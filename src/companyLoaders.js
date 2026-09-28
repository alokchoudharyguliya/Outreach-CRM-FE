import { api } from "./api";

/** Browser TTL for company lists (ms). Server also caches /companies/names. */
const TTL_MS = 3 * 60 * 1000;
const SESSION_PREFIX = "mp.companyCache.";

/** @type {Map<string, { expires: number, value: any }>} */
const memory = new Map();
/** @type {Map<string, Promise<any>>} */
const inflight = new Map();

function cacheGet(key) {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) memory.delete(key);
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.expires <= Date.now()) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }
    memory.set(key, parsed);
    return parsed.value;
  } catch {
    return null;
  }
}

function cacheSet(key, value) {
  const entry = { expires: Date.now() + TTL_MS, value };
  memory.set(key, entry);
  try {
    // Outreach rows can be large — keep names in sessionStorage only.
    if (key.startsWith("names:")) {
      sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
    }
  } catch {
    /* quota / private mode */
  }
}

function namesKey(options = {}) {
  const has =
    options.has_emails === true
      ? "1"
      : options.has_emails === false
        ? "0"
        : "any";
  const initial = (options.initial || "").toString().toLowerCase() || "-";
  const q = (options.q || "").toString().trim().toLowerCase() || "-";
  const limit = options.limit != null ? String(options.limit) : "default";
  return `names:h=${has}:i=${initial}:q=${q}:l=${limit}`;
}

async function withCache(key, loader) {
  const hit = cacheGet(key);
  if (hit != null) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const value = await loader();
      cacheSet(key, value);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/** Drop browser company caches (call after create / import / generate / sync). */
export function invalidateCompanyCaches() {
  memory.clear();
  inflight.clear();
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Full company rows for Generate / CompanyPicker (admin only — load on tab open). */
export async function fetchOutreachCompanies() {
  return withCache("outreach:v1", async () => {
    const all = [];
    let page = 1;
    let pages = 1;
    while (page <= pages) {
      const res = await api.listCompanies({
        page,
        page_size: 500,
        include_counts: false,
        has_emails: true,
      });
      all.push(...(res.items || []));
      pages = res.pages || 0;
      if (!pages) break;
      page += 1;
    }
    page = 1;
    pages = 1;
    while (page <= pages) {
      const res = await api.listCompanies({
        page,
        page_size: 500,
        include_counts: false,
        outreach_status: "READY",
      });
      const seen = new Set(all.map((c) => c.id));
      for (const c of res.items || []) {
        if (!seen.has(c.id)) all.push(c);
      }
      pages = res.pages || 0;
      if (!pages) break;
      page += 1;
    }
    return all;
  });
}

/** Lightweight id+name list for filter dropdowns (by initial letter). */
export async function fetchCompanyNames(options = {}) {
  return withCache(namesKey(options), async () => {
    const res = await api.listCompanyNames(options);
    return res.items || [];
  });
}
