/**
 * JSX-text unicode-escape guard.
 *
 * Root cause (CloudAuthPanel mojibake, 2026-06-04): a `\uXXXX` escape written as
 * JSX *text children* (e.g. `<div>\u05de\u05e1...</div>`) is NOT decoded by JSX —
 * it renders the literal backslash-u text. Escapes only decode inside a string
 * literal (`{"\u05de..."}`) or an attribute value (`aria-label="\u05de..."`).
 *
 * The repo intentionally uses ASCII `\uXXXX` escapes for Hebrew (to dodge the
 * U+200F LRM str_replace trap), so this trap is easy to reintroduce and ships
 * silently green. This static scan fails the build if any component puts a
 * unicode escape in JSX text position.
 *
 * Fix when this fails: wrap the text in `{"..."}` or use the real glyph.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walkTsx(full, acc);
    } else if (name.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

// Shape 1: escape immediately after a tag close `>` (same line), e.g. `>\u05de...`
const AFTER_TAG = />\s*\\u[0-9a-fA-F]{4}/;
// Shape 2: a standalone JSX-text line that is only escapes (no quote = not a string literal)
const STANDALONE_LINE = /^\s*\\u[0-9a-fA-F]{4}[^"']*$/;

describe("JSX-text unicode-escape guard", () => {
  const files = walkTsx(join(process.cwd(), "src"));

  it("finds .tsx files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("has no unicode escapes in JSX text position (they render literally)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (AFTER_TAG.test(line) || STANDALONE_LINE.test(line)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders, `JSX-text escapes render literally — wrap in {"..."}:\n${offenders.join("\n")}`).toEqual([]);
  });
});
