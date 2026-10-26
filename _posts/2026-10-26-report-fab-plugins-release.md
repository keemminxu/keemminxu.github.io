---
layout: post
title: "플러그인 2개 출시 6개월차 회고"
title_en: "Report of Fab Plugin Release for 6 months"
date: 2026-10-26 17:18:05 +0900
categories: ["unrealengine"]
tags: ["ue5", "fab", "plugin", "editorcursorskin", "blueprintanalyzer"]
---

# 어느덧 첫 플러그인을 출시한지.. 반년이 다 됐다!

정확히 6개월 뒤에 리포트 보면서 써볼려고했으나 게으른 이슈로 살짝 늦어진 점 ㅎ

~4월 21일에 출시했고 오늘은 10월 26일이다~

무튼 이 글을 쓰는 이유는 그냥 이래저래 전 세계 사람들과 소통 아닌 소통을 해볼 수 있었고. 작지만 여러 뿌듯함을 느끼는 순간도 많았음

# 결과 보고-Blueprint Analyzer

우선 결과에 대한 보고를 하자면 딱 6개월 동안 `BP Analyzer`는 Fab에서 997건의 다운로드 수, GitHub 10스타..!와 2포크를 성취했다. (사실 Fab 다운로드 1000건 보다 GitHub 10스타가 너무 신기하고 뿌듯함)

![BlueprintAnalyzer Fab 997 Downloads](/assets/images/report-fab-plugins-release/9c0caadc-24a9-458a-af8f-01435e1a940e.png)

![BlueprintAnalyzer GitHub 10 Stars](/assets/images/report-fab-plugins-release/72447a91-a6e0-4e3b-9cad-b7a21bfd21f0.png)


Fab 다운로드 결과를 보면 역시 유럽과, 북미 사람들이 과반수 이상을 차지했다.

그 이유를 생각해보니..


플러그인의 목적성이 .uasset 같은 바이너리 파일을 플러그인을 통해 쉽게 접근하자! 였는데, 요즘엔 이 바이너리도 fable이든 opus든 전부 다 읽어주고 솔직히 내 플러그인 보다 훨씬 유용하게 더 잘 읽어준다.

언리얼 mcp도 현재 실무에 적용시킬 수준으로 활용이 가능해졌고.. 아무래도 AI 도움이 없거나 혹은 claude code, codex등을 활용하지 인디게임 개발자가 유럽이나 북미 쪽에는 나머지 지역보다 훨씬 많은 것 같다. 인구가 많기도 하고..

쨌든 관련해서 여러 연락도 왔었다.


![SPAM mail](/assets/images/report-fab-plugins-release/25c741e6-99bf-485a-9827-3a887dfbfda5.png)

위에는 스팸인데 이렇게 협업을 제안하는 달콤한 메일도 왔지만, 무슨 LLM도 탑재안한 내 플러그인에 말도안되는 소리였고,, 나는 내 프로젝트를 직접 언급하면서 이름을 얘기하길래 정말 플러그인에 감명받은 분인줄 알았다 ㅋㅋㅋㅋ ㅠ


![dutch email](/assets/images/report-fab-plugins-release/39b52686-9e1d-49ca-9a67-001f8a5c89e6.png)

위 메일은 어떤 독일 회사에 있는 CEO가 나에게 직접 보낸 메일이었다. 스팸 아님! 5.4 버전도 공식 지원해달라고 요청 메일을 보내셨음ㅋㅋ(보니까 언리얼로 해양 시뮬레이션? 만드는 회사였음)

물론 바로 5.4로 업데이트해주고 깃허브에 릴리즈도 올려줬다.

![fab review 1](/assets/images/report-fab-plugins-release/6aa504d8-a17a-45de-a7ef-a716f6a8778a.png)

이 외에도 fab 리뷰에 1점으로 남긴 유저로 인해 4.3점이 됐다!!!! 누구야!!!!!!!! 말로해 그럼 업데이트로 해결해줄게ㅠㅠㅠ

하튼 이제 뭐 AI가 알아서 다 해주는 세상에 BP를 분석하는게 의미가 있겠냐만은 나에게는 그냥 좋은 경험이 됐다.

## 다음 결과 보고-EditorCursorSkin

사실 `Editor Cursor Skin`은 뭐 생산적인 기능이 아니라 그냥 에디터의 커서를 자유롭게 커스텀 할 수 있는 기능이라 큰 기대는 안했다만, 꽤 성적은 선방했다.

5월에 출시해서 대략 5개월 정도 기록해봤는데 다운로드 수는 143회..! GitHub는 0스타 ㅎ

대신!!


![editor cursor skin fab review](/assets/images/report-fab-plugins-release/c09f5683-b63f-4bdb-9ef5-851fb2b5f457.png)

이렇게 fab에 실제 글 리뷰가 달렸다..! 심지어 5점으로 두 분이 체크해줬다니 감사합니다!!

심지어 저 댓글 단 유저분은 모니터 이슈인진 모르겠으나 UE에서 마우스 커서가 잘 안보였는데 잘보이게 됐다? 뭐 이런 댓글을 다신거 같다 ㅋㅋㅋ 진짜 무척이나 힘이 됐다.

이 플러그인은 이거말곤 아직 뭐 없다. 그래도 매주 한, 두분씩은 다운로드 받아주심

---

다음엔 뭘 만들어서 출시해볼까나~
