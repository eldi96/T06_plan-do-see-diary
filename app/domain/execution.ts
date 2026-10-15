export const executionActivities = ['학습', '복습', '실습', '정리', '과제', '작성', '진행'] as const;
export type ExecutionActivity = typeof executionActivities[number];
export function executionSummary(title: string, activity: ExecutionActivity, memo = ''): string {
 if (!title.trim() || !executionActivities.includes(activity)) throw new Error('할 일과 활동 종류를 선택하세요.');
 return `${title.trim()} — ${activity}${memo.trim() ? `\n${memo.trim()}` : ''}`;
}
