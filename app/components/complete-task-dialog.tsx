"use client";
import {useEffect,useRef,useState} from 'react';
import type {Task} from '../domain/model';
import {diaryRequest} from '../lib/diary-client';
import {seoulToday} from '../domain/dates';

export function CompleteTaskDialog({task,onClose,onSaved}:{task:Task;onClose:()=>void;onSaved:()=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null);
 const trigger=useRef<HTMLElement|null>(null);
 const [hours,setHours]=useState('');
 const [minutes,setMinutes]=useState('');
 const duration=Number(hours)*60+Number(minutes);
 const chooseDuration=(value:number)=>{setHours(String(Math.floor(value/60)));setMinutes(String(value%60));};
 const [end,setEnd]=useState(()=>new Date(Date.now()+9*3600000).toISOString().slice(0,16));
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<{signature:string;body:unknown}|null>(null);
 const lock=useRef(false);
 useEffect(()=>{trigger.current=document.activeElement as HTMLElement;dialog.current?.showModal();return()=>{trigger.current?.focus();};},[]);
 const close=()=>{if(!lock.current)onClose();};
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   if(task.dueDate>seoulToday())throw Error('미래 날짜의 할 일은 아직 완료할 수 없습니다.');
   if(!Number.isInteger(Number(hours))||!Number.isInteger(Number(minutes))||Number(hours)<0||Number(minutes)<0||Number(minutes)>59||duration<=0||duration>1440)throw Error('실제 시간을 1분~24시간 사이로 입력하세요. 분은 0~59로 입력하세요.');
   const finish=new Date(`${end}:00+09:00`);
   if(!Number.isFinite(finish.getTime()))throw Error('끝낸 시각을 확인하세요.');
   if(finish.getTime()>Date.now()+60000)throw Error('실제로 끝낸 시각을 입력하세요.');
   const execution={start:new Date(finish.getTime()-duration*60000).toISOString(),end:finish.toISOString(),activity:'진행',memo:'',blockedReason:reason};
   const signature=JSON.stringify(execution);
   if(!request.current||request.current.signature!==signature)request.current={signature,body:{requestId:crypto.randomUUID(),action:'complete',kind:'task',id:task.id,version:task.version,execution}};
   await diaryRequest('',request.current.body);
   await onSaved();onClose();
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 };
 return <dialog ref={dialog} className="complete-task-dialog" aria-labelledby="complete-task-title" onCancel={e=>{e.preventDefault();close();}}><form onSubmit={save}>
  <h2 id="complete-task-title">완료 기록</h2><p className="completion-task-name">{task.title}</p>
  <fieldset className="completion-label completion-duration"><legend>실제로 걸린 시간</legend><div className="completion-minute-options">{[5,15,30,60].map(m=><button key={m} type="button" aria-pressed={duration===m} className={duration===m?'primary':'outline'} onClick={()=>chooseDuration(m)}>{m===60?'1시간':`${m}분`}</button>)}</div><div className="completion-custom"><label><input aria-label="실제로 걸린 시간의 시간" type="number" inputMode="numeric" min="0" max="24" step="1" value={hours} onChange={e=>setHours(e.target.value)} placeholder="0"/><span>시간</span></label><label><input aria-label="실제로 걸린 시간의 분" type="number" inputMode="numeric" min="0" max="59" step="1" value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="0"/><span>분</span></label></div><span className="micro">시간과 분을 함께 입력할 수 있어요. 최대 24시간</span></fieldset>
  <label className="completion-label">끝낸 시각 (서울)<input type="datetime-local" required value={end} max={`${seoulToday()}T23:59`} onChange={e=>setEnd(e.target.value)}/></label>
  <p className="micro">입력한 시간으로 시작·종료 시각을 계산합니다. 실제 날짜와 시각을 확인해 주세요. 체크를 해제해도 이 기록은 남습니다.</p>
  <details><summary>막힌 이유 남기기 · 선택</summary><textarea aria-label="막힌 이유" value={reason} maxLength={3000} onChange={e=>setReason(e.target.value)}/></details>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="completion-actions"><button type="button" className="outline" disabled={busy} onClick={close}>취소</button><button className="primary" disabled={busy} type="submit">{busy?'저장 중…':'완료하고 기록'}</button></div>
 </form></dialog>;
}
