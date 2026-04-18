---
description: Pair-program a new clinical rule in src/engine/rules.ts with the add-clinical-rule skill
argument-hint: <trigger-phrase>  (e.g. "PPI + clopidogrel")
---

Start a pair-programming loop to add a rule.

1. Invoke the `add-clinical-rule` skill — it owns the schema, golden-rule invariant, and test scaffolding. Pass `$ARGUMENTS` as the trigger.
2. While the skill proposes the rule, you:
   - Check `src/engine/rules.ts` for a rule with an overlapping group — duplicate groups are a bug.
   - Check `src/engine/drugSafety.ts` — if the trigger is really a drug-drug interaction, the rule belongs there instead. STOP and tell the user.
   - Confirm the proposed test covers (a) fire, (b) no-fire when comfort-care is set, (c) no-fire when the drug is on an exception list.
3. After the rule is written, update `.cowork/<slug>.md` → **Done** with the rule id, and **Tests** with the new suite name.
4. Do NOT commit — let the user read the diff first.
