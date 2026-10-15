"use client";
import {useId} from 'react';
import {Area,LinePath} from '@visx/shape';
import {curveMonotoneX} from '@visx/curve';
import {useChartStable} from './charts/chart-context';

/** Separate visual bands: relative planned workload above, completion rate below. */
export function PlannedProgressBands(){
 const {data,xScale,xAccessor,innerWidth,innerHeight}=useChartStable();
 const gradient=`planned-band-${useId().replace(/:/g,'')}`;
 const peak=Math.max(1,...data.map(d=>Number(d.planned)));
 const targetY=(point:Record<string,unknown>)=>innerHeight*(.36-.22*Number(point.planned)/peak);
 const x=(point:Record<string,unknown>)=>xScale(xAccessor(point));
 const slot=data.length>1?innerWidth/(data.length-1):innerWidth;
 const width=Math.min(17,slot*.78);
 return <g className="planned-progress-bands">
  <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a2a6af" stopOpacity={.25}/><stop offset="100%" stopColor="#a2a6af" stopOpacity={.025}/></linearGradient></defs>
  <Area data={data} x={x} y0={innerHeight} y1={targetY} curve={curveMonotoneX} fill={`url(#${gradient})`}/>
  <g className="completion-rate-bars">{data.map(point=>{
   const planned=Number(point.planned),actual=Number(point.actual);
   const rate=planned?Math.min(1,actual/planned):0;
   const height=rate*innerHeight*.5;
   return <rect key={String(point.date)} x={Math.max(0,Math.min(innerWidth-width,x(point)-width/2))} y={innerHeight-height} width={width} height={height} rx={3} fill="#708d85" data-date={String(point.date)} data-rate={rate}/>;
  })}</g>
  <LinePath data={data} x={x} y={targetY} curve={curveMonotoneX} stroke="#a2a6af" strokeWidth={1.5} fill="none"/>
 </g>;
}
