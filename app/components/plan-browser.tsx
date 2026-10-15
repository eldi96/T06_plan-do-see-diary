"use client";

import { useMemo, useState } from "react";
import { Search, LayoutGrid, List, Pencil, History, Trash2, ChevronLeft, ChevronRight, Check, Plus } from "lucide-react";
import type { Plan, Task } from "../domain/model";
import { usePlanLayoutMotion } from "../hooks/use-plan-layout-motion";
import { planPage } from "../domain/plan-pagination";

type Props = {
  plans: Plan[]; tasks: Task[]; selectedId: string; busy: boolean;
  onSelect: (id: string) => void; onEdit: (plan: Plan) => void;
  onHistory: (plan: Plan) => void; onDelete: (plan: Plan) => void;
  onAdd: () => void;
};

/** Viewing controls are local UI state; filtering never changes the selected plan or DB. */
export function PlanBrowser({ plans, tasks, selectedId, busy, onSelect, onEdit, onHistory, onDelete, onAdd }: Props) {
  const [view, setView] = useState<"auto" | "cards" | "list">("auto");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const mode = view === "auto" ? (plans.length >= 5 ? "list" : "cards") : view;
  const matches = useMemo(() => plans.filter(plan => `${plan.title} ${plan.success}`.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))), [plans, query]);
  const pagination = planPage(matches.length, page);
  const { pages, page: currentPage } = pagination;
  const visible = matches.slice(pagination.start, pagination.end);
  const split = mode === "list" && pagination.split;
  const { root: layoutRef, prepare: prepareMotion } = usePlanLayoutMotion(mode, plans.map(plan => plan.id).join(","), visible.map(plan => plan.id).join(","), split ? "split" : "single");
  const selected = plans.find(plan => plan.id === selectedId);
  const counts = useMemo(() => {
    const result = new Map<string, { total: number; completed: number }>();
    for (const task of tasks) {
      const count = result.get(task.planId) ?? { total: 0, completed: 0 };
      count.total++; if (task.completed) count.completed++;
      result.set(task.planId, count);
    }
    return result;
  }, [tasks]);
  if (!plans.length) return null;
  return <section className="plan-browser" aria-label="내 계획 탐색">
    <div className="plan-browser-toolbar">
      <div><h2>내 계획 <span>{plans.length}</span></h2><p>계획을 고르면 아래 할 일과 루틴이 이어집니다.</p></div>
      <div className="plan-browser-controls">
        <label className="plan-search"><Search size={16}/><input aria-label="계획 검색" placeholder="계획 찾기" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label>
        <div className="plan-view-toggle" role="group" aria-label="계획 보기 방식">
          <button aria-label="목록으로 보기" aria-pressed={mode === "list"} onClick={() => { prepareMotion(); setView("list"); setPage(1); }}><List size={17}/></button>
          <button aria-label="카드로 보기" aria-pressed={mode === "cards"} onClick={() => { prepareMotion(); setView("cards"); setPage(1); }}><LayoutGrid size={17}/></button>
        </div>
        <button className="outline plan-add-local" onClick={onAdd}><Plus size={16}/>계획 추가</button>
      </div>
    </div>
    <div ref={layoutRef} className={mode === "list" ? `plan-list ${split ? "plan-list-split" : ""}` : "plan-grid plan-browser-grid"}>
      {visible.map(plan => {
        const active = plan.id === selectedId;
        const count = counts.get(plan.id) ?? { total: 0, completed: 0 };
        return <section key={plan.id} className={`plan-entry ${mode === "list" ? "plan-list-row" : "panel plan-card"} ${active ? "selected" : ""}`} aria-label={`${plan.title} 계획`} onClick={event => { if (!(event.target as HTMLElement).closest("button,input,a,details")) onSelect(plan.id); }}>
          <button className="plan-entry-select" aria-pressed={active} onClick={() => onSelect(plan.id)}>
            <span className="plan-entry-heading"><strong title={plan.title}>{plan.title}</strong>{active && <span className="plan-selected-badge"><Check size={12}/>선택됨</span>}</span>
            <span className="plan-entry-subtitle">{plan.success}</span>
          </button>
          <div className="plan-entry-meta"><span>{plan.startDate} — {plan.endDate}</span><small>우선순위 {plan.priority} · 예상 {plan.estimatedMinutes}분</small></div>
          <div className="plan-entry-progress"><span>{count.completed} / {count.total} 완료</span><div aria-hidden="true"><i style={{width: `${count.total ? count.completed / count.total * 100 : 0}%`}}/></div></div>
          <div className="plan-entry-actions">
            <button className="icon-button" aria-label={`${plan.title} 계획 수정`} title="수정" onClick={() => onEdit(plan)}><Pencil size={16}/></button>
            <button className="icon-button" aria-label={`${plan.title} 수정 이력`} title="수정 이력" onClick={() => onHistory(plan)}><History size={16}/></button>
            <button className="icon-button delete-plan" disabled={busy} aria-label={`${plan.title} 계획 삭제`} title="삭제" onClick={() => onDelete(plan)}><Trash2 size={16}/></button>
          </div>
        </section>;
      })}
    </div>
    {!matches.length && <div className="plan-search-empty"><p>찾는 계획이 없습니다.</p><button className="text-button" onClick={() => { setQuery(""); setPage(1); }}>검색 지우기</button></div>}
    <div className="plan-browser-footer"><small>{matches.length ? `${pagination.start + 1}–${pagination.end} / ${matches.length}개` : "0개"}{query && " · 검색 결과"}</small>
      {pages > 1 && <nav className="plan-pagination" aria-label="계획 페이지"><button aria-label="이전 계획 페이지" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17}/></button><span>{currentPage} / {pages}</span><button aria-label="다음 계획 페이지" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17}/></button></nav>}
    </div>
    {selected && <details className="selected-plan-detail" key={selected.id}><summary>선택한 계획 자세히 <strong>{selected.title}</strong></summary><p>{selected.success}</p>{selected.improvement && <p className="mint">지난 회고 · {selected.improvement}</p>}</details>}
  </section>;
}
