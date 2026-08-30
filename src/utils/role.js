// Normalize a role string: trim whitespace + lowercase, with a safe fallback.
export const cleanRole = (role) => String(role || '').trim().toLowerCase()
