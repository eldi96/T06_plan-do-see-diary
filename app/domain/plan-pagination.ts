export const PLAN_PAGE_SIZE = 12;

/** Every page starts wide; its seventh entry switches that page to two columns. */
export function planPage(total: number, requested: number) {
  const pages = Math.max(1, Math.ceil(total / PLAN_PAGE_SIZE));
  const page = Math.max(1, Math.min(requested, pages));
  const start = (page - 1) * PLAN_PAGE_SIZE;
  const count = Math.max(0, Math.min(PLAN_PAGE_SIZE, total - start));
  return { pages, page, start, end: start + count, count, split: count > 6 };
}
