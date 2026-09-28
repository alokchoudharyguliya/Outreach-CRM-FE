import { useEffect, useState } from "react";
import { api } from "../api";
import { fetchOutreachCompanies } from "../companyLoaders.js";
import CompanyLetterFilter from "./CompanyLetterFilter.jsx";
import { EMAIL_STATUSES, EMAIL_VALIDITIES, NEW_COMPANY } from "../constants";
import { useSelection } from "../hooks/useSelection";
import { useActionFeedback, ToastStack } from "./ActionToast.jsx";
import CompanyPicker, { resolveCompanySelection } from "./CompanyPicker.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import IconButton from "./IconButton.jsx";
import Modal from "./Modal.jsx";
import Pagination from "./Pagination.jsx";
import VariantsButton from "./VariantsButton.jsx";
import {
  IconEdit,
  IconEye,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "./icons.jsx";

const emptyPerson = {
  name: "",
  companyValue: "",
  newName: "",
  domain: "",
  emailFormat: "firstname.lastname",
};
const emptyEmail = { email: "", status: "NEW", validity: "UNKNOWN", notes: "" };

const DEFAULT_TIERS = ["S++", "S+", "S", "A+", "A", "B+", "B", "C"];
const DEFAULT_TIER_LABELS = {
  "S++": "₹80L+ fresher CTC",
  "S+": "₹50–80L fresher CTC",
  S: "₹30–50L fresher CTC",
  "A+": "₹22–30L fresher CTC",
  A: "₹15–22L fresher CTC",
  "B+": "₹10–15L fresher CTC",
  B: "₹6–10L fresher CTC",
  C: "<₹6L fresher CTC",
};

export default function PeoplePanel({
  setError,
  onChanged,
  onCompanyTotalChange,
  canWrite = false,
}) {
  const [pickerCompanies, setPickerCompanies] = useState([]);
  const [rows, setRows] = useState([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peoplePages, setPeoplePages] = useState(0);
  const [peoplePage, setPeoplePage] = useState(1);
  const [peoplePageSize, setPeoplePageSize] = useState(50);
  const [searchQ, setSearchQ] = useState("");
  const [appliedSearchQ, setAppliedSearchQ] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [appliedCompanySearch, setAppliedCompanySearch] = useState("");
  const emptyCompanyFilters = {
    tier: "",
    india_presence: "",
    indian_city: "",
    country: "",
    tier_source: "",
    has_tier: "",
    sort: "name",
  };
  const [companyFilters, setCompanyFilters] = useState(emptyCompanyFilters);
  const [appliedCompanyFilters, setAppliedCompanyFilters] =
    useState(emptyCompanyFilters);
  const [companyRows, setCompanyRows] = useState([]);
  const [companyTotal, setCompanyTotal] = useState(0);
  const [companyPages, setCompanyPages] = useState(0);
  const [companyPage, setCompanyPage] = useState(1);
  const [companyPageSize, setCompanyPageSize] = useState(50);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyPerson);
  const [detail, setDetail] = useState(null);
  const [emailForm, setEmailForm] = useState(emptyEmail);
  const [busy, setBusy] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    domain: "",
    email_format: "firstname.lastname",
    career_url: "",
    tier: "",
    tier_label: "",
    country: "",
    india_presence: "",
    indian_city: "",
    focus: "",
    website: "",
    notes: "",
  });
  const [taxonomy, setTaxonomy] = useState({
    tiers: DEFAULT_TIERS,
    tier_labels: DEFAULT_TIER_LABELS,
    india_presence: ["YES", "NO", "UNKNOWN"],
    indian_city_suggestions: [
      "N/A",
      "Gurugram",
      "Gurgaon",
      "Noida",
      "Greater Noida",
      "New Delhi",
      "Delhi",
      "Bengaluru",
      "Bangalore",
      "Hyderabad",
      "Mumbai",
      "Pune",
      "Chennai",
      "Kolkata",
    ],
  });
  const [bulkMeta, setBulkMeta] = useState({
    tier: "",
    india_presence: "",
    indian_city: "",
    country: "",
  });
  const [tierPopoverId, setTierPopoverId] = useState(null);
  const [enrichStatus, setEnrichStatus] = useState(null);
  const [, setEnrichTick] = useState(0);
  const [expandedCareerId, setExpandedCareerId] = useState(null);
  const [eligibleOpenings, setEligibleOpenings] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligiblePage, setEligiblePage] = useState(1);
  const [eligiblePageSize, setEligiblePageSize] = useState(25);
  const [eligibleTotal, setEligibleTotal] = useState(0);
  const [eligiblePages, setEligiblePages] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [bulkCompanyOpen, setBulkCompanyOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState(emptyPerson);
  const { flash, toasts, dismiss } = useActionFeedback();

  function findCompany(name) {
    const key = String(name || "").toLowerCase();
    return (
      pickerCompanies.find((c) => c.name.toLowerCase() === key) ||
      companyRows.find((c) => c.name.toLowerCase() === key)
    );
  }

  async function ensurePickerCompanies() {
    if (pickerCompanies.length) return pickerCompanies;
    const list = await fetchOutreachCompanies();
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    setPickerCompanies(sorted);
    return sorted;
  }

  const peopleSel = useSelection(rows);
  const companySel = useSelection(companyRows);

  async function loadPeople() {
    try {
      const data = await api.listPeople({
        ...(companyFilter ? { company: companyFilter } : {}),
        ...(appliedSearchQ.trim() ? { q: appliedSearchQ.trim() } : {}),
        page: peoplePage,
        page_size: peoplePageSize,
      });
      setRows(data.items || []);
      setPeopleTotal(data.total || 0);
      setPeoplePages(data.pages || 0);
      peopleSel.clear();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadCompaniesList() {
    try {
      const f = appliedCompanyFilters;
      const data = await api.listCompanies({
        ...(appliedCompanySearch.trim()
          ? { q: appliedCompanySearch.trim() }
          : {}),
        page: companyPage,
        page_size: companyPageSize,
        include_counts: true,
        include_career: true,
        ...(f.tier ? { tier: f.tier } : {}),
        ...(f.india_presence ? { india_presence: f.india_presence } : {}),
        ...(f.indian_city ? { indian_city: f.indian_city } : {}),
        ...(f.country.trim() ? { country: f.country.trim() } : {}),
        ...(f.tier_source ? { tier_source: f.tier_source } : {}),
        ...(f.has_tier === "true"
          ? { has_tier: true }
          : f.has_tier === "false"
            ? { has_tier: false }
            : {}),
        ...(f.sort && f.sort !== "name" ? { sort: f.sort } : {}),
      });
      setCompanyRows(data.items || []);
      setCompanyTotal(data.total || 0);
      setCompanyPages(data.pages || 0);
      companySel.clear();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, peoplePage, peoplePageSize, appliedSearchQ]);

  useEffect(() => {
    loadCompaniesList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyPage, companyPageSize, appliedCompanySearch, appliedCompanyFilters]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tax = await api.companyTaxonomy();
        if (!cancelled && tax?.tiers?.length) setTaxonomy(tax);
      } catch {
        /* keep defaults */
      }
      try {
        const st = await api.companyEnrichStatus();
        if (!cancelled) setEnrichStatus(st);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enrichStatus?.busy) return undefined;
    const t = setInterval(async () => {
      try {
        const st = await api.companyEnrichStatus();
        setEnrichStatus(st);
        if (!st.busy) {
          await reloadAll();
          onChanged?.();
          flash(st.message || "Enrichment finished");
        }
      } catch {
        /* ignore poll errors */
      }
    }, 800);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichStatus?.busy]);

  // Re-render elapsed seconds while enricher is live
  useEffect(() => {
    if (!enrichStatus?.busy) return undefined;
    const t = setInterval(() => setEnrichTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [enrichStatus?.busy]);

  async function reloadAll() {
    await loadPeople();
    await loadCompaniesList();
    setPickerCompanies([]);
    await onCompanyTotalChange?.();
  }

  async function openCreate() {
    const list = await ensurePickerCompanies();
    setCreating(true);
    const match = list.find((c) => c.name === companyFilter);
    setForm({
      ...emptyPerson,
      companyValue: companyFilter || "",
      domain: match?.domain || "",
      emailFormat: match?.email_format || "firstname.lastname",
    });
  }

  async function openEdit(row) {
    const list = await ensurePickerCompanies();
    const company = list.find((c) => c.name === row.company);
    setEditing(row);
    setForm({
      name: row.name || "",
      companyValue: row.company || "",
      newName: "",
      domain: company?.domain || "",
      emailFormat: company?.email_format || "firstname.lastname",
    });
  }

  function onCompanyChange(next) {
    if (next.mode === "new") {
      setForm((f) => ({
        ...f,
        companyValue: NEW_COMPANY,
        newName: next.name || "",
        domain: next.domain || "",
        emailFormat: next.email_format || "firstname.lastname",
      }));
      return;
    }
    setForm((f) => ({
      ...f,
      companyValue: next.name || "",
      newName: "",
      domain: next.domain || "",
      emailFormat: next.email_format || "firstname.lastname",
    }));
  }

  async function savePerson(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const company = resolveCompanySelection({
        value: form.companyValue,
        newName: form.newName,
        domain: form.domain,
        emailFormat: form.emailFormat,
      });
      if (company.isNew) {
        await api.createCompany({
          name: company.name,
          domain: company.domain || null,
          email_format: company.email_format,
        });
      } else {
        const existing = findCompany(company.name);
        if (existing && (company.domain || company.email_format)) {
          await api.updateCompany(existing.id, {
            domain: company.domain || null,
            email_format: company.email_format,
          });
        }
      }

      const body = {
        name: form.name.trim(),
        company: company.name,
        domain: company.domain || null,
        email_format: company.email_format,
      };

      const wasCreating = creating;
      if (wasCreating) {
        await api.createPerson(body);
        setCreating(false);
      } else if (editing) {
        await api.updatePerson(editing.id, body);
        setEditing(null);
      }
      flash(wasCreating ? "Person added" : "Person saved");
      await reloadAll();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function askDeletePeople(targetRows) {
    if (!targetRows.length) return;
    const n = targetRows.length;
    const sample =
      n === 1
        ? `${targetRows[0].name} (${targetRows[0].company})`
        : `${n} selected people`;
    setPendingDelete({
      type: "people",
      rows: targetRows,
      message: `Delete ${sample} and all linked emails? This cannot be undone.`,
    });
  }

  async function openBulkCompany() {
    const selected = peopleSel.selectedItems;
    if (!selected.length) return;
    await ensurePickerCompanies();
    const firstCompany = selected[0]?.company || "";
    const sameCompany = selected.every((r) => r.company === firstCompany);
    const company = sameCompany ? findCompany(firstCompany) : null;
    setBulkForm({
      ...emptyPerson,
      companyValue: company?.name || "",
      newName: "",
      domain: company?.domain || "",
      emailFormat: company?.email_format || "firstname.lastname",
    });
    setBulkCompanyOpen(true);
  }

  function onBulkCompanyChange(next) {
    if (next.mode === "new") {
      setBulkForm((f) => ({
        ...f,
        companyValue: NEW_COMPANY,
        newName: next.name || "",
        domain: next.domain || "",
        emailFormat: next.email_format || "firstname.lastname",
      }));
      return;
    }
    setBulkForm((f) => ({
      ...f,
      companyValue: next.name || "",
      newName: "",
      domain: next.domain || "",
      emailFormat: next.email_format || "firstname.lastname",
    }));
  }

  async function saveBulkCompany(e) {
    e.preventDefault();
    const targets = peopleSel.selectedItems;
    if (!targets.length) return;
    setBusy(true);
    try {
      const company = resolveCompanySelection({
        value: bulkForm.companyValue,
        newName: bulkForm.newName,
        domain: bulkForm.domain,
        emailFormat: bulkForm.emailFormat,
      });
      if (company.isNew) {
        await api.createCompany({
          name: company.name,
          domain: company.domain || null,
          email_format: company.email_format,
        });
      } else {
        const existing = findCompany(company.name);
        if (existing && (company.domain || company.email_format)) {
          await api.updateCompany(existing.id, {
            domain: company.domain || null,
            email_format: company.email_format,
          });
        }
      }

      const results = await Promise.allSettled(
        targets.map((r) =>
          api.updatePerson(r.id, {
            company: company.name,
            domain: company.domain || null,
            email_format: company.email_format,
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      const ok = results.length - failed.length;
      if (failed.length) {
        const first = failed[0].reason?.message || "update failed";
        setError(
          `Updated ${ok}/${results.length}. ${failed.length} failed (e.g. ${first})`
        );
      } else {
        setError("");
      }
      flash(
        failed.length
          ? `Company updated for ${ok} of ${results.length}`
          : `Company + format updated for ${ok} people`
      );
      setBulkCompanyOpen(false);
      peopleSel.clear();
      await reloadAll();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function askDeleteCompanies(targetRows) {
    if (!targetRows.length) return;
    const n = targetRows.length;
    const withPeople = targetRows.filter((c) => c.people_count > 0);
    const sample =
      n === 1 ? targetRows[0].name : `${n} selected companies`;
    setPendingDelete({
      type: "companies",
      rows: targetRows,
      force: withPeople.length > 0,
      message: withPeople.length
        ? `Delete ${sample}? ${withPeople.length} compan${
            withPeople.length === 1 ? "y has" : "ies have"
          } people — those people and emails will also be deleted. This cannot be undone.`
        : `Delete ${sample}? This cannot be undone.`,
    });
  }

  async function openDetail(id) {
    setBusy(true);
    try {
      const data = await api.getPerson(id);
      setDetail(data);
      setEmailForm(emptyEmail);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addEmail(e) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      const company = findCompany(detail.company);
      await api.createEmail({
        person_id: detail.id,
        email: emailForm.email.trim().toLowerCase(),
        status: emailForm.status,
        validity: emailForm.validity,
        notes: emailForm.notes || null,
        email_format: company?.email_format || null,
      });
      flash("Email added");
      await openDetail(detail.id);
      await reloadAll();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function askDeleteEmail(em) {
    setPendingDelete({
      type: "email",
      rows: [em],
      message: `Delete email ${em.email}? This cannot be undone.`,
    });
  }

  function openCompanyEdit(c) {
    setEditingCompany(c);
    setCompanyForm({
      name: c.name,
      domain: c.domain || "",
      email_format: c.email_format || "firstname.lastname",
      career_url: c.career_url || "",
      tier: c.tier || "",
      tier_label: c.tier_label || "",
      country: c.country || "",
      india_presence: c.india_presence || "",
      indian_city: c.indian_city || "",
      focus: c.focus || "",
      website: c.website || "",
      notes: c.notes || "",
    });
  }

  async function patchCompanyTier(company, tier) {
    if (!canWrite) return;
    setBusy(true);
    try {
      const labels = taxonomy.tier_labels || DEFAULT_TIER_LABELS;
      await api.updateCompany(company.id, {
        tier: tier || null,
        tier_label: tier ? labels[tier] || null : null,
        tier_source: "manual",
        tier_confidence: 1.0,
      });
      flash(tier ? `Tier → ${tier}` : "Tier cleared");
      setTierPopoverId(null);
      await reloadAll();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkMeta() {
    const ids = [...companySel.selected];
    if (!ids.length) return;
    const body = { company_ids: ids };
    if (bulkMeta.tier) body.tier = bulkMeta.tier;
    if (bulkMeta.india_presence) body.india_presence = bulkMeta.india_presence;
    if (bulkMeta.indian_city.trim()) body.indian_city = bulkMeta.indian_city.trim();
    if (bulkMeta.country.trim()) body.country = bulkMeta.country.trim();
    if (!body.tier && !body.india_presence && !body.indian_city && !body.country) {
      setError("Pick a tier, india presence, indian city, or country for bulk edit");
      return;
    }
    setBusy(true);
    try {
      const res = await api.bulkUpdateCompanies(body);
      flash(`Updated ${res.updated || 0} companies`);
      companySel.clear();
      await reloadAll();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function startEnrich({
    selectedOnly = false,
    missingOnly = true,
    mode = "metadata",
  } = {}) {
    setBusy(true);
    try {
      const body = {
        mode,
        missing_only: missingOnly,
        overwrite: false,
      };
      if (selectedOnly) {
        const ids = [...companySel.selected];
        if (!ids.length) {
          setError("Select companies to enrich");
          setBusy(false);
          return;
        }
        body.company_ids = ids;
        body.missing_only = false;
      } else {
        body.limit = 2000; // one enrich hit
      }
      const st = await api.startCompanyEnrich(body);
      setEnrichStatus(st);
      flash(
        mode === "tier"
          ? "Tier labeling started"
          : "Metadata / location enrich started"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadEligibleOpenings(companyId, page = eligiblePage, pageSize = eligiblePageSize) {
    setEligibleLoading(true);
    try {
      const res = await api.listCareerOpenings({
        company_id: companyId,
        eligible: "true",
        page,
        page_size: pageSize,
        sort: "score",
      });
      setEligibleOpenings(res.items || []);
      setEligibleTotal(res.total || 0);
      setEligiblePages(res.pages || 0);
      if (res.page && res.page !== page) setEligiblePage(res.page);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEligibleLoading(false);
    }
  }

  async function toggleEligibleOpenings(companyId) {
    if (expandedCareerId === companyId) {
      setExpandedCareerId(null);
      setEligibleOpenings([]);
      setEligibleTotal(0);
      setEligiblePages(0);
      setEligiblePage(1);
      return;
    }
    setExpandedCareerId(companyId);
    setEligiblePage(1);
  }

  useEffect(() => {
    if (!expandedCareerId) return;
    loadEligibleOpenings(expandedCareerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedCareerId, eligiblePage, eligiblePageSize]);

  async function saveCompany(e) {
    e.preventDefault();
    if (!editingCompany) return;
    setBusy(true);
    try {
      const tier = companyForm.tier.trim() || null;
      const labels = taxonomy.tier_labels || DEFAULT_TIER_LABELS;
      await api.updateCompany(editingCompany.id, {
        name: companyForm.name.trim(),
        domain: companyForm.domain.trim() || null,
        email_format: companyForm.email_format,
        career_url: companyForm.career_url.trim() || null,
        tier,
        tier_label: tier
          ? companyForm.tier_label.trim() || labels[tier] || null
          : null,
        country: companyForm.country.trim() || null,
        india_presence: companyForm.india_presence.trim() || null,
        indian_city: companyForm.indian_city.trim() || null,
        focus: companyForm.focus.trim() || null,
        website: companyForm.website.trim() || null,
        notes: companyForm.notes,
        tier_source: "manual",
        tier_confidence: 1.0,
      });
      flash("Company saved");
      setEditingCompany(null);
      await reloadAll();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      if (pendingDelete.type === "people") {
        await Promise.all(
          pendingDelete.rows.map((r) => api.deletePerson(r.id, true))
        );
        if (detail && pendingDelete.rows.some((r) => r.id === detail.id)) {
          setDetail(null);
        }
        flash(
          `Deleted ${pendingDelete.rows.length} person${
            pendingDelete.rows.length === 1 ? "" : "s"
          }`
        );
        peopleSel.clear();
        await reloadAll();
        onChanged?.();
      } else if (pendingDelete.type === "email") {
        await api.deleteEmail(pendingDelete.rows[0].id);
        flash("Email deleted");
        if (detail) await openDetail(detail.id);
        onChanged?.();
      } else if (pendingDelete.type === "companies") {
        await Promise.all(
          pendingDelete.rows.map((c) =>
            api.deleteCompany(c.id, !!pendingDelete.force)
          )
        );
        flash(
          `Deleted ${pendingDelete.rows.length} compan${
            pendingDelete.rows.length === 1 ? "y" : "ies"
          }`
        );
        companySel.clear();
        await reloadAll();
        onChanged?.();
      }
      setPendingDelete(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const modalOpen = creating || editing;

  return (
    <section className="panel">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <div className="row-between">
        <h1>Companies &amp; People</h1>
        {canWrite ? (
          <button type="button" className="primary btn-with-icon" onClick={openCreate} title="Add a new person">
            <IconPlus />
            Add person
          </button>
        ) : null}
      </div>

      <form
        className="form compact"
        onSubmit={(e) => {
          e.preventDefault();
          setPeoplePage(1);
          setAppliedSearchQ(searchQ.trim());
        }}
      >
        <label>
          Search people
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="any characters: name or company…"
          />
        </label>
        <CompanyLetterFilter
          value={companyFilter}
          onChange={setCompanyFilter}
          source="all"
          hasEmails
          companyLabel="Filter company"
          anyLabel="All companies"
          onPageReset={() => setPeoplePage(1)}
        />
        <button type="submit" className="btn-with-icon" title="Search people">
          <IconSearch />
          Search
        </button>
      </form>

      <Pagination
        page={peoplePage}
        pages={peoplePages}
        total={peopleTotal}
        pageSize={peoplePageSize}
        disabled={busy}
        onPageChange={setPeoplePage}
        onPageSizeChange={(size) => {
          setPeoplePageSize(size);
          setPeoplePage(1);
        }}
      />

      {canWrite && peopleSel.selected.size > 0 ? (
        <div className="bulk-bar">
          <span className="bulk-count">{peopleSel.selected.size} people</span>
          <button
            type="button"
            title="Change company and email format for selected people"
            onClick={openBulkCompany}
            disabled={busy}
          >
            Change company / format
          </button>
          <button
            type="button"
            className="danger btn-with-icon"
            title="Delete selected people and their emails"
            onClick={() => askDeletePeople(peopleSel.selectedItems)}
            disabled={busy}
          >
            <IconTrash />
            Delete selected
          </button>
          <IconButton
            icon={IconX}
            label="Clear selection"
            className="ghost"
            onClick={peopleSel.clear}
            disabled={busy}
          />
        </div>
      ) : null}

      {rows.length ? (
        <div className="select-list">
          <div className="select-list-head people-head">
            {canWrite ? (
              <label className="check-cell">
                <input
                  type="checkbox"
                  checked={peopleSel.allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = peopleSel.someSelected;
                  }}
                  onChange={peopleSel.toggleAll}
                  aria-label="Select all people"
                />
              </label>
            ) : (
              <span />
            )}
            <span>Person</span>
            <span>Added</span>
            <span>Actions</span>
          </div>
          <ul className="list select-body">
            {rows.map((r) => {
              const checked = peopleSel.selected.has(r.id);
              return (
                <li
                  key={r.id}
                  className={
                    checked ? "item selectable people-row checked" : "item selectable people-row"
                  }
                >
                  {canWrite ? (
                    <label className="check-cell">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => peopleSel.toggleOne(r.id)}
                        aria-label={`Select ${r.name}`}
                      />
                    </label>
                  ) : (
                    <span />
                  )}
                  <div>
                    <div>{r.name}</div>
                    <div className="muted">{r.company}</div>
                  </div>
                  <span className="muted">{r.created_at?.slice(0, 10)}</span>
                  <div className="row-actions">
                    <IconButton
                      icon={IconEye}
                      label="View"
                      onClick={() => openDetail(r.id)}
                      disabled={busy}
                    />
                    {canWrite ? (
                      <>
                        <IconButton
                          icon={IconEdit}
                          label="Edit"
                          onClick={() => openEdit(r)}
                          disabled={busy}
                        />
                        <IconButton
                          icon={IconTrash}
                          label="Delete"
                          tone="danger"
                          onClick={() => askDeletePeople([r])}
                          disabled={busy}
                        />
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="muted">No people yet.</p>
      )}

      {peopleTotal > 0 ? (
        <Pagination
          page={peoplePage}
          pages={peoplePages}
          total={peopleTotal}
          pageSize={peoplePageSize}
          disabled={busy}
          onPageChange={setPeoplePage}
          onPageSizeChange={(size) => {
            setPeoplePageSize(size);
            setPeoplePage(1);
          }}
        />
      ) : null}

      <h2 className="section-title">Companies</h2>
      <p className="muted">
        Shared registry used by Generate, People, and email formats. Names/domains are
        stored lowercase for de-duplication. Use <strong>Fill metadata</strong> for
        location/focus/website, and <strong>Label tiers</strong> separately for CTC
        bands — they no longer block each other.
      </p>
      {canWrite ? (
        <div className="bulk-bar" style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ghost"
            disabled={busy || enrichStatus?.busy}
            onClick={() => startEnrich({ mode: "metadata", missingOnly: true })}
            title="Fill country, India presence, Indian city (NCR preferred), focus, website"
          >
            Fill metadata (missing)
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || enrichStatus?.busy || !companySel.selected.size}
            onClick={() =>
              startEnrich({ mode: "metadata", selectedOnly: true })
            }
            title="Fill metadata for selected companies"
          >
            Metadata selected ({companySel.selected.size})
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || enrichStatus?.busy}
            onClick={() => startEnrich({ mode: "tier", missingOnly: true })}
            title="Assign fresher-CTC tiers only (separate from location)"
          >
            Label tiers (missing)
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || enrichStatus?.busy || !companySel.selected.size}
            onClick={() => startEnrich({ mode: "tier", selectedOnly: true })}
            title="Label tiers for selected companies"
          >
            Tiers selected ({companySel.selected.size})
          </button>
        </div>
      ) : null}

      {enrichStatus &&
      (enrichStatus.busy ||
        enrichStatus.phase === "done" ||
        enrichStatus.phase === "error" ||
        (enrichStatus.companies && enrichStatus.companies.length > 0)) ? (
        <div
          className={`enrich-panel ${enrichStatus.phase || (enrichStatus.busy ? "running" : "")}`}
        >
          <div className="enrich-panel-header">
            <h3 className="enrich-panel-title">
              {enrichStatus.busy ? (
                <span className="enrich-pulse" aria-hidden="true" />
              ) : null}
              {enrichStatus.mode === "tier"
                ? "Tier labeler"
                : "Metadata / location enricher"}
            </h3>
            <span className="enrich-panel-phase">
              {enrichStatus.busy ? "LIVE" : enrichStatus.phase || "idle"}
              {enrichStatus.mode ? ` · ${enrichStatus.mode}` : ""}
            </span>
          </div>
          <p className="enrich-panel-message">
            {enrichStatus.message ||
              (enrichStatus.busy
                ? "Running enrichment…"
                : enrichStatus.error || "Enrichment finished")}
          </p>
          <div className="generate-progress-bar" aria-hidden="true">
            <div
              style={{
                width: `${
                  enrichStatus.total
                    ? Math.min(
                        100,
                        Math.round(
                          (100 *
                            (enrichStatus.processed ||
                              enrichStatus.current_index ||
                              0)) /
                            enrichStatus.total
                        )
                      )
                    : enrichStatus.busy
                      ? 8
                      : 100
                }%`,
              }}
            />
          </div>
          <div className="enrich-stats">
            <span className="enrich-stat">
              Progress{" "}
              <strong>
                {enrichStatus.processed || enrichStatus.current_index || 0}
                {enrichStatus.total ? ` / ${enrichStatus.total}` : ""}
              </strong>
            </span>
            {enrichStatus.workers ? (
              <span className="enrich-stat">
                Parallel{" "}
                <strong>
                  ×{enrichStatus.workers}
                  {enrichStatus.llm_concurrency
                    ? ` · llm≤${enrichStatus.llm_concurrency}`
                    : ""}
                </strong>
              </span>
            ) : null}
            {enrichStatus.mode === "tier" ? (
              <>
                <span className="enrich-stat">
                  Tiers written{" "}
                  <strong>{enrichStatus.wrote_tier_count ?? 0}</strong>
                </span>
                <span className="enrich-stat">
                  Needs review{" "}
                  <strong>{enrichStatus.needs_review_count ?? 0}</strong>
                </span>
              </>
            ) : (
              <span className="enrich-stat">
                Metadata updated{" "}
                <strong>{enrichStatus.wrote_meta_count ?? 0}</strong>
              </span>
            )}
            {enrichStatus.started_at ? (
              <span className="enrich-stat">
                Elapsed{" "}
                <strong>
                  {Math.max(
                    0,
                    Math.round(
                      ((enrichStatus.finished_at
                        ? enrichStatus.finished_at * 1000
                        : Date.now()) -
                        enrichStatus.started_at * 1000) /
                        1000
                    )
                  )}
                  s
                </strong>
              </span>
            ) : null}
          </div>
          {enrichStatus.error ? (
            <p className="error-text">{enrichStatus.error}</p>
          ) : null}
          {Array.isArray(enrichStatus.companies) &&
          enrichStatus.companies.length > 0 ? (
            <div className="enrich-company-grid">
              {enrichStatus.companies.map((c) => (
                <div
                  key={c.id}
                  className={`enrich-company-card phase-${c.phase || "queued"}`}
                >
                  <div className="enrich-company-name">{c.name}</div>
                  <div className="enrich-company-phase">
                    {c.phase || "queued"}
                    {c.tier ? ` · tier ${c.tier}` : ""}
                    {!c.tier && c.proposed_tier
                      ? ` · proposed ${c.proposed_tier}`
                      : ""}
                    {c.country ? ` · ${c.country}` : ""}
                    {c.indian_city ? ` · ${c.indian_city}` : ""}
                  </div>
                  <div className="enrich-company-meta">
                    {c.message || "—"}
                    {c.confidence != null
                      ? ` · conf ${Number(c.confidence).toFixed(2)}`
                      : ""}
                    {c.needs_review ? " · needs review" : ""}
                    {c.error ? ` · ${c.error}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {canWrite && companySel.selected.size > 0 ? (
        <div className="bulk-bar" style={{ marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <span className="bulk-count">{companySel.selected.size} selected</span>
          <label className="muted">
            Tier{" "}
            <select
              value={bulkMeta.tier}
              onChange={(e) => setBulkMeta({ ...bulkMeta, tier: e.target.value })}
            >
              <option value="">—</option>
              {(taxonomy.tiers || DEFAULT_TIERS).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="muted">
            India{" "}
            <select
              value={bulkMeta.india_presence}
              onChange={(e) =>
                setBulkMeta({ ...bulkMeta, india_presence: e.target.value })
              }
            >
              <option value="">—</option>
              {(taxonomy.india_presence || ["YES", "NO", "UNKNOWN"]).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="muted">
            City{" "}
            <input
              list="indian-city-suggestions"
              value={bulkMeta.indian_city}
              onChange={(e) =>
                setBulkMeta({ ...bulkMeta, indian_city: e.target.value })
              }
              placeholder="Gurugram / N/A"
              style={{ width: "8rem" }}
            />
          </label>
          <label className="muted">
            Country{" "}
            <input
              value={bulkMeta.country}
              onChange={(e) => setBulkMeta({ ...bulkMeta, country: e.target.value })}
              placeholder="India"
              style={{ width: "7rem" }}
            />
          </label>
          <button type="button" disabled={busy} onClick={applyBulkMeta}>
            Apply to selected
          </button>
          <button type="button" className="ghost" onClick={() => companySel.clear()}>
            Clear
          </button>
        </div>
      ) : null}
      <form
        className="form compact pool-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setCompanyPage(1);
          setAppliedCompanySearch(companySearch.trim());
          setAppliedCompanyFilters({ ...companyFilters });
        }}
      >
        <label>
          Search companies
          <input
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            placeholder="any characters: company or domain…"
          />
        </label>
        <label>
          Tier
          <select
            value={companyFilters.tier}
            onChange={(e) =>
              setCompanyFilters((f) => ({ ...f, tier: e.target.value }))
            }
          >
            <option value="">Any tier</option>
            <option value="S++,S+,S">S / S+ / S++</option>
            <option value="A+,A">A+ / A</option>
            <option value="S++,S+,S,A+,A">S + A tiers</option>
            <option value="B+,B,C">B / C</option>
            {(taxonomy.tiers || DEFAULT_TIERS).map((t) => (
              <option key={t} value={t}>
                {t} only
              </option>
            ))}
          </select>
        </label>
        <label>
          Has tier
          <select
            value={companyFilters.has_tier}
            onChange={(e) =>
              setCompanyFilters((f) => ({ ...f, has_tier: e.target.value }))
            }
          >
            <option value="">Any</option>
            <option value="true">Labeled</option>
            <option value="false">Missing tier</option>
          </select>
        </label>
        <label>
          India
          <select
            value={companyFilters.india_presence}
            onChange={(e) =>
              setCompanyFilters((f) => ({
                ...f,
                india_presence: e.target.value,
              }))
            }
          >
            <option value="">Any</option>
            <option value="yes">YES</option>
            <option value="no">NO</option>
            <option value="unknown">UNKNOWN / empty</option>
            <option value="not_yes">Not YES</option>
          </select>
        </label>
        <label>
          Indian city
          <input
            list="company-filter-indian-city"
            value={companyFilters.indian_city}
            onChange={(e) =>
              setCompanyFilters((f) => ({ ...f, indian_city: e.target.value }))
            }
            placeholder="Noida, Gurugram, empty…"
          />
          <datalist id="company-filter-indian-city">
            <option value="empty">Unset</option>
            {(
              taxonomy.indian_city_suggestions || [
                "N/A",
                "Gurugram",
                "Gurgaon",
                "Noida",
                "Greater Noida",
                "New Delhi",
                "Delhi",
                "Bengaluru",
                "Hyderabad",
                "Mumbai",
                "Pune",
                "Chennai",
              ]
            ).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          Country
          <input
            value={companyFilters.country}
            onChange={(e) =>
              setCompanyFilters((f) => ({ ...f, country: e.target.value }))
            }
            placeholder="India, empty…"
          />
        </label>
        <label>
          Tier source
          <select
            value={companyFilters.tier_source}
            onChange={(e) =>
              setCompanyFilters((f) => ({ ...f, tier_source: e.target.value }))
            }
          >
            <option value="">Any</option>
            <option value="manual">manual</option>
            <option value="azure">azure</option>
            <option value="merged">merged</option>
            <option value="evidence">evidence</option>
            <option value="empty">Unset</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={companyFilters.sort}
            onChange={(e) =>
              setCompanyFilters((f) => ({ ...f, sort: e.target.value }))
            }
          >
            <option value="name">Name</option>
            <option value="tier">Tier (high → low)</option>
          </select>
        </label>
        <button type="submit" className="btn-with-icon" title="Apply filters">
          <IconSearch />
          Apply
        </button>
        <button
          type="button"
          className="ghost"
          title="Clear enrichment filters"
          onClick={() => {
            setCompanySearch("");
            setCompanyFilters(emptyCompanyFilters);
            setAppliedCompanySearch("");
            setAppliedCompanyFilters(emptyCompanyFilters);
            setCompanyPage(1);
          }}
        >
          Clear
        </button>
      </form>

      <Pagination
        page={companyPage}
        pages={companyPages}
        total={companyTotal}
        pageSize={companyPageSize}
        disabled={busy}
        onPageChange={setCompanyPage}
        onPageSizeChange={(size) => {
          setCompanyPageSize(size);
          setCompanyPage(1);
        }}
      />

      {canWrite && companySel.selected.size > 0 ? (
        <div className="bulk-bar">
          <span className="bulk-count">{companySel.selected.size} companies</span>
          <button
            type="button"
            className="danger btn-with-icon"
            title="Delete selected companies"
            onClick={() => askDeleteCompanies(companySel.selectedItems)}
            disabled={busy}
          >
            <IconTrash />
            Delete selected
          </button>
          <IconButton
            icon={IconX}
            label="Clear selection"
            className="ghost"
            onClick={companySel.clear}
            disabled={busy}
          />
        </div>
      ) : null}

      {companyRows.length ? (
        <div className="select-list">
          <div className="select-list-head people-head">
            {canWrite ? (
              <label className="check-cell">
                <input
                  type="checkbox"
                  checked={companySel.allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = companySel.someSelected;
                  }}
                  onChange={companySel.toggleAll}
                  aria-label="Select all companies"
                />
              </label>
            ) : (
              <span />
            )}
            <span>Company</span>
            <span>Counts</span>
            <span>Actions</span>
          </div>
          <ul className="list select-body">
            {companyRows.map((c) => {
              const checked = companySel.selected.has(c.id);
              return (
                <li
                  key={c.id}
                  className={
                    checked
                      ? "item selectable people-row checked"
                      : "item selectable people-row"
                  }
                >
                  {canWrite ? (
                    <label className="check-cell">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => companySel.toggleOne(c.id)}
                        aria-label={`Select ${c.name}`}
                      />
                    </label>
                  ) : (
                    <span />
                  )}
                  <div>
                    <div>
                      {c.name}
                      {canWrite ? (
                        <span className="tier-chip-wrap" style={{ marginLeft: 6 }}>
                          <button
                            type="button"
                            className={`pill soft tier-chip${c.tier_source === "manual" ? " tier-manual" : ""}`}
                            title={
                              c.tier_label
                                ? `${c.tier_label}${c.tier_confidence != null ? ` · conf ${c.tier_confidence}` : ""}`
                                : "Set tier"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setTierPopoverId(
                                tierPopoverId === c.id ? null : c.id
                              );
                            }}
                          >
                            {c.tier || "tier?"}
                          </button>
                          {tierPopoverId === c.id ? (
                            <span className="tier-popover" role="listbox">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => patchCompanyTier(c, "")}
                              >
                                Clear
                              </button>
                              {(taxonomy.tiers || DEFAULT_TIERS).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  className={t === c.tier ? "pill" : "ghost"}
                                  onClick={() => patchCompanyTier(c, t)}
                                >
                                  {t}
                                </button>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      ) : c.tier ? (
                        <span className="pill soft" style={{ marginLeft: 6 }}>
                          {c.tier}
                        </span>
                      ) : null}
                      {c.outreach_status ? (
                        <span className="pill soft" style={{ marginLeft: 6 }}>
                          {c.outreach_status}
                        </span>
                      ) : null}
                      {(c.eligible_count || 0) > 0 ? (
                        <span className="pill soft" style={{ marginLeft: 6 }}>
                          {c.eligible_count} eligible
                        </span>
                      ) : null}
                    </div>
                    <div className="muted mono">
                      {c.domain || "no domain"} · {c.email_format}
                      {c.source ? ` · ${c.source}` : ""}
                    </div>
                    {c.india_presence || c.indian_city || c.country || c.focus ? (
                      <div
                        className="muted"
                        style={{ marginTop: 2, fontSize: "0.85rem" }}
                      >
                        {[
                          c.india_presence
                            ? `India ${c.india_presence}`
                            : null,
                          c.indian_city || null,
                          c.country || null,
                          c.focus || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    ) : null}
                    {c.career_url || (c.locations && c.locations.length) || c.opening_count ? (
                      <div className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
                        {c.career_url ? (
                          <a
                            href={c.career_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Career page
                          </a>
                        ) : null}
                        {c.locations?.length
                          ? `${c.career_url ? " · " : ""}${c.locations
                              .map((l) => l.location || l.location_slug)
                              .join(", ")}`
                          : null}
                        {c.opening_count
                          ? `${c.career_url || c.locations?.length ? " · " : ""}${c.opening_count} openings${
                              c.eligible_count ? ` · ${c.eligible_count} eligible` : ""
                            }`
                          : null}
                        {c.opening_count ? (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className="ghost"
                              style={{ padding: "0 0.35rem", fontSize: "inherit" }}
                              onClick={() => toggleEligibleOpenings(c.id)}
                            >
                              {expandedCareerId === c.id ? "Hide openings" : "Show eligible"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {expandedCareerId === c.id ? (
                      <div className="muted" style={{ marginTop: 6, fontSize: "0.85rem" }}>
                        {eligibleLoading ? (
                          <span>Loading eligible openings…</span>
                        ) : eligibleOpenings.length ? (
                          <>
                            <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem" }}>
                              {eligibleOpenings.map((o) => (
                                <li key={o.id}>
                                  {o.url ? (
                                    <a href={o.url} target="_blank" rel="noreferrer">
                                      {o.title}
                                    </a>
                                  ) : (
                                    o.title
                                  )}
                                  {o.assessment?.score != null
                                    ? ` · score ${Number(o.assessment.score).toFixed(2)}`
                                    : ""}
                                </li>
                              ))}
                            </ul>
                            {eligibleTotal > 0 ? (
                              <Pagination
                                page={eligiblePage}
                                pages={eligiblePages}
                                total={eligibleTotal}
                                pageSize={eligiblePageSize}
                                disabled={eligibleLoading}
                                onPageChange={setEligiblePage}
                                onPageSizeChange={(size) => {
                                  setEligiblePageSize(size);
                                  setEligiblePage(1);
                                }}
                              />
                            ) : null}
                          </>
                        ) : (
                          <span>No eligible openings yet.</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <span className="muted">
                    {c.people_count || 0} people · {c.email_count || 0} emails
                    {c.new_count != null
                      ? ` · ${c.new_count} new / ${c.sent_count || 0} sent`
                      : ""}
                  </span>
                  <div className="row-actions">
                    {canWrite ? (
                      <>
                        <IconButton
                          icon={IconEdit}
                          label="Edit company"
                          onClick={() => openCompanyEdit(c)}
                          disabled={busy}
                        />
                        <IconButton
                          icon={IconTrash}
                          label="Delete company"
                          tone="danger"
                          onClick={() => askDeleteCompanies([c])}
                          disabled={busy}
                        />
                      </>
                    ) : (
                      <span className="muted">view only</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {companyTotal > 0 ? (
        <Pagination
          page={companyPage}
          pages={companyPages}
          total={companyTotal}
          pageSize={companyPageSize}
          disabled={busy}
          onPageChange={setCompanyPage}
          onPageSizeChange={(size) => {
            setCompanyPageSize(size);
            setCompanyPage(1);
          }}
        />
      ) : null}

      {canWrite && bulkCompanyOpen ? (
        <Modal
          title={`Change company / format · ${peopleSel.selected.size} people`}
          onClose={() => setBulkCompanyOpen(false)}
        >
          <p className="muted" style={{ marginTop: 0 }}>
            Assign the selected people to one company and set its email format.
          </p>
          <form className="form" onSubmit={saveBulkCompany}>
            <div className="full">
              <CompanyPicker
                companies={pickerCompanies}
                value={bulkForm.companyValue}
                newName={bulkForm.newName}
                domain={bulkForm.domain}
                emailFormat={bulkForm.emailFormat}
                requireDomain={false}
                onChange={onBulkCompanyChange}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              title="Apply company and email format to selected people"
            >
              {busy ? "Updating…" : "Apply to selected"}
            </button>
          </form>
        </Modal>
      ) : null}

      {canWrite && modalOpen ? (
        <Modal
          title={creating ? "Add person" : `Edit person #${editing.id}`}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        >
          <form className="form" onSubmit={savePerson}>
            <label className="full">
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <div className="full">
              <CompanyPicker
                companies={pickerCompanies}
                value={form.companyValue}
                newName={form.newName}
                domain={form.domain}
                emailFormat={form.emailFormat}
                requireDomain={false}
                onChange={onCompanyChange}
              />
            </div>
            <button type="submit" disabled={busy} title="Save person">
              Save
            </button>
          </form>
        </Modal>
      ) : null}

      {detail ? (
        <Modal
          title={`${detail.name} · ${detail.company}`}
          wide
          onClose={() => setDetail(null)}
        >
          <div className="row-between" style={{ marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>Emails</h3>
            {canWrite ? (
              <VariantsButton
                name={detail.name}
                domain={findCompany(detail.company)?.domain || ""}
                company={detail.company}
                personId={detail.id}
                busy={busy}
                setBusy={setBusy}
                setError={setError}
                onDone={() => {
                  openDetail(detail.id);
                  onChanged?.();
                }}
                label="Generate variants"
                iconOnly={false}
              />
            ) : null}
          </div>
          <ul className="list">
            {(detail.emails || []).map((em) => (
              <li key={em.id} className="item">
                <span className="mono">{em.email}</span>
                <span className="status">{em.status}</span>
                <span className="status">{em.validity || "UNKNOWN"}</span>
                {canWrite ? (
                  <IconButton
                    icon={IconTrash}
                    label="Delete email"
                    tone="danger"
                    onClick={() => askDeleteEmail(em)}
                    disabled={busy}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {canWrite ? (
          <form className="form compact" onSubmit={addEmail}>
            <label>
              New email
              <input
                value={emailForm.email}
                onChange={(e) =>
                  setEmailForm({ ...emailForm, email: e.target.value })
                }
                required
              />
            </label>
            <label>
              Status
              <select
                value={emailForm.status}
                onChange={(e) =>
                  setEmailForm({ ...emailForm, status: e.target.value })
                }
              >
                {EMAIL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Validity
              <select
                value={emailForm.validity}
                onChange={(e) =>
                  setEmailForm({ ...emailForm, validity: e.target.value })
                }
              >
                {EMAIL_VALIDITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy} title="Add email for this person">
              Add email
            </button>
          </form>
          ) : null}
        </Modal>
      ) : null}

      {canWrite && editingCompany ? (
        <Modal title="Edit company" onClose={() => setEditingCompany(null)}>
          <form className="form" onSubmit={saveCompany}>
            <label>
              Name
              <input
                value={companyForm.name}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, name: e.target.value })
                }
                required
              />
            </label>
            <label>
              Domain
              <input
                value={companyForm.domain}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, domain: e.target.value })
                }
                placeholder="mongodb.com"
              />
            </label>
            <label className="full">
              Email format
              <select
                value={companyForm.email_format}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, email_format: e.target.value })
                }
              >
                {[
                  "firstname.lastname",
                  "firstnamelastname",
                  "firstinitiallastname",
                  "firstname_lastname",
                  "firstname",
                ].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Career page URL
              <input
                value={companyForm.career_url}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, career_url: e.target.value })
                }
                placeholder="https://…"
              />
            </label>
            <label>
              Tier
              <select
                value={companyForm.tier}
                onChange={(e) => {
                  const tier = e.target.value;
                  const labels = taxonomy.tier_labels || DEFAULT_TIER_LABELS;
                  setCompanyForm({
                    ...companyForm,
                    tier,
                    tier_label: tier ? labels[tier] || companyForm.tier_label : "",
                  });
                }}
              >
                <option value="">—</option>
                {(taxonomy.tiers || DEFAULT_TIERS).map((t) => (
                  <option key={t} value={t}>
                    {t}
                    {taxonomy.tier_labels?.[t] ? ` · ${taxonomy.tier_labels[t]}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tier label
              <input
                value={companyForm.tier_label}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, tier_label: e.target.value })
                }
                placeholder="₹15–22L fresher CTC"
              />
            </label>
            <label>
              Country
              <input
                value={companyForm.country}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, country: e.target.value })
                }
                placeholder="India"
              />
            </label>
            <label>
              India presence
              <select
                value={companyForm.india_presence}
                onChange={(e) =>
                  setCompanyForm({
                    ...companyForm,
                    india_presence: e.target.value,
                  })
                }
              >
                <option value="">—</option>
                {(taxonomy.india_presence || ["YES", "NO", "UNKNOWN"]).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Indian city
              <input
                list="indian-city-suggestions"
                value={companyForm.indian_city}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, indian_city: e.target.value })
                }
                placeholder="Gurugram / Noida / Bangalore / N/A"
              />
            </label>
            <datalist id="indian-city-suggestions">
              {(
                taxonomy.indian_city_suggestions || [
                  "N/A",
                  "Gurugram",
                  "Gurgaon",
                  "Noida",
                  "Greater Noida",
                  "New Delhi",
                  "Delhi",
                  "Bengaluru",
                  "Bangalore",
                ]
              ).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <label className="full">
              Focus
              <input
                value={companyForm.focus}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, focus: e.target.value })
                }
                placeholder="SaaS / Fintech / …"
              />
            </label>
            <label className="full">
              Website
              <input
                value={companyForm.website}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, website: e.target.value })
                }
                placeholder="https://…"
              />
            </label>
            <label className="full">
              Notes
              <textarea
                value={companyForm.notes}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, notes: e.target.value })
                }
                rows={3}
              />
            </label>
            {editingCompany?.builtin_id ? (
              <p className="muted full">
                Built In id: <code>{editingCompany.builtin_id}</code>
              </p>
            ) : null}
            {editingCompany?.tier_source || editingCompany?.tier_confidence != null ? (
              <p className="muted full">
                Source: {editingCompany.tier_source || "—"}
                {editingCompany.tier_confidence != null
                  ? ` · confidence ${editingCompany.tier_confidence}`
                  : ""}
              </p>
            ) : null}
            <button type="submit" disabled={busy} title="Save company changes">
              Save company
            </button>
          </form>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Are you sure?"
        message={pendingDelete?.message || ""}
        confirmLabel="Yes, delete"
        busyLabel="Deleting…"
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
