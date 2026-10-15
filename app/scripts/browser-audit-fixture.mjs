// Disposable QA data; never connect this script to the user preview or production.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8788';
if(process.env.PDS_TEST_DATABASE!=='isolated')throw Error('Requires isolated test-state on 8788');
async function save(kind,data){const r=await fetch(base+'/api/diary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),action:'save',kind,data})});const result=await r.json();assert.equal(r.status,200);return result;}
const plan=await save('plan',{title:'브라우저 검수 전용',startDate:'2026-10-14',endDate:'2026-10-14',priority:'보통',estimatedMinutes:30,success:'격리 테스트'});
const literal='<img src=x onerror="document.body.dataset.pdsXss=1">';
const task=await save('task',{planId:plan.id,title:literal,dueDate:'2026-10-14',priority:'보통',estimatedMinutes:15,tags:[],notes:'<script>document.body.dataset.pdsXss=1</script>',learning:false,understanding:null});
await save('execution',{taskId:task.id,start:'2026-10-14T10:00:00+09:00',end:'2026-10-14T10:10:00+09:00',content:literal,blockedReason:'검수용 막힘'});
console.log('Disposable browser fixture ready on 8788 only.');
