# Daily 사진 첨부 + 블로그 내 작성 — 설계

날짜: 2026-09-18
선행 문서: `2026-06-22-daily-diary-feed-design.md` (해당 문서의 비범위였던 "블로그에서 직접 작성"을 이번에 도입)

## 목표

`/daily/` 피드에 사진을 넣을 수 있게 한다. 로그인한 관리자는 `/daily/` 페이지 안에서 텍스트 + 사진 여러 장을 바로 게시하고, 사진이 2장 이상이면 캐러셀로 표시한다. Discord → 봇 입력 경로는 그대로 유지한다(텍스트 전용).

## 1. 데이터 (Supabase, 프로젝트 `mnatdbpscbvhhsxstvaq`)

### 테이블
- `daily_logs` 에 `image_urls text[] not null default '{}'` 추가.
  - 기존 row·봇이 넣는 row는 빈 배열 → 기존 동작 불변.
  - `content` 는 계속 순수 텍스트. 통합 검색(`search.js`)의 ilike 검색 영향 없음.
  - 사진만 있는 글은 `content = ''` 로 저장 (not null 제약 유지).

### RLS (`daily_logs`)
- 기존 `daily_logs anon read` (anon SELECT) 유지.
- 추가: `authenticated` 역할에 SELECT / INSERT / DELETE 허용, 조건은 `(auth.jwt() ->> 'email') = 'cuzziman@gmail.com'`.
  - SELECT 정책이 필요한 이유: INSERT 시 `Prefer: return=representation` 으로 생성 row를 돌려받고, DELETE 대상 row를 식별하려면 authenticated 역할도 읽을 수 있어야 한다. SELECT 는 조건 없이 `true`.
  - 가입이 열려 있을 가능성에 대비해 "로그인만 하면 가능"이 아니라 관리자 email로 고정한다.
- 봇은 service_role 이라 RLS 우회 — 영향 없음.

### Storage
- 버킷 `daily-images`: public = true, `file_size_limit` 10MB, `allowed_mime_types` `image/*` (기존 `draft-images` 와 동일 설정).
- 객체 경로: `{auth.uid()}/{uuid}.jpg`
- `storage.objects` 정책 (기존 draft-images 정책과 같은 형태 + 관리자 email 조건):
  - INSERT: `bucket_id = 'daily-images' AND (storage.foldername(name))[1] = auth.uid()::text AND (auth.jwt() ->> 'email') = 'cuzziman@gmail.com'`
  - DELETE: 동일 조건.
- 읽기는 public 버킷의 공개 URL(`/storage/v1/object/public/daily-images/...`) 사용.

## 2. 작성 UI (`/daily/` 상단, 로그인 시에만)

- `daily.html` 의 제목 아래에 `.daily-compose` 블록 추가. 기본 `display:none`, `body.is-admin` 일 때만 표시 (기존 에디터 FAB와 같은 CSS 게이팅).
- 구성: textarea · [사진 추가] 버튼(`<input type="file" accept="image/*" multiple>`) · 썸네일 미리보기 줄(개별 × 제거) · 상태 텍스트 · [게시] 버튼.
- textarea 에 이미지 붙여넣기(Ctrl+V) 시에도 첨부 목록에 추가.
- 글당 최대 10장. 초과분은 무시하고 상태 텍스트로 안내.
- 업로드 전 브라우저 리사이즈: 긴 변 1600px 로 축소(작으면 그대로), canvas → JPEG quality 0.85 재인코딩.
  - 부수 효과: EXIF(GPS 포함) 제거.
  - 디코딩은 `createImageBitmap(file, { imageOrientation: 'from-image' })` 우선, 미지원 시 `<img>` 폴백.
  - 각 이미지의 리사이즈 후 width/height 중 **첫 장의 비율**을 기록해 둔다(아래 3 참조 — URL 에 싣는다).
- 게시 흐름:
  1. 텍스트·사진 둘 다 비면 중단.
  2. `window.blogAdmin.getSession()` 없으면 "로그인이 만료되었습니다" 안내 후 중단 (세션은 1시간 만료, refresh 미구현 — 기존 동작과 동일).
  3. 사진을 순서대로 Storage 에 업로드 → 공개 URL 배열 생성.
  4. `POST /rest/v1/daily_logs` (`Authorization: Bearer <accessToken>`, `Prefer: return=representation`) body `{ content, image_urls }`.
  5. 성공: 작성 칸 초기화, 피드 1페이지 재로드.
  6. 3~4 중 실패: 이미 올린 Storage 객체를 삭제(best-effort)하고 상태 텍스트에 에러 표시. 입력 내용은 보존.
