/** Lifecycle / send state */
export const EMAIL_STATUSES = ["NEW", "SENT", "SKIPPED"];

/** Address quality — UNKNOWN until send feedback */
export const EMAIL_VALIDITIES = ["UNKNOWN", "VALID", "INVALID"];

export const EMAIL_FORMATS = [
  "firstname.lastname",
  "firstnamelastname",
  "firstinitiallastname",
  "firstname_lastname",
  "firstname",
  "lastname",
  "firstname.l",
  "f.lastname",
  "firstnamel",
  "flastname",
  "lastname.firstname",
  "lastname_firstname",
  "firstname-lastname",
  "f_lastname",
  "firstname_l",
  "first2lastname",
  "lastnamefirstname",
  "lastnamefirstinitial",
  "lastname.f",
  "firstinitiallastinitial",
];

export const NEW_COMPANY = "__new__";

/** Normalize free text for consistent client-side comparisons. */
export function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
