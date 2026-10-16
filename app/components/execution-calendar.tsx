"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,X,Plus,Check} from 'lucide-react';
import type {Task,Plan,Execution} from '../domain/model';
import {seoulToday} from '../domain/dates';

export function ExecutionCalendar({tasks,plans,records,busy,initialDate,onToggle,onEdit,onRecord,onSchedule}:{tasks:Task[];plans:Plan[];records:Execution[];busy:boolean;initialDate:string;onToggle:(task:Task)=>Promise<boolean|void>;onEdit:(task:Task)=>void;onRecord:(task:Task,date:string)=>void;onSchedule:(task:Task,date:string)=>Promise<void>}) {
 const [month,setMonth]=useState(()=>initialDate.slice(0,7));
 const [selected,setSelected]=useState('');
 const [choosing,setChoosing]=useState(false);
 const [search,setSearch]=useState('');
 const [message,setMessage]=useState('');
 const [holidays,setHolidays]=useState<Record<string,string>>({});
 const [holidayError,setHolidayError]=useState(false);
 const year=month.slice(0,4);
 useEffect(()=>{const controller=new AbortController();setHolidays({});setHolidayError(false);
  fetch(`/api/calendar?year=${year}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<{holidays:Record<string,string>}>;}).then(data=>setHolidays(data.holidays)).catch(()=>{if(!controller.signal.aborted)setHolidayError(true);});
  return()=>controller.abort();
 },[year]);
 const trigger=useRef<HTMLElement|null>(null);
 const today=seoulToday();
 const live=useMemo(()=>tasks.filter(t=>!t.deleted&&plans.some(p=>!p.deleted&&p.id===t.planId)),[tasks,plans]);
 const first=`${month}-01`;
 const offset=new Date(`${first}T00:00:00Z`).getUTCDay();
 const days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 const daily=live.filter(t=>t.dueDate===selected);
 const done=daily.filter(t=>t.completed).length;
 const shift=(direction:number)=>{const d=new Date(`${first}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+direction);setMonth(d.toISOString().slice(0,7));};
 const close=()=>{setSelected('');setChoosing(false);setSearch('');trigger.current?.focus();};
 const select=(date:string)=>{trigger.current=document.activeElement as HTMLElement;setSelected(date);setChoosing(false);setMessage('');};
 useEffect(()=>{if(!selected)return;const dismiss=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected('');setChoosing(false);trigger.current?.focus();}};document.addEventListener('keydown',dismiss);return()=>document.removeEventListener('keydown',dismiss);},[selected]);
 const label=(date:string)=>new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
 return <section className={`panel execution-calendar calendar-layout${selected?' has-selection':''}`} aria-label="실행 기록 달력"><div className="calendar-main">
  <div className="calendar-heading"><div className="calendar-month"><button className="outline" aria-label="이전 달" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><h2>{month.slice(0,4)}년 {Number(month.slice(5))}월</h2><button className="outline" aria-label="다음 달" onClick={()=>shift(1)}><ChevronRight size={18}/></button></div><button className="outline" onClick={()=>{setMonth(today.slice(0,7));select(today);}}>오늘</button></div>
  <div className="calendar-weekdays">{['일','월','화','수','목','금','토'].map((d,i)=><span className={i===0?'is-sunday':i===6?'is-saturday':undefined} key={d}>{d}</span>)}</div>
  {holidayError&&<p className="micro" role="status">공휴일 정보를 불러오지 못했어요. 주말과 일정은 계속 확인할 수 있어요.</p>}
  <div className="calendar-days">{Array.from({length:offset},(_,i)=><div className="calendar-blank" key={`blank${i}`}/>)}{Array.from({length:days},(_,i)=>{
   const date=`${month}-${String(i+1).padStart(2,'0')}`,items=live.filter(t=>t.dueDate===date),completed=items.filter(t=>t.completed).length;
   const future=date>today,ratio=items.length?completed/items.length:0;
   const weekday=(offset+i)%7,holiday=holidays[date];
   const level=future||!items.length?'none':ratio===1?'full':ratio>=.75?'high':ratio>=.5?'medium':ratio>0?'low':'zero';
   return <button key={date} className={`calendar-day level-${level}${weekday===0?' is-sunday':weekday===6?' is-saturday':''}${holiday?' is-holiday':''}${date===today?' is-today':''}${date===selected?' is-selected':''}`} aria-label={`${label(date)}${holiday?` · ${holiday}`:''} · ${items.length?future?`예정 ${items.length}개`:`${items.length}개 중 ${completed}개 완료`:'예정 없음'}`} title={holiday} onClick={()=>select(date)}><span>{i+1}</span>{holiday&&<em className="calendar-holiday-name">{holiday}</em>}<small>{items.length?(future?`${items.length}개 예정`:`${completed}/${items.length}`):''}</small></button>;
  })}</div>
  </div><div className="calendar-panel-slot" aria-hidden={!selected} inert={!selected}><aside className="calendar-inline-panel" aria-labelledby="calendar-day-title">
   <div className="drawer-heading"><h2 id="calendar-day-title">{selected&&label(selected)}</h2><button className="icon-button" aria-label="날짜 패널 닫기" onClick={close}><X size={20}/></button></div>
   {selected>today&&<p className="micro">미래 일정은 미리 확인하고 수정할 수 있어요. 완료 기록은 해당 날짜부터 남길 수 있어요.</p>}<p className="drawer-count">{daily.length}개 중 {done}개 완료{selected>today?' · 예정일 전':''}</p>
   <div className="drawer-progress" aria-hidden="true"><span style={{width:`${daily.length?done/daily.length*100:0}%`}}/></div>
   <div className="drawer-tasks">{daily.map(task=>{
    const linked=records.filter(r=>!r.deleted&&r.taskId===task.id);
    return <div key={task.id} className="drawer-task"><label><input type="checkbox" aria-label={`${task.title} 완료`} checked={task.completed} disabled={busy||(!task.completed&&task.dueDate>today)} onChange={async()=>{try{const saved=await onToggle(task);if(saved!==false)setMessage("완료 상태를 저장했습니다.");}catch(e){setMessage((e as Error).message);}}}/><span><strong>{task.title}</strong><small>{plans.find(p=>p.id===task.planId)?.title}{task.routineId?' · 루틴':''}</small></span></label><details><summary aria-label={`${task.title} 상세`}>···</summary><div className="drawer-options"><button className="text-button" disabled={selected>today} onClick={()=>{close();onRecord(task,selected);}}>시간·메모 기록</button><button className="text-button" onClick={()=>{close();onEdit(task);}}>할 일 수정</button>{linked.length>0&&<small>실행 기록 {linked.length}건 · {Number((linked.reduce((n,r)=>n+r.durationSeconds,0)/60).toFixed(1))}분</small>}</div></details></div>;
   })}{!daily.length&&<p className="calendar-empty">이날의 할 일이 없습니다.<br/>계획에서 할 일을 선택해 보세요.</p>}</div>
   {message&&<p role="status" className="micro">{message}</p>}
   <button className="text-button calendar-add" onClick={()=>setChoosing(!choosing)}><Plus size={16}/>할 일 선택</button>
   {choosing&&<div className="calendar-task-picker"><p className="micro">선택하면 이 날짜로 예정일(마감일)을 옮깁니다. 루틴은 원래 날짜를 유지합니다.</p><input aria-label="추가할 할 일 검색" placeholder="할 일 찾기" value={search} onChange={e=>setSearch(e.target.value)}/>{live.filter(t=>!t.completed&&!t.routineId&&t.dueDate!==selected&&t.title.includes(search)).map(t=><button className="outline" disabled={busy} key={t.id} onClick={async()=>{try{await onSchedule(t,selected);setMessage('이 날짜에 할 일을 배치했습니다.');}catch(e){setMessage((e as Error).message);}}}>{t.title}<small>{t.dueDate}</small></button>)}</div>}
   <p className="drawer-footnote"><Check size={14}/>체크하면 실제 시간을 입력하고 완료와 실행 기록을 함께 저장합니다. 체크를 해제해도 실행 기록은 유지됩니다.</p>
  </aside></div>
 </section>;
}
