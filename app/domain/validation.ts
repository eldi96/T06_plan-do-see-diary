import { daysBetween, requireDate } from './dates';

export function requiredText(value: unknown, label: string, maxLength = 2000): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}을 입력하세요.`);
  if (value.length > maxLength) throw new Error(`${label}은 ${maxLength}자 이내로 입력하세요.`);
  return value.trim();
}
export function nonnegativeMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw new Error('예상 시간은 0 이상의 유효한 분으로 입력하세요.');
  return value;
}
export function validatePeriod(start: unknown, end: unknown, maxDays?: number): { startDate: string; endDate: string } {
  const startDate = requireDate(start), endDate = requireDate(end);
  if (startDate > endDate) throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
  if (maxDays !== undefined && daysBetween(startDate, endDate) + 1 > maxDays) throw new Error(`적용 기간은 ${maxDays}일 이내로 선택하세요.`);
  return { startDate, endDate };
}
/** Explicit offset is required so clients cannot submit machine-local ambiguous times. */
export function executionDurationSeconds(start: unknown, end: unknown): number {
  const instant = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('시각에는 시간대가 필요합니다.');
    requireDate(value.slice(0, 10));
    const clock = value.slice(11, 19).split(':').map(Number);
    if (clock[0] > 23 || clock[1] > 59 || clock[2] > 59) throw new Error('올바른 시각을 입력하세요.');
    const time = Date.parse(value);
    if (!Number.isFinite(time)) throw new Error('올바른 시각을 입력하세요.');
    return time;
  };
  const difference = instant(end) - instant(start);
  if (difference < 0) throw new Error('종료 시각은 시작 시각보다 빠를 수 없습니다.');
  if (difference % 1000 !== 0) throw new Error('실행 시간은 초 단위로 입력하세요.');
  return difference / 1000;
}
