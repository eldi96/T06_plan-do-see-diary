import assert from "node:assert/strict";
import { buildIndexes, summarize } from "../domain/selectors.ts";
const base = process.env.PDS_TEST_URL ?? "http://127.0.0.1:8788";
if (
  process.env.PDS_TEST_DATABASE !== "isolated" ||
  !/^http:\/\/(127\.0\.0\.1|localhost):8788$/.test(base)
)
  throw Error(
    "Use isolated test-state on port 8788 with PDS_TEST_DATABASE=isolated. Never run against the user preview on 8787.",
  );
let checks = 0;
const test = (name, condition) => {
  assert.ok(condition, name);
  checks++;
  console.log("PASS", name);
};
async function post(body) {
  const r = await fetch(base + "/api/diary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, ...(await r.json()) };
}
const request = (kind, data, id, version) => ({
  requestId: crypto.randomUUID(),
  action: "save",
  kind,
  data,
  id,
  version,
});
const snapshot = async () => {
  const r = await fetch(base + "/api/diary");
  assert.equal(r.status, 200);
  return await r.json();
};
const label = "검증 전용 " + crypto.randomUUID();
const planData = {
  title: label,
  startDate: "2026-10-12",
  endDate: "2026-10-18",
  success: "검증 전용",
  priority: "보통",
  estimatedMinutes: 60,
};
const p = await post(request("plan", planData));
test("plan create", p.status === 200);
const p2 = await post(
  request("plan", { ...planData, title: label + " 수정" }, p.id, p.version),
);
test("plan edit", p2.status === 200);
let state = await snapshot();
test(
  "original plan snapshot",
  state.history.some(
    (h) => h.record_id === p.id && JSON.parse(h.data).title === label,
  ),
);
const taskData = {
  planId: p.id,
  title: label + " task",
  dueDate: "2026-10-12",
  priority: "보통",
  estimatedMinutes: 30,
  tags: ["검증"],
  notes: "<script>window.__pds_xss=1</script>",
  learning: false,
  understanding: "복습 필요",
};
const t = await post(request("task", taskData));
test("task create", t.status === 200);
state = await snapshot();
test(
  "nonlearning understanding null",
  state.records.find((r) => r.id === t.id).understanding === null,
);
const toggle = {
  requestId: crypto.randomUUID(),
  kind: "task",
  id: t.id,
  version: 1,
  action: "toggle",
};
const duplicate = await Promise.all([post(toggle), post(toggle)]);
test(
  "same key parallel retries",
  duplicate.every((r) => r.status === 200 && r.version === 2),
);
state = await snapshot();
test(
  "one completed task",
  state.records.find((r) => r.id === t.id).completed === true,
);
const completedSummary = summarize(
  buildIndexes(state.records).tasks.filter((item) => item.planId === p.id),
  buildIndexes(state.records).executions,
  "2026-10-14",
);
test(
  "C22 same-key double completion adds exactly one to See and evidence",
  completedSummary.completedCount === 1 &&
    completedSummary.completedTasks.length === 1,
);
let exported = await (await fetch(base + "/api/diary?export")).json();
test(
  "one completion record",
  exported.completions.filter((c) => c.task_id === t.id).length === 1,
);
const undo = await post({
  ...toggle,
  requestId: crypto.randomUUID(),
  version: 2,
});
test("undo", undo.status === 200);
await post(toggle);
state = await snapshot();
test(
  "old retry does not recomplete",
  state.records.find((r) => r.id === t.id).completed === false,
);
const simultaneous = await Promise.all([
  post({ ...toggle, requestId: crypto.randomUUID(), version: 3 }),
  post({ ...toggle, requestId: crypto.randomUUID(), version: 3 }),
]);
test(
  "different keys only one transition",
  simultaneous.filter((r) => r.status === 200).length === 1 &&
    simultaneous.filter((r) => r.status === 409).length === 1,
);
exported = await (await fetch(base + "/api/diary?export")).json();
test(
  "cycles preserve two real completions",
  exported.completions.filter((c) => c.task_id === t.id).length === 2,
);
const execution = await post(
  request("execution", {
    taskId: t.id,
    start: "2026-10-13T09:00:00+09:00",
    end: "2026-10-13T09:30:00+09:00",
    content: label + " 실제 기록",
    blockedReason: "검증용 막힘",
  }),
);
test("execution save", execution.status === 200);
state = await snapshot();
const saved = state.records.find((r) => r.id === execution.id);
test(
  "UTC and exact seconds",
  saved.start === "2026-10-13T00:00:00.000Z" && saved.durationSeconds === 1800,
);
test(
  "execution leaves estimates unchanged",
  state.records.find((r) => r.id === t.id).estimatedMinutes === 30 &&
    state.records.find((r) => r.id === p.id).estimatedMinutes === 60,
);
const badTime = await post(
  request("execution", {
    taskId: t.id,
    start: "2026-10-13T09:30:00+09:00",
    end: "2026-10-13T09:00:00+09:00",
    content: "검증",
    blockedReason: "",
  }),
);
test("reverse execution rejected", badTime.status === 400);
const quick = await post(
  request("execution", {
    taskId: t.id,
    start: "2026-10-13T10:00:00+09:00",
    end: "2026-10-13T10:15:00+09:00",
    activity: "실습",
    memo: "",
    blockedReason: "",
  }),
);
test("quick activity record without typed content", quick.status === 200);
state = await snapshot();
test(
  "server builds summary from actual task title",
  state.records.find((r) => r.id === quick.id).content ===
    taskData.title + " — 실습",
);
const editedRecord = await post(
  request(
    "execution",
    {
      taskId: t.id,
      start: "2026-10-13T09:00:00+09:00",
      end: "2026-10-13T09:30:00+09:00",
      content: "기존 자유 입력 기록 보존",
      blockedReason: "",
    },
    execution.id,
    1,
  ),
);
test(
  "legacy written record can stay written",
  editedRecord.status === 200 &&
    (await snapshot()).records.find((r) => r.id === execution.id).content ===
      "기존 자유 입력 기록 보존",
);
const routineData = {
  title: label + " routine",
  planId: p.id,
  startDate: "2026-10-12",
  endDate: "2026-10-18",
  weekdays: [1, 2, 3, 4, 5],
  priority: "보통",
  estimatedMinutes: 15,
  tags: [],
  learning: true,
};
const r = await post(request("routine", routineData));
test("routine create", r.status === 200);
state = await snapshot();
const generated = state.records.filter((t) => t.routineId === r.id);
test("five separate weekdays", generated.length === 5);
const deleted = generated[0];
await post({
  requestId: crypto.randomUUID(),
  action: "delete",
  kind: "task",
  id: deleted.id,
  version: 1,
});
await post(
  request("routine", { ...routineData, title: label + " changed" }, r.id, 1),
);
state = await snapshot();
test(
  "deleted routine occurrence stays deleted",
  state.records.find((t) => t.id === deleted.id).deleted === true &&
    state.records.filter((t) => t.routineId === r.id).length === 5,
);
test(
  "old routine tasks preserved",
  state.records.find((t) => t.id === generated[1].id).title ===
    routineData.title,
);
test(
  "script text remains literal",
  state.records.find((r) => r.id === t.id).notes === taskData.notes,
);
const exam = await post(
  request("exam", { title: "SQLD", examDate: "2026-11-15", mode: "14" }),
);
test("exam save", exam.status === 200);
state = await snapshot();
test(
  "exam 14 day start persisted",
  state.records.find((r) => r.id === exam.id).startDate === "2026-11-01",
);
const custom = await post(
  request(
    "exam",
    {
      title: "SQLD",
      examDate: "2026-11-20",
      mode: "custom",
      customDate: "2026-11-03",
    },
    exam.id,
    1,
  ),
);
test("custom start save", custom.status === 200);
const shifted = await post(
  request(
    "exam",
    {
      title: "SQLD",
      examDate: "2026-12-01",
      mode: "custom",
      customDate: "2026-11-03",
    },
    exam.id,
    2,
  ),
);
test(
  "exam date change preserves custom start",
  shifted.status === 200 &&
    (await snapshot()).records.find((r) => r.id === exam.id).startDate ===
      "2026-11-03",
);
const duplicateExam = await post(
  request("exam", { title: "SQLD", examDate: "2026-12-01", mode: "7" }),
);
test("duplicate exam prevented", duplicateExam.status === 409);
const reverseStart = await post(
  request("exam", {
    title: "ADsP",
    examDate: "2026-11-01",
    mode: "custom",
    customDate: "2026-11-02",
  }),
);
test("exam start inversion rejected", reverseStart.status === 400);
const invalid = await post(
  request("exam", { title: "SQLD", examDate: "2026-02-30", mode: "14" }),
);
test("invalid calendar date rejected", invalid.status === 400);
const reflection = await post(
  request("review", {
    planId: p.id,
    startDate: "2026-10-12",
    endDate: "2026-10-18",
    content: "검증용 회고",
    improvement: "다음에는 실습부터 시작",
  }),
);
test("review saved separately", reflection.status === 200);
const nextPlan = await post(
  request("plan", {
    ...planData,
    title: label + " next",
    sourceReviewId: reflection.id,
    improvement: "다음에는 실습부터 시작",
    success: "다음에는 실습부터 시작",
  }),
);
test(
  "C33 improvement carried to next plan",
  nextPlan.status === 200 &&
    (await snapshot()).records.some(
      (i) =>
        i.id === nextPlan.id &&
        i.sourceReviewId === reflection.id &&
        i.improvement === "다음에는 실습부터 시작",
    ),
);
state = await snapshot();
const indexes = buildIndexes(state.records);
const summary = summarize(
  indexes.tasks.filter((item) => item.planId === p.id),
  indexes.executions,
  "2026-10-14",
);
test(
  "C28-32 shared evidence and clearing blocked reason updates count",
  summary.plannedCount === summary.tasks.length &&
    summary.completedCount === summary.completedTasks.length &&
    summary.blockedCount === 0 &&
    summary.actualSeconds === 2700 &&
    summary.estimatedMinutes === 90,
);
test(
  "C35 repeated DB reads preserve records and relationships",
  JSON.stringify(state.records) === JSON.stringify((await snapshot()).records),
);
const exportAll = await (await fetch(base + "/api/diary?export=1")).json();
test(
  "C36 one export contains records, history, completions and schema",
  exportAll.schemaVersion === 2 &&
    exportAll.records.some((i) => i.id === reflection.id) &&
    exportAll.history.length > 0 &&
    exportAll.completions.length > 0,
);
// Keep test-only local records out of the live UI. Export retains their audit history.
state = await snapshot();
for (const item of state.records.filter(
  (i) =>
    !i.deleted &&
    (i.id === p.id ||
      i.id === t.id ||
      i.id === execution.id ||
      i.id === quick.id ||
      i.id === r.id ||
      i.id === exam.id ||
      i.id === reflection.id ||
      i.id === nextPlan.id ||
      i.routineId === r.id),
)) {
  const removed = await post({
    requestId: crypto.randomUUID(),
    action: "delete",
    kind: item.kind,
    id: item.id,
    version: item.version,
  });
  assert.equal(removed.status, 200, "test cleanup");
}
const orphan = await post(request("task", taskData));
test("deleted parent rejects new child", orphan.status === 400);
console.log(
  `${checks} integration assertions passed against local Worker + D1.`,
);
