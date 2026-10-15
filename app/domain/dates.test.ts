import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isCalendarDate, seoulToday, examStartDate, examStatus, studyPeriod, isDelayed } from './dates';
import { executionDurationSeconds, validatePeriod } from './validation';

test('date validation handles leap years and rejects calendar normalization', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01']) assert.equal(isCalendarDate(date), false);
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-01-01', -14), '2025-12-18');
});
test('Seoul today changes at 15:00 UTC regardless of machine timezone', () => {
  assert.equal(seoulToday(new Date('2026-10-13T14:59:59Z')), '2026-10-13');
  assert.equal(seoulToday(new Date('2026-10-13T15:00:00Z')), '2026-10-14');
});
test('exam offset recalculates while custom date remains an original input', () => {
  const exam = { examDate: '2026-11-15', startMode: '14' as const, customStartDate: null };
  assert.equal(examStartDate(exam), '2026-11-01');
  assert.equal(examStartDate({ ...exam, examDate: '2026-12-01' }), '2026-11-17');
  assert.equal(examStartDate({ ...exam, startMode: '7' }), '2026-11-08');
  const custom = { ...exam, startMode: 'custom' as const, customStartDate: '2026-11-10' };
  assert.equal(examStartDate({ ...custom, examDate: '2026-12-01' }), '2026-11-10');
  assert.throws(() => examStartDate({ ...custom, examDate: '2026-11-09' }));
});
test('exam status and exclusive study end do not imply learning completion', () => {
  const exam = { examDate: '2026-11-15', startMode: '14' as const, customStartDate: null };
  assert.equal(examStatus(exam, '2026-10-31'), 'planned');
  assert.equal(examStatus(exam, '2026-11-01'), 'preparing');
  assert.equal(examStatus(exam, '2026-11-15'), 'exam_day');
  assert.equal(examStatus(exam, '2026-11-16'), 'past');
  assert.equal(examStatus({ ...exam, examDate: null }, '2026-11-16'), 'unscheduled');
  assert.deepEqual(studyPeriod(exam), { startDate: '2026-11-01', endDate: '2026-11-14' });
  assert.equal(studyPeriod({ ...exam, startMode: 'custom', customStartDate: '2026-11-15' }), null);
});
test('today deadline is not delayed and completed tasks are never delayed', () => {
  assert.equal(isDelayed('2026-10-13', 'in_progress', '2026-10-13'), false);
  assert.equal(isDelayed('2026-10-12', 'in_progress', '2026-10-13'), true);
  assert.equal(isDelayed('2026-10-12', 'completed', '2026-10-13'), false);
});
test('execution times compare absolute instants and reject reversed or invalid input', () => {
  assert.equal(executionDurationSeconds('2026-10-14T00:00:00+09:00', '2026-10-13T15:01:00Z'), 60);
  assert.throws(() => executionDurationSeconds('2026-10-14T00:00:00Z', '2026-10-13T23:59:59Z'));
  assert.throws(() => executionDurationSeconds('2026-02-30T00:00:00Z', '2026-03-01T00:00:00Z'));
  assert.throws(() => executionDurationSeconds('2026-10-13T24:00:00Z', '2026-10-14T01:00:00Z'));
  assert.throws(() => executionDurationSeconds('2026-10-13T00:00:00', '2026-10-13T01:00:00'));
});
test('bounded generation counts both ends of a period', () => {
  assert.deepEqual(validatePeriod('2026-10-01', '2026-10-07', 7), { startDate: '2026-10-01', endDate: '2026-10-07' });
  assert.throws(() => validatePeriod('2026-10-01', '2026-10-08', 7));
});