- 게시 중에는 버튼 비활성화 + "업로드 중 2/5" 진행 표시.

## 3. 표시 (`daily.js`)

- `image_urls` 가 비면 기존과 동일.
- 1장: `.daily-media` 안에 단일 `<img>`.
- 2장 이상: `.daily-carousel`
  - 트랙은 CSS `scroll-snap-type: x mandatory` 가로 스크롤, 슬라이드는 폭 100%. 모바일은 네이티브 스와이프.
  - 좌/우 화살표 버튼(hover 가능한 포인터 환경에서만 표시), 우상단 `2 / 5` 카운터.
  - 현재 인덱스는 트랙 `scroll` 이벤트에서 `Math.round(scrollLeft / clientWidth)` 로 계산. 첫/마지막에서 해당 화살표 비활성화.
  - 라이브러리 없음.
- 프레임 비율: 첫 사진 비율을 4:5 ~ 16:9 로 clamp 해 `aspect-ratio` 로 지정, 슬라이드 이미지는 `object-fit: contain` (잘림 없음, 여백은 프레임 배경색).
  - 레이아웃 시프트를 피하려고 비율을 이미지 로드 전에 알아야 한다 → 업로드 시 첫 사진 URL 에 `#r=<width>x<height>` 프래그먼트를 붙여 저장한다. 프래그먼트는 서버로 전송되지 않으므로 URL 동작에 영향 없음. 프래그먼트가 없거나 파싱 실패 시 4:3 기본값.
  - 1장일 때는 프레임 없이 `max-width:100%; height:auto` + 같은 방식의 `aspect-ratio` 힌트.
- 모든 `<img>`: `loading="lazy"`, `decoding="async"`, `alt=""`. 이미지를 `<a target="_blank" rel="noopener">` 로 감싸 클릭 시 원본 새 탭.
- URL 은 `escapeHtml` + 속성용 `"` 이스케이프 후 삽입하고, `https://` 로 시작하는 값만 렌더한다.
- 삭제: 각 글 헤더 우측에 `.daily-entry-del` 버튼(`body.is-admin` 에서만 표시). 클릭 → `confirm` → `DELETE /rest/v1/daily_logs?id=eq.<id>` → 해당 글의 `daily-images` 객체 삭제(best-effort) → 현재 페이지 재로드.
- 수정 기능 없음.

## 4. 파일 구성

| 파일 | 변경 |
|---|---|
| `daily.html` | `.daily-compose` 마크업 추가 |
| `assets/js/daily.js` | 이미지/캐러셀 렌더, 삭제 버튼 마크업, `window.dailyFeed = { reload, reloadCurrent }` 노출. 헤더 주석 갱신 |
| `assets/js/daily-compose.js` (신규) | 첨부 관리·리사이즈·업로드·게시·삭제. `daily.js` 와는 `window.dailyFeed` 와 피드 컨테이너의 click 위임으로만 연결 |
| `_includes/head.html` | `/daily/` 조건 블록에 `daily-compose.js` 로드 추가 |
| `assets/main.scss` | `.daily-compose*`, `.daily-media`, `.daily-carousel*`, `.daily-entry-del` |
| Supabase 마이그레이션 | 컬럼·RLS·버킷·Storage 정책 |

`pippi.js`(AI Daily) 는 건드리지 않는다. `.daily-*` CSS 를 공유하지만 새 클래스만 추가하므로 영향 없음.

## 5. 에러 처리

- 업로드/INSERT 실패 → 상태 텍스트에 메시지, 입력 보존, 올라간 객체 롤백 삭제.
- 401/403 → "로그인이 만료되었거나 권한이 없습니다. 다시 로그인하세요."
- 이미지 디코딩 실패(미지원 포맷 등) → 해당 파일만 건너뛰고 안내.
- 이미지 로드 실패(피드) → 브라우저 기본 깨진 이미지 표시, 별도 처리 없음.

## 6. 검증

- 로컬 `jekyll serve` + headless Chrome(playwright-core)로 데스크톱/모바일 뷰포트에서: 1장 글, 여러 장 캐러셀(화살표·카운터·스와이프 스냅), 사진 없는 기존 글 렌더 확인.
- anon key 로 `daily_logs` INSERT 와 `daily-images` 업로드가 거부(401/403)되는지 curl 로 확인.
- 실제 게시/삭제는 관리자 비밀번호가 필요하므로 사용자가 브라우저에서 1회 확인.

## 범위 밖

글 수정 · Discord 봇 사진 지원 · 라이트박스 · 동영상 · 세션 refresh · `daily.js`/`pippi.js` 중복 통합.
