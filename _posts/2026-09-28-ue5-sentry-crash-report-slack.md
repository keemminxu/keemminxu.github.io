---
layout: post
title: "UE5 Sentry 연동 및 슬랙으로 크래시 받기"
title_en: "Sentry for a UE5 PC Game: From Plugin Setup to Crash Alerts in Slack on the Free Plan"
excerpt_en: "End-to-end Sentry setup for a UE5 Windows game: sentry-unreal plugin, manual init with environment/release/user context, PDB symbol upload, and a Cloudflare Worker relay that turns Sentry alerts into Slack cards without a paid plan."
date: 2026-09-28 12:02:56 +0900
categories: [unrealengine]
tags: [ue5, sentry, crash-report, slack, cloudflare-workers, crashpad]
thumbnail: /assets/images/ue5-sentry-crash-report-slack/slack-crash-card.png
excerpt: "sentry-unreal 플러그인 벤더링부터 수동 초기화, 유저·맵 컨텍스트, PDB 심볼 업로드, 그리고 무료 플랜에서 Cloudflare Worker로 슬랙 알림 카드 만들기까지"
---

열심히 프로젝트를 개발하고 베타로 출시 직전.. "아 맞다 크래시 리포트!"

크래시 리포트도 없이 출시를 할 뻔 했음..

이전 프로젝트에선 언리얼 기본 크래시 리포트를 커스텀 해서 사용했었는데, 그렇게까지 해야되나? 싶어서 ThirdParty를 찾아보다 `Sentry`라는 플러그인을 발견했다.

Sentry를 사용한 이유!

