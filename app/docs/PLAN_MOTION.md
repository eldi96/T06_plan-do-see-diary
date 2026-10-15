# 계획 레이아웃 모션

2026-10-14. 사용자 예제의 동적 배치 방식만 적용. 색·문구·데이터·페이지 구성 CSS는 바꾸지 않았다. 공식 npm animejs를 exact 버전으로 설치하고 animejs/layout 하위 모듈만 사용한다.

React가 DOM과 실제 데이터를 관리한다. 훅은 createLayout으로 배치 스냅샷을 보관하고, 보기 전환 전에 record(), React commit 후 useLayoutEffect에서 animate()를 실행한다. 예제처럼 appendChild/innerHTML로 항목을 직접 만들지 않는다.

| Before | After | Why |
|---|---|---|
| 카드·목록 즉시 재배치 | 240ms out(3) 배치 이동 | 같은 계획이 어디로 이동하는지 연결 |
| 화면에 새로 들어온 계획 즉시 표시 | 12px 이동·scale .98·opacity, 200ms | 기존 디자인을 유지한 작은 등장 |
| 삭제 시 즉시 빈자리 변경 | 6px 퇴장·scale .98·opacity, 160ms | 짧은 퇴장과 주변 배치 연결 |
| 빈 목록 이후 이전 DOM 인스턴스 남을 가능성 | root 제거/교체시 revert 후 재생성 | 마지막 삭제→첫 생성 관계 오류 방지 |

검색·페이지 이동·첫 데이터 로딩·키보드 조작은 즉시 처리한다. prefers-reduced-motion reduce에는 이동을 실행하지 않고 설정 변경시 진행 중 모션을 정리한다. unmount도 revert한다. 초기 자동 보기와6개 페이지 규칙은 유지하므로 다른 페이지에 있는 항목을 추가해도 현재 페이지에 가짜 항목을 만들지 않는다.

검증: TypeScript, 신규 hook/component ESLint, 최종 빌드 통과. 실제 사용자 앱에서 포인터 보기 전환 is-animated true, 전환 전후 계획 textContent 동일, console error0 확인. 격리8788에서 마지막 계획 삭제→재생성→추가→삭제(0→1→2→1), 키보드 Enter 목록전환 모션false, console error0. 검수자 최종 코드 판정 Approve. reduced-motion 변경·실제 휴대전화 체감은 코드 확인 범위다.

사용자 실제 기록을 저장/삭제하지 않았다. 격리 DB의 지정 검증용 계획만 CRUD했다. 배포 없음.

공식 참고: https://animejs.com/documentation/layout/layout-methods/record/ 및 https://animejs.com/documentation/layout/layout-methods/animate/
