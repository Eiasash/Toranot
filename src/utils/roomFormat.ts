/**
 * Shared room format patterns for SZMC geriatric ward.
 *
 * Used by manual input paths (VoiceInput, QuickCaptureSheet, AddAdmissionModal).
 * The main parser (parsePatientList.ts) uses its own token-based approach and
 * should NOT be changed — structured line-by-line parsing is fundamentally
 * different from free-text extraction.
 *
 * Two tiers:
 *  - STRONG formats are unambiguous room identifiers even without keywords.
 *  - PLAIN digits (70, 2088) require a keyword prefix (חדר, מיטה) in free text
 *    to avoid false positives against ages, vitals, and lab values.
 */

/**
 * Normalize a raw room match into consistent display format.
 * e.g. "ניטור 2" → "ניטור-2", "א 92" → "א-92"
 */
export function normalizeRoom(raw: string): string {
  return raw
    .trim()
    .replace(/(ניטור)\s+(\d)/, "$1-$2")
    .replace(/([א-ת])\s+(\d)/, "$1-$2")
    .replace(/(\d)\s+([א-ת])/, "$1-$2");
}
