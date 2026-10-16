"use client";
import {useState} from 'react';

export function EstimatedTimeInput({value,onChange}:{value:number|string;onChange:(minutes:number|string)=>void}){
 const [unit,setUnit]=useState<'minutes'|'hours'>(()=>Number(value)>=60&&Number(value)%60===0?'hours':'minutes');
 const factor=unit==='hours'?60:1,step=unit==='hours'?60:10;
 const display=value===''?'':Number(value)/factor;
 const adjust=(direction:number)=>onChange(Math.min(Math.floor(100000/factor)*factor,Math.max(0,(Number(value)||0)+direction*step)));
 function changeUnit(next:'minutes'|'hours'){
  if(next===unit)return;
  if(next==='hours'&&value!=='')onChange(Math.min(1666,Math.ceil(Number(value)/60))*60);
  setUnit(next);
 }
 return <fieldset className="estimated-time">
  <legend>예상 시간</legend>
  <div className="estimated-time-options estimated-unit-options" aria-label="예상 시간 단위">
   {(['minutes','hours'] as const).map(option=><label key={option}><input type="radio" name="estimated-time-unit" checked={unit===option} onChange={()=>changeUnit(option)}/><span>{option==='minutes'?'분':'시간'}</span></label>)}
  </div>
  <div className="estimated-number">
   <button type="button" aria-label={`예상 시간 ${unit==='minutes'?'10분':'1시간'} 줄이기`} disabled={Number(value)===0} onClick={()=>adjust(-1)}>−</button>
   <label><input required type="text" inputMode="numeric" pattern="[0-9]+" role="spinbutton" aria-label="예상 시간 값" aria-valuemin={0} aria-valuemax={Math.floor(100000/factor)} aria-valuenow={value===''?undefined:Number(display)}
    value={display} placeholder={unit==='hours'?'예: 2':'예: 30'} maxLength={6}
    onChange={e=>{const raw=e.target.value;if(!/^\d*$/.test(raw))return;if(raw==='')onChange('');else if(Number(raw)*factor<=100000)onChange(Number(raw)*factor);}}
    onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();adjust(e.key==='ArrowUp'?1:-1);}}}/><span>{unit==='minutes'?'분':'시간'}</span></label>
   <button type="button" aria-label={`예상 시간 ${unit==='minutes'?'10분':'1시간'} 늘리기`} disabled={Number(value)>=Math.floor(100000/factor)*factor} onClick={()=>adjust(1)}>+</button>
  </div>
  <p className="micro">{unit==='minutes'?'10분씩 조절':'1시간씩 조절'} · 숫자를 직접 입력할 수 있어요.</p>
 </fieldset>;
}
