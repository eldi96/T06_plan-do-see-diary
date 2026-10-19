import type {Task} from './model';
import {addDays, requireDate} from './dates';

export function monthlyProgress(tasks: readonly Task[], month: string) {
  const first = requireDate(`${month}-01`);
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth()+1);
  const end = next.toISOString().slice(0,10);
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.deleted || task.dueDate < first || task.dueDate >= end) continue;
    const group = byDate.get(task.dueDate);
    if (group) group.push(task);
    else byDate.set(task.dueDate, [task]);
  }
  const days=[];
  for(let date=first; date<end; date=addDays(date,1)) {
    const plannedTasks=byDate.get(date)??[];
    const completedTasks=plannedTasks.filter(t=>t.completed);
    days.push({date,planned:plannedTasks.length,actual:completedTasks.length,
      plannedTasks,completedTasks,remaining:plannedTasks.filter(t=>!t.completed)});
  }
  return days;
}
