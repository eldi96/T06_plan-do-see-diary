// Only fill the explicitly isolated browser QA database up to a target count.
const base = 'http://127.0.0.1:8788';
if (process.env.PDS_TEST_DATABASE !== 'isolated') throw Error('Requires isolated test-state on 8788');
const target = Number(process.argv[2] ?? 6);
if (!Number.isInteger(target) || target < 1 || target > 24) throw Error('Target must be 1–24');
const response = await fetch(base + '/api/diary');
if (!response.ok) throw Error('Test database unavailable');
const data = await response.json();
const count = data.records.filter(item => item.kind === 'plan' && !item.deleted).length;
for (let index = count; index < target; index++) {
  const r = await fetch(base + '/api/diary', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({requestId:crypto.randomUUID(),action:'save',kind:'plan',data:{title:'배치 검증 '+(index+1),startDate:'2026-10-14',endDate:'2026-10-20',priority:'보통',estimatedMinutes:30,success:'격리된 배치 검증'}}) });
  if (!r.ok) throw Error('Fixture save failed');
}
console.log('Isolated plans prepared: '+Math.max(count, target));
