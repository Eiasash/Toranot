---
description: Generate a Hebrew SBAR handoff for a SZMC clinical note (rotation shift handoff, not rules-engine work)
argument-hint: <note-id or patient-slug>
---

Produce a SBAR-formatted handoff in **Hebrew** from the note data. Do NOT invent patient data — read from the app's stored note (src/data/notes/, Supabase row, or whatever the current page is showing).

Structure (labels Hebrew-RTL, body Hebrew):

- **מצב (Situation)** — one sentence: age, sex, ward, primary reason.
- **רקע (Background)** — comorbidities + active meds, STOPP/Beers flags if the rules engine fired any (use the actual fired rule id).
- **הערכה (Assessment)** — current problem list with priority, any pending workup.
- **המלצה (Recommendation)** — specific actions for the next shift, owners, time horizon.

Follow Israeli MoH / Clalit conventions from the hebrew-medical-glossary skill. Do not translate drug names; keep generic English with Hebrew trade name in parens if the note has one.