- 공식 언리얼 플러그인([getsentry/sentry-unreal](https://github.com/getsentry/sentry-unreal))이 Win64/Android/iOS를 한 번에 지원함
- Windows는 crashpad로 미니덤프를 뜨고, 올려둔 PDB로 서버가 심볼화까지 해줌
- 무료 플랜으로 시작할 수 있음

설계는 아래처럼 함

```
게임 클라이언트 (crashpad)
   │  크래시/에러 이벤트 + 미니덤프
   ▼
Sentry  >> 이슈 그룹핑, PDB로 스택 심볼화
   │  알림 규칙이 발동하면 웹훅
   ▼
Cloudflare Worker  >> Sentry 페이로드를 Slack 카드로 변환
   │  Incoming Webhook
   ▼
Slack #crash-report 채널
```
![Sentry 크래시 리포트 파이프라인](/assets/images/ue5-sentry-crash-report-slack/pipeline-overview.png)

중간에 Worker가 끼어 있는 건 Sentry 무료 플랜에서 Slack 내장 통합을 못 쓰기 때문. 자세한건 뒤에 쓸 예정

## 1. 플러그인

Fab 버전도 있지만 GitHub 릴리즈의 엔진 버전별 zip(`sentry-unreal-1.21.0-engine5.8.zip`)을 받아 프로젝트 `Plugins/Sentry`에 그대로 넣었음

원본은 239MB인데 대부분 안 쓰는 플랫폼 바이너리다. Linux/Mac/WinArm64용 ThirdParty를 지우고 Win64 + Android + iOS만 남기니 61MB가 됐음.

```gitignore
# Sentry ThirdParty 바이너리 추적 허용
!Plugins/Sentry/Source/ThirdParty/**
!Plugins/Sentry/Binaries/Win64/crashpad_handler.exe
.sentry-native/
sentry.properties
```

`.sentry-native/`는 SDK가 로컬에 쌓는 DB고, `sentry.properties`는 심볼 업로드 토큰이 들어가는 파일이라 둘 다 제외시킴

아래는 build.cs

```csharp
bool bWithSentry = Target.Platform == UnrealTargetPlatform.Win64
    || Target.Platform == UnrealTargetPlatform.Android
    || Target.Platform == UnrealTargetPlatform.IOS;
if (bWithSentry)
{
    PublicDependencyModuleNames.Add("Sentry");
}
PublicDefinitions.Add("MP_WITH_SENTRY=" + (bWithSentry ? "1" : "0"));
```

zip을 풀었을 때 `Sentry.CrashReporter.exe`(63MB)가 사라져 있었다. Windows Defender가 격리한 걸로 추정하는데 확인은 못 했음. 기본 설정에선 안 쓰는 파일이라 상관없긴한데, 이 상태에서 `EnableExternalCrashReporter`를 켜면 Build.cs가 없는 파일을 복사하려다 빌드가 깨짐. 켤려면 파일부터 확인해야 할 듯?

## 2. 초기화는 직접

플러그인은 기본적으로 엔진 뜰 때 알아서 초기화됨. 이걸 끄고(`InitAutomatically=False`) GameInstanceSubsystem으로 직접 올림

이렇게 한 이유

1. environment를 우리 서버 설정에서 가져오고 싶었다. 이 프로젝트는 `DefaultGame.ini`에 접속할 서버(Dev/Stage/Product(Release))가 적혀 있음. 네트워크 매니저가 보는 값과 Sentry environment가 같아야 알림 필터가 의미가 있어서
2. release 이름을 실제 배포 버전으로 맞추고 싶었음. 런처가 설치 폴더에 버전 파일을 써주는데 이걸 읽어서 `MyProject@0.0.1.5` 같은 이름을 만듦

```cpp
void UMyProjectSentrySubsystem::InitializeSentry()
{
    USentrySubsystem* Sentry = GEngine ? GEngine->GetEngineSubsystem<USentrySubsystem>() : nullptr;
    if (!Sentry || !Sentry->IsSupportedForCurrentSettings())
    {
        return;
    }

    const FString ServerEnv = ReadActiveServer();   // "Dev" / "Stage" / "Product(Release)"
    const FString AppVersion = ResolveAppVersion();

    USentrySettings* Touched = nullptr;
    FString SavedEnv, SavedRelease;
    bool bSavedOverride = false;

    Sentry->InitializeWithSettings(FConfigureSettingsNativeDelegate::CreateLambda([&](USentrySettings* Settings)
    {
        Touched = Settings;
        SavedEnv = Settings->Environment;
        SavedRelease = Settings->Release;
        bSavedOverride = Settings->OverrideReleaseName;

        Settings->Environment = ServerEnv;
        Settings->OverrideReleaseName = true;
        Settings->Release = FString::Printf(TEXT("MyProject@%s"), *AppVersion);
    }));

    // 되돌려 놓지 않으면 에디터에서 Project Settings 저장할 때 이 값이 ini 파일로 저장됨
    if (Touched)
    {
        Touched->Environment = SavedEnv;
        Touched->Release = SavedRelease;
        Touched->OverrideReleaseName = bSavedOverride;
    }

    if (!Sentry->IsEnabled())
    {
        return; // DSN이 없거나 초기화 실패
    }
    // ...태그, 유저, 맵 세팅
}
```

버전은 이 순서로 찾음. 에디터에서 크래시나면 그냥 `PIE`로 찍힘

```cpp
FString UMyProjectSentrySubsystem::ResolveAppVersion()
{
    if (GIsEditor)
    {
        return TEXT("PIE");
    }

    // ① 커맨드라인 -AppVersion=
    FString V;
    if (FParse::Value(FCommandLine::Get(), TEXT("AppVersion="), V) && !V.IsEmpty())
    {
        return V;
    }

    // ② 런처가 설치 폴더에 써주는 launcher-version.json
    //    {"branchName":"product","versionName":"0.0.1.5"}
    FString JsonRaw;
    if (FFileHelper::LoadFileToString(JsonRaw, *(FPaths::RootDir() / TEXT("launcher-version.json"))))
    {
        TSharedPtr<FJsonObject> Obj;
        if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(JsonRaw), Obj) && Obj.IsValid())
        {
            FString Ver, Branch;
            Obj->TryGetStringField(TEXT("versionName"), Ver);
            Obj->TryGetStringField(TEXT("branchName"), Branch);
            if (!Ver.IsEmpty())
            {
                // release 브랜치가 아니면 0.0.1.5-beta 식으로
                return (Branch.IsEmpty() || Branch.Equals(TEXT("product"), ESearchCase::IgnoreCase))
                    ? Ver : FString::Printf(TEXT("%s-%s"), *Ver, *Branch);
            }
        }
    }

    // ③ version.txt  ④ ProjectVersion(ini) 순으로 폴백
    // ...
}
```

런처가 이미 쓰고 있던 파일을 읽는 거라 런처 쪽에 따로 요청할 게 없었음

하지만 GameInstance가 생기기 전, 그니까 모듈 로드나 RHI 초기화 중에 나는 크래시는 못 잡음 ㅠ. 지금까진 그 구간에서 문제가 된 적이 없어서 이렇게 뒀는데 그 구간이 문제가 되면 자동 초기화로 돌리고 environment는 CI에서 `SENTRY_ENVIRONMENT` 환경변수로 넣도록 바꾸면 됨

## 3. 이벤트에 뭘 붙일까?  (태그, 유저, 맵)

### 태그

알림 필터와 검색에 쓸 태그를 직접 붙인다.

```cpp
TMap<FString, FString> Tags;
Tags.Add(TEXT("server_env"), ServerEnv);
Tags.Add(TEXT("app_version"), AppVersion);
Tags.Add(TEXT("client_version"), FString::FromInt(CLIENT_VERSION)); // 패킷 프로토콜 버전
Tags.Add(TEXT("target_type"), LexToString(FApp::GetBuildTargetType()));      // Game / Editor
Tags.Add(TEXT("build_config"), LexToString(FApp::GetBuildConfiguration()));  // Shipping / Development
Sentry->SetTags(Tags);
```

플러그인도 기본 태그를 몇 개 올려주는데 `Target Type`, `Is game`처럼 키에 공백이 들어가 있음. 알림 규칙 필터에 쓰기 애매해서 공백 없는 키를 따로 만들었다.

### 유저

로그인하면 내부 Id와 닉네임을, 로그인 전이나 로그아웃 후엔 머신 기반 익명 ID를 넣는다. 이메일과 IP는 안 보냄

### 맵

크래시 났을 때 어느 레벨이었는지가 제일 궁금해서 `map` 태그를 계속 갱신한다.

```cpp
PostLoadMapHandle = FCoreUObjectDelegates::PostLoadMapWithWorld.AddUObject(this, &ThisClass::HandleMapLoaded);
HandleMapLoaded(GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr); // 이미 로드된 맵은 여기서 한 번

void UMyProjectSentrySubsystem::HandleMapLoaded(UWorld* World)
{
    if (!World) return;
    FString MapName = World->GetMapName();
    MapName.RemoveFromStart(World->StreamingLevelsPrefix); // PIE의 UEDPIE_0_ 접두어 제거
    Sentry->SetTag(TEXT("map"), MapName);
}
```

바인딩 직후에 한 번 직접 불러주는 줄은 꼭 있어야 함!

![Sentry 이슈 상세 화면 Tags에 server_env, app_version, map, build_config 등이 붙고 User에 memberId/닉네임이 보이는 스크린샷](/assets/images/ue5-sentry-crash-report-slack/sentry-issue-detail.png)

## 4. ini 설정

```ini
[/Script/Sentry.SentrySettings]
InitAutomatically=False
Dsn="https://<공개키>@<조직ID>.ingest.us.sentry.io/<프로젝트ID>"
Debug=False
EnableAutoLogAttachment=False
MaxBreadcrumbs=200
EnableOfflineCaching=True
AutomaticBreadcrumbs=(bOnMapLoadingStarted=True,bOnMapLoaded=True,bOnGameStateClassChanged=False,bOnGameSessionIDChanged=False,bOnUserActivityStringChanged=False)
EnableBuildTargets=(bEnableClient=True,bEnableGame=True,bEnableEditor=True,bEnableServer=True,bEnableProgram=True)
UploadSymbolsAutomatically=False
```

### 로그 첨부는 끔

`EnableAutoLogAttachment`를 켜면 크래시뿐 아니라 모든 이벤트에 로그 파일 전체가 붙는다. 프로젝트는 세션 로그가 60~110MB라 기본 첨부 한도(20MB)부터 넘어버림.. 그리고 결국 shipping에서 로그 꺼버리면 의미도 없어짐.

### 에디터 타깃

대부분 에디터 크래시는 `EditorDsn`에 별도 Sentry 프로젝트를 연결해서 분리하기도 한다고 함

근데 요구가 있어서 킨 후에 아래로 처리함

- 에디터 이벤트는 `target_type=Editor`, 버전은 `PIE`로 찍힌다
- 슬랙 알림 규칙에 `environment=Product` + `target_type=Game` 필터를 검

## 5. Windows에서 실제로 잡히는 것

붙이고 나서 제일 궁금했던 부분이라 엔진 소스를 따라가 봄

- 플러그인이 초기화하면서 엔진 크래시 핸들링 타입을 `Disabled`로 바꾼다
- 엔진의 GuardedMain, 워커 스레드, GPU 크래시 쪽 `__except`가 `GetCrashHandlingType()`을 보고, Disabled면 예외를 넘김
- 넘어간 예외를 crashpad의 UnhandledExceptionFilter가 받음

그래서 잡히는 것들:

| 종류 | 결과 |
|---|---|
| 액세스 위반 (null/dangling 포인터) | 크래시 이벤트 |
| `check()` / `Fatal` 로그 / OOM | 크래시 이벤트 |
| 렌더 스레드, 워커 스레드 크래시 | 크래시 이벤트 |
| GPU 크래시 | 크래시 이벤트 (Aftermath 덤프 첨부) |
| fast-fail | `crashpad_wer.dll` 경유로 수집 |
| `ensure()` | 크래시가 아닌 error 이벤트 |

못 잡는 것도 있었음

- CRT `abort()` / SIGABRT: 엔진 AbortHandler 쪽 `__except`는 핸들링 타입을 안 봐서 crashpad로 안 넘어감
- GameInstance 생성 전 크래시 (수동 초기화의 대가)

그리고 Shipping은 기본적으로 `check()`가 꺼져 있다(`bUseChecksInShipping` 미설정). Development에선 check에 걸려 크래시로 잡히던 게 Shipping에선 그냥 지나가거나, 한참 뒤에 엉뚱한 곳에서 액세스 위반으로 터짐. 같은 버그인데 빌드마다 스택이 다르게 나오면 이걸 먼저 의심해 볼 만한듯?

## 6. 테스트

Development 빌드는 콘솔로 확인

```
MyProject.Sentry.TestEvent hello   ← 직접 만든 명령. 메시지 이벤트 하나 전송
debug crash                        ← 엔진 내장. 액세스 위반 크래시
debug check / debug ensure / debug gpucrash
```

Shipping은 콘솔이 막혀 있어 커맨드라인 인자를 하나 만들었다. 인자를 붙여 실행하면 50초 뒤에 강제로 크래시를 낸다. 50초면 로그인하고 맵에 들어갈 시간이라 유저·맵 컨텍스트가 제대로 붙는지도 같이 볼 수 있음

```cpp
if (FParse::Param(FCommandLine::Get(), TEXT("SentryTestCrash")))
{
    FTimerHandle Unused;
    GetGameInstance()->GetTimerManager().SetTimer(Unused, []()
    {
        GLog->Flush();
        *reinterpret_cast<volatile int32*>(0) = 0xDEAD;
    }, 50.0f, false);
}
```

```
LogSentrySdk: Sentry initialization completed with result 0
```

`result 0`이 아니면 SDK 전체가 꺼진 상태 크래시만 안 잡히는 게 아니라 이벤트가 하나도 안 나감

## 7. 심볼 업로드

PDB를 안 올리면 스택이 전부 `0x00007ff6...` 같은 주소로만 나옴. Sentry는 스택 프레임으로 이슈를 묶는데 함수명이 없으니 서로 다른 크래시가 `unknown` 하나로 합쳐져 버린다. 이슈가 하나로 뭉치면 알림도 덜 온다

![심볼 업로드 전 Sentry 이슈 화면](/assets/images/ue5-sentry-crash-report-slack/stack-before-after-symbols.png)

준비물은 Organization Auth Token. 프로젝트 루트 `sentry.properties`에 넣는데 앞에서 `.gitignore`에 넣어둔 그 파일

```properties
defaults.org=<org-slug>
defaults.project=<project-slug>
auth.token=sntrys_...
```

처음엔 수동으로 올려서 확인해봄

```bash
# sentry.properties를 자동으로 안 읽는다. 환경변수로 꼭 지정 필요
SENTRY_PROPERTIES=sentry.properties \
  Plugins/Sentry/Source/ThirdParty/CLI/sentry-cli-Windows-x86_64.exe \
  debug-files upload --wait Binaries/Win64
```

여기서 한 번 막힘. 플러그인의 빌드 스크립트는 `SENTRY_PROPERTIES`를 알아서 지정해주는데, sentry-cli를 직접 돌리면 프로젝트 루트의 `sentry.properties`를 안 읽는다. 인증 에러가 나서 토큰 문제인 줄 알고 한참 봤다.

CI(Jenkins)에서는 빌드 머신 환경변수로 `SENTRY_UPLOAD_SYMBOLS_AUTOMATICALLY=True`만 주면 된다. ini의 `UploadSymbolsAutomatically=False`를 스크립트가 덮어쓰기 때문에, 개발자 로컬 빌드는 업로드를 안 하고 CI 빌드만 올리게 된다. 다만 주의할 점이 있음

- 플러그인 PostBuildStep이 엔진 동봉 Python으로 심볼 스크립트를 돌린다. bat의 종료 코드가 Python 결과라서 빌드 머신 엔진에 Python이 없으면 빌드 자체가 실패함
- sentry-cli 업로드가 실패해도 빌드 실패다
- Shipping 모놀리식 PDB는 수백 MB에서 1GB를 넘기도 한다. 업로드 시간을 한 번 재두는 게 좋을듯

### 덤프 파일만 있을 때

유저가 `.dmp` 파일을 따로 보내주는 경우도 있다. 로컬에 있는 PDB가 그 exe와 같은 빌드라는 보장이 없어서(실제로 GUID가 안 맞았다) 로컬 심볼화는 믿기 어려움. 이럴 땐 덤프를 Sentry 미니덤프 엔드포인트로 그냥 올린다. CI가 올려둔 정확한 PDB로 서버가 심볼화해줌

```bash
curl -X POST "https://<조직ID>.ingest.us.sentry.io/api/<프로젝트ID>/minidump/?sentry_key=<DSN 공개키>" \
  -F "upload_file_minidump=@crash.dmp" \
  -F "sentry[environment]=Manual" \
  -F "sentry[release]=MyProject@0.0.1.5"
```

`environment=Manual`로 올리는 게 포인트다. Release 필터를 건 슬랙 알림에 수동 업로드가 섞이지 않는다.

## 8. Slack으로 (무료 플랜 우회)

Sentry에는 Slack 통합이 기본으로 있는데 당시 확인한 기준으로 유료(Team) 플랜부터 쓸 수 있었음. 알림 하나 받자고 플랜을 올리긴 좀 아까워서 웹훅 중계로 갔음

```
Sentry 알림 규칙 → 웹훅 → Cloudflare Worker → Slack Incoming Webhook
```

Cloudflare Workers 무료 티어가 하루 10만 요청이라 크래시 알림 용도면 넉넉함. 게다가 메시지 포맷을 마음대로 커스텀 할 수 있어서 내장 통합보다 이 방식이 더 나았다.

### Slack 쪽

1. api.slack.com/apps에서 앱 생성 → Incoming Webhooks 켜기 → 채널 지정
2. 나온 `https://hooks.slack.com/services/...` URL이 시크릿이다. 커밋하면 안 된다

### Sentry 쪽 - 두 가지 방법

- **A. Internal Integration** (Settings → Developer Settings → Custom Integrations): 요청에 서명이 붙어서 검증이 가능하다
- **B. Legacy WebHooks 플러그인** (프로젝트 Settings → Legacy Integrations → WebHooks): 서명이 없다. 대신 무료 플랜에서 실제로 돌아가는 걸 확인한 건 이 경로다

두 경로는 페이로드 모양이 달라서 Worker가 둘 다 받게 만들었다.

### Worker

핵심 부분만 옮긴다.

```js
export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') return new Response('sentry-slack-relay');

        // Legacy WebHooks는 서명이 없으니 URL 쿼리 토큰으로 막는다
        const url = new URL(request.url);
        if (env.RELAY_TOKEN && url.searchParams.get('t') !== env.RELAY_TOKEN) {
            return new Response('forbidden', { status: 403 });
        }

        const raw = await request.text();

        // Internal Integration 요청은 HMAC-SHA256 서명 검증
        if (env.SENTRY_CLIENT_SECRET && request.headers.get('sentry-hook-resource')) {
            const sig = request.headers.get('sentry-hook-signature');
            if (!sig || !(await verifySignature(raw, sig, env.SENTRY_CLIENT_SECRET))) {
                return new Response('bad signature', { status: 401 });
            }
        }

        const info = extract(JSON.parse(raw)); // 두 페이로드 형식을 공통 형태로
        if (!info) return new Response('ignored');

        // Sentry는 1초 안에 응답을 요구한다. Slack 전송은 응답 후 백그라운드로
        ctx.waitUntil(postToSlack(env.SLACK_WEBHOOK_URL, buildSlackMessage(info)));
        return new Response('ok');
    },
};

function extract(body) {
    // A. Internal Integration: { action, data: { event, triggered_rule } }
    if (body?.data?.event) { /* ... */ }
    // B. Legacy WebHooks: { project_name, level, message, url, event, triggering_rules }
    if (body?.url && (body?.event || body?.message)) { /* ... */ }
    return null;
}
```

`ctx.waitUntil`을 빼면 안 된다. Internal Integration은 웹훅이 1초 안에 응답하지 않는 일이 반복되면 Sentry가 통합의 웹훅을 자동으로 비활성화해버림. Slack 응답을 기다렸다가 200을 주면 언젠가 걸린다. 받자마자 200부터 주고 전송은 뒤에서 한다.

Slack Incoming Webhook은 초당 1건 정도가 한도라 크래시가 몰리면 429가 온다. `Retry-After` 헤더를 보고 몇 번 재시도하게 했음

```js
if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
    const ra = Number(res.headers.get('retry-after'));
    const waitMs = Math.min((Number.isFinite(ra) && ra > 0 ? ra : attempt) * 1000, 12000)
        + Math.floor(Math.random() * 400);
    await new Promise((r) => setTimeout(r, waitMs));
    continue;
}
```

배포는 wrangler로

```bash
npx wrangler deploy
npx wrangler secret put SLACK_WEBHOOK_URL
npx wrangler secret put RELAY_TOKEN        # 아무 랜덤 문자열
```

Sentry에 등록할 URL은 `https://<worker>.workers.dev/?t=<RELAY_TOKEN>`이다.

### 카드 모양

Block Kit으로 카드를 만든다. 크래시 보고 먼저 확인하게 되는 것들만 골라서 위에 2열 표로 넣음

```js
const fields = [
    field('Server', info.environment),     // Dev / Stage / Product(Release)
    field('Version', version),             // app_version 태그
    field('Build', build),                 // Shipping · Game
    field('Time', formatKST(info.ts)),
    field('User', userText),               // memberId / 닉네임, 또는 "미로그인"
    field('Geo', geoText),                 // user.geo — 도시 단위 추정치
    field('Map', info.tags.map),
];
```

그 아래에 GPU·CPU·OS 스펙 한 줄(이벤트 `contexts`에서 뽑음), 에러 메시지, 콜스택 25줄을 코드블록으로 넣고 맨 밑에 Sentry 이슈로 가는 버튼을 단다. 컬러바는 레벨별로 다르게 하고 `ensure`나 stall처럼 죽지는 않은 건 노란색으로 구분했다.

![Slack 채널에 도착한 크래시 카드 — Server/Version/Build/Time/User/Geo/Map 필드, Spec, Error Message, Call Stack 코드블록, "자세한 로그 확인하기" 버튼이 보이는 스크린샷](/assets/images/ue5-sentry-crash-report-slack/slack-crash-card.png)

콜스택까지 카드에 넣은 게 생각보다 좋았다. 심볼 업로드가 된 빌드면 슬랙에서 스택만 보고 "아 그거네" 하고 바로 코드로 가는 경우가 꽤 있다.

## 9. 알림 규칙과 "왜 크래시마다 안 오지?"

알림 규칙은 세 가지를 걸었다.

- 새 이슈가 생겼을 때
- 해결 처리한 이슈가 다시 발생했을 때 (회귀)
- 한 이슈가 일정 시간에 N번 이상 발생했을 때

필터는 `environment=Product(Release)` + `target_type=Game`. 개발 빌드나 에디터 크래시가 운영 채널로 들어오는 걸 막는다.

![Sentry Automations 화면에서 알림 규칙 설정 — 트리거(새 이슈/회귀/빈도), environment·target_type 필터, 웹훅 액션이 보이는 스크린샷](/assets/images/ue5-sentry-crash-report-slack/alert-rule-setup.png) 

운영하다 보면 "크래시가 났는데 슬랙이 안 왔다"는 말이 반드시 나온다. 결론은 정상 동작

- Sentry 이슈 알림은 이벤트가 아니라 이슈(그룹) 단위로 발동한다. 같은 스택으로 묶인 크래시는 두 번째부터 "새 이슈"가 아니다
- 액션에는 스로틀(분 단위)이 걸려 있고 이게 규칙·액션·이슈 조합마다 따로 돈다
- 심볼이 없으면 여러 크래시가 한 이슈로 뭉친다. 그러면 카드는 더 드물게 온다

크래시마다 받고 싶으면 트리거를 "이벤트가 캡처될 때"로 바꾸고 스로틀을 0으로 두면 된다. Sentry가 8월에 예전 규칙 에디터를 없애고 Automations 화면으로 바꿔서, 지금은 거기서 "An event or issue activity is captured" 트리거를 골라야 한다. 무료 플랜에서도 되는지는 확인 못 했다. 사실 이벤트마다 오면 채널이 금방 시끄러워져서 우리는 이슈 단위로 두기로 했음

하나 더. Legacy WebHooks는 전송을 딱 한 번 시도하고 실패하면 재시도도 로그도 없다. Worker 쪽에서 뭘 받았는지라도 남겨두려면 `wrangler.toml`에 로그를 켜두자. 우리는 이걸 안 켜놔서, 문제가 생겼을 때 사후에 확인할 방법이 없었음

```toml
[observability]
enabled = true
```

## 10. 운영하면서 생긴 이슈

### 배포 패키지에서 crashpad가 빠졌을 때

붙이고 며칠 뒤 나간 배포 빌드에서 Sentry가 침묵함. 원인은 배포 파일 목록에 `Plugins/Sentry/Binaries/Win64` 폴더가 없던 것. exe에는 Sentry가 링크돼 있는데 `crashpad_handler.exe`와 `crashpad_wer.dll`이 없으니 `sentry_init`이 `result 1`로 실패했다. 이러면 SDK 전체가 꺼져서 크래시 말고 다른 이벤트도 안 나감

런처 배포 목록에 폴더를 추가해서 해결했다. 배포 전 체크리스트에 `result 0` 로그 확인을 넣었던 이유

### 서명 안 된 핸들러

`crashpad_handler.exe`, `crashpad_wer.dll`은 서명이 안 된 바이너리다. 백신이나 SmartScreen이 핸들러를 막으면 역시 SDK가 조용히 꺼짐. 게임 exe를 코드 서명하고 있다면 이 두 파일도 같은 인증서로 같이 서명해야 됨

### 오프라인 종료 지연

`EnableOfflineCaching=True`면 전송 실패한 이벤트를 캐시했다가 다음 실행 때 다시 보낸다. 대신 오프라인 상태에서 게임을 끄면 `ShutdownTimeout`(기본 5초)만큼 종료가 늦어질 수 있다. 체감되면 1~2초로 줄여도 된다.

## 실제로 잡은 것

한 달 정도 굴려 보니 "가끔 튕긴다"가 구체적인 한 줄로 바뀌었다는게 제일 큰 소득이었음

예를 들면 이런 코드가 있었다.

```cpp
// Before
FName QuickSlotName = QuickSlotComponent->GetQuickSlotID(Key);
if (QuickSlotName.GetStringLength() > 0 && GetMesh()->GetAnimInstance()->IsAnyMontagePlaying() == false)
```

AnimInstance가 없는 순간에 퀵슬롯에 등록된 애님 키가 들어오면 바로 크래시 남. 재현 조건도 애매하고 유저 제보만으로는 절대 못 찾았을 종류다. Sentry 이슈에 스택, 맵, 유저가 다 붙어 와서 금방 고쳤음

```cpp
// After
UAnimInstance* AnimInstance = GetMesh() ? GetMesh()->GetAnimInstance() : nullptr;
if (!QuickSlotComponent || !AnimInstance || AnimInstance->IsAnyMontagePlaying())
{
    return;
}
```

커밋 메시지에 Sentry 이슈 ID(`PROJ-1E` 같은)를 같이 적어두면, 나중에 이슈 화면에서 해결 처리할 때도 편하고 회귀 알림이 왔을 때 어느 커밋이 고쳤던 건지 곧장 찾을 수 있다.

레벨 전환 중에 GameInstanceSubsystem이 들고 있던 죽은 액터 포인터를 역참조하는 크래시도 Sentry로 잡았다. 이건 따로 정리할 만한 얘기라 다음에 쓰려고 함

## 정리

- **플러그인**: GitHub 릴리즈 zip 벤더링, 안 쓰는 플랫폼 제거(239→61MB), `.gitignore`에서 lib/exe 되살리기
- **수동 초기화**: GameInstanceSubsystem에서 environment/release를 우리 설정으로 주입. 설정 객체는 덮은 뒤 바로 원복(ini로 새는 것 방지)
- **컨텍스트**: 공백 없는 태그 키, memberId+닉네임(같은 계정 확인), 익명 ID, `map` 태그(바인딩 직후 1회 수동 호출)
- **ini**: DSN은 큰따옴표 필수. 로그 첨부는 로그 정리 전엔 끄기
- **Windows 수집 범위**: 액세스 위반·check·렌더/GPU 크래시는 잡히고 `abort()`와 GameInstance 이전 크래시는 안 잡힌다. `ensure`는 error 이벤트. Shipping은 check가 꺼져 있다
- **심볼**: 수동 sentry-cli는 `SENTRY_PROPERTIES` 지정 필수, CI는 환경변수로 자동 업로드. 덤프만 있으면 미니덤프 엔드포인트로
- **슬랙**: 무료 플랜이면 Cloudflare Worker 중계. 1초 내 응답(`waitUntil`), 429 재시도, 페이로드 두 형식 모두 처리
- **알림**: 이벤트가 아니라 이슈 단위로 온다. 안 온다고 버그는 아니다
- **배포 체크**: `Sentry initialization completed with result 0` 로그 확인, crashpad 두 파일 포함·서명

붙이는 것보다 "제대로 켜져 있는지"를 계속 확인하는 게 더 어려웠다. SDK가 꺼질 때 아무 소리도 안 내는 경우가 많아서, 초기화 결과 로그 한 줄은 꼭 챙기자