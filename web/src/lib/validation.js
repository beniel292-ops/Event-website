// Shared by the browser form AND the server (/api/*). Keep in sync with the
// CHECK constraints in supabase/schema.sql.

export const VIT_EMAIL_REGEX = /^[a-z]+(\.[a-z]+)+(20\d{2})@vitstudent\.ac\.in$/i;
export const REG_NO_REGEX = /^\d{2}[A-Z]{3}\d{4}$/i;
export const NAME_REGEX = /^[\p{L}][\p{L} .'-]*$/u;

const MIN_YEAR = 2015;

export function normalizeRegistration({ name = '', email = '', reg_no = '' } = {}) {
  return {
    name: String(name).trim().replace(/\s+/g, ' '),
    email: String(email).trim().toLowerCase(),
    reg_no: String(reg_no).trim().toUpperCase(),
  };
}

export function validateVitEmail(email) {
  const clean = String(email || '').trim();
  if (!clean) return 'Email is required';
  const match = clean.match(VIT_EMAIL_REGEX);
  if (!match) return 'Must be your VIT student email (e.g. snake.babu2025@vitstudent.ac.in)';
  const year = Number(match[2]);
  if (year < MIN_YEAR || year > new Date().getFullYear() + 1) {
    return 'The year in this email does not look right';
  }
  return null;
}

export function validateRegNo(regNo) {
  const clean = String(regNo || '').trim();
  if (!clean) return 'Registration number is required';
  if (!REG_NO_REGEX.test(clean)) return 'Format must be like 25BCE1234';
  return null;
}

export function validateName(name) {
  const clean = String(name || '').trim();
  if (clean.length < 2) return 'Full name must be at least 2 characters';
  if (clean.length > 100) return 'Full name must be under 100 characters';
  if (!NAME_REGEX.test(clean)) return "Use letters, spaces, dots, hyphens or apostrophes only";
  return null;
}

// Returns null when valid, otherwise { field: message }.
export function validateRegistration(data) {
  const errors = {
    name: validateName(data.name),
    email: validateVitEmail(data.email),
    reg_no: validateRegNo(data.reg_no),
  };
  return Object.values(errors).some(Boolean) ? errors : null;
}
