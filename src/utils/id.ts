let counter = 0;

export function generateId(prefix = ""): string {
  counter++;
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
  return `${prefix}${Date.now()}-${counter}-${rand}`;
}
