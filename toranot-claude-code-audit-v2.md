# Toranot PWA — Claude Code Audit & Improvement Prompt

## Context

Toranot is a Hebrew RTL medical shift management PWA for geriatric ward on-call doctors at Shaare Zedek Medical Center. It runs as a mobile-first, offline-capable app built with React + TypeScript + Vite + Tailwind.

**Total codebase:** ~11K LOC across 40+ files
**Tests:** 260/260 passing (Vitest)
**Build:** 398KB JS (119KB gzip), 50KB CSS

---

## Architecture

### Core Components (by size)
| File | LOC | Purpose |
|------|-----|---------|
| `PatientCard.tsx` | 942 | Main patient display, all inline features |
| `QuickReference.tsx` | 801 | Clinical protocols modal (electrolytes, codes, ABx) |
| `Scanner.tsx` | 539 | OCR camera input via Tesseract.js |
| `PatientsContext.tsx` | 469 | Global state: reducer, localStorage, 30-shift history |
| `LabChart.tsx` | 379 | SVG lab trend charts with critical zones |
| `drugSafety.ts` | 365 | Drug interactions (35+) + renal dose warnings (15 drugs) |
| `App.tsx` | 346 | Main layout, modals, navigation |
| `TaskItem.tsx` | 319 | Individual task with swipe, due time, notes |
| `hints.ts` | 308 | Diagnosis-based clinical hints (FYI, not tasks) |
| `LabTracker.tsx` | 290 | Lab entry badges + inline quick entry |
| `parsePatientList.ts` | 269 | Hebrew NLP: OCR text → PatientEntry[] |
| `HandoffSheet.tsx` | 244 | IPASS sign-out export (WhatsApp/copy/share) |
| `TaskDashboard.tsx` | 229 | All-patient task view + section triage |
| `rules.ts` | 612 | 37 rules engine: status/tasks → generated tasks |

### Engine Layer
| File | Purpose |
|------|---------|
| `engine/rules.ts` | 37 clinical rules with triggers, urgency, categories |
| `engine/hints.ts` | Diagnosis-based FYI hints (not actionable) |
| `engine/mergeScan.ts` | Rescan merge: preserves tasks, notes, labs, photos |
| `engine/drugSafety.ts` | Drug interactions + CrCl-based renal dose warnings |
| `engine/labDelta.ts` | Baseline-to-latest lab change alerts |
| `engine/smartOCR.ts` | Scan diff detection (admissions/discharges/changes) |

### Types
```typescript
PatientEntry {
  id, section, room, name, age, diagnosis,
  flags[], status[], tomorrowNotes[],
  tasks: Task[], generatedTasks: Task[],
  notes?, labs?: LabEntry[],
  handoverNote?: string,        // NEW - persists across shifts
  photos?: PatientPhoto[],      // NEW - base64 compressed images
  order?, scannedAt, confidence
}

Task { id, text, urgency, category, source, done, doneTime, time, confidence, note, dueAt }
LabEntry { id, label, value, unit?, time }
PatientPhoto { id, dataUrl, caption?, time }
```

### State Management
- `PatientsContext.tsx`: useReducer + localStorage
- Actions: IMPORT_TEXT, TOGGLE_TASK, ADD_TASK, ADD_LAB, SET_HANDOVER_NOTE, ADD_PHOTO, REMOVE_PHOTO, ARCHIVE_SHIFT, RESTORE_SHIFT, etc.
- 30-shift history in localStorage
- Dark mode toggle persisted

---

## 🚨 CRITICAL DESIGN RULES (DO NOT VIOLATE)

1. **Diagnosis NEVER triggers rules.** `triggerField` default is `"tasks"`. Only `status[]` (task text) triggers rule-engine generated tasks. This prevents chronic diagnoses (DM, HTN) from spawning unwanted tasks every shift.

2. **Rooms NEVER assign sections.** `detectSectionFromRoom()` always returns `null`. Section comes ONLY from explicit Hebrew headers (צד א, צד ב, etc.) in the scanned text.

