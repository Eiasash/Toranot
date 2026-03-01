function normalize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Strict key: section + room + name. Keeps patients separate per section. */
export function buildPatientKey(
  section: string,
  room: string | null,
  name: string | null,
): string {
  return `${normalize(section)}|${normalize(room)}|${normalize(name)}`;
}

/** Loose key: room + name only. Detects transfers between sections. */
export function buildPatientLooseKey(
  room: string | null,
  name: string | null,
): string {
  return `${normalize(room)}|${normalize(name)}`;
}

/**
 * Stable-ish identity key: name + age.
 *
 * Used to keep a patient "the same" even if room/bed changes overnight.
 * Collisions are possible (same name+age), so matching must be conservative.
 */
export function buildPatientStableKey(
  name: string | null,
  age: number | null | undefined,
): string {
  return `${normalize(name)}|${age ?? ""}`;
}
