---
layout: post
title: "개인 비서 봇 개발 일지 (1) 디스코드 봇 + 아침 메일"
title_en: "Building a Personal Assistant Bot (1): A Discord Bot and a Morning Family Email with Claude Agent SDK"
excerpt_en: "A Claude Agent SDK assistant on a free GCP e2-micro that takes orders on Discord and sends a daily HTML family email, and why the Discord half quietly went unused."
date: 2026-10-29 11:10:00 +0900
categories: ["etc"]
tags: [claude-agent-sdk, discord-bot, python, gcp, html-email, personal-assistant]
thumbnail: /assets/images/pippi-assistant-1-discord-mail/morning-mail.gif
excerpt: "Claude Agent SDK로 만든 개인 비서 삐삐. 디스코드로 일정·메모를 시키고 매일 아침 가족 메일도 받았는데, 메일은 잘 읽으면서 디스코드는 점점 안 열게 됐다."
---

## 삐삐

개인 비서 이름을 삐삐로 정했다. 예전 삐삐처럼, 부르면 바로 달려온다는 느낌

처음부터 가볍게 만든 건 아니었다. 초기 버전에는 가계부, 프로젝트 추적, 리마인더까지 다 넣었다. 그런데 이런 기능은 내가 데이터를 계속 넣어 줘야 굴러간다. 비서를 관리하는 일이 오히려 늘어나서 결국 안 쓰게 됨... 그래서 다 걷어내고 "내가 시킬 때만 일하는 가벼운 비서"로 다시 만들었다. 지금 하는 일은 이 정도다.

- 자유 대화 (웹검색, 링크 읽기 포함)
- 07:30 아침 브리핑 (뉴스·날씨·오늘 일정·채용 공고)
- 구글 캘린더 조회·등록·수정·삭제  ex. "내일 3시 치과 잡아줘", "그거 4시로 미뤄줘"
- 메모 "다이소에서 건전지 사야 됨"
- 블로그 일기

## 구조

서버는 GCP e2-micro 한 대다. Always Free라서 서버비는 사실상 0원이고 메모리는 1GB밖에 없다. 여기에 Python 프로세스 하나를 띄워 놓고 전부 처리한다.

```
Discord ─▶ discord.py 게이트웨이 ─▶ Brain (Claude Agent SDK 상주 세션)
                                        └▶ in-process MCP 도구
                                           (캘린더 · 메모 · 날씨 · 일기)
스케줄러 ─▶ 07:30 브리핑 / 08:00 가족 메일
```

두뇌는 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python)다. 대화 맥락을 이어 가야 하니("그럼 2인분 기준은?") 세션을 매번 새로 만들지 않고 계속 띄워 둔다. 캘린더나 메모 같은 도구는 SDK의 `@tool`로 감싸서 프로세스 안에서 MCP 서버로 붙였다.

```python
from claude_agent_sdk import create_sdk_mcp_server, tool

@tool("gcal_add",
      "일정 등록. start/end는 'YYYY-MM-DDTHH:MM' 또는 종일이면 'YYYY-MM-DD'. "
      "end 생략 시 1시간(종일은 하루)짜리",
      {"title": str, "start": str, "end": str, "description": str})
async def gcal_add(args):
    return await handle_gcal_add(gcal, args)

server = create_sdk_mcp_server(name="assist", version="1.0.0", tools=[gcal_add, ...])
```

도구 설명을 한국어로 써 두면 "다음 주 화요일 저녁 7시 회식"처럼 말해도 알아서 `start`를 채워서 부른다. 다만 모델은 지금이 몇 시인지 모름. 그래서 메시지마다 앞에 `[지금: 10/29(목) 09:12]` 같은 줄을 붙여 보냄. 이게 없으면 "내일"을 엉뚱한 날로 잡는다!!

메모리는 생각보다 빡빡했다. Agent SDK는 안에서 Claude Code CLI 프로세스를 띄우는데, 상주 세션 하나가 200MB 넘게 먹고있고 1GB 서버에서는 세션을 하나만 두고 스왑을 2GB 잡아서 버티고 있음.

