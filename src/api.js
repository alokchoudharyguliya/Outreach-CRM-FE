const TOKEN_KEY = "outreach_token";
const API_BASE_KEY = "outreach_api_base";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Default: Vite `/api` proxy. Vercel: `VITE_API_BASE` or localStorage override. */
export function normalizeApiBase(raw) {
  const value = String(raw || "").trim();
  if (!value) return "/api";
  const stripped = value.replace(/\/+$/, "");
  if (stripped.startsWith("/")) return stripped || "/api";
  try {
    const url = new URL(stripped);
    let path = url.pathname.replace(/\/+$/, "") || "";
    if (!path || path === "/") path = "/api";
    else if (path !== "/api" && !path.endsWith("/api")) path = `${path}/api`;
    return `${url.origin}${path}`;
  } catch {
    return stripped;
  }
}

export function getApiBase() {
  try {
    const stored = localStorage.getItem(API_BASE_KEY);
    if (stored) return normalizeApiBase(stored);
  } catch {
    /* ignore */
  }
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return normalizeApiBase(fromEnv);
  return "/api";
}

export function setApiBase(value) {
  const next = String(value || "").trim();
  try {
    if (!next) localStorage.removeItem(API_BASE_KEY);
    else localStorage.setItem(API_BASE_KEY, normalizeApiBase(next));
  } catch {
    /* ignore */
  }
  return getApiBase();
}

export function clearApiBaseOverride() {
  try {
    localStorage.removeItem(API_BASE_KEY);
  } catch {
    /* ignore */
  }
  return getApiBase();
}

function apiHeaders(extra = {}) {
  const headers = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...extra,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(path, options = {}) {
  const headers = apiHeaders(options.headers || {});
  const url = `${getApiBase()}${path}`;
  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    const err = new Error(
      `Cannot reach API at ${getApiBase()}. Start the Mac backend and ngrok, then check the API URL.`
    );
    err.status = 0;
    throw err;
  }
  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    let detail = res.statusText;
    if (ct.includes("application/json")) {
      try {
        const data = await res.json();
        detail = data.detail || JSON.stringify(data);
      } catch {
        /* ignore */
      }
    } else if (ct.includes("text/html")) {
      detail =
        "API returned a web page instead of JSON. Set the ngrok URL (with /api) on the login screen.";
    }
    const err = new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail)
    );
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function qs(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== "")
  ).toString();
}

/** Bust browser company name / outreach caches after mutations. */
function bustCompanyCaches() {
  import("./companyLoaders.js")
    .then((m) => m.invalidateCompanyCaches?.())
    .catch(() => {});
}

async function afterCompanyMutation(promise) {
  const result = await promise;
  bustCompanyCaches();
  return result;
}