3. **Hebrew RTL throughout.** All text, labels, buttons, layout must support RTL. Use `dir="auto"` for mixed content.

4. **OLED dark mode.** True black backgrounds (`#000`, `#0a0a0a`). All components must have `dark:` variants. No hardcoded light colors.

5. **Mobile-first.** Touch targets ≥44px. Swipe gestures. No hover-dependent interactions.

6. **Offline-capable PWA.** No network-dependent features in core workflow.

7. **Tests must pass.** 260/260 before and after any changes.

---

## Phase 1: Bug Audit

### 1.1 State & Logic Bugs
- [ ] **Race conditions**: Check `PatientsContext.tsx` reducer for any async hazards (localStorage writes, batch updates)
- [ ] **Stale closures**: Audit all `useCallback`/`useMemo` dependency arrays in PatientCard (942 LOC, many hooks)
- [ ] **useState initializer**: `HandoverNoteInline` inside PatientCard uses `useState(patient.handoverNote ?? "")` — this won't update if patient prop changes. Need key-based reset or useEffect sync.
- [ ] **Photo memory pressure**: `PhotoAttachments` stores base64 in localStorage. Check for quota exceeded errors. Add try/catch around localStorage writes.
- [ ] **Task reminder cleanup**: `taskReminders.ts` uses `setTimeout` but timers persist across HMR. Need cleanup on unmount.
- [ ] **Drug pattern false positives**: `drugSafety.ts` uses broad regex. "monitor" in task text could match drug names. Audit all patterns for over-matching.

### 1.2 localStorage
- [ ] Quota handling when photos are stored (base64 images + 30 shift history = potential overflow)
- [ ] Parse failure recovery (corrupted JSON)
- [ ] Migration path if PatientEntry shape changes (new fields: handoverNote, photos)
- [ ] Test what happens at 5MB localStorage limit with many photos

### 1.3 OCR Parser
- [ ] `parsePatientList.ts`: Test with real OCR output (misspellings, partial recognition)
- [ ] `smartOCR.ts`: `normalizeKey` by name only — what about common names? Need room+name composite key
- [ ] Section detection: Multiple patients with same name in different sections

### 1.4 Rules Engine
- [ ] Verify all 37 rules fire correctly with `triggerField: "tasks"` default
- [ ] Check for duplicate generated tasks on repeated rule application (pull-to-refresh)
- [ ] Rules with `triggerField: "all"` — none should exist (design rule)

### 1.5 New Feature Bugs
- [ ] **DrugSafetyAlerts**: `checkDrugInteractions` scans `status[]` — is "aspirin" in status typical? May miss drugs only in task text
- [ ] **Renal warnings**: `calculateCrCl` defaults weight=70kg, isFemale=false. This is a significant assumption for geriatric patients. Consider using actual patient data or showing the assumption.
- [ ] **LabDelta**: thresholds are absolute (e.g., Cr rise ≥0.5). For a patient with baseline Cr 3.0, a rise to 3.5 is less alarming than Cr 0.8→1.3. Consider relative thresholds.
- [ ] **SectionDashboard**: `onSelectSection` closes modal but doesn't navigate to the section. Should dispatch section change.
- [ ] **PhotoAttachments**: No limit on number of photos per patient. Each photo ~50-100KB compressed. Need a cap.
- [ ] **TaskReminders**: If user sets dueAt in the past, `scheduleTaskReminder` silently fails (delay < 0). Should show an immediate alert instead.

### 1.6 Dark Mode
- [ ] Scan ALL new components for missing `dark:` variants: DrugSafetyAlerts, SectionDashboard, PhotoAttachments, LabChart, HandoverNoteInline
- [ ] Check modal overlays, popups, tooltips
- [ ] SVG text in LabChart uses `fill="currentColor"` — verify it resolves correctly in dark mode

