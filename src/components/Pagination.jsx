import IconButton from "./IconButton.jsx";
import { IconChevronLeft, IconChevronRight } from "./icons.jsx";

const PAGE_SIZES = [25, 50, 100];

/** Build page tokens: numbers and "…" ellipsis gaps. */
function pageWindow(current, totalPages, radius = 2) {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const set = new Set([1, totalPages]);
  for (let i = current - radius; i <= current + radius; i += 1) {
    if (i >= 1 && i <= totalPages) set.add(i);
  }
  if (current <= radius + 2) {
    for (let i = 1; i <= Math.min(totalPages, radius * 2 + 3); i += 1) set.add(i);
  }
  if (current >= totalPages - radius - 1) {
    for (let i = Math.max(1, totalPages - (radius * 2 + 2)); i <= totalPages; i += 1) {
      set.add(i);
    }
  }

  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

export default function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}) {
  if (!total && pages <= 1) return null;

  const canPrev = page > 1;
  const canNext = page < pages;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const numbers = pageWindow(page, pages);

  function goTo(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(1, Math.floor(n)), Math.max(1, pages));
    if (clamped !== page) onPageChange(clamped);
  }

  return (
    <div className="pagination">
      <span className="muted pagination-meta">
        {total ? `${from}–${to} of ${total}` : "0 results"}
      </span>
      <div className="pagination-controls">
        <IconButton
          icon={IconChevronLeft}
          label="Previous page"
          className="ghost"
          disabled={disabled || !canPrev}
          onClick={() => onPageChange(page - 1)}
        />
        <div className="pagination-numbers" role="navigation" aria-label="Pages">
          {numbers.map((item, idx) =>
            item === "…" ? (
              <span key={`e-${idx}`} className="pagination-ellipsis">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === page ? "pagination-num active" : "pagination-num"}
                disabled={disabled || item === page}
                onClick={() => onPageChange(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                title={`Go to page ${item}`}
              >
                {item}
              </button>
            )
          )}
        </div>
        <IconButton
          icon={IconChevronRight}
          label="Next page"
          className="ghost"
          disabled={disabled || !canNext}
          onClick={() => onPageChange(page + 1)}
        />
        {pages > 9 ? (
          <label className="pagination-goto">
            Go to
            <input
              type="number"
              min={1}
              max={pages}
              placeholder={String(page)}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  goTo(e.currentTarget.value);
                  e.currentTarget.value = "";
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget.value) {
                  goTo(e.currentTarget.value);
                  e.currentTarget.value = "";
                }
              }}
            />
          </label>
        ) : null}
      </div>
      {onPageSizeChange ? (
        <label className="pagination-size">
          Per page
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function emptyPage(pageSize = 50) {
  return { items: [], total: 0, page: 1, pageSize, pages: 0 };
}
