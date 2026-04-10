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
 * Strong room formats that are unambiguously rooms in any context:
 *  - ניטור-1, ניטור 2       (monitor rooms)
 *  - א-92, ב-10             (Hebrew-letter prefix + hyphen + digits)
 *  - 2095-א                 (digits + hyphen + Hebrew letter suffix)
 *  - 49/2, 55/1             (room/bed legacy)
 */
export const STRONG_ROOM_RE =
  /ניטור\s*-?\s*(\d{1,2})|([א-ת])-(\d{1,4})|(\d{1,4})-([א-ת])|(\d{1,4})\/(\d{1,2})/;

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
