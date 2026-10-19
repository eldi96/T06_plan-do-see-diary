"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import './experiment-panel.css';

type Day={day:string;planned:number;completed:number;rate:number|null;recorded_at:string};
type Experiment={config:null|{question:string;metric:string;unit:string;initial_rule:string;calculation_rule:string;created_at:string};days:Day[];change:null|{before_rule:string;after_rule:string;reason:string;changed_at:string;basisDays:{day:string;recordedAt:string}[]};today:string;preview:{planned:number;completed:number};summary:{planned:number;completed:number;mean:number|null;validDays:number};comparison:{before:number|null;after:number|null;complete:boolean};rules:{calculation:string;weekStartsOn:string}};
const percentage=(n:number|null)=>n===null?'—':`${n.toFixed(2)}%`;
const dateTime=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
async function request(body?:object):Promise<Experiment>{
  const response=await fetch('/api/experiment',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  if(response.status===401)window.dispatchEvent(new Event('pds-session-expired'));
  const value=await response.json() as Experiment&{error?:string};if(!response.ok)throw new Error(value.error||'기록을 불러오지 못했습니다.');return value;
}
export function ExperimentPanel(){
  const [data,setData]=useState<Experiment|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [question,setQuestion]=useState(''),[initialRule,setInitialRule]=useState('');
  const lock=useRef(false),revision=useRef(0);
  const reload=useCallback(async()=>{if(lock.current)return;const id=++revision.current;try{const result=await request();if(id===revision.current){setData(result);setError('');}}catch(cause){if(id===revision.current)setError((cause as Error).message);}},[]);
  useEffect(()=>{void reload();const refresh=()=>{if(document.visibilityState==='visible')void reload();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{revision.current++;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[reload]);
  async function save(body:object,message:string){if(lock.current)return;lock.current=true;revision.current++;setBusy(true);setError('');setNotice('');try{setData(await request(body));setNotice(message);}catch(cause){setError((cause as Error).message);}finally{lock.current=false;setBusy(false);}}
  function start(event:FormEvent<HTMLFormElement>){event.preventDefault();void save({action:'start',question:question.trim(),initialRule:initialRule.trim()},'질문과 기준을 저장했습니다. 오늘 할 일을 마친 뒤 오늘 결과를 확정하세요.');}
  function change(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);void save({action:'change',afterRule:form.get('afterRule'),reason:form.get('reason')},'변경한 계획 방식을 저장했습니다. 다음 날짜의 기록부터 적용하세요.');}
  const count=data?.days.length??0,configured=!!data?.config,needsChange=configured&&count===2&&!data?.change;
  const recordedToday=data?.days.some(day=>day.day===data.today)??false;
  return <section className="panel experiment-panel" aria-labelledby="experiment-title" aria-busy={busy}>
    <header className="experiment-heading"><div><h2 id="experiment-title">5일간의 계획 돌아보기</h2><p className="micro">평소처럼 체크하고, 하루가 끝나면 결과만 남겨요.</p></div><span className="experiment-badge">{configured?`${count} / 5일`:'시작 전'}</span></header>
    <ol className="experiment-days" aria-label="5일 기록 진행 상황">{Array.from({length:5},(_,i)=>{const day=data?.days[i];return <li key={i} className={day?'is-recorded':configured&&i===count?'is-next':''}><span>{i+1}일차</span><strong>{day?percentage(day.rate):'—'}</strong><small>{day?day.day.slice(5).replace('-','.'):(i<2?'변경 전':'변경 후')}</small></li>;})}</ol>
    {error&&<div className="experiment-error"><p role="alert">{error}</p><button type="button" className="outline" disabled={busy} onClick={()=>void reload()}>다시 확인</button></div>}
    <p className="experiment-notice" role="status">{notice}</p>
    {!data&&!error&&<p className="micro">저장된 기록을 확인하고 있습니다.</p>}
    {data&&!configured&&<>
      <p className="experiment-intro">처음 이틀의 결과를 보고 <strong>계획하는 방식 한 가지</strong>를 바꿔보세요. 나머지 사흘과 비교하면 나에게 맞는 계획량을 찾을 수 있어요.</p>
      <form onSubmit={start}><fieldset disabled={busy} className="experiment-fields">
        <label>알아보고 싶은 점<textarea name="question" rows={2} required maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="할 일을 줄이면 하루 완료율이 높아질까?"/></label>
        <label>지금 계획하는 방식<textarea name="initialRule" rows={2} required maxLength={2000} value={initialRule} onChange={e=>setInitialRule(e.target.value)} placeholder="하루에 핵심 할 일을 3개씩 정한다."/></label>
        <div className="experiment-form-footer"><button type="button" className="experiment-example" onClick={()=>{setQuestion('하루에 계획하는 할 일 수를 줄이면 완료율이 높아질까?');setInitialRule('하루에 핵심 할 일을 3개씩 정한다.');}}>예시 불러오기</button><span className="micro">예시는 내 상황에 맞게 고친 뒤 저장하세요.</span><button type="submit" className="primary" disabled={!question.trim()||!initialRule.trim()}>{busy?'저장 중…':'질문과 기준 저장'}</button></div>
      </fieldset></form>
      <p className="micro">오늘 할 일 {data.preview.planned}개 중 {data.preview.completed}개 완료 · 지표는 날짜별 완료율(%)로 유지됩니다. 과거 기록을 자동으로 채우지는 않습니다.</p>
    </>}
    {data?.config&&<>
      <div className="experiment-question"><strong>{data.config.question}</strong><p className="micro">계획 방식 · {data.change?.after_rule??data.config.initial_rule}</p></div>
      {needsChange?<form onSubmit={change} className="experiment-action">
        <h3>이틀을 돌아보고, 한 가지만 바꿔보세요.</h3><p className="micro">{data.days.map((day,i)=>`${i+1}일차 ${day.day} · ${day.completed}/${day.planned}개`).join(' / ')}<br/>기존 방식 · {data.config.initial_rule}</p>
        <fieldset disabled={busy} className="experiment-fields"><label>앞으로 계획하는 방식<textarea name="afterRule" rows={2} required maxLength={2000} placeholder="하루 핵심 할 일을 3개에서 2개로 줄인다."/></label><label>바꾸려는 이유<textarea name="reason" rows={2} required maxLength={2000} placeholder="처음 이틀에 마치지 못한 일이 쌓여 계획량을 조절하려고 한다."/></label><div className="experiment-form-footer"><span className="micro">저장한 변경 시각과 앞선 두 날짜가 함께 남습니다.</span><button type="submit" className="primary">{busy?'저장 중…':'변경한 방식 저장'}</button></div></fieldset>
      </form>:count<5?<div className="experiment-action experiment-today"><div><span className="micro">{data.today} · 서울 기준</span><h3>{recordedToday?'오늘 결과를 남겼어요.':'오늘의 체크가 결과가 됩니다.'}</h3><p>{recordedToday?'다음 날짜에 이어서 기록하면 됩니다.':`오늘 할 일 ${data.preview.planned}개 중 ${data.preview.completed}개 완료`}</p><p className="micro">{recordedToday?'같은 날의 결과는 한 번만 저장됩니다.':'결과를 확정하면 이후 할 일 체크를 바꿔도 이 기록은 유지됩니다.'}</p></div><button type="button" className="primary" disabled={busy||recordedToday} onClick={()=>void save({action:'record'},'오늘 결과를 확정했습니다.')}>{busy?'저장 중…':recordedToday?'오늘 기록 완료':'오늘 결과 확정'}</button></div>:<div className="experiment-action"><h3>다섯 날짜의 기록이 모였어요.</h3><p className="micro">변경 전 이틀과 변경 후 사흘을 같은 완료율 기준으로 비교하세요.</p></div>}
      {count>0&&<>
        <div className="experiment-comparison"><div><span>변경 전 · {Math.min(count,2)}일</span><strong>{percentage(data.comparison.before)}</strong></div><span className="experiment-arrow" aria-hidden="true">→</span><div><span>변경 후 · {Math.max(0,count-2)}일</span><strong>{percentage(data.comparison.after)}</strong></div><p className="micro">일별 완료율의 평균 · 계획이 없는 날은 평균에서 제외</p></div>
        <details className="experiment-detail"><summary>날짜별 기록과 계산 확인</summary><div className="experiment-table-wrap"><table><caption className="micro">기록하지 않은 날은 0%로 채우지 않습니다.</caption><thead><tr><th>날짜</th><th>완료 / 계획</th><th>완료율</th></tr></thead><tbody>{data.days.map((day,i)=><tr key={day.day}><td>{i+1}일차 · {day.day}</td><td>{day.completed} / {day.planned}</td><td>{day.rate===null?'계획 없음':percentage(day.rate)}</td></tr>)}</tbody></table></div><p className="micro">기록된 {count}일 합계 · 완료 {data.summary.completed}개 / 계획 {data.summary.planned}개<br/>일별 완료율 평균 · {percentage(data.summary.mean)} (계획이 있는 {data.summary.validDays}일 기준)</p></details>
      </>}
      {data.change&&<details className="experiment-detail"><summary>계획 방식을 바꾼 기록</summary><p>변경 전 · {data.change.before_rule}</p><p>변경 후 · {data.change.after_rule}</p><p>이유 · {data.change.reason}</p><p className="micro">근거 · {data.change.basisDays.map(d=>d.day).join(', ')}<br/>변경 시각 · {dateTime(data.change.changed_at)}</p></details>}
    </>}
    {data&&<details className="experiment-detail"><summary>기록 방법과 계산 기준</summary><p className="micro">① 질문과 현재 방식을 정해요. ② 서로 다른 날짜에 이틀을 기록해요. ③ 계획 방식 하나를 바꾸고 이유를 남겨요. ④ 사흘을 더 기록해 비교해요.</p><p className="micro">{data.rules.calculation}</p>{data.config&&<p className="micro">기준을 정한 시각 · {dateTime(data.config.created_at)}</p>}</details>}
  </section>;
}
