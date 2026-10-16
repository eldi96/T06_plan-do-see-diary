"use client";
import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
type Experiment={config:null|{question:string;metric:string;unit:string;initial_rule:string;calculation_rule:string;created_at:string};days:{day:string;planned:number;completed:number;rate:number|null;fraction:string|null;recorded_at:string}[];change:null|{before_rule:string;after_rule:string;reason:string;changed_at:string};today:string;comparison:{before:number|null;after:number|null;complete:boolean}};
export function ExperimentPanel(){
  const [data,setData]=useState<Experiment|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  async function request(body?:object){
    const response=await fetch('/api/experiment',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
    if(response.status===401)window.dispatchEvent(new Event('pds-session-expired'));
    const value=await response.json() as Experiment&{error?:string};if(!response.ok)throw new Error(value.error||'실험 기록을 불러오지 못했습니다.');return value;
  }
  useEffect(()=>{let live=true;request().then(value=>{if(live)setData(value);}).catch(cause=>{if(live)setError((cause as Error).message);});return()=>{live=false;};},[]);
  async function save(body:object){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{setData(await request(body));}catch(cause){setError((cause as Error).message);}finally{lock.current=false;setBusy(false);}}
  function start(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);void save({action:'start',question:form.get('question'),initialRule:form.get('initialRule')});}
  function change(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);void save({action:'change',afterRule:form.get('afterRule'),reason:form.get('reason')});}
  return <section className="panel" aria-labelledby="experiment-title"><details><summary id="experiment-title"><strong>5일간의 계획 실험</strong>{data?.config&&<span className="micro"> · {data.days.length}/5일 기록</span>}</summary>
    <p className="micro">서울 날짜 기준으로 실제 사용한 날의 결과를 남깁니다. 둘째 날 기록 후, 셋째 날 기록 전에 계획 규칙 하나를 바꿔 비교하세요.</p>
    {!data&&!error&&<p role="status">실험 기록을 확인하고 있습니다.</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {!data&&error&&<button type="button" className="outline" onClick={()=>{setError('');request().then(setData).catch(cause=>setError((cause as Error).message));}}>다시 시도</button>}
    {data&&!data.config&&<form onSubmit={start}><fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:12}}>
      <label>알아보고 싶은 질문<textarea name="question" required maxLength={1000} placeholder="예: 평일 학습량을 조절하면 완료율이 달라질까?"/></label>
      <label>현재 계획 규칙<textarea name="initialRule" required maxLength={2000} placeholder="지금 적용 중인 계획 규칙을 적어 주세요."/></label>
      <p className="micro">지표는 날짜별 할 일 완료율, 단위는 %입니다. 시작 후 질문·지표·단위·계산 기준을 고정합니다.</p>
      <button type="submit" className="primary">{busy?'저장 중…':'실험 시작'}</button>
    </fieldset></form>}
    {data?.config&&<>
      <p><strong>{data.config.question}</strong></p><p className="micro">현재 규칙 · {data.change?.after_rule||data.config.initial_rule}</p>
      <details><summary>고정한 계산 기준</summary><p className="micro">{data.config.calculation_rule}</p><p className="micro">시작 · {new Date(data.config.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p></details>
      {data.days.length<5&&<button type="button" className="outline" disabled={busy||data.days.some(day=>day.day===data.today)||(data.days.length===2&&!data.change)} onClick={()=>void save({action:'record'})}>
        {busy?'기록 중…':data.days.some(day=>day.day===data.today)?'오늘 기록 완료':'오늘 기록 남기기'}</button>}
      <p className="micro">오늘의 할 일 체크를 마친 뒤 기록하세요. 하루 한 번 저장되며 이후 체크를 바꿔도 실험 기록은 바뀌지 않습니다.</p>
      {data.days.length===2&&!data.change&&<form onSubmit={change}><fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:12}}>
        <h3>다음 기록 전, 규칙 하나 바꾸기</h3><p className="micro">변경 전 · {data.config.initial_rule}</p>
        <label>바꿀 계획 규칙<textarea name="afterRule" required maxLength={2000}/></label><label>바꾸는 이유<textarea name="reason" required maxLength={2000}/></label>
        <button className="primary" type="submit">규칙 변경 기록</button>
      </fieldset></form>}
      {data.change&&<details><summary>규칙 변경 이력</summary><p>변경 전 · {data.change.before_rule}</p><p>변경 후 · {data.change.after_rule}</p><p>이유 · {data.change.reason}</p><p className="micro">{new Date(data.change.changed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p></details>}
      <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><caption className="micro">실제 날짜별 고정 기록 · 기록하지 않은 날은 누락이며 0%로 채우지 않습니다.</caption><thead><tr><th>날짜</th><th>완료 / 계획</th><th>완료율</th></tr></thead><tbody>
        {data.days.map((day,index)=><tr key={day.day}><td>{index+1}일차 · {day.day}</td><td>{day.completed} / {day.planned}</td><td>{day.rate===null?'계획 없음 · 비교 제외':`${day.rate.toFixed(2)}%`}</td></tr>)}
      </tbody></table></div>
      <p>변경 전 평균 ({Math.min(data.days.length,2)}/2일) · {data.comparison.before===null?'비교 자료 없음':`${data.comparison.before.toFixed(2)}%`} / 변경 후 평균 ({Math.max(0,data.days.length-2)}/3일) · {data.comparison.after===null?'비교 자료 없음':`${data.comparison.after.toFixed(2)}%`}</p>
      <p className="micro">{data.comparison.complete?'실제 5일 기록과 규칙 변경이 남았습니다. 각 날짜의 완료 수 ÷ 계획 수 × 100으로 직접 계산한 값과 비교해 주세요.':'아직 실제 5일 실험이 완료되지 않았습니다. 실제 서로 다른 날짜에 기록을 이어가세요.'}</p>
    </>}
  </details></section>;
}
