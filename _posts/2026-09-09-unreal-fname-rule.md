---
layout: post
title: "언리얼의 FName 규칙"
title_en: "FName Rule in Unreal Engine"
date: 2026-09-09 09:46:35 +0900
categories: ["unrealengine"]
tags: ["ue5", "fname", "ue", "unrealengine", "c++", "coding", "rule", "rowname", "fstring"]
---

# 언리얼에 이런 이슈도 있었네

가끔 한 기능이 PIE 환경에선 잘 되는데, Shipping Build에선 안되는 경우가 더러 있다.

이번에 빌드하다 DT 데이터를 받아오는 부분에서 `TAB`이라는 데이터가 분명 에디터에선 잘 되는데,, 패키징에선 안나오는 이슈가 있었음.

결국 호출하는 쪽을 BP부터 C++까지 찾아 발견했다. (원인은 WBP안에 있었음)

멀고도 먼 유지보수의 길.. ~퇴사한 개발자의 코드를 보는건 너무 괴롭다(탓할 사람이 없음)~

아래 캡쳐된 화면을 보면 셋의 차이점이 뭔지 알겠는가.

![Equal FString, FName in UE](/assets/images/unreal-fname-rule/3a953119-3d9c-4494-8f6b-7fa06e46b0e0.png)

첫번째는 FName끼리 비교했을때 -> Equal(Name)은 대소문자를 무시한다.
* 즉 Tab == TAB 는 True 인 셈.

두번째와 세번째는 FString끼리 비교했을때
* Tab == TAB 는 True. Tab === TAB 는 False.

사실 여기까진 거의 다 아는 사실이다.

---

# 근데 실무에선 이게 어떻게 작용하나?

언리얼 데이터 테이블을 보면 RowName은 FName으로 돼있음.

언리얼 FName의 동작은
* 전역 이름 사전으로 쓰임. 그래서 같은 철자는 대소문자 무시하고 한 칸만 차지하고, 그 칸에 저장되는 철자는 맨 처음 등록한 쪽의 것!!!

이게 무슨말이냐..

PIE 환경에선 각 FName 값이 자기 대소문자를 따로 기억함. TAB이든, Tab이든 각자 철자 입력한대로 저장됨.

근데 패키징환경에선?

* 이 기능이 꺼짐. `(WITH_CASE_PRESERVING_NAME = WITH_EDITORONLY_DATA)`
* TAB을 만들어도 사전에 이미 Tab가 있으면 그 칸을 재사용하게됨. 그래서 FString으로 바꾸면 Tab이 나옴.

즉, 누가 먼저 `Tab`을 등록했나가 중요해짐. 

현재 프로젝트에선 Tab키를 Input에 등록했었다.
`EKeys::Tab("Tab")` 그래서 콘텐츠가 로드되기 훨씬 전부터 실행 파일 시작점에 `Tab`이라는 이름으로 등록됐음.

그리고 WBP에선 이걸 FName끼리 검사했던게 아니라 굳이굳이 FString으로 변환 후 `===` 이 Case Sensitive Equal로 검사를 했으니 false로 빠져버린 것...

진짜 첨보는 이슈여서 당황했음.

그래서 FName은 중복되지 않는게 좋다고 한다..! 특히 DT의 RowName이나, 키보드 키 문자들과..! (Space, Tab등등)

혹시나 String으로 변환 후 비교할수도 있으니까 ㅋㅋㅋ