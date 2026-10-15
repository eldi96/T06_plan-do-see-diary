/** Only soft-delete artifacts linked to the exact old, already deleted integration-test plans. */
const url='http://127.0.0.1:8787/api/diary';
const response=await fetch(url);if(!response.ok)throw Error('Preview unavailable');
const {records}=await response.json();
const testPlanIds=new Set(records.filter(r=>r.kind==='plan'&&r.deleted&&r.success==='검증 전용'&&/^검증 전용 [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}( 수정)?$/.test(r.title)).map(r=>r.id));
const testTaskIds=new Set(records.filter(r=>r.kind==='task'&&testPlanIds.has(r.planId)).map(r=>r.id));
const artifacts=records.filter(r=>!r.deleted&&((r.kind==='task'||r.kind==='routine'||r.kind==='review')&&testPlanIds.has(r.planId)||r.kind==='execution'&&testTaskIds.has(r.taskId)));
for(const r of artifacts){const result=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),action:'delete',kind:r.kind,id:r.id,version:r.version})});if(!result.ok)throw Error(`Test cleanup failed (${result.status})`);}
console.log(`Soft-deleted ${artifacts.length} old test artifacts. User plans and records were untouched.`);
