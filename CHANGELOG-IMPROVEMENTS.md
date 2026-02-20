# Toranot — 10 Improvements (All-in-One Patch)

## How to Apply

```bash
cd Toranot
git apply toranot-improvements.patch
npm install
npm run build
```

For the Netlify proxy, set `ANTHROPIC_API_KEY` in Netlify env vars.

---

## Changes Summary

### 1. 🔒 Serverless OCR Proxy (Security)
**Files:** `netlify/functions/ocr-proxy.ts`, `netlify.toml`, `src/components/Scanner.tsx`

The API key was stored in localStorage and sent directly from the browser. Now:
- Netlify serverless function proxies OCR requests server-side
- API key stays in Netlify env vars, never reaches the browser
- **Graceful fallback**: if proxy unavailable (e.g., GitHub Pages), falls back to direct API key mode
- Set `ANTHROPIC_API_KEY` in Netlify dashboard → Environment Variables

### 2. 🔄 Service Worker with Proper Versioning
**File:** `public/sw.js`, `src/main.tsx`

- Bumped to v6 with `CACHE_VERSION` constant for easy version bumps
- Purges ALL old `toranot-*` caches on activate
- Posts `SW_UPDATED` message to clients on new version
- Main app shows a dismissable "new version" banner when update arrives
- Auto-checks for updates every 5 minutes
- Skips caching API/Netlify function calls

### 3. 💾 Expanded Data Backup & Import
**Files:** `src/context/PatientsContext.tsx`, `src/components/HandoffSheet.tsx`, `src/components/ShiftHistory.tsx`

- Shift history cap raised from **5 → 30**
- Handoff sheet now has **"Export JSON"** button (downloads full patient state)
- Shift History modal has **"Import JSON"** button (restores from backup file)
- New `IMPORT_BACKUP` reducer action for type-safe restore
- Cross-device transfer: export on phone A → import on phone B

### 4. ⏱ Task Countdown Timers with Notifications
**Files:** `src/components/TaskCountdown.tsx` (NEW), `src/components/TaskItem.tsx`

- New **TaskCountdown** component shows live MM:SS countdown when `dueAt` is set
- Color escalation: green → amber (<15min) → red (<5min) → pulsing red (overdue)
- **Browser notifications** when timer expires (with vibration on mobile)
- **Quick timer setter**: tap ⏱ button on any task to set 10min / 30min / 1h / 2h / 4h
- Notification permission requested on app load
- Cancel timer button to remove dueAt

### 5. 💬 WhatsApp Share for Handoff
**File:** `src/components/HandoffSheet.tsx`

- Dedicated **"WhatsApp"** button opens `wa.me` with the handoff text pre-filled
- **Native Share API** button (falls back to clipboard)
- **Copy** button with fallback text selection for older browsers
- Three clear buttons in the footer: Copy / WhatsApp / Share

### 6. 🔄 Cross-Device Data Transfer
**Files:** `src/components/HandoffSheet.tsx`, `src/components/ShiftHistory.tsx`

- JSON export/import acts as a simple cross-device sync mechanism
- No backend required — just send the JSON file via WhatsApp/email/AirDrop
- Import validates the JSON structure before applying

### 7. 📦 Reducer Architecture Improvement
**File:** `src/context/PatientsContext.tsx`

- Added `IMPORT_BACKUP` action type
- `normalizePatient` is now exported (used by import flow)
- Shift history with 30-item cap is more appropriate for audit trails

### 8. 📋 Drug Hazard Data Extracted to JSON
**File:** `src/data/drugHazards.json` (NEW)

- All drug lists (anticholinergic, QTc, nephrotoxic, fall risk) in standalone JSON
- Includes version and last-updated metadata
- Ready for future: department-specific overrides, crowd-sourced updates, API integration
- Note: MedFlags.tsx still uses the inline Sets for now — JSON is available for future refactor

### 9. ♿ Accessibility Improvements
**Files:** `src/components/SectionTabs.tsx`, `src/components/TaskItem.tsx`, `src/components/HandoffSheet.tsx`, `src/components/ShiftHistory.tsx`

- **`role="tablist"` / `role="tab"` / `aria-selected`** on section tabs
- **`aria-label`** on all icon-only buttons (⏱, ✎, ✕, 🗑️)
- **`role="dialog"` / `aria-label`** on all modals
- **`role="button"` / `aria-label`** on task items
- Dark mode classes added to SectionTabs (was missing)

### 10. 🌙 Dark Mode Consistency
**Files:** `src/components/SectionTabs.tsx`

- Section tabs now respect dark mode (was white-only before)
- Consistent `dark:` classes throughout

---

## New Files
| File | Purpose |
|------|---------|
| `netlify.toml` | Netlify config: functions dir, redirect `/api/*` to functions |
| `netlify/functions/ocr-proxy.ts` | Serverless OCR proxy for Anthropic API |
| `src/components/TaskCountdown.tsx` | Live countdown timer + notification component |
| `src/data/drugHazards.json` | Extracted drug hazard databases |

## Modified Files (9)
| File | Key Changes |
|------|-------------|
| `public/sw.js` | Versioned cache, update notification, skip API caching |
| `src/main.tsx` | Notification permission, SW update banner |
| `src/context/PatientsContext.tsx` | IMPORT_BACKUP action, 30-shift history |
| `src/components/Scanner.tsx` | Proxy-first OCR with fallback |
| `src/components/TaskItem.tsx` | Timer button + countdown display + onSetDue prop |
| `src/components/PatientCard.tsx` | Passes onSetDue to TaskItem |
| `src/components/HandoffSheet.tsx` | WhatsApp + native share + JSON export |
| `src/components/ShiftHistory.tsx` | JSON import + better UI |
| `src/components/SectionTabs.tsx` | ARIA roles + dark mode |

## Build Verification
- ✅ TypeScript: `tsc --noEmit` — zero errors
- ✅ Vite build: `vite build` — clean production build (303KB JS gzipped to 92KB)
