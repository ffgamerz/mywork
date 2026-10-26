// Date-only helpers for payment paid_date (YYYY-MM-DD in the user's local day).
export const localToday = (now = new Date()) => {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 10)
}

export const isRealDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v

// Returns an error message, or '' when the paid date is acceptable.
export const paidDateError = (v, today = localToday()) => {
  if (!v) return 'Paid date is required.'
  if (!isRealDate(v)) return 'Paid date must be a valid date.'
  if (v > today) return 'Paid date cannot be in the future.'
  return ''
}
