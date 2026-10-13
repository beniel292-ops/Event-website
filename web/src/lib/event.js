function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// '2026-07-29' -> '29th July 2026'
export function formatEventDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' });
  return `${ordinal(d)} ${month} ${y}`;
}

// True once the event day is over (India time).
export function isEventOver(isoDate) {
  if (!isoDate) return false;
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return isoDate < todayIST;
}
