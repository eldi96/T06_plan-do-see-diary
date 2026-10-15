import { env } from "cloudflare:workers";
import { z } from "zod";
import { isCalendarDate, examStartDate } from "../../../domain/dates";
import { executionDurationSeconds } from "../../../domain/validation";
import {
  executionActivities,
  executionSummary,
} from "../../../domain/execution";

const date = z.string().refine(isCalendarDate, "유효한 날짜를 입력하세요");
const priority = z.enum(["높음", "보통", "낮음"]);
const common = {
  title: z.string().trim().min(1).max(300),
  priority,
  estimatedMinutes: z.number().int().min(0).max(100000),
};
const schemas = {
  plan: z
    .object({
      ...common,
      startDate: date,
      endDate: date,
      success: z.string().trim().min(1).max(3000),
      sourceReviewId: z.string().optional(),
      improvement: z.string().max(3000).optional(),
    })
    .refine((v) => v.startDate <= v.endDate, "기간의 종료일을 확인하세요"),
  task: z.object({
    ...common,
    planId: z.string(),
    dueDate: date,
    tags: z.array(z.string().max(50)).max(20),
    notes: z.string().max(5000),
    understanding: z.enum(["이해했어요", "복습 필요"]).nullable(),
    learning: z.boolean(),
    routineId: z.string().optional(),
    occurrenceDate: date.optional(),
  }),
  execution: z
    .object({
      taskId: z.string(),
      start: z.string().datetime({ offset: true }),
      end: z.string().datetime({ offset: true }),
      content: z.string().trim().max(5000).optional(),
      activity: z.enum(executionActivities).optional(),
      memo: z.string().max(3000).optional(),
      blockedReason: z.string().max(3000),
    })
    .refine(
      (v) => !!v.activity || !!v.content,
      "활동 종류를 선택하거나 내용을 입력하세요",
    )
    .refine(
      (v) => Date.parse(v.end) >= Date.parse(v.start),
      "종료가 시작보다 빠릅니다",
    ),
  exam: z
    .object({
      title: z.enum(["SQLD", "ADsP"]),
      examDate: date,
      mode: z.enum(["7", "14", "custom"]),
      customDate: date.optional(),
    })
    .refine(
      (v) =>
        v.mode !== "custom" || (!!v.customDate && v.customDate <= v.examDate),
      "공부 시작일은 시험일 이전이어야 합니다",
    ),
  review: z
    .object({
      planId: z.string(),
      startDate: date,
      endDate: date,
      content: z.string().max(5000),
      improvement: z.string().trim().min(1).max(3000),
    })
    .refine((v) => v.startDate <= v.endDate, "기간을 확인하세요"),
  routine: z
    .object({
      ...common,
      planId: z.string(),
      startDate: date,
      endDate: date,
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      tags: z.array(z.string().max(50)).max(20),
      learning: z.boolean(),
    })
    .refine(
      (v) =>
        v.startDate <= v.endDate &&
        (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000 <= 90,
      "반복 기간은 최대 91일입니다",
    ),
};
type Kind = keyof typeof schemas;
type Row = {
  id: string;
  kind: Kind;
  data: string;
  version: number;
  deleted: number;
  occurrence: string | null;
  updated_at: string;
};
function db() {
  if (!env.DB) throw new Error("DB unavailable");
  return env.DB;
}
function unpack(r: Row) {
  return {
    ...JSON.parse(r.data),
    id: r.id,
    kind: r.kind,
    version: r.version,
    deleted: !!r.deleted,
    updatedAt: r.updated_at,
  };
}
const headers = { "Cache-Control": "no-store" };
async function load() {
  const rows = await db()
    .prepare("SELECT * FROM records ORDER BY updated_at,id")
    .all<Row>();
  return rows.results.map(unpack);
}
export async function GET(request: Request) {
  try {
    const data = await load();
    if (new URL(request.url).searchParams.has("export")) {
      const [h, c] = await Promise.all([
        db().prepare("SELECT * FROM history ORDER BY created_at,id").all(),
        db().prepare("SELECT * FROM completions ORDER BY created_at,id").all(),
      ]);
      return Response.json(
        {
          schemaVersion: 2,
          timezone: "Asia/Seoul",
          exportedAt: new Date().toISOString(),
          records: data,
          history: h.results,
          completions: c.results,
        },
        { headers },
      );
    }
    const h = await db()
      .prepare("SELECT * FROM history ORDER BY created_at DESC")
      .all();
    const c = await db().prepare("SELECT * FROM completions ORDER BY created_at,id").all();
    return Response.json({ records: data, history: h.results, completions: c.results }, { headers });
  } catch {
    return Response.json(
      { error: "자료를 불러오지 못했습니다. 잠시 후 다시 시도하세요." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  let key = "",
    fingerprint = "";
  try {
    const body: any = await request.json();
    key = z.string().uuid().parse(body.requestId);
    fingerprint = JSON.stringify(body);
    const prior = await db()
      .prepare("SELECT * FROM requests WHERE id=?")
      .bind(key)
      .first<{ fingerprint: string; result: string }>();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        return Response.json(
          { error: "요청 키가 다른 작업에 사용되었습니다." },
          { status: 409 },
        );
      return Response.json(JSON.parse(prior.result), { headers });
    }
    const action = z.enum(["save", "toggle", "delete", "complete"]).parse(body.action);
    const kind = z
      .enum(["plan", "task", "execution", "exam", "review", "routine"])
      .parse(body.kind) as Kind;
    const id = body.id ? z.string().uuid().parse(body.id) : crypto.randomUUID();
    const row = await db()
      .prepare("SELECT * FROM records WHERE id=?")
      .bind(id)
      .first<Row>();
    if (row && (row.kind !== kind || row.deleted))
      throw new Error("대상이 없거나 삭제되었습니다.");
    const old = row ? unpack(row) : null;
    if (row && body.version !== row.version)
      return Response.json(
        { error: "다른 화면에서 변경되었습니다. 새로고침 후 다시 시도하세요." },
        { status: 409 },
      );
    if (action !== "save" && !row) throw new Error("대상이 없습니다.");
    if ((action === "toggle" || action === "complete") && kind !== "task")
      throw new Error("할 일만 완료할 수 있습니다.");
    let value: any =
      action === "save"
        ? schemas[kind].parse(body.data)
        : JSON.parse(row!.data);
    if (kind === "exam" && row && value.title !== old?.title)
      throw new Error("대상의 자격증 이름은 변경할 수 없습니다.");
    if (kind === "task" && action === "save") {
      value.completed = old?.completed ?? false;
      value.cycle = old?.cycle ?? 0;
      if (!value.learning) value.understanding = null;
    }
    if (action === "toggle") {
      value.completed = !value.completed;
      if (value.completed) value.cycle = (value.cycle ?? 0) + 1;
    }
    let completionExecution: any = null;
    const completionExecutionId = action === "complete" ? crypto.randomUUID() : null;
    if (action === "complete") {
      if (value.completed) return Response.json({error:"이미 완료된 할 일입니다. 새로고침해 주세요."},{status:409,headers});
      completionExecution = schemas.execution.parse({...body.execution,taskId:id});
      try{completionExecution.durationSeconds=executionDurationSeconds(completionExecution.start,completionExecution.end);}catch(e){return Response.json({error:(e as Error).message},{status:400,headers});}
      if(completionExecution.durationSeconds<=0) return Response.json({error:"실제로 걸린 시간을 0분보다 길게 입력하세요."},{status:400,headers});
      if(Date.parse(completionExecution.end)>Date.now()+60000) return Response.json({error:"미래 시각의 실행 기록은 저장할 수 없습니다."},{status:400,headers});
      completionExecution.start=new Date(completionExecution.start).toISOString();
      completionExecution.end=new Date(completionExecution.end).toISOString();
      if(completionExecution.activity) completionExecution.content=executionSummary(value.title,completionExecution.activity,completionExecution.memo);
      value.completed=true;
      value.cycle=(value.cycle??0)+1;
    }
    if (kind === "execution") {
      try {
        value.durationSeconds = executionDurationSeconds(
          value.start,
          value.end,
        );
        value.start = new Date(value.start).toISOString();
        value.end = new Date(value.end).toISOString();
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 400 });
      }
    }
    if (kind === "exam")
      value.startDate = examStartDate({
        examDate: value.examDate,
        startMode: value.mode,
        customStartDate: value.customDate ?? null,
      });
    if (action === "save" && ["task", "review", "routine"].includes(kind)) {
      const parent = await db()
        .prepare(
          "SELECT * FROM records WHERE id=? AND kind='plan' AND deleted=0",
        )
        .bind(value.planId)
        .first<Row>();
      if (!parent) throw new Error("연결할 계획을 선택하세요.");
      if (kind === "routine") {
        const p = unpack(parent);
        if (value.startDate < p.startDate || value.endDate > p.endDate)
          throw new Error("반복 기간은 계획 기간 안이어야 합니다.");
      }
    }
    if (action === "save" && kind === "execution") {
      const task = await db()
        .prepare(
          "SELECT * FROM records WHERE id=? AND kind='task' AND deleted=0",
        )
        .bind(value.taskId)
        .first<Row>();
      if (!task) throw new Error("연결할 할 일이 없습니다.");
      const taskValue = unpack(task);
      const parent = await db()
        .prepare(
          "SELECT id FROM records WHERE id=? AND kind='plan' AND deleted=0",
        )
        .bind(taskValue.planId)
        .first();
      if (!parent) throw new Error("연결할 계획이 삭제되었습니다.");
      if (value.activity)
        value.content = executionSummary(
          taskValue.title,
          value.activity,
          value.memo,
        );
    }
    if (action === "save" && kind === "plan" && value.sourceReviewId) {
      const review = await db()
        .prepare(
          "SELECT * FROM records WHERE id=? AND kind='review' AND deleted=0",
        )
        .bind(value.sourceReviewId)
        .first<Row>();
      if (!review) throw new Error("연결할 돌아보기가 없습니다.");
    }
    const now = new Date().toISOString(),
      version = (row?.version ?? 0) + 1;
    const result = { ok: true, id, version, ...(completionExecutionId?{executionId:completionExecutionId}:{}) };
    const statements: D1PreparedStatement[] = [];
    // Recheck logical parents inside the atomic batch, not only before it.
    let parentGuard = false;
    if ((action === "save" && ["task", "review", "routine"].includes(kind)) || action === "complete") {
      parentGuard = true;
      statements.push(
        db()
          .prepare(
            "INSERT INTO mutation_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM records WHERE id=? AND kind='plan' AND deleted=0) THEN 1 ELSE 0 END",
          )
          .bind(key + ":parent", value.planId),
      );
    } else if (action === "save" && kind === "execution") {
      parentGuard = true;
      statements.push(
        db()
          .prepare(
            "INSERT INTO mutation_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM records t JOIN records p ON p.id=json_extract(t.data,'$.planId') WHERE t.id=? AND t.kind='task' AND t.deleted=0 AND p.kind='plan' AND p.deleted=0) THEN 1 ELSE 0 END",
          )
          .bind(key + ":parent", value.taskId),
      );
    }
    // A failed compare-and-swap MUST abort the complete batch, including history/completion inserts.
    if (row)
      statements.push(
        db()
          .prepare(
            "INSERT INTO mutation_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM records WHERE id=? AND version=? AND deleted=0) THEN 1 ELSE 0 END",
          )
          .bind(key, id, row.version),
      );
    if (row)
      statements.push(
        db()
          .prepare(
            "INSERT INTO history(id,record_id,kind,data,version,created_at) SELECT ?,id,kind,data,version,? FROM records WHERE id=?",
          )
          .bind(crypto.randomUUID(), now, id),
      );
    const occurrence =
      kind === "exam"
        ? action === "delete"
          ? null
          : `exam:${value.title}`
        : (row?.occurrence ??
          (kind === "task" && value.routineId
            ? `${value.routineId}:${value.occurrenceDate}`
            : null));
    if (row)
      statements.push(
        db()
          .prepare(
            "UPDATE records SET data=?,version=?,deleted=?,occurrence=?,updated_at=? WHERE id=? AND version=?",
          )
          .bind(
            JSON.stringify(value),
            version,
            action === "delete" ? 1 : 0,
            occurrence,
            now,
            id,
            row.version,
          ),
      );
    else
      statements.push(
        db()
          .prepare(
            "INSERT INTO records(id,kind,data,version,deleted,occurrence,updated_at) VALUES(?,?,?,1,0,?,?)",
          )
          .bind(id, kind, JSON.stringify(value), occurrence, now),
      );
    if (completionExecution)
      statements.push(db().prepare("INSERT INTO records(id,kind,data,version,deleted,occurrence,updated_at) VALUES(?,'execution',?,1,0,NULL,?)").bind(completionExecutionId,JSON.stringify(completionExecution),now));
    if ((action === "toggle" || action === "complete") && value.completed)
      statements.push(
        db()
          .prepare(
            "INSERT INTO completions(id,task_id,cycle,request_id,created_at) VALUES(?,?,?,?,?)",
          )
          .bind(crypto.randomUUID(), id, value.cycle, key, now),
      );
    if (kind === "routine" && action === "save") {
      for (
        let stamp = Date.parse(value.startDate + "T00:00:00Z");
        stamp <= Date.parse(value.endDate + "T00:00:00Z");
        stamp += 86400000
      ) {
        const d = new Date(stamp);
        if (!value.weekdays.includes(d.getUTCDay())) continue;
        const day = d.toISOString().slice(0, 10);
        const task = {
          title: value.title,
          planId: value.planId,
          dueDate: day,
          tags: value.tags,
          notes: "",
          priority: value.priority,
          estimatedMinutes: value.estimatedMinutes,
          learning: value.learning,
          understanding: null,
          completed: false,
          cycle: 0,
          routineId: id,
          occurrenceDate: day,
          routineVersion: version,
        };
        statements.push(
          db()
            .prepare(
              "INSERT INTO records(id,kind,data,version,deleted,occurrence,updated_at) VALUES(?,'task',?,1,0,?,?) ON CONFLICT(occurrence) DO NOTHING",
            )
            .bind(
              crypto.randomUUID(),
              JSON.stringify(task),
              `${id}:${day}`,
              now,
            ),
        );
      }
    }
    statements.push(
      db()
        .prepare(
          "INSERT INTO requests(id,fingerprint,result,created_at) VALUES(?,?,?,?)",
        )
        .bind(key, fingerprint, JSON.stringify(result), now),
    );
    if (row)
      statements.push(
        db().prepare("DELETE FROM mutation_guards WHERE id=?").bind(key),
      );
    if (parentGuard)
      statements.push(
        db()
          .prepare("DELETE FROM mutation_guards WHERE id=?")
          .bind(key + ":parent"),
      );
    await db().batch(statements);
    return Response.json(result, { headers });
  } catch (error) {
    if (key) {
      try {
        const existing = await db()
          .prepare("SELECT * FROM requests WHERE id=?")
          .bind(key)
          .first<{ fingerprint: string; result: string }>();
        if (existing && existing.fingerprint === fingerprint)
          return Response.json(JSON.parse(existing.result), { headers });
      } catch {
        /* preserve original error */
      }
    }
    if (error instanceof z.ZodError)
      return Response.json(
        { error: error.issues.map((i) => i.message).join(" · ") },
        { status: 400 },
      );
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("CHECK constraint") ||
      message.includes("UNIQUE constraint")
    )
      return Response.json(
        { error: "다른 화면에서 변경되었습니다. 새로고침 후 다시 시도하세요." },
        { status: 409 },
      );
    const safe = ["대상이", "할 일만", "연결할", "반복 기간"].some((s) =>
      message.startsWith(s),
    );
    return Response.json(
      {
        error: safe
          ? message
          : "저장하지 못했습니다. 입력을 유지하고 있으니 다시 시도하세요.",
      },
      { status: safe ? 400 : 503 },
    );
  }
}
