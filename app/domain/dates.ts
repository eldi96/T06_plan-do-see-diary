import type { DateExamInput, CalendarDate } from './model';

export const SEOUL_TIME_ZONE = 'Asia/Seoul';
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function requireDate(value: unknown): CalendarDate {
  if (!isCalendarDate(value)) throw new Error('올바른 날짜를 YYYY-MM-DD 형식으로 입력하세요.');
  return value;
}
export function addDays(value: CalendarDate, days: number): CalendarDate {
  requireDate(value);
  if (!Number.isSafeInteger(days)) throw new Error('날짜 간격은 정수여야 합니다.');
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime())) throw new Error('날짜 범위를 벗어났습니다.');
  const result = date.toISOString().slice(0, 10);
  return requireDate(result);
}
export function seoulToday(now: Date = new Date()): CalendarDate {
  if (!Number.isFinite(now.getTime())) throw new Error('올바른 시각이 필요합니다.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return requireDate(`${part('year')?.padStart(4, '0')}-${part('month')}-${part('day')}`);
}
export function daysBetween(start: CalendarDate, end: CalendarDate): number {
  requireDate(start); requireDate(end);
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
}
export function examStartDate(exam: DateExamInput): CalendarDate | null {
  if (exam.examDate === null) return null;
  requireDate(exam.examDate);
  let start: CalendarDate;
  if (exam.startMode === 'custom') start = requireDate(exam.customStartDate);
  else if (exam.startMode === '7' || exam.startMode === '14') start = addDays(exam.examDate, -Number(exam.startMode));
  else throw new Error('공부 시작 방식을 선택하세요.');
  if (start > exam.examDate) throw new Error('공부 시작일은 시험일 이후일 수 없습니다.');
  return start;
}
export type ExamStatus = 'unscheduled' | 'planned' | 'preparing' | 'exam_day' | 'past';
export function examStatus(exam: DateExamInput, today = seoulToday()): ExamStatus {
  requireDate(today);
  const start = examStartDate(exam);
  if (start === null || exam.examDate === null) return 'unscheduled';
  if (today < start) return 'planned';
  if (today < exam.examDate) return 'preparing';
  return today === exam.examDate ? 'exam_day' : 'past';
}
export function studyPeriod(exam: DateExamInput): { startDate: CalendarDate; endDate: CalendarDate } | null {
  const start = examStartDate(exam);
  if (start === null || exam.examDate === null || start === exam.examDate) return null;
  return { startDate: start, endDate: addDays(exam.examDate, -1) };
}
export function isDelayed(dueDate: CalendarDate, status: 'in_progress' | 'completed', today = seoulToday()): boolean {
  requireDate(dueDate); requireDate(today);
  return status === 'in_progress' && dueDate < today;
}