### 1.7 RTL / Bidi
- [ ] Drug names in alerts are English — verify they display correctly in RTL context
- [ ] Lab labels (K+, Na, Cr) are LTR — check alignment in RTL buttons
- [ ] Photo caption input direction

### 1.8 Accessibility
- [ ] All new buttons need `aria-label` (Hebrew)
- [ ] Drug safety alerts should be `role="alert"` for screen readers
- [ ] Photo viewer needs keyboard navigation (Escape to close)
- [ ] Section dashboard buttons need descriptive labels

### 1.9 Performance
- [ ] `checkDrugInteractions` runs on every render via useMemo — is the dependency correct?
- [ ] `calculateLabDeltas` iterates all labs on every render — consider memoization
- [ ] PatientCard is now 942 LOC with many useMemo/useState — consider splitting
- [ ] Photo compression runs synchronously on main thread — move to Web Worker?

---

## Phase 2: Feature Improvements

### P0 — Critical Integration Gaps

**2.1 Wire up SmartOCR scan diff**
- `smartOCR.ts` exists but is NOT integrated into the import flow
- After IMPORT_TEXT in the reducer, run `detectScanChanges(oldPatients, newPatients)` 
- Show a banner/toast: "🆕 3 חדשים | 🔄 2 שוחררו | ✏️ 1 עודכן"
- Allow user to dismiss or tap to see details

**2.2 Section navigation from dashboard**
- `SectionDashboard.onSelectSection` currently just closes the modal
- Should dispatch to change the active section tab before closing
- Need to pass a section setter or dispatch action

**2.3 CrCl display & patient weight**
- Add optional `weight` field to PatientEntry
- Show CrCl on the drug safety alert: "CrCl ~35 mL/min (estimated, weight 70kg)"
- Allow tapping to edit weight for accurate calculation

### P1 — Safety Improvements

**2.4 Drug pattern expansion**
- Add: Metoprolol, Amlodipine, Furosemide, Hydrochlorthiazide, Prednisone, Omeprazole (PPI + Clopidogrel interaction)
- Add anticholinergic burden scoring (common geriatric issue)
- Flag high-risk drug combos specific to falls risk

**2.5 Lab alert intelligence**
- Current lab delta uses absolute thresholds. Implement:
  - Rate of change (Cr rising 0.3/day vs 0.3 over 3 days)
  - Relative thresholds (50% rise in Cr = AKI by KDIGO)
  - Consecutive trend (3+ values in same direction)

**2.6 Notification reliability**
- Current taskReminders uses setTimeout (lost on page refresh)
- Implement Service Worker-based scheduling for true push notifications
- Add a "reminder set" indicator on tasks with dueAt
- Sound alert option (configurable)

### P2 — UX Polish

**2.7 Photo improvements**
- Add caption editing (tap photo → edit caption)
- Swipe gallery for multiple photos
- Include photo count in handoff export text: "📷 3 תמונות מצורפות"
- Consider linking photos to specific tasks

**2.8 Handover note templates**
- Quick-insert buttons: "ממתין ל-CT", "שיחה עם משפחה מחר", "אין לשחרר לפני...", "comfort measures"
- Auto-suggest based on flags (DNR → "GOC discussed")

**2.9 Dashboard enhancements**
- Add time-based view: "What's due in the next 2 hours?"
- Patient acuity heatmap (color by acuity score)
- Completion progress bar per section

**2.10 Export improvements**
- PDF export option for handoff (not just text)
- Include lab charts as inline images in PDF
- Structured JSON export with lab trends for EMR integration

### P3 — Code Quality

**2.11 Component splitting**
- PatientCard (942 LOC) should be split:
  - PatientCardHeader (name, room, section, edit)
  - PatientCardAlerts (drug safety, lab deltas, med flags)
  - PatientCardActions (buttons row, lab form, chart)
  - PatientCardTasks (task list, add task)
  - PatientCardFooter (notes, handover note, photos)

