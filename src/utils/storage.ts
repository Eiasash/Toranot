/**
 * Safe localStorage wrappers that log warnings instead of silently swallowing errors.
 */

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`Failed to read localStorage key "${key}":`, err);
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Failed to write localStorage key "${key}":`, err);
  }
}
