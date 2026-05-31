/**
 * errorReporter PHI-scrub tests.
 *
 * errorReporter POSTs unhandled errors to Supabase (toranot_errors). In a
 * patient-data app the message/stack can echo PHI, so it must be scrubbed
 * BEFORE the POST. The integration test asserts that end-to-end through the
 * fetch body — message AND payload.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubEnv("VITE_SUPABASE_URL", "https://fake.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");

const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({} as Response));
vi.stubGlobal("fetch", fetchMock);

import { scrubPhi, cleanStack, scrubPayload, reportError } from "../utils/errorReporter";

describe("scrubPhi", () => {
  it("redacts digit runs >= 4, quoted echoes, and Hebrew; keeps short numbers + English", () => {
    expect(scrubPhi("id 312345678 phone 0501234567")).toBe("id [#] phone [#]");
    expect(scrubPhi("age 84 glucose 250")).toBe("age 84 glucose 250");
    expect(scrubPhi('near "chest pain"')).toBe('near "[redacted]"');
    expect(scrubPhi("המטופל כהן")).toContain("[he]");
    expect(scrubPhi("המטופל כהן")).not.toMatch(/[֐-׿]/);
    expect(scrubPhi("TypeError: x is not a function")).toBe("TypeError: x is not a function");
  });
});

describe("cleanStack", () => {
  it("drops the 'Error: <message>' header (which echoes raw PHI), keeps frames", () => {
    const stack = "Error: secret חולה 312345678\n    at foo (app.js:10:5)\n    at bar (app.js:20:3)";
    const out = cleanStack(stack);
    expect(out).not.toContain("312345678");
    expect(out).not.toMatch(/[֐-׿]/);
    expect(out).toContain("at foo (app.js:10:5)");
  });
});

describe("scrubPayload", () => {
  it("scrubs string values (stack header dropped) but keeps keys + numbers", () => {
    const out = scrubPayload({
      stack: "Error: x 99999\n    at f (a.js:1:2)",
      note: "חולה כהן",
      lineno: 42,
    });
    expect(out.lineno).toBe(42); // numbers untouched
    const json = JSON.stringify(out);
    expect(json).toContain("stack"); // keys NOT redacted
    expect(json).toContain("note");
    expect(json).not.toMatch(/[֐-׿]/); // values scrubbed
    expect(json).not.toContain("99999");
  });

  it("recurses into nested objects/arrays + redacts large numeric ids, keeping code locations (Codex P2)", () => {
    const out = scrubPayload({
      patient: { name: "כהן", id: 312345678 },
      ids: [987654321, 12],
      lineno: 4242, // code location — kept even though >= 1000
      count: 7, // small number — kept
    });
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/[֐-׿]/); // nested Hebrew scrubbed
    expect(json).not.toContain("312345678"); // nested numeric id redacted
    expect(json).not.toContain("987654321"); // array numeric id redacted
    expect(json).toContain("patient"); // keys preserved
    expect(out.lineno).toBe(4242);
    expect((out.patient as Record<string, unknown>).name).toBe("[he]");
    expect((out.ids as unknown[])[1]).toBe(12);
  });
});

describe("reportError → Supabase POST is PHI-scrubbed (message AND payload)", () => {
  it("a thrown Error with PHI leaks neither Hebrew nor the id into the POST body", () => {
    fetchMock.mockClear();
    const err = new Error("failed for חולה 312345678");
    reportError("window.onerror", err.message, {
      stack: err.stack,
      filename: "app.js",
      lineno: 42,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1]!;
    const body = JSON.parse(String(init.body)) as { message: string; payload: string };

    // message: scrubbed
    expect(body.message).not.toMatch(/[֐-׿]/);
    expect(body.message).not.toContain("312345678");

    // payload (serialized): scrubbed — incl. the stack header that echoes the message
    expect(body.payload).not.toMatch(/[֐-׿]/);
    expect(body.payload).not.toContain("312345678");
    // keys survive (we scrubbed fields, not the JSON string)
    expect(body.payload).toContain("stack");
    expect(body.payload).toContain("filename");
  });
});
