import { useEffect, useState } from "react";
import { api } from "../api";
import { fetchCompanyNames } from "../companyLoaders.js";

export const COMPANY_LETTERS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  "#",
];

/**
 * Two-step company filter: pick A–Z (or #), then load matching names.
 * source="all" — companies registry (optional hasEmails)
 * source="pending" — companies with pending queue emails
 */
export default function CompanyLetterFilter({
  value = "",
  onChange,
  source = "all",
  hasEmails = true,
  letterLabel = "Letter",
  companyLabel = "Company",
  anyLabel = "Any company",
  disabled = false,
  onPageReset,
}) {
  const [letter, setLetter] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!letter) {
      setOptions([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let items = [];
        if (source === "pending") {
          const rows = await api.pendingCompanies({ initial: letter });
          items = (rows || []).map((r, idx) => ({
            id: idx,
            name: r.company,
          }));
        } else {
          items = await fetchCompanyNames({
            has_emails: hasEmails,
            initial: letter,
          });
        }
        if (!cancelled) setOptions(items);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [letter, source, hasEmails]);

  function onLetterChange(next) {
    setLetter(next);
    if (value) {
      onChange?.("");
      onPageReset?.();
    }
  }

  function onCompanyChange(next) {
    onChange?.(next);
    onPageReset?.();
  }

  return (
    <>
      <label>
        {letterLabel}
        <select
          value={letter}
          disabled={disabled}
          onChange={(e) => onLetterChange(e.target.value)}
        >
          <option value="">Pick letter…</option>
          {COMPANY_LETTERS.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
      </label>
      <label>
        {companyLabel}
        <select
          value={value}
          disabled={disabled || !letter || loading}
          onChange={(e) => onCompanyChange(e.target.value)}
        >
          <option value="">{anyLabel}</option>
          {loading ? (
            <option value="" disabled>
              Loading…
            </option>
          ) : null}
          {!loading
            ? options.map((c) => (
                <option key={`${c.id}-${c.name}`} value={c.name}>
                  {c.name}
                </option>
              ))
            : null}
        </select>
      </label>
    </>
  );
}
