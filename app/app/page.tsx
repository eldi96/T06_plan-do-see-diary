"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  BookOpen,
  ClipboardList,
  PlayCircle,
  BarChart3,
  GraduationCap,
  Download,
  Plus,
  Info,
  ArrowUpRight,
  Check,
  X,
  Search,
  Trash2,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Home as HomeIcon,
  Clock,
  ArrowRight,
  ListChecks,
  Sparkles,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { executionActivities, executionSummary } from "../domain/execution";
import { diaryRequest } from "../lib/diary-client";
import { PlanBrowser } from "../components/plan-browser";
import { ExecutionCalendar } from "../components/execution-calendar";
import { CompleteTaskDialog } from "../components/complete-task-dialog";
import { AuthGate, AccountMenuTrigger } from "../components/auth-gate";
import { ExperimentPanel } from "../components/experiment-panel";
import { ReviewChart } from "../components/monthly-chart";
import {
  seoulToday,
  addDays,
  examStartDate,
  examStatus,
  daysBetween,
} from "../domain/dates";
import type {
  DiaryRecord,
  HistoryEntry,
  CompletionEntry,
  Task,
  MutationResult,
  DiaryExport,
} from "../domain/model";
import { buildIndexes, summarize, compareTasks } from "../domain/selectors";
type Item = DiaryRecord;
const nav = [
  ["today", "오늘 할 일", HomeIcon],
  ["plans", "계획과 루틴", ClipboardList],
  ["records", "실행 기록", PlayCircle],
  ["review", "돌아보기", BarChart3],
  ["exams", "시험 일정", GraduationCap],
] as const;
function successExamples(title: string): string[] {
  if (/블로그/.test(title))
    return ["학습 내용을 정리한 글 1편 발행", "글에 실습 결과와 배운 점 포함"];
  if (/파이썬/.test(title))
    return [
      "복습한 개념으로 예제 3개 직접 풀기",
      "도움 없이 함수 1개 작성하기",
    ];
  if (/강의 정리/.test(title))
    return ["강의 핵심 내용을 5줄로 정리", "핵심 개념을 내 말로 설명하기"];
  if (/사전강의|AWS/.test(title))
    return [
      "정한 강의 분량을 듣고 핵심 내용 정리",
      "배운 내용을 예제 1개로 확인",
    ];
  if (/ALEPH|과제/i.test(title))
    return [
      "정한 과제 범위를 구현하고 동작 확인",
      "완료한 결과와 확인 방법 정리",
    ];
  if (/와이어샤크/.test(title))
    return ["패킷을 캡처하고 주요 필드 설명", "필터를 적용해 원하는 패킷 찾기"];
  if (/리눅스/.test(title))
    return [
      "명령어 5개를 직접 실행하고 용도 정리",
      "도움 없이 정한 실습 마치기",
    ];
  if (/자격증|SQLD|ADsP/i.test(title))
    return ["정한 문제를 풀고 틀린 문제 복습", "오답의 이유를 내 말로 설명"];
  return ["정한 분량을 끝내고 결과 확인", "도움 없이 배운 내용을 설명하기"];
}
const priorities = ["높음", "보통", "낮음"],
  weekdays = ["일", "월", "화", "수", "목", "금", "토"];
