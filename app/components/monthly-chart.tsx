"use client";
import {useMemo,useState} from 'react';
import {PlannedProgressBands} from './planned-progress-bands';
import type {Task,Plan} from '../domain/model';
import {monthlyProgress} from '../domain/monthly-progress';
import {seoulToday} from '../domain/dates';
import {ComposedChart} from './charts/composed-chart';
import {Line} from './charts/line';
import {XAxis} from './charts/x-axis';
import {ChartTooltip} from './charts/tooltip/chart-tooltip';
import {useChartStable} from './charts/chart-context';

function DateTargets({onSelect}:{onSelect:(date:string)=>void}) {
  const {data,xScale,xAccessor,innerWidth,innerHeight}=useChartStable();
  return <g>{data.map((point,index)=>{
    if(!Number(point.planned)&&!Number(point.actual))return null;
    const center=xScale(xAccessor(point));
    const left=index ? (center+xScale(xAccessor(data[index-1])))/2 : 0;
    const right=index===data.length-1 ? innerWidth : (center+xScale(xAccessor(data[index+1])))/2;
    return <rect key={String(point.date)} x={left} y={0} width={Math.max(0,right-left)} height={innerHeight} fill="transparent" style={{cursor:'pointer'}} onClick={()=>onSelect(String(point.date))}/>;
  })}</g>;
}
export function ReviewChart({tasks,plans,onTask}:{tasks:Task[];plans:Plan[];onTask:(task:Task)=>void}) {
  const [month,setMonth]=useState(()=>seoulToday().slice(0,7));
  const [planId,setPlanId]=useState('');
  const [selectedDate,setSelectedDate]=useState('');
  const livePlans=plans.filter(p=>!p.deleted);
  const validPlan=livePlans.some(p=>p.id===planId)?planId:'';
  const filtered=useMemo(()=>tasks.filter(t=>plans.some(p=>!p.deleted&&p.id===t.planId)&&(!validPlan||t.planId===validPlan)),[tasks,plans,validPlan]);
  const data=useMemo(()=>monthlyProgress(filtered,month),[filtered,month]);
  const recordedDates=data.filter(day=>day.planned>0||day.actual>0);
  const selected=recordedDates.find(day=>day.date===selectedDate);
  const today=seoulToday();
  const totalPlanned=data.reduce((n,d)=>n+d.planned,0);
  const totalDone=data.reduce((n,d)=>n+d.actual,0);
  const changeMonth=(value:string)=>{if(/^\d{4}-\d{2}$/.test(value)&&Number(value.slice(5))>=1&&Number(value.slice(5))<=12&&Number(value.slice(0,4))>=1&&Number(value.slice(0,4))<9999){setMonth(value);setSelectedDate('');}};
  return <section className="panel review-chart monthly-chart" aria-label="월별 예정량과 완료량 그래프">
    <div className="section-head"><h2>날짜별 계획과 실행</h2><div className="review-chart-controls push"><input aria-label="그래프 월" type="month" value={month} onChange={e=>changeMonth(e.target.value)}/><select aria-label="그래프 계획" value={validPlan} onChange={e=>{setPlanId(e.target.value);setSelectedDate('');}}><option value="">전체 계획</option>{livePlans.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div></div>
    <div className="review-chart-legend"><span className="target-legend"><i/>상단 · 예정량</span><span className="done-legend"><i/>하단 · 완료율</span><span className="micro push">월 예정 {totalPlanned}개 · 완료 {totalDone}개</span></div>
    <div className="monthly-chart-scroll"><ComposedChart data={data} className="review-chart-canvas chart-entry-reveal" aspectRatio="4 / 1" animationDuration={0} barGap={0} maxBarSize={17} margin={{left:18,right:18,top:16,bottom:34}}>
      <Line dataKey="planned" stroke="transparent" strokeWidth={0} animate={false}/>
      <PlannedProgressBands/>
      <XAxis numTicks={data.length} tickerHalfWidth={0}/>
      <DateTargets onSelect={setSelectedDate}/>
      <ChartTooltip showCrosshair={false} showDots={false} damping={0} content={({point})=><div className="review-chart-tooltip"><strong>{String(point.date)}</strong><p>해야 할 일 {Number(point.planned)}개</p><p>체크한 일 {Number(point.actual)}개</p><p>완료율 {Number(point.planned)?Math.round(Number(point.actual)/Number(point.planned)*100)+'%':'예정 없음'}</p><small>날짜를 눌러 계획별 기록 확인</small></div>}/>
    </ComposedChart></div>
    {!filtered.length&&<p className="micro">할 일과 반복 루틴을 추가하면 기준 곡선이 나타납니다.</p>}
    <div className="review-chart-picker"><label htmlFor="chart-date">날짜별 기록</label><select id="chart-date" disabled={!recordedDates.length} value={selected?.date??''} onChange={event=>setSelectedDate(event.target.value)}><option value="">{recordedDates.length?'그래프를 누르거나 기록 있는 날짜 선택':'이달에 표시할 기록이 없습니다'}</option>{recordedDates.map(day=><option key={day.date} value={day.date}>{day.date} · 예정 {day.planned} / 완료 {day.actual}</option>)}</select></div>
    <p className="micro">상단 곡선: 예정량의 변화 · 하단 막대: 완료율(0~100%). 두 영역은 높이 기준이 다릅니다.</p>
    <details className="chart-help"><summary>집계 기준</summary><p className="micro">달력에 배치된 할 일의 예정일(마감일)을 기준으로 루틴도 함께 셉니다. 막대는 해당 날짜에 배치된 할 일 중 현재 체크된 수입니다. 체크한 시각과 관계없이 달력에 배치된 날짜에 표시합니다. 완료 취소·재완료를 반영하며, 예정일을 수정하면 그래프도 바뀝니다. 곡선은 상단에서 예정량을 상대적인 높이로 표시하고, 막대는 하단에서 완료율로 표시합니다. 100% 완료해도 두 영역은 닿지 않습니다. 정확한 개수는 날짜별 기록에서 확인합니다.</p></details>
    {selected&&<div className="review-chart-evidence"><h3>{selected.date} · 예정 {selected.planned} / 완료 {selected.actual}</h3>
      {livePlans.filter(p=>[...selected.plannedTasks,...selected.completedTasks].some(t=>t.planId===p.id)).map(p=>{
        const scheduled=selected.plannedTasks.filter(t=>t.planId===p.id);
        const done=selected.completedTasks.filter(t=>t.planId===p.id);
        return <details key={p.id} className="routine-occurrences"><summary>{p.title} · 예정 {scheduled.length} / 완료 {done.length}</summary>{scheduled.map(t=><button key={t.id} onClick={()=>onTask(t)}>{t.title}<span>{t.completed?'완료':selected.date>today?'예정':'미완료'}</span></button>)}</details>;
      })}
    </div>}
  </section>;
}
