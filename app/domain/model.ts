/** API /api/diary contracts. Calendar dates are Seoul date-only. */
export type CalendarDate = string;
export type Priority = "높음" | "보통" | "낮음";
export type Understanding = "이해했어요" | "복습 필요" | null;
export type Kind =
  "plan" | "task" | "execution" | "exam" | "review" | "routine";
export interface RecordMetadata {
  id: string;
  version: number;
  deleted: boolean;
  updatedAt: string;
}
export interface CommonInput {
  title: string;
  priority: Priority;
  estimatedMinutes: number;
}
export interface PlanInput extends CommonInput {
  startDate: CalendarDate;
  endDate: CalendarDate;
  success: string;
  sourceReviewId?: string;
  improvement?: string;
}
export interface Plan extends PlanInput, RecordMetadata {
  kind: "plan";
}
export interface TaskInput extends CommonInput {
  planId: string;
  dueDate: CalendarDate;
  tags: string[];
  notes: string;
  understanding: Understanding;
  learning: boolean;
  routineId?: string;
  occurrenceDate?: CalendarDate;
}
export interface Task extends TaskInput, RecordMetadata {
  kind: "task";
  completed: boolean;
  cycle: number;
  routineVersion?: number;
}
export interface ExecutionInput {
  taskId: string;
  start: string;
  end: string;
  content?: string;
  activity?: import("./execution").ExecutionActivity;
  memo?: string;
  blockedReason: string;
}
export interface Execution extends ExecutionInput, RecordMetadata {
  kind: "execution";
  content: string;
  durationSeconds: number;
}
export type ExamStartMode = "7" | "14" | "custom";
export interface ExamInput {
  title: string;
  examDate: CalendarDate;
  mode: ExamStartMode;
  customDate?: CalendarDate;
}
export interface Exam extends ExamInput, RecordMetadata {
  kind: "exam";
  startDate: CalendarDate;
}
/** Normalized calculation input adapted from API mode/customDate. */
export interface DateExamInput {
  examDate: CalendarDate | null;
  startMode: ExamStartMode;
  customStartDate: CalendarDate | null;
}
export interface RoutineInput extends CommonInput {
  planId: string;
  weekdays: number[];
  startDate: CalendarDate;
  endDate: CalendarDate;
  tags: string[];
  learning: boolean;
}
export interface Routine extends RoutineInput, RecordMetadata {
  kind: "routine";
}
export interface ReviewInput {
  planId: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
  content: string;
  improvement: string;
}
export interface Review extends ReviewInput, RecordMetadata {
  kind: "review";
}
export type DiaryRecord = Plan | Task | Execution | Exam | Routine | Review;
export interface HistoryEntry {
  id: string;
  record_id: string;
  kind: Kind;
  data: string;
  version: number;
  created_at: string;
}
export interface CompletionEntry {
  id: string;
  task_id: string;
  cycle: number;
  request_id: string;
  created_at: string;
}
export interface DiaryResponse {
  records: DiaryRecord[];
  history: HistoryEntry[];
  completions: CompletionEntry[];
}
export interface DiaryExport extends DiaryResponse {
  schemaVersion: 3;
  timezone: "Asia/Seoul";
  exportedAt: string;
  experiment?: {config:unknown;days:unknown[];change:unknown};
  completions: CompletionEntry[];
}
export interface MutationResult {
  ok: true;
  id: string;
  version: number;
  executionId?: string;
}
export interface ApiError {
  error: string;
}
type InputByKind = {
  plan: PlanInput;
  task: TaskInput;
  execution: ExecutionInput;
  exam: ExamInput;
  routine: RoutineInput;
  review: ReviewInput;
};
export type SaveRequest = {
  [K in Kind]: {
    requestId: string;
    action: "save";
    kind: K;
    id?: string;
    version?: number;
    data: InputByKind[K];
  };
}[Kind];
export type MutationRequest =
  | SaveRequest
  | {requestId:string;action:"complete";kind:"task";id:string;version:number;execution:Omit<ExecutionInput,"taskId">}
  | {
      requestId: string;
      action: "toggle";
      kind: "task";
      id: string;
      version: number;
    }
  | {
      requestId: string;
      action: "delete";
      kind: Kind;
      id: string;
      version: number;
    };
