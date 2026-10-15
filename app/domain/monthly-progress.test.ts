import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthlyProgress} from './monthly-progress';
import type {Task} from './model';
const task=(id:string,date:string,completed:boolean,deleted=false)=>({id,dueDate:date,completed,deleted,planId:'p'} as Task);
test('5 planned, 3 checked: curve 5 and bar 3 regardless of completion time',()=>{
 const tasks=Array.from({length:5},(_,i)=>task(String(i),'2026-10-15',i<3));
 const days=monthlyProgress(tasks,[],'2026-10');
 assert.equal(days.length,31);assert.equal(days[14].planned,5);assert.equal(days[14].actual,3);assert.equal(days[14].remaining.length,2);
 assert.equal(days[13].actual,0);assert.equal(days[15].actual,0);
});
test('unchecking and deletion change the assigned day; includes all leap-month days',()=>{
 const days=monthlyProgress([task('a','2024-02-01',true),task('b','2024-02-01',false),task('c','2024-02-01',true,true),task('d','2024-01-31',true)],[],'2024-02');
 assert.equal(days.length,29);assert.equal(days[0].planned,2);assert.equal(days[0].actual,1);assert.equal(days[28].planned,0);
});
