"use client";

import { memo } from "react";

export function pageWindow(page: number, totalPages: number): number[] {
  const span = 2;
  const start = Math.max(1, Math.min(page - span, totalPages - span * 2));
  const end = Math.min(totalPages, Math.max(page + span, span * 2 + 1));
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}

function PaginationImpl({
  page,
  totalPages,
  onPageChange,
  ariaLabel = "Paginación",
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages);
  const first = pages[0] ?? 1;
  const last = pages[pages.length - 1] ?? totalPages;

  return (
    <nav className="e-m-pagination" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="e-m-pagination__btn"
      >
        ← Anterior
      </button>
      {first > 1 && (
        <>
          <button type="button" onClick={() => onPageChange(1)} className="e-m-pagination__btn">
            1
          </button>
          {first > 2 && <span className="e-m-pagination__ellipsis">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          aria-current={p === page ? "page" : undefined}
          className={`e-m-pagination__btn${p === page ? " e-m-pagination__btn--current" : ""}`}
        >
          {p}
        </button>
      ))}
      {last < totalPages && (
        <>
          {last < totalPages - 1 && <span className="e-m-pagination__ellipsis">…</span>}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className="e-m-pagination__btn"
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="e-m-pagination__btn"
      >
        Siguiente →
      </button>
    </nav>
  );
}

export const Pagination = memo(PaginationImpl);
export default Pagination;