**2.12 Test coverage for new features**
- Add tests for `drugSafety.ts`: known interaction pairs, CrCl calculation, edge cases
- Add tests for `labDelta.ts`: threshold validation, direction detection
- Add tests for `smartOCR.ts`: name normalization, diff detection
- Add tests for `taskReminders.ts`: scheduling, cancellation, sync

**2.13 Error boundaries**
- Add React Error Boundary around PatientCard (single broken card shouldn't crash app)
- Add try/catch in photo compression
- Graceful degradation if Notification API unavailable

---

## Execution Instructions

1. **Read all relevant source files before making changes.** Especially: `PatientCard.tsx`, `PatientsContext.tsx`, `rules.ts`, `drugSafety.ts`, `labDelta.ts`.

2. **Run tests after every change:** `npm test` (must stay at 260+/260)

3. **Type check:** `npx tsc --noEmit` (must be clean)

4. **Build verify:** `npm run build` (must succeed)

5. **Commit in logical chunks:** One commit per phase/feature group. Clear commit messages.

6. **Priority order:** Phase 1 bugs → P0 integration → P1 safety → P2 UX → P3 code quality

7. **Never violate design rules** (section 🚨 above). If in doubt, don't change it.

---

## File Map (quick reference)

```
src/
├── App.tsx                          # Main layout + modals
├── context/
│   └── PatientsContext.tsx           # Global state reducer
├── components/
│   ├── PatientCard.tsx               # Main patient card (needs splitting)
│   ├── TaskItem.tsx                  # Single task with swipe
│   ├── LabTracker.tsx                # Lab badges + inline entry
│   ├── LabChart.tsx                  # SVG lab trend charts
│   ├── DrugSafetyAlerts.tsx          # Drug interactions + renal + lab deltas
│   ├── PhotoAttachments.tsx          # Camera capture + gallery
│   ├── SectionDashboard.tsx          # Triage overview
│   ├── HandoffSheet.tsx              # Sign-out export
│   ├── TaskDashboard.tsx             # All-patient task view
│   ├── QuickReference.tsx            # Clinical protocols
│   ├── Scanner.tsx                   # OCR camera
│   ├── MedFlags.tsx                  # Medication safety badges
│   ├── QuickScenario.tsx             # Emergency scenario tasks
│   ├── TaskTemplates.tsx             # Reusable task templates
│   ├── VoiceInput.tsx                # Hebrew speech-to-text
│   ├── UndoToast.tsx                 # Undo toast system
│   ├── ShiftTimer.tsx                # 24h/26h shift countdown
│   ├── PullToRefresh.tsx             # Pull-to-refresh gesture
│   ├── SectionTabs.tsx               # Section navigation tabs
│   ├── InputArea.tsx                 # Text input area
│   ├── PatientList.tsx               # Filtered patient list
│   ├── ShiftHistory.tsx              # 30-shift archive browser
│   └── GlobalSearch.tsx              # Cross-patient search
├── engine/
│   ├── rules.ts                      # 37 clinical rules
│   ├── hints.ts                      # Diagnosis-based hints
│   ├── mergeScan.ts                  # Rescan merge logic
│   ├── drugSafety.ts                 # Drug interactions + renal
│   ├── labDelta.ts                   # Lab change alerts
│   └── smartOCR.ts                   # Scan diff detection
├── parser/
│   └── parsePatientList.ts           # Hebrew OCR → PatientEntry[]
├── types/
│   ├── patient.ts                    # All type definitions
│   └── index.ts                      # Re-exports
├── utils/
│   ├── id.ts                         # ID generation
│   ├── haptics.ts                    # Vibration feedback
│   └── taskReminders.ts              # Notification scheduling
└── __tests__/
    ├── rules.test.ts                 # Rules engine tests
    ├── reducer.test.ts               # State reducer tests
    ├── parsePatientList.test.ts      # Parser tests
    ├── mergeScan.test.ts             # Merge logic tests
    ├── sectionDetection.test.ts      # Section header detection
    └── taskOrdering.test.ts          # Task sort order tests
```
