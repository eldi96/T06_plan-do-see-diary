import type {Task, CompletionEntry} from './model';
import {addDays, requireDate} from './dates';

export function monthlyProgress(tasks: readonly Task[], _completions: readonly CompletionEntry[], month: string) {
  const first = requireDate(`${month}-01`);
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth()+1);
  const end = next.toISOString().slice(0,10);
  const live = tasks.filter(t=>!t.deleted);
  const days=[];
  for(let date=first; date<end; date=addDays(date,1)) {
    const plannedTasks=live.filter(t=>t.dueDate===date);
    const completedTasks=plannedTasks.filter(t=>t.completed);
    const completedIds=new Set(completedTasks.map(t=>t.id));
    days.push({date,planned:plannedTasks.length,actual:completedTasks.length,
      plannedTasks,completedTasks,remaining:plannedTasks.filter(t=>!completedIds.has(t.id)),
      additional:[] as Task[]});
  }
  return days;
}
