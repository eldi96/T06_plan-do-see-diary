import type {
  DiaryRecord,
  Execution,
  Plan,
  Review,
  Routine,
  Task,
  Exam,
  CalendarDate,
} from "./model";
import { isDelayed, requireDate, seoulToday } from "./dates";

/** Live views only. Export retains the original records, including tombstones. */
export function buildIndexes(records: readonly DiaryRecord[]) {
  const live = records.filter((record) => !record.deleted);
  const plans = live.filter((r): r is Plan => r.kind === "plan");
  const planIds = new Set(plans.map((p) => p.id));
  const tasks = live.filter(
    (r): r is Task => r.kind === "task" && planIds.has(r.planId),
  );
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const executions = live.filter(
    (r): r is Execution => r.kind === "execution" && taskById.has(r.taskId),
  );
  const reviews = live.filter(
    (r): r is Review => r.kind === "review" && planIds.has(r.planId),
  );
  const routines = live.filter(
    (r): r is Routine => r.kind === "routine" && planIds.has(r.planId),
  );
  const exams = live.filter((r): r is Exam => r.kind === "exam");
  const blockedTaskIds = new Set(
    executions.filter((e) => e.blockedReason.trim()).map((e) => e.taskId),
  );
  return {
    plans,
    planIds,
    tasks,
    taskById,
    executions,
    reviews,
    routines,
    exams,
    blockedTaskIds,
  };
}

/** C28–32 and C83: use these exact lists for both numbers and evidence. */
export function summarize(
  scope: readonly Task[],
  executions: readonly Execution[],
  today: CalendarDate = seoulToday(),
) {
  requireDate(today);
  const tasks = scope.filter((t) => !t.deleted);
  const taskIds = new Set(tasks.map((t) => t.id));
  const records = executions.filter((e) => !e.deleted && taskIds.has(e.taskId));
  const blockedIds = new Set(
    records.filter((e) => e.blockedReason.trim()).map((e) => e.taskId),
  );
  const completedTasks = tasks.filter((t) => t.completed);
  const delayedTasks = tasks.filter((t) =>
    isDelayed(t.dueDate, t.completed ? "completed" : "in_progress", today),
  );
  const blockedTasks = tasks.filter((t) => blockedIds.has(t.id));
  const estimatedMinutes = tasks.reduce(
    (sum, t) => sum + t.estimatedMinutes,
    0,
  );
  const actualSeconds = records.reduce((sum, e) => sum + e.durationSeconds, 0);
  const actualMinutes = actualSeconds / 60;
  return {
    tasks,
    executions: records,
    completedTasks,
    delayedTasks,
    blockedTasks,
    plannedCount: tasks.length,
    completedCount: completedTasks.length,
    delayedCount: delayedTasks.length,
    blockedCount: blockedTasks.length,
    estimatedMinutes,
    actualSeconds,
    actualMinutes,
    differenceMinutes: actualMinutes - estimatedMinutes,
  };
}

export function periodTasks(
  tasks: readonly Task[],
  planId: string,
  from: CalendarDate,
  to: CalendarDate,
) {
  requireDate(from);
  requireDate(to);
  if (from > to) throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
  return tasks.filter(
    (t) =>
      !t.deleted && t.planId === planId && t.dueDate >= from && t.dueDate <= to,
  );
}

const priorityOrder = { 높음: 0, 보통: 1, 낮음: 2 } as const;
/** C20: stable ID tiebreaker, matching the current screen's published sorting. */
export function compareTasks(a: Task, b: Task, sort: "due" | "title" = "due") {
  if (sort === "title")
    return a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id);
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    priorityOrder[a.priority] - priorityOrder[b.priority] ||
    a.id.localeCompare(b.id)
  );
}