function min(n: number) {
  const v = Math.round(Math.abs(n) * 10) / 10;
  return (
    (n < 0 ? "−" : "") +
    (v < 60
      ? `${v}분`
      : `${Math.floor(v / 60)}시간 ${Math.round((v % 60) * 10) / 10}분`)
  );
}
function ktime(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(" ", "T");
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export default function Home() {
  return <AuthGate><DiaryHome/></AuthGate>;
}
function DiaryHome() {
  const [completingTask,setCompletingTask]=useState<Task|null>(null);
  const [items, setItems] = useState<Item[]>([]),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [completions, setCompletions] = useState<CompletionEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("today"),
    [day, setDay] = useState(""),
    [planId, setPlanId] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [priority, setPriority] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState("due");
  const [modal, setModal] = useState<{ kind: string; item?: Item } | null>(
      null,
    ),
    [draft, setDraft] = useState<any>({}),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [pending, setPending] = useState<any>(null),
    [evidence, setEvidence] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const modalTrigger = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false);
  const {
    plans,
    tasks,
    executions,
    reviews,
    exams,
    routines,
    taskById,
    blockedTaskIds,
  } = useMemo(() => buildIndexes(items), [items]);
  const today = day || seoulToday(),
    plan = plans.find((i) => i.id === planId),
    planTasks = tasks.filter((i) => i.planId === planId);
  async function reload() {
    setLoading(true);
    try {
      const d = await diaryRequest();
      setItems(d.records);
      setHistory(d.history);
      setCompletions(d.completions ?? []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setDay(seoulToday());
    void reload();
  }, []);
  useEffect(() => {
    if (!plans.some((p) => p.id === planId)) setPlanId(plans[0]?.id ?? "");
  }, [plans, planId]);
  useEffect(() => {
    setFrom(plan?.startDate ?? today);
    setTo(plan?.endDate ?? today);
    setEvidence("");
  }, [planId, plan?.startDate, plan?.endDate, today]);
  useEffect(() => {
    const d = dialog.current;
    if (modal && d && !d.open) {
      d.dataset.openMethod =
        document.documentElement.dataset.inputMethod ?? "keyboard";
      d.showModal();
    } else if (!modal && d?.open) {
      d.close();
      modalTrigger.current?.focus();
    }
  }, [modal]);
  async function mutate(body: unknown) {
    return diaryRequest<MutationResult>("", body);
  }
  async function change(item: Item, action: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await mutate({
        requestId: crypto.randomUUID(),
        action,
        kind: item.kind,
        id: item.id,
        version: item.version,
      });
      await reload();
      setNotice(
        action === "delete"
          ? "삭제했습니다. 기존 기록은 내보내기에 보존됩니다."
          : "완료 상태를 변경했습니다.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function selectPlan(id: string) {
    setPlanId(id);
    setQuery("");
    setFilter("all");
    setPriority("");
    setTag("");
  }
  function open(kind: string, item?: Item, seed: any = {}) {
    modalTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setFormError("");
    setPending(null);
    let d: any =
      kind === "plan"
        ? {
            title: "",
            startDate: today,
            endDate: addDays(today, 6),
            success: "",
            priority: "보통",
            estimatedMinutes: 30,
          }
        : kind === "task"
          ? {
              title: "",
              planId,
              dueDate: today,
              tags: [],
              notes: "",
              priority: "보통",
              estimatedMinutes: 30,
              learning: true,
              understanding: null,
            }
          : kind === "routine"
            ? {
                title: "",
                planId,
                startDate: plan?.startDate ?? today,
                endDate: plan?.endDate ?? addDays(today, 6),
                weekdays: [1, 2, 3, 4, 5],
                tags: [],
                priority: "보통",
                estimatedMinutes: 30,
                learning: true,
              }
            : kind === "execution"
              ? {
                  taskId: planTasks[0]?.id ?? "",
                  start: "",
                  end: "",
                  content: "",
                  blockedReason: "",
                  activity: "",
                  memo: "",
                  recordMode: "quick",
                }
              : kind === "review"
                ? {
                    planId,
                    startDate: from,
                    endDate: to,
                    content: "",
                    improvement: "",
                  }
                : kind === "exam"
                  ? { title: "SQLD", examDate: "", mode: "14", customDate: "" }
                  : {};
    d = { ...d, ...seed, ...item };
    if (["task", "routine"].includes(kind)) d.tagsText = (d.tags ?? []).join(", ");
    if (kind === "execution" && item?.kind === "execution") {
      d.start = ktime(item.start);
      d.end = ktime(item.end);
      d.recordMode = item.activity ? "quick" : "detail";
      d.activity = item.activity ?? "";
      d.memo = item.memo ?? "";
    }
    setDraft(d);
    setModal({ kind, item });
  }
  function edit(key: string, value: any) {
    setDraft((d: any) => ({ ...d, [key]: value }));
    setPending(null);
    setFormError("");
  }
  function close() {
    if (!busy) {
      setModal(null);
      setPending(null);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!modal || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFormError("");
    try {
      const data = { ...draft };
      if (["task", "routine"].includes(modal.kind)) {
        data.tags = String(data.tagsText ?? "").split(",").map(tag => tag.trim()).filter(Boolean);
      }
      delete data.tagsText;
      if (["plan", "task", "routine"].includes(modal.kind)) {
        if (
          String(data.estimatedMinutes).trim() === "" ||
          !/^\d+$/.test(String(data.estimatedMinutes))
        )
          throw Error("예상 시간을 분 단위로 입력하세요.");
        data.estimatedMinutes = Number(data.estimatedMinutes);
      }
      if (modal.kind === "execution") {
        data.start += ":00+09:00";
        data.end += ":00+09:00";
        if (data.recordMode === "quick") {
          delete data.content;
        } else {
          delete data.activity;
          delete data.memo;
        }
      }
      if (modal.kind === "exam" && data.mode !== "custom")
        delete data.customDate;
      const body = pending ?? {
        requestId: crypto.randomUUID(),
        action: "save",
        kind: modal.kind,
        id: modal.item?.id,
        version: modal.item?.version,
        data,
      };
      setPending(body);
      const result = await mutate(body);
      await reload();
      setModal(null);
      setPending(null);
      if (modal.kind === "plan") setPlanId(result.id);
      setNotice("서버에 저장했습니다.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function download() {
    try {
      const r = await fetch("/api/diary?export=1");
      if (!r.ok) throw Error("내보내기에 실패했습니다. 다시 시도하세요.");
      const d: DiaryExport = await r.json(),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = `pds-${seoulToday()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const currentDay = seoulToday(),
    nearEnd = addDays(today, 2);
  const delayed = (t: Task) => !t.completed && t.dueDate < currentDay,
    blocked = (t: Task) => blockedTaskIds.has(t.id);
  const near = (t: Task) =>
    !t.completed && t.dueDate >= today && t.dueDate <= nearEnd;
  const scope = planTasks.filter((t) => t.dueDate >= from && t.dueDate <= to),
    daily = planTasks.filter((t) => t.dueDate === today),
    metricScope = tab === "review" ? scope : daily;
  const metrics = [
    {
      key: "all",
      label: tab === "review" ? "계획 수 · 할 일" : "오늘의 할 일",
      n: metricScope.length,
    },
    {
      key: "completed",
      label: "완료",
      n: metricScope.filter((t) => t.completed).length,
    },
    {
      key: tab === "review" ? "delayed" : "understanding",
      label: tab === "review" ? "지연" : "복습 필요",
      n: metricScope.filter((t) =>
        tab === "review" ? delayed(t) : t.understanding === "복습 필요",
      ).length,
    },
    {
      key: tab === "review" ? "blocked" : "near",
      label: tab === "review" ? "막힘" : "마감 임박",
      n:
        tab === "review"
          ? metricScope.filter(blocked).length
          : planTasks.filter(near).length,
    },
  ];
  const matches = (t: Task) =>
    `${t.title} ${t.notes} ${t.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()) &&
    (!priority || t.priority === priority) &&
    (!tag || t.tags.includes(tag)) &&
    (filter === "all" ||
      (filter === "completed" && t.completed) ||
      (filter === "pending" && !t.completed) ||
      (filter === "delayed" && delayed(t)) ||
      (filter === "blocked" && blocked(t)) ||
      (filter === "understanding" && t.understanding === "복습 필요") ||
      (filter === "near" && near(t)));
  const compare = (a: Task, b: Task) =>
    compareTasks(a, b, sort === "title" ? "title" : "due");
  const summary = summarize(scope, executions, currentDay);
  const shown = (tab === "plans" ? planTasks.filter(task=>!task.routineId) : filter === "near" ? planTasks : daily)
      .filter(matches)
      .sort(compare),
    past = planTasks
      .filter((t) => !t.routineId && delayed(t) && t.dueDate !== today)
      .sort(compare),
    scopeExec = summary.executions,
    estimated = summary.estimatedMinutes,
    actual = summary.actualMinutes;
  const manualShown = shown.filter(task=>!task.routineId);
  const routineShown = shown.filter(task=>!!task.routineId);
  const routineTasks = planTasks.filter(task=>!!task.routineId).sort(compare);
  const tools = (
    <>
      <div className="tools">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="검색"
            placeholder="할 일 검색하기…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {tab === "plans" && (
          <select
            aria-label="상태 필터"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">모든 상태</option>
            <option value="completed">완료</option>
            <option value="pending">진행 중</option>
            <option value="delayed">지연</option>
            <option value="blocked">막힘</option>
            <option value="understanding">복습 필요</option>
          </select>
        )}
        <select
          aria-label="우선순위 필터"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">우선순위</option>
          {priorities.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="태그 필터"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">모든 태그</option>
          {Array.from(new Set(planTasks.flatMap((t) => t.tags))).map(
            (t: any) => (
              <option key={t}>{t}</option>
            ),
          )}
        </select>
        <select
          aria-label="정렬"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="due">마감일 순</option>
          <option value="title">제목 순</option>
        </select>
      </div>
      <p className="micro">
        {sort === "due" ? "마감일 → 우선순위 → ID 순" : "제목 → ID 순"}
      </p>
    </>
  );
  const row = (t: Task) => (
    <article className="task-row" key={t.id}>
      <button
        className={"check " + (t.completed ? "checked" : "")}
        disabled={busy}
        aria-label={`${t.title} ${t.completed ? "완료 취소" : "완료"}`}
        onClick={() => t.completed?void change(t,"toggle"):setCompletingTask(t)}
      >
        {t.completed && <Check size={18} />}
      </button>
      <button className="task-title" onClick={() => open("task", t)}>
        <strong>{t.title}</strong>
        <small>
          {t.tags.join(" · ") || "할 일"} · {t.dueDate} · 예상{" "}
          {min(t.estimatedMinutes)}
        </small>
      </button>
      <div className="task-actions">
        {t.learning && t.understanding && (
          <span
            className={
              "pill " + (t.understanding === "이해했어요" ? "mint" : "")
            }
          >
            {t.understanding}
          </span>
        )}
        {blocked(t) && <span className="pill">막힘</span>}
        <button
          className="text-button"
          onClick={() => open("execution", undefined, { taskId: t.id })}
        >
          기록 <ArrowUpRight size={14} />
        </button>
        <button
          className="icon-button"
          aria-label={`${t.title} 삭제`}
          disabled={busy}
          onClick={() => void change(t, "delete")}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
  let preview = "",
    warning = "";
  if (modal?.kind === "exam" && draft.examDate) {
    try {
      preview =
        examStartDate({
          examDate: draft.examDate,
          startMode: draft.mode,
          customStartDate: draft.customDate || null,
        }) ?? "";
      warning =
        preview === draft.examDate
          ? "사전 준비 기간이 없습니다."
          : preview < seoulToday()
            ? "공부 시작일이 이미 지났어요."
            : "";
    } catch (e) {
      warning = (e as Error).message;
    }
  }
  const input = (key: string, type = "text", required = true) => (
    <input
      required={required}
      type={type}
      value={draft[key] ?? ""}
      onChange={(e) =>
        edit(key, type === "number" ? Number(e.target.value) : e.target.value)
      }
    />
  );
  const textarea = (key: string, required = false) => (
    <textarea
      required={required}
      maxLength={5000}
      value={draft[key] ?? ""}
      onChange={(e) => edit(key, e.target.value)}
    />
  );
  return (
    <div
      className="shell"
      data-view={tab}
      onPointerDownCapture={() => {
        document.documentElement.dataset.inputMethod = "pointer";
      }}
      onKeyDownCapture={() => {
        document.documentElement.dataset.inputMethod = "keyboard";
      }}
    >
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <i />
            <i />
          </span>
          PDS <span>/ diary</span>
        </div>
        <p className="workspace">나의 워크스페이스</p>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setFilter("all");
                setEvidence("");
              }}
            >
              <Icon size={21} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p className="sidebar-thought">
            작은 오늘이
            <br />
            원하는 내일을 만듭니다.
          </p>
          <div className="week-strip" aria-label="날짜 바로가기">
            {Array.from({ length: 7 }, (_, i) => {
              const weekday = new Date(today + "T00:00:00Z").getUTCDay(),
                d = addDays(today, -((weekday + 6) % 7) + i);
              return (
                <button
                  key={d}
                  aria-label={`${d} 할 일 보기`}
                  aria-pressed={d === today}
                  onClick={() => setDay(d)}
                >
                  <small>{weekdays[(i + 1) % 7]}</small>
                  <span>{Number(d.slice(-2))}</span>
                </button>
              );
            })}
          </div>
          <button onClick={download}>
            <Download size={20} />
            데이터 내보내기
          </button>
          <small>계획 → 실행 → 돌아보기</small>
          <AccountMenuTrigger />
        </div>
      </aside>
      <main>
        <header>
          <span>
            워크스페이스 <span className="slash">/</span>{" "}
            {nav.find((n) => n[0] === tab)?.[1]}
          </span>
          <div className="header-actions">
            <div className="date-control">
              <CalendarDays size={17} />
              <input
                aria-label="선택 날짜"
                type="date"
                value={today}
                onChange={(e) => setDay(e.target.value || seoulToday())}
              />
              <button
                className="icon-button"
                aria-label="이전 날짜"
                onClick={() => setDay(addDays(today, -1))}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="icon-button"
                aria-label="다음 날짜"
                onClick={() => setDay(addDays(today, 1))}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <button className="primary" onClick={() => open("plan")}>
              <Plus size={16} />새 계획
            </button>
          </div>
        </header>
        <div className="content">
          <div className="public-notice">
            <Info size={17} />
            <span>
              로그인한 계정의 자료만 표시됩니다.
              남이 봐도 괜찮은 내용만 넣으세요.
            </span>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={reload}>다시 불러오기</button>
            </div>
          )}
          {notice && (
            <div className="saved" role="status">
              {notice}
              <button aria-label="안내 닫기" onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className={`page-heading${tab === "exams" ? " exam-heading" : ""}`}>
            <div>
              <span className="eyebrow">YOUR DAILY RHYTHM</span>
              <h1>
                {tab === "today" ? (
                  <>
                    오늘의 작은 일,
                    <br />
                    <span className="mint">내일의 나로.</span>
                  </>
                ) : tab === "plans" ? (
                  "계획을, 나의 리듬으로."
                ) : tab === "records" ? (
                  "실제로 한 일을 남겨요."
                ) : tab === "review" ? (
                  "돌아보고, 다시 앞으로."
                ) : (
                  "시험까지, 나의 페이스로."
                )}
              </h1>
              <p>
                {tab === "exams"
                  ? "시험일과 나에게 맞는 공부 시작일을 설정하세요."
                  : "계획하고, 기록하고, 다음 계획으로 이어가세요."}
              </p>
            </div>
            {tab === "today" && (
              <div className="hero-quote">
                <p>
                  오늘의 작은 실천이
                  <br />
                  내일의 변화를 만듭니다.
                </p>
                <i />
              </div>
            )}
            {tab !== "exams" && tab !== "records" && (
              <select
                className="plan-selector"
                aria-label="선택 계획"
                value={planId}
                onChange={(e) => selectPlan(e.target.value)}
              >
                <option value="">계획 선택</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          {loading && <p className="loading">서버의 기록을 불러오는 중…</p>}
          {!loading &&
            !error &&
            !plans.length &&
            tab !== "exams" &&
            tab !== "today" && (
              <section className="panel empty">
                <BookOpen size={34} />
                <h2>첫 계획부터 시작해요.</h2>
                <p>
                  평일의 공부부터 주말의 실습까지,
                  <br />
                  실제로 하려는 일을 하나의 계획으로 묶어보세요.
                </p>
                <button className="primary" onClick={() => open("plan")}>
                  <Plus size={17} />내 계획 만들기
                </button>
              </section>
            )}
          {(tab === "today" || (tab === "review" && plan)) && (
            <div className="metrics">
              {metrics.map((m, index) => {
                const Icon = [CalendarDays, Check, BookOpen, Clock][index],
                  percent = metricScope.length
                    ? Math.round(
                        (metricScope.filter((t) => t.completed).length /
                          metricScope.length) *
                          100,
                      )
                    : 0;
                const yesterday = planTasks.filter(
                  (t) => t.dueDate === addDays(today, -1),
                ).length;
                const descriptions = [
                  daily.length === yesterday
                    ? "어제와 같은 수의 할 일"
                    : daily.length > yesterday
                      ? `어제보다 ${daily.length - yesterday}개 많아요`
                      : `어제보다 ${yesterday - daily.length}개 적어요`,
                  `완료율 ${percent}%`,
                  "선택한 날짜의 복습 항목",
                  `선택일 포함 3일 이내 · 미완료`,
                ];
                return (
                  <button
                    className={`metric-card metric-${index}`}
                    key={m.key}
                    onClick={() => {
                      if (tab === "review") setEvidence(m.key);
                      else {
                        setQuery("");
                        setPriority("");
                        setTag("");
                        setFilter(m.key);
                      }
                    }}
                  >
                    <span className="metric-icon">
                      <Icon size={25} />
                    </span>
                    <div className="metric-body">
                      <span className="metric-label">{m.label}</span>
                      <div className="metric-value">
                        <b>{String(m.n).padStart(2, "0")}</b>
                        <span>건</span>
                        <ArrowUpRight size={15} />
                      </div>
                      <small>
                        {tab === "review"
                          ? "숫자를 눌러 근거 보기"
                          : descriptions[index]}
                      </small>
                    </div>
                    {index === 1 && (
                      <span
                        className="completion-ring"
                        style={{
                          background: `conic-gradient(var(--mint) ${percent * 3.6}deg, #8ea6a922 0deg)`,
                        }}
                        aria-label={`완료율 ${percent}%`}
                      >
                        <span>{percent}%</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {tab === "today" && (
            <div className="dashboard">
              <section className="panel checklist-panel">
                <div className="section-head">
                  <h2>
                    {filter === "near" ? "마감 임박 할 일" : "오늘 할 일"}
                  </h2>
                  <span className="mint">
                    {daily.filter((t) => t.completed).length} / {daily.length}{" "}
                    완료
                  </span>
                  <button
                    className="text-button push"
                    onClick={() => setTab("plans")}
                  >
                    계획 상세 <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="checklist-context">
                  <select
                    className="plan-selector"
                    aria-label="오늘 할 일의 계획"
                    value={planId}
                    onChange={(e) => selectPlan(e.target.value)}
                  >
                    <option value="">계획 선택</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  {plan && <small>성공 기준 · {plan.success}</small>}
                </div>
                <div
                  className="status-tabs"
                  role="group"
                  aria-label="할 일 상태"
                >
                  {[
                    ["all", "전체", daily.length],
                    [
                      "pending",
                      "진행 중",
                      daily.filter((t) => !t.completed).length,
                    ],
                    [
                      "completed",
                      "완료",
                      daily.filter((t) => t.completed).length,
                    ],
                    [
                      "understanding",
                      "복습",
                      daily.filter((t) => t.understanding === "복습 필요")
                        .length,
                    ],
                    ...(filter === "near"
                      ? [["near", "마감 임박", planTasks.filter(near).length]]
                      : []),
                  ].map(([key, label, count]) => (
                    <button
                      key={key}
                      aria-pressed={filter === key}
                      className={filter === key ? "active" : ""}
                      onClick={() => setFilter(String(key))}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
                {tools}
                <p className="micro">
                  {filter === "near"
                    ? `${today}부터 ${addDays(today, 2)}까지 · 미완료 할 일`
                    : `서울 날짜 기준 ${today} 마감인 할 일`}
                </p>
                {manualShown.map(row)}
                {!manualShown.length && (
                  <div className="checklist-empty">
                    <span className="empty-illustration">
                      <ListChecks size={58} />
                      <i>
                        <Plus size={21} />
                      </i>
                    </span>
                    <h3>
                      {filter === "all"
                        ? routineShown.length ? "직접 추가한 할 일이 없어요." : "오늘 할 일이 없어요."
                        : "조건에 맞는 할 일이 없어요."}
                    </h3>
                    <p>
                      {plan
                        ? "새로운 할 일을 추가하거나 조건을 변경하세요."
                        : "먼저 계획을 만들고 오늘의 할 일을 추가하세요."}
                      <br />
                      작은 계획이 큰 변화를 만듭니다.
                    </p>
                  </div>
                )}
                {routineShown.length > 0 && <details className="routine-occurrences" open={filter !== "all"}><summary>오늘의 루틴 · {routineShown.length}개</summary>{routineShown.map(row)}</details>}
                <button
                  className="add-row"
                  onClick={() => open(plan ? "task" : "plan")}
                >
                  <Plus size={17} />할 일 추가
                </button>
                {past.length > 0 && (
                  <details className="overdue">
                    <summary>지난 미완료 {past.length}개</summary>
                    {past.map(row)}
                  </details>
                )}
              </section>
              <div className="right-column">
                <section className="panel recent-panel">
                  <div className="section-head">
                    <h2>최근 실행 기록</h2>
                    <button
                      className="text-button push"
                      onClick={() => setTab("records")}
                    >
                      달력에서 보기 <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="journal">
                    {executions
                      .filter((e) => planTasks.some((t) => t.id === e.taskId))
                      .slice(-2)
                      .reverse()
                      .map((e) => (
                        <button
                          className="journal-entry"
                          key={e.id}
                          onClick={() => open("execution", e)}
                        >
                          <CheckCircle2 size={23} />
                          <div>
                            <strong>{taskById.get(e.taskId)?.title}</strong>
                            <p>{e.content}</p>
                            <small>
                              {ktime(e.start).replace("T", " ")} ·{" "}
                              {min(e.durationSeconds / 60)}
                            </small>
                          </div>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                  </div>
                  {!executions.some((e) =>
                    planTasks.some((t) => t.id === e.taskId),
                  ) && (
                    <div className="journal-empty">
                      <FileText size={24} />
                      <p>
                        아직 실행 기록이 없습니다.
                        <br />
                        <span>진행한 활동을 간편하게 남겨보세요.</span>
                      </p>
                    </div>
                  )}
                </section>
                <section className="panel reflection">
                  <div className="reflection-top">
                    <h2>오늘의 발견이 다음 계획으로.</h2>
                    <button
                      className="text-button"
                      disabled={!plan}
                      onClick={() => setTab("review")}
                    >
                      돌아보기 작성 <ArrowRight size={14} />
                    </button>
                  </div>
                  <span className="reflection-icon">
                    <Sparkles size={25} />
                  </span>
                  {reviews.filter((r) => r.planId === planId).at(-1)
                    ?.improvement && (
                    <h3 className="mint">
                      {
                        reviews.filter((r) => r.planId === planId).at(-1)
                          ?.improvement
                      }
                    </h3>
                  )}
                  <p>
                    {reviews.filter((r) => r.planId === planId).at(-1)
                      ?.content ||
                      "잘된 점과 막힌 점, 다음에 바꾸고 싶은 한 가지를 남겨요."}
                  </p>
                </section>
              </div>
            </div>
          )}
          {tab === "plans" && (
            <>
              <PlanBrowser plans={plans} tasks={tasks} selectedId={planId} busy={busy}
                onAdd={()=>open("plan")}
                onSelect={selectPlan} onEdit={p => open("plan", p)} onHistory={p => open("history", p)}
                onDelete={p => { if (confirm(`「${p.title}」 계획을 삭제할까요? 연결된 할 일도 화면에서 제외됩니다. 기존 기록과 이력은 내보내기에 보존됩니다.`)) void change(p, "delete"); }} />
              {plan && (
                <>
                  <section className="panel">
                    <div className="section-head">
                      <h2>{plan.title}의 할 일</h2>
                      <button
                        className="primary push"
                        onClick={() => open("task")}
                      >
                        <Plus size={16} />할 일 추가
                      </button>
                    </div>
                    {tools}
                    <p className="micro">직접 추가한 할 일입니다. 반복 루틴 항목은 아래에서 따로 확인합니다.</p>
                    {shown.map(row)}
                    {!shown.length && (
                      <p className="empty-small">실제 할 일을 추가해 주세요.</p>
                    )}
                  </section>
                  <section className="panel">
                    <div className="section-head">
                      <h2>평일·주말 루틴</h2>
                      <button
                        className="outline push"
                        onClick={() => open("routine")}
                      >
                        <Plus size={16} />
                        반복 할 일
                      </button>
                    </div>
                    <p className="muted">
                      요일과 기간에 맞춰 만든 항목은 일반 할 일 목록에 섞이지 않고 여기에서 관리합니다.
                    </p>
                    {routines
                      .filter((r) => r.planId === planId)
                      .map((r) => (
                        <div className="routine-row" key={r.id}>
                          <strong>{r.title}</strong>
                          <span>
                            {r.weekdays
                              .map((d: number) => weekdays[d])
                              .join(" · ")}{" "}
                            / {r.startDate} — {r.endDate}
                          </span>
                          <button onClick={() => open("routine", r)}>
                            수정
                          </button>
                        </div>
                      ))}
                    <details className="routine-occurrences"><summary>생성된 루틴 항목 · {routineTasks.length}개</summary>{routineTasks.map(row)}{!routineTasks.length&&<p className="empty-small">등록된 루틴 항목이 없습니다.</p>}</details>
                    <p className="micro">
                      변경은 아직 생성되지 않은 날짜에만 적용됩니다. 기존 할
                      일·실행 기록은 유지됩니다.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
          {tab === "records" && (
            <><ExecutionCalendar tasks={tasks} plans={plans} records={executions} busy={busy} initialDate={today} onToggle={async task=>{if(!task.completed){setCompletingTask(task);return false;}if(lock.current) throw Error("처리 중입니다.");lock.current=true;setBusy(true);try{await mutate({requestId:crypto.randomUUID(),action:"toggle",kind:"task",id:task.id,version:task.version});await reload();return true;}finally{lock.current=false;setBusy(false);}}} onEdit={task=>open("task",task)} onRecord={(task,date)=>open("execution",undefined,{taskId:task.id,start:`${date}T00:00`,end:`${date}T00:00`})} onSchedule={async(task,date)=>{
              if(lock.current) throw Error("처리 중입니다. 잠시 후 다시 시도하세요.");
              lock.current=true;setBusy(true);
              try{const {id,version,kind,deleted,updatedAt,completed,cycle,...data}=task;await mutate({requestId:crypto.randomUUID(),action:"save",kind:"task",id,version,data:{...data,dueDate:date}});await reload();}finally{lock.current=false;setBusy(false);}
            }}/><details className="calendar-record-history"><summary>실행 기록 내역 · {executions.length}건</summary><section className="panel">
              <div className="section-head">
                <h2>실행 기록</h2>
                <button
                  className="primary push"
                  disabled={!planTasks.length}
                  onClick={() => open("execution")}
                >
                  <Plus size={16} />
                  기록 추가
                </button>
              </div>
              {executions
                .filter(
                  () => true,
                )
                .slice()
                .reverse()
                .map((e) => (
                  <article className="execution-card" key={e.id}>
                    <span className="dot" />
                    <div>
                      <h3>{taskById.get(e.taskId)?.title ?? "삭제된 할 일"}</h3>
                      <p className="preserve">{e.content}</p>
                      <small>
                        {ktime(e.start).replace("T", " ")} →{" "}
                        {ktime(e.end).replace("T", " ")} · 실제{" "}
                        {min(e.durationSeconds / 60)}
                      </small>
                      {e.blockedReason && (
                        <p className="blocked">막힌 이유 · {e.blockedReason}</p>
                      )}
                    </div>
                    <div className="execution-actions push">
                      <button
                        className="text-button"
                        onClick={() => open("execution", e)}
                      >
                        수정
                      </button>
                      <button
                        className="text-button delete-record"
                        disabled={busy}
                        aria-label={`${taskById.get(e.taskId)?.title ?? "실행"} 기록 삭제`}
                        onClick={() => {
                          if (
                            confirm(
                              "이 실행 기록을 삭제할까요? 실제 시간과 막힘 집계에서 제외되며, 기존 내용은 이력과 내보내기에 보존됩니다.",
                            )
                          )
                            void change(e, "delete");
                        }}
                      >
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              {!executions.some(
                () => true,
              ) && (
                <p className="empty-small">
                  실제로 한 내용을 기록해 주세요. 예시 기록은 넣지 않았어요.
                </p>
              )}
            </section></details></>
          )}
          {tab === "review" && <><ReviewChart tasks={tasks} completions={completions} plans={plans} onTask={task=>open("task",task)}/><ExperimentPanel/></>}
          {tab === "review" && plan && (
            <>
              <section className="panel">
                <div className="section-head">
                  <h2>계획과 실제</h2>
                  <div className="range push">
                    <input
                      aria-label="집계 시작일"
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                    <span>—</span>
                    <input
                      aria-label="집계 종료일"
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </div>
                </div>
                <p className="micro">
                  선택 계획·기간 내 마감인 할 일 기준. 실제 시간은 해당 할 일의
                  전체 실행 기록입니다.
                </p>
                {from > to ? (
                  <p className="error">종료일을 시작일 이후로 선택하세요.</p>
                ) : (
                  <>
                    <div className="time-summary">
                      {[
                        ["estimated", "예상 시간", estimated],
                        ["actual", "실제 시간", actual],
                        ["difference", "실제 − 예상", actual - estimated],
                      ].map(([k, l, v]) => (
                        <button key={k} onClick={() => setEvidence(String(k))}>
                          <span>{l}</span>
                          <strong>
                            {k === "difference" && Number(v) > 0 ? "+" : ""}
                            {min(Number(v))}
                          </strong>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                    {evidence && (
                      <div className="evidence">
                        <div className="section-head">
                          <h3>숫자가 나온 근거 기록</h3>
                          <button
                            className="icon-button push"
                            aria-label="근거 닫기"
                            onClick={() => setEvidence("")}
                          >
                            <X size={16} />
                          </button>
                        </div>
                        {(evidence === "actual" || evidence === "difference") &&
                          scopeExec.map((e) => (
                            <p key={e.id}>
                              {taskById.get(e.taskId)?.title} · {e.content} ·{" "}
                              {min(e.durationSeconds / 60)}
                            </p>
                          ))}
                        {evidence !== "actual" &&
                          scope
                            .filter((t) =>
                              evidence === "completed"
                                ? t.completed
                                : evidence === "delayed"
                                  ? delayed(t)
                                  : evidence === "blocked"
                                    ? blocked(t)
                                    : true,
                            )
                            .map(row)}
                        {evidence === "difference" && (
                          <p className="micro">
                            실제 기록 합 − 위 할 일 예상 합
                          </p>
                        )}
                        {(evidence === "actual"
                          ? scopeExec.length
                          : scope.filter((t) =>
                              evidence === "completed"
                                ? t.completed
                                : evidence === "delayed"
                                  ? delayed(t)
                                  : evidence === "blocked"
                                    ? blocked(t)
                                    : true,
                            ).length) === 0 && (
                          <p>해당 기록이 없습니다. 합계는 0입니다.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
              <section className="panel">
                <div className="section-head">
                  <h2>돌아보기와 다음 계획</h2>
                  <button
                    className="primary push"
                    onClick={() => open("review")}
                  >
                    <Plus size={16} />
                    회고 작성
                  </button>
                </div>
                {reviews
                  .filter((r) => r.planId === planId)
                  .slice()
                  .reverse()
                  .map((r) => (
                    <article className="review-card" key={r.id}>
                      <small>
                        {r.startDate} — {r.endDate}
                      </small>
                      <p className="preserve">{r.content}</p>
                      <h3>{r.improvement}</h3>
                      <div className="card-buttons">
                        <button onClick={() => open("review", r)}>수정</button>
                        <button
                          className="outline"
                          onClick={() =>
                            open("plan", undefined, {
                              sourceReviewId: r.id,
                              improvement: r.improvement,
                              success: r.improvement,
                            })
                          }
                        >
                          다음 계획에 반영 <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
              </section>
            </>
          )}
          {tab === "exams" && (
            <>
              <section className="panel">
                <div className="section-head">
                  <h2>내 시험 일정</h2>
                  <button className="primary push" onClick={() => open("exam")}><Plus size={16}/>시험 일정 추가</button>
                </div>
                {!exams.length && <p className="muted">등록한 시험 일정이 없어요. 준비할 시험과 날짜를 직접 추가해 보세요.</p>}
              </section>
              <div className="exam-grid">
                {exams.map((e) => {
                  const name = e.title,
                    state = e
                      ? examStatus({
                          examDate: e.examDate,
                          startMode: e.mode,
                          customStartDate: e.customDate ?? null,
                        })
                      : "unscheduled",
                    labels = {
                      unscheduled: "시험일 미설정",
                      planned: "준비 예정",
                      preparing: "준비 기간",
                      exam_day: "시험 당일",
                      past: "시험일 지남",
                    };
                  return (
                    <section className="panel exam-card exam-compact" key={name}>
                      <div className="section-head">
                        <span className="exam-icon">
                          <GraduationCap size={25} />
                        </span>
                        <span className="pill mint push">{labels[state]}</span>
                      </div>
                      <h2>{name}</h2>
                      <p>
                        {name === "SQLD" ? "SQL 개발자" : "데이터분석 준전문가"}
                      </p>
                      <dl>
                        <div>
                          <dt>시험일</dt>
                          <dd>{e?.examDate ?? "미설정"}</dd>
                        </div>
                        <div>
                          <dt>공부 시작일</dt>
                          <dd className="mint">{e?.startDate ?? "—"}</dd>
                        </div>
                        <div className="exam-mode">
                          <dt>준비 방식</dt>
                          <dd>
                            {e
                              ? e.mode === "custom"
                                ? "직접 시작일"
                                : `시험 ${e.mode}일 전`
                              : "7일 전 · 14일 전 · 직접 날짜"}
                          </dd>
                        </div>
                      </dl>
                      {e && (state === "planned" || state === "preparing") && (
                        <p className="countdown">
                          {state === "planned" ? "공부 시작" : "시험"}까지{" "}
                          <b>
                            {daysBetween(
                              seoulToday(),
                              state === "planned" ? e.startDate : e.examDate,
                            )}
                            일
                          </b>
                        </p>
                      )}
                      <button
                        className={e ? "outline full" : "primary full"}
                        onClick={() => open("exam", e, { title: name })}
                      >
                        {e ? "일정 변경" : "시험 일정 설정"}
                        <CalendarDays size={16} />
                      </button>
                      {e && (
                        <button
                          className="text-button history-button"
                          onClick={() => open("history", e)}
                        >
                          변경 이력
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
              <section className="panel exam-note">
                <Info size={20} />
                <div>
                  <h3>공부 시작일은 직접 결정합니다.</h3>
                  <p>
                    시험일 기준 7일 전·14일 전 또는 지정한 날짜부터 준비 일정을
                    설정합니다.
                    <br />
                    일정 변경 시 기존 할 일과 학습 기록은 유지됩니다.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setTab("plans")}
                  >
                    공부할 내용을 계획에 추가 <ArrowUpRight size={15} />
                  </button>
                </div>
              </section>
            </>
          )}
          <footer>
            계획은 유연하게, 기록은 솔직하게. <span>PDS diary</span>
          </footer>
        </div>
      </main>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="modal-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <div className="modal-heading">
          <h2 id="modal-title">
            {modal?.kind === "history"
              ? "수정 이력"
              : modal?.kind === "plan"
                ? "계획 세우기"
                : modal?.kind === "task"
                  ? "할 일 설정"
                  : modal?.kind === "routine"
                    ? "반복 할 일"
                    : modal?.kind === "execution"
                      ? "실제로 한 일 기록"
                      : modal?.kind === "exam"
                        ? "시험과 공부 시작일"
                        : "돌아보기"}
          </h2>
          <button
            className="icon-button"
            disabled={busy}
            aria-label="닫기"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {modal?.kind === "history" ? (
          <div className="history-list">
            {history
              .filter((h) => h.record_id === modal.item?.id)
              .map((h) => (
                <article key={h.id}>
                  <small>
                    버전 {h.version} · {ktime(h.created_at).replace("T", " ")}
                  </small>
                  <pre>{JSON.stringify(JSON.parse(h.data), null, 2)}</pre>
                </article>
              ))}
            {!history.some((h) => h.record_id === modal.item?.id) && (
              <p>아직 수정된 적이 없어요.</p>
            )}
          </div>
        ) : (
          <form onSubmit={save}>
            {modal && ["plan", "task", "routine"].includes(modal.kind) && (
              <>
                <Field label="제목">{input("title")}</Field>
                {modal.kind !== "plan" && (
                  <Field label="연결 계획">
                    <select
                      required
                      value={draft.planId ?? ""}
                      onChange={(e) => edit("planId", e.target.value)}
                    >
                      <option value="">계획 선택</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="form-grid">
                  <Field label="우선순위">
                    <select
                      value={draft.priority}
                      onChange={(e) => edit("priority", e.target.value)}
                    >
                      {priorities.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <fieldset className="estimated-time">
                    <legend>예상 시간</legend>
                    <div className="estimated-time-options">
                      {[30, 60].map((minutes) => (
                        <label key={minutes}>
                          <input type="radio" name="estimated-time" value={minutes}
                            checked={Number(draft.estimatedMinutes) === minutes}
                            onChange={() => edit("estimatedMinutes", minutes)}/>
                          <span>{minutes === 30 ? "30분" : "1시간"}</span>
                        </label>
                      ))}
                    </div>
                    {![30, 60].includes(Number(draft.estimatedMinutes)) && <p className="micro">기존 예상 시간 {draft.estimatedMinutes}분은 선택을 바꾸기 전까지 유지됩니다.</p>}
                  </fieldset>
                </div>
              </>
            )}
            {modal && ["plan", "routine", "review"].includes(modal.kind) && (
              <div className="form-grid">
                <Field label="시작일">{input("startDate", "date")}</Field>
                <Field label="종료일">
                  <input
                    required
                    type="date"
                    min={draft.startDate}
                    value={draft.endDate ?? ""}
                    onChange={(e) => edit("endDate", e.target.value)}
                  />
                </Field>
              </div>
            )}
            {modal?.kind === "plan" && (
              <>
                <div className="field success-field">
                  <label htmlFor="success-criteria">성공 기준</label>
                  <p className="micro">
                    이 계획을 끝냈다고 판단할 수 있는 결과를 적습니다.
                  </p>
                  <textarea
                    id="success-criteria"
                    required
                    maxLength={3000}
                    placeholder={successExamples(draft.title ?? "")[0]}
                    value={draft.success ?? ""}
                    onChange={(e) => edit("success", e.target.value)}
                  />
                  <span className="example-label">
                    예시를 선택한 뒤 수정할 수 있습니다.
                  </span>
                  <div className="criteria-examples">
                    {successExamples(draft.title ?? "").map((example) => (
                      <button
                        type="button"
                        key={example}
                        onClick={() => edit("success", example)}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
                {draft.improvement && (
                  <p className="mint">이전 회고 · {draft.improvement}</p>
                )}
              </>
            )}
            {modal && ["task", "routine"].includes(modal.kind) && (
              <>
                <Field label="태그 (쉼표로 구분)">
                  <input
                    value={draft.tagsText ?? ""}
                    onChange={(e) => edit("tagsText", e.target.value)}
                  />
                </Field>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={!!draft.learning}
                    onChange={(e) => edit("learning", e.target.checked)}
                  />
                  학습 항목 · 이해도 별도 표시
                </label>
              </>
            )}
            {modal?.kind === "task" && (
              <>
                <Field label="마감일">{input("dueDate", "date")}</Field>
                <Field label="내용">{textarea("notes")}</Field>
                {draft.learning && (
                  <Field label="이해도 (완료와 별개)">
                    <select
                      value={draft.understanding ?? ""}
                      onChange={(e) =>
                        edit("understanding", e.target.value || null)
                      }
                    >
                      <option value="">아직 평가하지 않음</option>
                      <option>이해했어요</option>
                      <option>복습 필요</option>
                    </select>
                  </Field>
                )}
              </>
            )}
            {modal?.kind === "routine" && (
              <>
                <Field label="반복 요일">
                  <div className="weekday-checks">
                    {weekdays.map((w, n) => (
                      <label key={n}>
                        <input
                          type="checkbox"
                          checked={(draft.weekdays ?? []).includes(n)}
                          onChange={(e) =>
                            edit(
                              "weekdays",
                              e.target.checked
                                ? [...draft.weekdays, n]
                                : draft.weekdays.filter((i: number) => i !== n),
                            )
                          }
                        />
                        {w}
                      </label>
                    ))}
                  </div>
                </Field>
                <p className="micro">
                  계획 기간 안에서 최대 91일 생성합니다. 기존 날짜별 할 일은
                  덮어쓰지 않습니다.
                </p>
              </>
            )}
            {modal?.kind === "execution" && (
              <>
                <Field label="기록할 할 일">
                  <select
                    required
                    value={draft.taskId ?? ""}
                    onChange={(e) => edit("taskId", e.target.value)}
                  >
                    <option value="">할 일 선택</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.dueDate}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="field">
                  <span>기록 방식</span>
                  <div className="record-modes">
                    <button
                      type="button"
                      className={draft.recordMode === "quick" ? "active" : ""}
                      onClick={() => edit("recordMode", "quick")}
                    >
                      간편 기록
                    </button>
                    <button
                      type="button"
                      className={draft.recordMode === "detail" ? "active" : ""}
                      onClick={() => edit("recordMode", "detail")}
                    >
                      직접 작성
                    </button>
                  </div>
                </div>
                {draft.recordMode === "quick" ? (
                  <>
                    <Field label="활동 종류">
                      <select
                        required
                        value={draft.activity ?? ""}
                        onChange={(e) => edit("activity", e.target.value)}
                      >
                        <option value="">활동 선택</option>
                        {executionActivities.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="메모 (선택)">
                      <input
                        maxLength={3000}
                        placeholder="필요한 경우에만 추가합니다"
                        value={draft.memo ?? ""}
                        onChange={(e) => edit("memo", e.target.value)}
                      />
                    </Field>
                    <div className="record-preview">
                      <span>저장될 기록</span>
                      <p>
                        {tasks.some((t) => t.id === draft.taskId) &&
                        draft.activity
                          ? executionSummary(
                              taskById.get(draft.taskId)?.title ?? "",
                              draft.activity,
                              draft.memo,
                            )
                          : "할 일과 활동 종류를 선택하세요."}
                      </p>
                    </div>
                  </>
                ) : (
                  <Field label="실제로 한 내용">
                    {textarea("content", true)}
                  </Field>
                )}
                <div className="form-grid">
                  <Field label="시작 시각 (서울)">
                    {input("start", "datetime-local")}
                    <button
                      type="button"
                      className="text-button time-now"
                      onClick={() =>
                        edit("start", ktime(new Date().toISOString()))
                      }
                    >
                      현재 시각 입력
                    </button>
                  </Field>
                  <Field label="종료 시각 (서울)">
                    <input
                      required
                      type="datetime-local"
                      min={draft.start}
                      value={draft.end ?? ""}
                      onChange={(e) => edit("end", e.target.value)}
                    />
                    <button
                      type="button"
                      className="text-button time-now"
                      onClick={() =>
                        edit("end", ktime(new Date().toISOString()))
                      }
                    >
                      현재 시각 입력
                    </button>
                  </Field>
                </div>
                <p className="micro">
                  소요 시간은 자동 계산하며 원래 예상 시간을 바꾸지 않습니다.
                </p>
                <Field label="막혔던 이유 (없으면 비워 두세요)">
                  {textarea("blockedReason")}
                </Field>
              </>
            )}
            {modal?.kind === "exam" && (
              <>
                <Field label="자격증">
                  <select
                    disabled={!!modal.item}
                    value={draft.title}
                    onChange={(e) => edit("title", e.target.value)}
                  >
                    <option>SQLD</option>
                    <option>ADsP</option>
                  </select>
                </Field>
                <Field label="시험일">{input("examDate", "date")}</Field>
                <Field label="언제부터 공부할까요?">
                  <select
                    value={draft.mode}
                    onChange={(e) => edit("mode", e.target.value)}
                  >
                    <option value="7">시험 7일 전부터</option>
                    <option value="14">시험 14일 전부터</option>
                    <option value="custom">공부 시작일 직접 선택</option>
                  </select>
                </Field>
                {draft.mode === "custom" && (
                  <Field label="공부 시작일">
                    <input
                      required
                      type="date"
                      max={draft.examDate}
                      value={draft.customDate ?? ""}
                      onChange={(e) => edit("customDate", e.target.value)}
                    />
                  </Field>
                )}
                <div className="exam-preview">
                  <span>공부 시작일</span>
                  <strong>{preview || "시험일을 선택해 주세요"}</strong>
                  {preview && (
                    <>
                      <small>
                        시험일 {draft.examDate} ·{" "}
                        {draft.mode === "custom"
                          ? "직접 선택"
                          : `${draft.mode}일 전 시작`}
                      </small>
                      <small>
                        {preview > seoulToday()
                          ? `공부 시작까지 ${daysBetween(seoulToday(), preview)}일`
                          : preview === seoulToday()
                            ? "오늘 공부 시작"
                            : `공부 시작일로부터 ${daysBetween(preview, seoulToday())}일 지남`}
                      </small>
                    </>
                  )}
                  {warning && <p>{warning}</p>}
                </div>
                <p className="micro">
                  일정을 변경해도 기존 학습 기록은 유지됩니다.
                </p>
              </>
            )}
            {modal?.kind === "review" && (
              <>
                <Field label="돌아보기">{textarea("content")}</Field>
                <Field label="다음 계획에서 바꿀 한 가지">
                  {textarea("improvement", true)}
                </Field>
              </>
            )}
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="outline"
                disabled={busy}
                onClick={close}
              >
                취소
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "서버에 저장 중…"
                  : pending
                    ? "같은 요청으로 다시 저장"
                    : "저장하기"}
              </button>
            </div>
          </form>
        )}
      </dialog>
      {completingTask&&<CompleteTaskDialog task={completingTask} onClose={()=>setCompletingTask(null)} onSaved={async()=>{await reload();setNotice("완료와 실행 기록을 함께 저장했습니다.");}}/>}
    </div>
  );
}

