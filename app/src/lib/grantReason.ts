// Mirrors server/validate.js cleanGrantReason so the grant dialog explains a refusal before sending.

export const GRANT_REASON_MIN = 3;
export const GRANT_REASON_MAX = 200;

/** The reason as the server stores it: trimmed, inner whitespace collapsed. */
export function normalizeGrantReason(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** A user-facing error for an unusable reason, or null when it will be accepted. */
export function grantReasonError(text: string): string | null {
  const length = normalizeGrantReason(text).length;
  if (length < GRANT_REASON_MIN) return `Give a reason of at least ${GRANT_REASON_MIN} characters.`;
  if (length > GRANT_REASON_MAX) return `Keep the reason under ${GRANT_REASON_MAX + 1} characters.`;
  return null;
}
