import { EMAIL_FORMATS, NEW_COMPANY } from "../constants";

/**
 * Company selector: pick an existing company or create a new one.
 * onChange receives { mode: 'existing'|'new'|'', company?, name, domain, email_format }
 */
export default function CompanyPicker({
  companies = [],
  value = "",
  newName = "",
  domain = "",
  emailFormat = "firstname.lastname",
  allowEmpty = false,
  emptyLabel = "Any company",
  requireDomain = true,
  showMeta = true,
  onChange,
}) {
  const selected = value || "";
  const isNew = selected === NEW_COMPANY;

  function pickExisting(name) {
    if (!name) {
      onChange?.({
        mode: "",
        name: "",
        domain: "",
        email_format: "firstname.lastname",
      });
      return;
    }
    if (name === NEW_COMPANY) {
      onChange?.({
        mode: "new",
        name: newName || "",
        domain: domain || "",
        email_format: emailFormat || "firstname.lastname",
      });
      return;
    }
    const company = companies.find((c) => c.name === name);
    onChange?.({
      mode: "existing",
      company,
      name: company?.name || name,
      domain: company?.domain || "",
      email_format: company?.email_format || "firstname.lastname",
    });
  }

  return (
    <div className="company-picker">
      <label>
        Company
        <select
          value={selected}
          onChange={(e) => pickExisting(e.target.value)}
          required={requireDomain && !allowEmpty}
        >
          {allowEmpty ? <option value="">{emptyLabel}</option> : null}
          {!allowEmpty && !selected ? (
            <option value="" disabled>
              Select a company…
            </option>
          ) : null}
          {companies.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
              {c.domain ? ` · ${c.domain}` : ""}
            </option>
          ))}
          <option value={NEW_COMPANY}>+ New company…</option>
        </select>
      </label>

      {isNew ? (
        <label>
          New company name
          <input
            value={newName}
            onChange={(e) =>
              onChange?.({
                mode: "new",
                name: e.target.value,
                domain,
                email_format: emailFormat,
              })
            }
            placeholder="MongoDB"
            required
          />
        </label>
      ) : null}

      {showMeta && (isNew || selected) ? (
        <>
          <label>
            Domain
            <input
              value={domain}
              onChange={(e) =>
                onChange?.({
                  mode: isNew ? "new" : "existing",
                  name: isNew ? newName : selected,
                  domain: e.target.value,
                  email_format: emailFormat,
                  company: companies.find((c) => c.name === selected),
                })
              }
              placeholder="mongodb.com"
              required={requireDomain && (isNew || !!selected)}
            />
          </label>
          <label>
            Email format
            <select
              value={emailFormat}
              onChange={(e) =>
                onChange?.({
                  mode: isNew ? "new" : "existing",
                  name: isNew ? newName : selected,
                  domain,
                  email_format: e.target.value,
                  company: companies.find((c) => c.name === selected),
                })
              }
            >
              {EMAIL_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}

export function resolveCompanySelection({
  value,
  newName,
  domain,
  emailFormat,
}) {
  if (value === NEW_COMPANY) {
    const name = (newName || "").trim();
    if (!name) throw new Error("Enter a name for the new company");
    return {
      name,
      domain: (domain || "").trim().toLowerCase(),
      email_format: emailFormat || "firstname.lastname",
      isNew: true,
    };
  }
  const name = (value || "").trim();
  if (!name) throw new Error("Select a company");
  return {
    name,
    domain: (domain || "").trim().toLowerCase(),
    email_format: emailFormat || "firstname.lastname",
    isNew: false,
  };
}
