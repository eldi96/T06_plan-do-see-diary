import {env} from 'cloudflare:workers';
import {assertSameOrigin, authJson, requireSession} from '../../../lib/auth-server';

const CALCULATION = '서울 날짜 기준 당일 마감·미삭제 할 일 중 현재 완료한 수 ÷ 전체 수 × 100. 같은 소유자의 미삭제 계획에 연결된 할 일만 포함. 하루 한 번 서버 시각으로 고정. 누락 날짜는 null이며 0으로 채우지 않음. 할 일 0개인 날은 null로 비교 제외. 중복 날짜 기록 거절. 유난히 높거나 낮은 값도 실제 결과이면 삭제하거나 보정하지 않음. 완료 수는 계획 수 이하여서 완료율은 0~100% 범위. 각 일자의 원래 분수로 평균을 계산한 뒤 소수 둘째 자리 반올림. 주 시작 일요일. 지표·단위·계산 방식은 실험 시작 후 변경 불가.';
type Config = {question:string;metric:string;unit:string;initial_rule:string;calculation_rule:string;created_at:string};
type Day = {day:string;planned:number;completed:number;task_snapshot:string;recorded_at:string};
type Change = {before_rule:string;after_rule:string;reason:string;changed_at:string};
const today = () => new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const rounded = (value:number) => Math.round((value+Number.EPSILON)*100)/100;
function db(){if(!env.DB)throw new Error('DB unavailable');return env.DB;}
async function state(owner:string) {
  const currentDay=today();
  const [config,days,change,preview] = await Promise.all([
    db().prepare('SELECT question,metric,unit,initial_rule,calculation_rule,created_at FROM experiment_config WHERE owner_id=?').bind(owner).first<Config>(),
    db().prepare('SELECT day,planned,completed,task_snapshot,recorded_at FROM experiment_days WHERE owner_id=? ORDER BY day').bind(owner).all<Day>(),
    db().prepare('SELECT before_rule,after_rule,reason,changed_at FROM experiment_change WHERE owner_id=?').bind(owner).first<Change>(),
    db().prepare(`SELECT COUNT(*) planned,COALESCE(SUM(CASE WHEN json_extract(t.data,'$.completed')=1 THEN 1 ELSE 0 END),0) completed
      FROM records t WHERE t.owner_id=? AND t.kind='task' AND t.deleted=0 AND json_extract(t.data,'$.dueDate')=?
      AND EXISTS(SELECT 1 FROM records p WHERE p.owner_id=t.owner_id AND p.id=json_extract(t.data,'$.planId') AND p.kind='plan' AND p.deleted=0)`)
      .bind(owner,currentDay).first<{planned:number;completed:number}>(),
  ]);
  const records = days.results.map(day=>({...day, task_snapshot:JSON.parse(day.task_snapshot) as {id:string;completed:boolean}[], rate:day.planned?rounded(day.completed/day.planned*100):null, fraction:day.planned?`${day.completed}/${day.planned} × 100`:null}));
  const mean = (slice:Day[]) => {
    const valid = slice.filter(day=>day.planned>0);
    return valid.length?rounded(valid.reduce((total,day)=>total+day.completed/day.planned*100,0)/valid.length):null;
  };
  const calculation=config?.calculation_rule??CALCULATION;
  return {config,days:records,change:change?{...change,basisDays:records.slice(0,2).map(d=>({day:d.day,recordedAt:d.recorded_at}))}:null,today:currentDay,
    preview:{planned:preview?.planned??0,completed:preview?.completed??0},
    summary:{planned:records.reduce((n,d)=>n+d.planned,0),completed:records.reduce((n,d)=>n+d.completed,0),mean:mean(days.results),validDays:records.filter(d=>d.planned>0).length},
    comparison:{before:mean(days.results.slice(0,2)),after:mean(days.results.slice(2,5)),unit:'%',beforeDays:days.results.slice(0,2).map(d=>d.day),afterDays:days.results.slice(2,5).map(d=>d.day),complete:records.length===5&&!!change},rules:{missing:null,zeroPlanned:null,weekStartsOn:calculation.includes('주 시작 월요일')?'월요일':'일요일',rounding:'소수 둘째 자리',calculation}};
}
export async function GET(request:Request) {
  try {
    const session=await requireSession(request);
    if(!session)return authJson({error:'로그인이 필요합니다.'},401);
    return authJson(await state(session.user.id));
  } catch {return authJson({error:'실험 기록을 불러오지 못했습니다.'},503);}
}
async function body(request:Request):Promise<Record<string,unknown>|null> {
  if(!request.headers.get('content-type')?.startsWith('application/json'))return null;
  const reader=request.body?.getReader();if(!reader)return null;
  const chunks:Uint8Array[]=[];let length=0;
  try {
    while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>12000){await reader.cancel();return null;}chunks.push(next.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const value=JSON.parse(new TextDecoder().decode(bytes));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  } catch{return null;}
}
const text=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max?value.trim():null;
export async function POST(request:Request) {
  const originError=assertSameOrigin(request);if(originError)return originError;
  try {
    const session=await requireSession(request);if(!session)return authJson({error:'로그인이 필요합니다.'},401);
    const owner=session.user.id,input=await body(request);
    const allowed:Record<string,string[]>={start:['action','question','initialRule'],record:['action'],change:['action','afterRule','reason']};
    if(!input||typeof input.action!=='string'||!allowed[input.action]||Object.keys(input).some(key=>!allowed[input.action as string].includes(key)))return authJson({error:'입력 형식을 확인해 주세요.'},400);
    const now=new Date().toISOString(),day=today();let changes=0;
    if(input.action==='start') {
      const question=text(input.question,1000),rule=text(input.initialRule,2000);
      if(!question||!rule)return authJson({error:'질문과 현재 계획 규칙을 입력해 주세요.'},400);
      const result=await db().prepare(`INSERT INTO experiment_config(owner_id,question,initial_rule,calculation_rule,created_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id) DO NOTHING`).bind(owner,question,rule,CALCULATION,now).run();changes=result.meta.changes;
    } else if(input.action==='change') {
      const afterRule=text(input.afterRule,2000),reason=text(input.reason,2000);
      if(!afterRule||!reason)return authJson({error:'바꿀 규칙과 이유를 입력해 주세요.'},400);
      const result=await db().prepare(`INSERT INTO experiment_change(owner_id,before_rule,after_rule,reason,changed_at)
        SELECT owner_id,initial_rule,?,?,? FROM experiment_config c WHERE owner_id=? AND initial_rule<>?
        AND (SELECT COUNT(*) FROM experiment_days d WHERE d.owner_id=c.owner_id)=2
        AND NOT EXISTS(SELECT 1 FROM experiment_change x WHERE x.owner_id=c.owner_id)`)
        .bind(afterRule,reason,now,owner,afterRule).run();changes=result.meta.changes;
    } else {
      // One INSERT statement evaluates eligibility and captures the same consistent task set.
      const result=await db().prepare(`INSERT INTO experiment_days(owner_id,day,planned,completed,task_snapshot,recorded_at)
        SELECT ?,?,COUNT(*),COALESCE(SUM(CASE WHEN json_extract(t.data,'$.completed')=1 THEN 1 ELSE 0 END),0),
        COALESCE(json_group_array(json_object('id',t.id,'completed',json(CASE WHEN json_extract(t.data,'$.completed')=1 THEN 'true' ELSE 'false' END))),'[]'),?
        FROM records t WHERE t.owner_id=? AND t.kind='task' AND t.deleted=0 AND json_extract(t.data,'$.dueDate')=?
        AND EXISTS(SELECT 1 FROM records p WHERE p.owner_id=t.owner_id AND p.id=json_extract(t.data,'$.planId') AND p.kind='plan' AND p.deleted=0)
        HAVING EXISTS(SELECT 1 FROM experiment_config c WHERE c.owner_id=?)
        AND (SELECT COUNT(*) FROM experiment_days d WHERE d.owner_id=?)<5
        AND NOT EXISTS(SELECT 1 FROM experiment_days d WHERE d.owner_id=? AND d.day=?)
        AND ((SELECT COUNT(*) FROM experiment_days d WHERE d.owner_id=?)<2 OR EXISTS(SELECT 1 FROM experiment_change x WHERE x.owner_id=?))`)
        .bind(owner,day,now,owner,day,owner,owner,owner,day,owner,owner).run();changes=result.meta.changes;
    }
    if(changes!==1)return authJson({error:input.action==='record'?'오늘 이미 기록했거나, 시작 설정·둘째 날 이후 규칙 변경을 확인해야 합니다. 실험은 최대 5일입니다.':input.action==='change'?'서로 다른 2일을 기록한 뒤, 셋째 날 기록 전에 한 번만 다른 규칙으로 변경할 수 있습니다.':'이미 시작한 실험 설정은 변경할 수 없습니다.'},409);
    return authJson(await state(owner));
  } catch{return authJson({error:'실험 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