export const api = {
  health: () => request("/health"),
  login: (body) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/auth/me"),
  listUsers: (params = {}) => {
    const q = qs(params);
    return request(`/auth/users${q ? `?${q}` : ""}`);
  },
  createUser: (body) =>
    request("/auth/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id, body) =>
    request(`/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: "DELETE" }),
  generate: (body) =>
    afterCompanyMutation(
      request("/emails/generate", { method: "POST", body: JSON.stringify(body) })
    ),
  generateFromLinkedIn: (body) =>
    afterCompanyMutation(
      request("/emails/generate-from-linkedin", {
        method: "POST",
        body: JSON.stringify(body),
      })
    ),
  startGenerate: (body) =>
    afterCompanyMutation(
      request("/emails/generate/start", {
        method: "POST",
        body: JSON.stringify(body),
      })
    ),
  startGenerateFromLinkedIn: (body) =>
    afterCompanyMutation(
      request("/emails/generate-from-linkedin/start", {
        method: "POST",
        body: JSON.stringify(body),
      })
    ),
  generateJobStatus: () => request("/emails/generate/status"),
  startPoolBatch: (body) =>
    afterCompanyMutation(
      request("/emails/pool-batch/start", {
        method: "POST",
        body: JSON.stringify(body),
      })
    ),
  poolBatchStatus: () => request("/emails/pool-batch/status"),
  stopPoolBatch: () =>
    request("/emails/pool-batch/stop", { method: "POST", body: "{}" }),
  variants: (body) =>
    request("/emails/variants", { method: "POST", body: JSON.stringify(body) }),
  pending: (params = {}) => {
    const q = qs(params);
    return request(`/emails/pending${q ? `?${q}` : ""}`);
  },
  copyPending: (params = {}) => {
    const q = qs(params);
    return request(`/emails/copy-pending${q ? `?${q}` : ""}`);
  },
  listEmails: (params = {}) => {
    const q = qs(params);
    return request(`/emails${q ? `?${q}` : ""}`);
  },
  sendLog: (params = {}) => {
    const q = qs(params);
    return request(`/emails/send-log${q ? `?${q}` : ""}`);
  },
  overview: () => request("/emails/overview"),
  sendQueue: (params = {}) => {
    const q = qs(params);
    return request(`/emails/send-queue${q ? `?${q}` : ""}`);
  },
  getEmail: (id) => request(`/emails/${id}`),
  createEmail: (body) =>
    afterCompanyMutation(
      request("/emails", { method: "POST", body: JSON.stringify(body) })
    ),
  updateEmail: (id, body) =>
    request(`/emails/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEmail: (id) =>
    afterCompanyMutation(request(`/emails/${id}`, { method: "DELETE" })),
  updateStatus: (id, payload = {}, notes) => {
    // Back-compat: updateStatus(id, "SENT") or updateStatus(id, { status, validity, notes })
    const body =
      typeof payload === "string"
        ? { status: payload, notes }
        : { ...payload };
    return request(`/emails/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  sendStatus: () => request("/send/status"),
  sendStart: (body = {}) =>
    request("/send/start", { method: "POST", body: JSON.stringify(body) }),
  sendStop: () => request("/send/stop", { method: "POST", body: "{}" }),
  sendConfig: () => request("/send/config"),
  updateSendConfig: (body) =>
    request("/send/config", { method: "PUT", body: JSON.stringify(body) }),
  createSendAccount: (body) =>
    request("/send/accounts", { method: "POST", body: JSON.stringify(body) }),
  updateSendAccount: (id, body) =>
    request(`/send/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSendAccount: (id, deleteProfile = false) =>
    request(
      `/send/accounts/${encodeURIComponent(id)}?delete_profile=${deleteProfile ? "true" : "false"}`,
      { method: "DELETE" },
    ),
  loginSendAccount: (id) =>
    request(`/send/accounts/${encodeURIComponent(id)}/login`, {
      method: "POST",
      body: "{}",
    }),
  createSendTemplate: (name) =>
    request("/send/templates", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  renameSendTemplate: (from, to) =>
    request("/send/templates", {
      method: "PATCH",
      body: JSON.stringify({ from, to }),
    }),
  deleteSendTemplate: (name) =>
    request(`/send/templates?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  linkedinStatus: () => request("/linkedin/status"),
  linkedinConfig: () => request("/linkedin/config"),
  linkedinLogin: (account_id = null) =>
    request("/linkedin/login", {
      method: "POST",
      body: JSON.stringify(account_id ? { account_id } : {}),
    }),
  linkedinSearch: (body) =>
    request("/linkedin/search", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startLinkedInConnect: (body) =>
    request("/linkedin/connect/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  linkedinConnectStatus: () => request("/linkedin/connect/status"),
  stopLinkedInConnect: () =>
    request("/linkedin/connect/stop", { method: "POST", body: "{}" }),
  getConnectNote: () => request("/linkedin/connect/note"),
  saveConnectNote: (body) =>
    request("/linkedin/connect/note", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  startSmartConnectTriage: (body) =>
    request("/linkedin/smart-connect/triage/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startSmartConnectRetriage: (body = {}) =>
    request("/linkedin/smart-connect/retriage/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startSmartConnectSend: (body) =>
    request("/linkedin/smart-connect/send/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  smartConnectStatus: () => request("/linkedin/smart-connect/status"),
  smartConnectResult: () => request("/linkedin/smart-connect/result"),
  stopSmartConnect: () =>
    request("/linkedin/smart-connect/stop", { method: "POST", body: "{}" }),
  getDiscoverConfig: () => request("/discover/config"),
  saveDiscoverConfig: (body) =>
    request("/discover/config", { method: "PUT", body: JSON.stringify(body) }),
  startDiscover: (body) =>
    request("/discover/start", { method: "POST", body: JSON.stringify(body) }),
  discoverStatus: () => request("/discover/status"),
  stopDiscover: () => request("/discover/stop", { method: "POST", body: "{}" }),
  saveDiscovered: (candidates) =>
    afterCompanyMutation(
      request("/discover/save", {
        method: "POST",
        body: JSON.stringify({ candidates }),
      })
    ),
  pendingCompanies: (params = {}) => {
    const q = qs(params);
    return request(`/emails/pending-companies${q ? `?${q}` : ""}`);
  },
  stats: (company) =>
    request(`/emails/stats${company ? `?company=${encodeURIComponent(company)}` : ""}`),
  listCompanyNames: (params = {}) => {
    const q = qs(params);
    return request(`/companies/names${q ? `?${q}` : ""}`);
  },
  listNcrCompanyNames: (params = {}) => {
    const q = qs(params);
    return request(`/companies/ncr-names${q ? `?${q}` : ""}`);
  },
  listPeople: (params = {}) => {
    const q = qs(params);
    return request(`/people${q ? `?${q}` : ""}`);
  },
  getPerson: (id) => request(`/people/${id}`),
  createPerson: (body) =>
    afterCompanyMutation(
      request("/people", { method: "POST", body: JSON.stringify(body) })
    ),
  updatePerson: (id, body) =>
    afterCompanyMutation(
      request(`/people/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    ),
  deletePerson: (id, deleteEmails = true) =>
    afterCompanyMutation(
      request(`/people/${id}?delete_emails=${deleteEmails}`, { method: "DELETE" })
    ),
  importCounts: () => request("/people/import-counts"),
  listCompanies: (params = {}) => {
    const q = qs(params);
    return request(`/companies${q ? `?${q}` : ""}`);
  },
  createCompany: (body) =>
    afterCompanyMutation(
      request("/companies", { method: "POST", body: JSON.stringify(body) })
    ),
  updateCompany: (id, body) =>
    afterCompanyMutation(
      request(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    ),
  resolveCompanyFormat: (id, body = {}) =>
    request(`/companies/${id}/resolve-format`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteCompany: (id, force = false) =>
    afterCompanyMutation(
      request(`/companies/${id}?force=${force}`, { method: "DELETE" })
    ),
  importCompaniesCsv: (path = null) =>
    afterCompanyMutation(
      request(
        `/companies/import-csv${path ? `?path=${encodeURIComponent(path)}` : ""}`,
        { method: "POST", body: "{}" }
      )
    ),
  syncCompanyOutreach: () =>
    afterCompanyMutation(
      request("/companies/sync-outreach", { method: "POST", body: "{}" })
    ),
  companyOutreachStatuses: () => request("/companies/outreach-statuses"),
  companyTaxonomy: () => request("/companies/taxonomy"),
  bulkUpdateCompanies: (body) =>
    afterCompanyMutation(
      request("/companies/bulk-update", {
        method: "POST",
        body: JSON.stringify(body),
      })
    ),
  startCompanyEnrich: (body = {}) =>
    request("/companies/enrich/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  companyEnrichStatus: () => request("/companies/enrich/status"),
  listFormats: () => request("/companies/formats"),
  getFormat: async (domain) => {
    const headers = apiHeaders();
    const res = await fetch(
      `${getApiBase()}/companies/formats/${encodeURIComponent(domain)}`,
      { headers }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to load format");
    return res.json();
  },
  saveFormat: (domain, email_format) =>
    request("/companies/formats", {
      method: "PUT",
      body: JSON.stringify({ domain, email_format }),
    }),
  deleteFormat: (domain) =>
    request(`/companies/formats/${encodeURIComponent(domain)}`, { method: "DELETE" }),
  exportCsv: async () => {
    const headers = apiHeaders();
    const res = await fetch(`${getApiBase()}/emails/export.csv`, { headers });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "emails.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
  llmStatus: () => request("/llm/status"),
  listCareerLocations: () => request("/career/locations"),
  listCareerEnrollments: (params = {}) => {
    const q = qs(params);
    return request(`/career/enrollments${q ? `?${q}` : ""}`);
  },
  listCareerOpenings: (params = {}) => {
    const q = qs(params);
    return request(`/career/openings${q ? `?${q}` : ""}`);
  },
  getCareerOpening: (id) => request(`/career/openings/${id}`),
  ingestCareer: (location, opts = {}) => {
    const params = {};
    if (location) params.location = location;
    if (opts.mode) params.mode = opts.mode;
    if (opts.since) params.since = opts.since;
    const q = qs(params);
    return request(`/career/ingest${q ? `?${q}` : ""}`, {
      method: "POST",
      body: "{}",
    });
  },
  startCareerScan: (body) =>
    request("/career/jobs/scan", { method: "POST", body: JSON.stringify(body) }),
  startCareerEligibility: (body) =>
    request("/career/jobs/eligibility", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  careerJobStatus: () => request("/career/jobs/status"),
  stopCareerJob: () =>
    request("/career/jobs/stop", { method: "POST", body: "{}" }),
};