![디스코드 #비서 채널에서 삐삐에게 일정 등록을 시키고 답을 받는 화면](/assets/images/pippi-assistant-1-discord-mail/discord-chat.png) 

## 가족 아침 메일

디스코드 봇이 어느 정도 자리 잡고 나서 아침 메일을 붙였다. 매일 08:00에 나와 와이프에게 HTML 메일을 한 통씩 보낸다.

- 날씨 - 시간대별 기온, 강수확률, 옷차림 한 줄
- 이번 주 일정, 다가오는 연휴와 D-day
- 오늘 저녁 메뉴 (해 먹을 거면 재료와 레시피, 아니면 배달 메뉴)
- 금요일에는 주말 국내 여행 + 연차 쓰고 갈 만한 해외 여행 추천
- 이번 주 갈 만한 팝업·전시·공연
- 뉴스 5건 한 줄 요약
- 내 블로그 방문 통계

![폰 메일 앱에서 본 아침 메일 전체 화면 (상단 호출기 머리부터 뉴스까지)](/assets/images/pippi-assistant-1-discord-mail/morning-mail.gif)

원칙은 하나만 정했다. **데이터는 코드가 모으고, 문장만 Claude가 쓴다.** 기온이나 일정 시간 같은 숫자를 모델한테 맡기면 가끔 틀린다. 날씨(Open-Meteo), 캘린더, 연합뉴스 RSS, 위키백과 사진 같은 건 코드가 직접 가져와서 그대로 넣는다. Claude는 인사말, 섹션마다 붙는 한 줄 요약, 옷차림, 저녁 메뉴, 뉴스 고르기만 한다. 두 사람 메일을 하루 한 번 호출로 같이 만든다. 호출이 실패하면 문장 없이 데이터만으로 메일을 보낸다. 메일이 아예 안 오는 날은 없게 하려는 거다.

하루 흐름은 이렇게 나눴다.

| 시각 | 하는 일 |
|---|---|
| 06:30 | 수집 |
| 07:45 | 조립 (Claude 호출 + HTML 렌더) |
| 08:00 | 발송 (Gmail SMTP, 받는 사람별로 따로) |

### 삽질 기록 1 - 비용이 20배

메일 문장은 대화용 상주 세션과 섞이지 않게 매번 새 세션으로 한 번만 묻고 닫는다. 도구도 하나도 안 준다. 처음 붙였을 때 호출 한 번 비용이 이상하게 비싸서 보니, 로컬 `CLAUDE.md`랑 설정 파일까지 프롬프트에 같이 실리고 있었다. `setting_sources=[]`를 넣으니 바로 정상으로 돌아왔다. 차이가 20배였다.

```python
opts = ClaudeAgentOptions(
    system_prompt=system, model=model,
    tools=[], permission_mode="dontAsk",
    setting_sources=[],          # 이거 없으면 CLAUDE.md까지 실린다
    output_format={"type": "json_schema", "schema": schema},
    env={"TZ": "Asia/Seoul"},
)
```

`output_format`에 JSON 스키마를 주면 결과가 구조화돼서 와서 템플릿에 바로 꽂을 수 있다. 형식이 틀리면 한 번만 다시 묻는다.

### 삽질 기록 2 - 메일 HTML은 2005년

메일 클라이언트는 웹 브라우저가 아니다. `<style>` 블록이나 웹폰트는 무시되기 일쑤라 전부 테이블 + 인라인 스타일로 짰다. 본문 표를 `width="600"`으로 고정했더니 폰(320~430px)에서 오른쪽이 잘렸다. `width:100%;max-width:600px`로 바꾸고 나서야 데스크톱과 폰에서 둘 다 제대로 보였다.

### 비용

Claude 호출은 메일 하루 한 번에 약 $0.08이다. 나중에 나들이 웹검색을 붙이면서 한 달에 몇 달러가 더 늘었다. 날씨, 뉴스 RSS, 캘린더, 위키 사진, Gmail 발송은 전부 무료

## 그런데 디스코드를 안 열게 됐다

메일은 잘 읽었다. 보고서처럼 아침에 한 번 쭉 내려 보면 끝이라 불편할 게 없었다. 와이프한테도 같은 메일이 가니까 따로 챙길 것도 없었다.

문제는 디스코드였다. 원래 자주 들어가는 앱이 아니다 보니, 일정 하나 넣으려고 디스코드를 켜는 게 은근히 귀찮았다. 게다가 와이프는 디스코드를 안 쓴다. 삐삐는 사실상 나 혼자 쓰는 비서였고 그나마 나도 점점 안 부르게 됐다.

생각해 보면 우리 둘 다 하루 종일 켜 두는 앱은 카톡 하나다. 그래서 삐삐를 카톡 단톡방으로 옮기기로 했음!

## 정리

- Claude Agent SDK의 `@tool` + `create_sdk_mcp_server`로 도구를 프로세스 안에 붙이면, 캘린더 같은 걸 자연어로 다루는 비서가 금방 나온다.
- 모델한테는 메시지마다 지금 시각을 같이 넘겨야 상대 날짜를 제대로 잡는다.
- 숫자는 코드로, 문장만 모델로. 모델 호출이 실패해도 결과물이 나가게 짜 두면 마음이 편하다.
- 일회성 호출에는 `setting_sources=[]`를 꼭 넣자. 로컬 설정이 실려서 비용이 몇십 배로 튈 수 있다.
- 기능이 좋아도 평소에 안 여는 앱에 있으면 결국 안 쓴다.
