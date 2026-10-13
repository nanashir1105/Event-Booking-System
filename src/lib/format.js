// Change this to match your market.
const CURRENCY = 'USD';

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const fmtPrice = (n) =>
  Number(n) === 0
    ? 'Free'
    : new Intl.NumberFormat([], { style: 'currency', currency: CURRENCY }).format(n);

// <input type="datetime-local"> value -> ISO string with timezone
export const toIso = (local) => new Date(local).toISOString();
