import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  DiaryRecord,
  Task,
  Execution,
  Plan,
  Review,
  Routine,
  Exam,
} from "./model";
import {
  buildIndexes,
  summarize,
  periodTasks,
  compareTasks,
} from "./selectors";

const meta = { version: 1, deleted: false, updatedAt: "2026-10-14T00:00:00Z" };
const plan: Plan = {
  ...meta,
  id: "p",
  kind: "plan",
  title: "검증 계획",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  priority: "보통",
  estimatedMinutes: 60,
  success: "검증",
};
function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    ...meta,
    id,
    kind: "task",
    title: "같은 제목",
    planId: "p",
    dueDate: "2026-10-14",
    tags: [],
    notes: "",
    priority: "보통",
    estimatedMinutes: 10,
    understanding: null,
    learning: true,
    completed: false,
    cycle: 0,
    ...patch,
  };
}
function execution(
  id: string,
  taskId: string,
  patch: Partial<Execution> = {},
): Execution {
  return {
    ...meta,
    id,
    kind: "execution",
    taskId,
    start: "2026-10-01T00:00:00Z",
    end: "2026-10-01T00:00:30Z",
    durationSeconds: 30,
    content: "테스트",
    blockedReason: "",
    ...patch,
  };
}

test("deleted parent and task remove linked live views without destroying input", () => {
  const records: DiaryRecord[] = [
    plan,
    { ...plan, id: "gone", deleted: true },
    task("a"),
    task("b", { deleted: true }),
    task("c", { planId: "gone" }),
    execution("ea", "a"),
    execution("eb", "b"),
    execution("ec", "c"),
    {
      ...meta,
      id: "r",
      kind: "review",
      planId: "gone",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      content: "",
      improvement: "검증",
    } as Review,
    {
      ...meta,
      id: "routine",
      kind: "routine",
      planId: "gone",
      title: "반복",
      weekdays: [1],
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      tags: [],
      learning: true,
      priority: "보통",
      estimatedMinutes: 10,
    } as Routine,
    {
      ...meta,
      id: "exam",
      kind: "exam",
      title: "SQLD",
      examDate: "2026-11-01",
      mode: "7",
      startDate: "2026-10-25",
    } as Exam,
  ];
  const indexes = buildIndexes(records);
  assert.deepEqual(
    indexes.tasks.map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(
    indexes.executions.map((e) => e.id),
    ["ea"],
  );
  assert.equal(indexes.reviews.length, 0);
  assert.equal(indexes.routines.length, 0);
  assert.equal(indexes.exams.length, 1);
  assert.equal(indexes.taskById.get("a")?.id, "a");
  assert.equal(records.length, 11);
});
test("C28–32 completed is not delayed; blocked counts tasks once and ignores whitespace/deletion", () => {
  const scope = [
    task("a", { dueDate: "2026-10-13" }),
    task("b", { dueDate: "2026-10-13", completed: true }),
    task("c"),
  ];
  const records = [
    execution("1", "a", { blockedReason: "막힘" }),
    execution("2", "a", { blockedReason: "또 막힘" }),
    execution("3", "b", { blockedReason: "  " }),
    execution("4", "c", { blockedReason: "삭제됨", deleted: true }),
  ];
  const result = summarize(scope, records, "2026-10-14");
  assert.equal(result.plannedCount, 3);
  assert.equal(result.completedCount, 1);
  assert.equal(result.delayedCount, 1);
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(
    result.blockedTasks.map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(
    [...buildIndexes([plan, ...scope, ...records]).blockedTaskIds],
    ["a"],
  );
});
test("period boundaries include both ends; all linked execution dates contribute without rounding", () => {
  const tasks = [
    task("a", { dueDate: "2026-10-01" }),
    task("b", { dueDate: "2026-10-31" }),
    task("out", { dueDate: "2026-11-01" }),
    task("other", { planId: "other" }),
  ];
  const scope = periodTasks(tasks, "p", "2026-10-01", "2026-10-31");
  const result = summarize(
    scope,
    [
      execution("ea", "a", { durationSeconds: 1 }),
      execution("eb", "b", { durationSeconds: 2 }),
      execution("out", "out", { durationSeconds: 600 }),
    ],
    "2026-10-14",
  );
  assert.equal(result.plannedCount, 2);
  assert.equal(result.estimatedMinutes, 20);
  assert.equal(result.actualSeconds, 3);
  assert.equal(result.actualMinutes, 0.05);
  assert.equal(result.differenceMinutes, -19.95);
  const empty = summarize([], [execution("ea", "a")], "2026-10-14");
  assert.equal(empty.plannedCount, 0);
  assert.equal(empty.actualSeconds, 0);
  assert.equal(empty.differenceMinutes, 0);
  assert.throws(() => periodTasks(tasks, "p", "2026-10-31", "2026-10-01"));
});
test("C20 due/priority/title ties resolve by stable ID irrespective of input order", () => {
  const a = task("a"),
    b = task("b"),
    early = task("z", { dueDate: "2026-10-13" }),
    high = task("h", { priority: "높음" });
  assert.deepEqual(
    [b, high, a, early].sort(compareTasks).map((t) => t.id),
    ["z", "h", "a", "b"],
  );
  assert.deepEqual(
    [b, a].sort((x, y) => compareTasks(x, y, "title")).map((t) => t.id),
    ["a", "b"],
  );
});
