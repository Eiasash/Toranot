/**
 * renderAndSanitize — convert lightweight markdown produced by AI providers
 * (Claude / Gemini) into safe HTML for display in the AI clinical-reasoning panel.
 *
 * SAFETY ORDER IS CRITICAL:
 *   text → markdown regex transforms → DOMPurify.sanitize → HTML out
 *
 * Sanitizing BEFORE markdown rendering is dangerous: regex replacements would
 * re-introduce unsanitized HTML into the output. Always sanitize last.
 *
 * Allowed tags are deliberately a small whitelist; allowed attrs are limited
 * to `class` so AI cannot smuggle event handlers, styles, or URLs.
 *
 * Extracted from AIClinicalReasoning.tsx so it can be unit-tested in isolation
 * (XSS payload variants, header rendering, list rendering).
 */
import DOMPurifyImport from "dompurify";

// DOMPurify ships two shapes depending on env:
//   - Browser bundle (Vite production):  default export already has .sanitize()
//   - Node / jsdom (vitest):             default export is a factory that takes a window
// Normalising once at module load keeps callers identical in both environments.
function getPurifier(): { sanitize: (html: string, opts?: unknown) => string } {
  const candidate = DOMPurifyImport as unknown as
    | { sanitize?: (html: string, opts?: unknown) => string }
    | ((win: unknown) => { sanitize: (html: string, opts?: unknown) => string });
  if (typeof candidate === "function") {
    // Factory form — bind to the current window (jsdom or browser).
    return candidate(typeof window !== "undefined" ? window : globalThis);
  }
  return candidate as { sanitize: (html: string, opts?: unknown) => string };
}

const DOMPurify = getPurifier();

export function renderAndSanitize(text: string): string {
  const html = text
    // Strip leading artifact characters (Gemini sometimes starts with lone ., ,, * etc)
    .replace(/^[.,;:\s*]+/, "")
    // Headers (## and ###)
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1 text-slate-800 dark:text-slate-200">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-4 mb-1.5 text-slate-800 dark:text-slate-200">$1</h2>')
    // Bold (must run before bullet/italic so ** is consumed first)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>')
    // Italic — only single * surrounded by non-space (avoids eating bullet asterisks)
    .replace(/(?<![\s*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\s*])/g, '<em>$1</em>')
    // Bullet lists — handle *, •, ·, - as bullet markers
    .replace(/^[*•·\-]\s+(.+)$/gm, '<li class="mr-4 mb-0.5">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="list-disc list-inside my-1.5 text-xs space-y-0.5">$1</ul>')
    // Line breaks (double newline = paragraph)
    .replace(/\n{2,}/g, '</p><p class="mb-2">')
    // Single newlines in remaining text
    .replace(/\n/g, '<br/>')
    // Wrap in paragraph
    .replace(/^/, '<p class="mb-2">')
    .replace(/$/, '</p>');

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["h2", "h3", "strong", "em", "ul", "li", "p", "br"],
    ALLOWED_ATTR: ["class"],
  });
}
