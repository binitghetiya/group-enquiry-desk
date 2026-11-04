const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Digit runs with common separators; only redacted when they contain 7+ digits (phone, ID, card).
const NUMBER_RUN = /\+?\d[\d\s().-]{5,}\d/g;

/**
 * Strips obvious personal data before text leaves the server for an LLM provider.
 * This is a safety net, not the primary control: the helper only accepts page copy, and enquiry
 * records are never passed to the provider at all.
 */
export function redactPersonalData(text: string): { text: string; redactions: number } {
  let redactions = 0;
  const out = text
    .replace(EMAIL, () => {
      redactions++;
      return '[redacted email]';
    })
    .replace(NUMBER_RUN, (match) => {
      if ((match.match(/\d/g) ?? []).length < 7) return match;
      redactions++;
      return '[redacted number]';
    });
  return { text: out, redactions };
}
