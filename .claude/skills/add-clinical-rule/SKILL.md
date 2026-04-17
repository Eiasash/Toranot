---
name: add-clinical-rule
description: Add a clinical rule to Toranot's src/engine/rules.ts with the Golden Rule invariant, unique group check, comfort-care suppression audit, and automatic test scaffolding. Use when user says "add a rule", "new rule", "add clinical rule", "new trigger in rules.ts", or when proposing a new auto-generated task pattern for the rules engine. DO NOT use for drug interactions (those live in drugSafety.ts).
---

# Add Clinical Rule — Toranot Rules Engine

Guards `src/engine/rules.ts` against the most common screw-ups:
1. Auto-generating tasks a nurse/morning team should handle (violates Golden Rule).
2. Duplicate `group` keys (breaks dedup).
3. Missing test + `RULES.length` assertion update.
4. Not checking comfort-care suppression where clinically appropriate.
5. Trigger field too broad (scanning planNotes/tomorrowNotes — forbidden).

## Workflow (strict order)

### 1 — Validate against the Golden Rule
Before writing any code, state the proposed rule in plain English and answer:

> "Is this something the on-call doctor MUST act on during this shift?"

If the answer is "nice to have", "for morning team", "standing order", "nursing task",
"textbook ladder", or "social work referral" → **STOP**. This does not belong in rules.ts.
Consider `QuickReference.tsx` or `OnCallProtocols.tsx` instead.

### 2 — Check for group collision
```
grep -n "group:" src/engine/rules.ts | awk -F'"' '{print $2}' | sort | uniq -d
```
Then verify the proposed new `group` is not in the existing list:
```
grep -c "group: \"<proposed_group>\"" src/engine/rules.ts
# Expect 0
```

### 3 — Choose the narrowest trigger field
- `"diagnosis"` — only when the rule truly depends on admission Dx.
- `"tasks"` — when the trigger is a status/flag/existing task.
- `"all"` — last resort. Justify in the rule comment.

**Never** expect planNotes or tomorrowNotes to match — they are excluded by the engine.

### 4 — Scaffold the rule

```typescript
// Rationale: <one-line clinical justification with reference>
{
  trigger: /regex/i,
  source: "Hebrew label shown to user",
  group: "unique_snake_case",
  triggerField: "diagnosis", // narrowest viable
  tasks: [
    { text: "...", urgency: "stat"|"urgent"|"routine"|"morning"|"extra",
      category: "labs"|"meds"|"procedure"|"consult"|"other" },
  ],
},
```

### 5 — Confirm comfort-care suppression decision
If the rule fires aggressive workup (labs, imaging, consults), verify:
- `COMFORT_CARE_PATTERN` suppression already applies at the engine level, OR
- The rule explicitly opts in/out with justification in a comment above the rule.

DNR/DNI alone is NOT comfort care — do not treat it as suppression.

### 6 — Write the regression test

Add to `src/__tests__/rules.test.ts`:

```typescript
it("fires <rule name> on matching <trigger>", () => {
  const patient = makePatient({ /* minimal fixture that hits the trigger */ });
  const tasks = generateTasks(patient);
  expect(tasks.some(t => t.generatedFrom === "<source>")).toBe(true);
});

it("does NOT fire <rule name> on comfort-care patient", () => {
  const patient = makePatient({ diagnosis: "<trigger>", flags: ["comfort"] });
  const tasks = generateTasks(patient);
  expect(tasks.some(t => t.generatedFrom === "<source>")).toBe(false);
});
```

### 7 — Bump the RULES.length assertion
In `rules.test.ts`:
```typescript
expect(RULES.length).toBe(<N+1>);
```
Also check `rules.cross.test.ts` for counts or scenarios affected.

### 8 — Run the mandatory workflow
Invoke the `toranot-ship` skill OR manually:
```
npx tsc --noEmit && npx vitest run && npx vite build
```

## Checklist (print this before committing)

- [ ] Rule passes the Golden Rule test (doctor-actionable this shift)
- [ ] `group` is unique across all RULES
- [ ] `triggerField` is the narrowest viable option
- [ ] Rationale comment cites a source (Hazzard's / Harrison's / SZMC DAG)
- [ ] Comfort-care suppression behavior is intentional + documented
- [ ] Regression test added (positive case)
- [ ] Negative test added (no fire on non-matching or comfort-care)
- [ ] `expect(RULES.length).toBe(N+1)` bumped
- [ ] `rules.cross.test.ts` updated if relevant
- [ ] tsc + vitest + vite build all green

## Anti-examples (do NOT ship these)

```typescript
// ❌ Nursing standing order — belongs to nursing team
{ trigger: /דלקת עור/, tasks: [{ text: "להפוך מדי שעתיים", ... }] }

// ❌ Morning team discharge planning
{ trigger: /שחרור/, tasks: [{ text: "תאם עם סוציאלית", ... }] }

// ❌ Textbook ladder as separate tasks
{ trigger: /דליריום/, tasks: [
  { text: "בדוק קלציום" },
  { text: "בדוק TSH" },
  { text: "בדוק B12" },
  { text: "בדוק פולאט" },
  { text: "בדוק אמוניה" },
]}
// ✅ Consolidate:
{ trigger: /דליריום/, tasks: [
  { text: "workup דליריום: Ca|TSH|B12|Folate|NH3", urgency: "urgent" }
]}
```
