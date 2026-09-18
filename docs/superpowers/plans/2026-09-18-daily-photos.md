# Daily 사진 첨부 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/daily/` 에서 관리자가 텍스트+사진 여러 장을 직접 게시하고, 피드가 사진(2장 이상은 캐러셀)을 표시한다.

**Architecture:** Supabase `daily_logs.image_urls text[]` + public 버킷 `daily-images`. 읽기는 기존 `daily.js`(anon), 쓰기는 신규 `daily-compose.js` 가 `window.blogAdmin` 세션 JWT 로 REST 직접 호출. 두 파일은 `window.dailyFeed` 와 DOM 이벤트 위임으로만 연결.

**Tech Stack:** Jekyll, vanilla JS(ES5 스타일 — 기존 daily.js 와 동일), SCSS, Supabase REST/Storage. 테스트 러너 없음 → 검증은 curl(RLS) + headless Chrome(렌더).

스펙: `docs/superpowers/specs/2026-09-18-daily-photos-design.md`

---

### Task 1: Supabase 마이그레이션

- [ ] `apply_migration` `daily_photos`:
  - `alter table public.daily_logs add column image_urls text[] not null default '{}';`
  - 정책 `daily_logs admin read`(authenticated, SELECT, true), `daily_logs admin insert`(authenticated, INSERT, email 조건), `daily_logs admin delete`(authenticated, DELETE, email 조건)
  - `insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('daily-images','daily-images',true,10485760,'{image/*}')`
  - `storage.objects` 정책 INSERT/DELETE: bucket + 본인 폴더 + email 조건
- [ ] 검증: anon key 로 `POST /rest/v1/daily_logs` → 401/403(RLS), anon 으로 Storage 업로드 → 400/403. anon `GET ?select=id,image_urls&limit=1` → 200 + `image_urls: []`.

### Task 2: 피드 렌더 (`assets/js/daily.js`)

- [ ] `escapeAttr`, `parseRatio(url)`(`#r=WxH` → clamp 0.8~1.7778, 기본 4/3), `renderMedia(urls)`(https 만, 1장 `.daily-media`, 2장+ `.daily-carousel`) 추가
- [ ] `render()` 에 미디어 + `.daily-entry-del` 버튼(`data-id`) 삽입, `<article data-id>` 부여, content 가 빈 글은 body div 생략
- [ ] `initCarousels()` — 화살표 click → `track.scrollBy`, `scroll` → 카운터/disabled 갱신
- [ ] `window.dailyFeed = { reload: load(0), reloadCurrent: load(current) }`, 헤더 주석 갱신
- [ ] Commit

### Task 3: 작성/삭제 (`assets/js/daily-compose.js`, `daily.html`, `_includes/head.html`)

- [ ] `daily.html` 에 `.daily-compose` 마크업 (textarea `#daily-compose-text`, file input `#daily-compose-file`, `#daily-compose-thumbs`, `#daily-compose-status`, `#daily-compose-submit`)
- [ ] `head.html` `/daily/` 블록에 스크립트 추가
- [ ] `daily-compose.js`: 첨부 배열 관리(최대 10), paste 핸들러, `resizeImage(file)`(1600px, JPEG 0.85, width/height 반환), `uploadOne`, `removeObjects`(롤백/삭제 공용), `submit`, 피드 click 위임 삭제
- [ ] Commit

### Task 4: 스타일 (`assets/main.scss`)

- [ ] `.daily-compose*`(기본 none, `body.is-admin` 에서 flex), `.daily-media`, `.daily-carousel*`, `.daily-entry-del`, 모바일 보정
- [ ] Commit

### Task 5: 검증

- [ ] `bundle exec jekyll build` 성공
- [ ] headless Chrome: `/daily/` 에 Supabase 응답을 route mock 해 (사진 0/1/3장) 렌더 — 데스크톱 1280, 모바일 390 스크린샷. 캐러셀 next 클릭 후 카운터 `2 / 3` 확인. `is-admin` 클래스 주입 시 작성 칸·삭제 버튼 표시 확인.
- [ ] 임시 스크립트·스크린샷은 scratchpad 에만 두고 정리
