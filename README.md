# 플랜두씨 다이어리

계획을 세우고, 실제로 한 일을 기록하고, 돌아본 내용을 다음 계획으로 이어가는 앱입니다.

React · TypeScript · Cloudflare Workers · D1을 사용합니다. 최종 데이터 구조는 app/contracts/pds-schema-v2.json에 있습니다.

## 실행

Node.js 22.13 이상에서 app 폴더로 이동해 실행합니다.

```sh
npm ci
npm run build
npm start -- --port 8787
```

로컬 주소: http://127.0.0.1:8787

실제 다이어리 데이터, DB 파일, 환경 비밀값은 저장소에 포함하지 않습니다.
