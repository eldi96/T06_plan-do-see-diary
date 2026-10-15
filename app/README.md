# 앱 실행

루트 README의 설치·빌드·실행 순서를 따릅니다.

- app/: 화면과 서버 API
- components/: UI 및 차트
- domain/, lib/: 데이터 모델과 처리 로직
- db/, drizzle/: 서버 DB와 마이그레이션
- contracts/pds-schema-v2.json: 데이터 계약
- scripts/, build/: 설치·빌드·실행에 연결된 도구
- public/, vendor/: 정적 자산과 라이선스

운영과 로컬 DB는 별개입니다. DB 파일 및 비밀값을 커밋하지 않습니다.
