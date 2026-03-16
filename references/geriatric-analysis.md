# Geriatric Analysis Framework

Auto-run for all geriatric ward notes (גריאטריה -מח, גריאטריה מוגבר).
Skip if user says "בלי ניתוח" or "just the note".

## Output Format

Show in chat AFTER the note (NOT in EMR output or HTML):

```
📋 ניתוח גריאטרי — [Patient Name]
🔴 [Critical flags — immediate action required]
🟠 [Warning flags — address this admission]
🔵 [Missing workup / assessment]
💡 [Teaching points]
```

Max 10-12 flags total.

---

## Analysis Categories

### 1. Beers Criteria 2023 (AGS)

Flag any drug on the Beers list. Reference the Toranot engine (`src/engine/drugSafety.ts`) Beers rules for the authoritative pattern list.

**Always flag:**
- Benzodiazepines (any, ≥65) — 🔴
- Zolpidem/Zopiclone — 🔴
- First-gen antihistamines (diphenhydramine, hydroxyzine, promethazine) — 🔴
- TCAs (amitriptyline, nortriptyline, doxepin) — 🔴
- Tramadol ≥75 — 🔴
- Long-acting sulfonylureas (glibenclamide) — 🟠
- NSAIDs ≥75 — 🟠
- PPI >8 weeks without clear indication — 🟠
- Metoclopramide chronic — 🟠
- Digoxin >0.125mg/d — 🟠

**Format:**
```
🔴 Beers: Lorazepam — נפילות, דליריום, שברים. שקול הפסקה או Melatonin/Mirtazapine
🟠 Beers: Omeprazole >8 שבועות — שקול step-down / הפסקה אם אין הנחייה ברורה
```

### 2. STOPP/START Criteria v3

**STOPP** (potentially inappropriate to START):
- PPI without indication beyond 8 weeks
- Aspirin without cardiovascular indication
- Benzodiazepine >4 weeks
- Duplicate drugs in same class
- NSAID + anticoagulant without PPI
- Alpha-blocker in patient with orthostatic hypotension

**START** (should be started if absent):
- Statin in cardiovascular disease (unless palliative/frail)
- ACEi/ARB in CHF with reduced EF
- Beta-blocker post-MI
- Anticoagulation in AF (CHA2DS2-VASc ≥2)
- Calcium + Vitamin D in osteoporosis
- Bisphosphonate after fragility fracture
- Influenza/pneumococcal vaccination

**Format:**
```
🟠 STOPP: Aspirin ללא הנחייה קרדיווסקולרית ברורה — שקול הפסקה
🔵 START: חסר סטטין — IHD ברקע, ללא סטטין ברשימת התרופות
```

### 3. Drug Interactions

Reference the Toranot engine (`src/engine/drugSafety.ts`) interaction pairs.

**Priority interactions for geriatrics:**
- QT prolongation combos (amiodarone + FQ/haloperidol/ondansetron)
- Bleeding risk (anticoagulant + NSAID/aspirin without PPI)
- Hyperkalemia (ACEi/ARB + K-sparing + KCl)
- Serotonin syndrome (SSRI/SNRI + tramadol/linezolid)
- Respiratory depression (benzo + opioid)
- Triple Whammy (NSAID + ACEi/ARB + diuretic → AKI)
- TMP-SMX + spironolactone → severe hyperkalemia

**Format:**
```
🔴 אינטראקציה: Amiodarone + Ciprofloxacin — QT prolongation, סיכון Torsades. שקול Ceftriaxone
```

### 4. Anticholinergic Burden

Count anticholinergic load using a simplified scoring:
- High burden (score 3): Amitriptyline, Oxybutynin, Chlorpromazine, Diphenhydramine
- Moderate burden (score 2): Quetiapine, Paroxetine, Tolterodine, Hydroxyzine
- Low burden (score 1): Ranitidine, Cetirizine, Metoclopramide, Prednisone

**Flag when total score ≥3:**
```
🔴 נטל אנטיכולינרגי: ≥3 (Oxybutynin + Amitriptyline) — סיכון דליריום, אצירת שתן, עצירות. הפסק לפחות אחד
```

### 5. Renal Dosing

Check all medications against CrCl (use conservative estimate per Toranot engine logic).

**Flag when dose adjustment needed:**
```
🔴 מינון כלייתי: Enoxaparin — CrCl ~25 (conservative). הפחת ל-1mg/kg x1/d
🟠 מינון כלייתי: Gabapentin — CrCl ~35. max 300mg x2/d
```

### 6. Nutrition / Weight

**Flag:**
- BMI <20 or weight loss >5% in 3 months — 🟠
- Albumin <3.0 — 🟠
- No dietitian referral noted — 🔵
- Dysphagia without SLP assessment — 🔴

```
🟠 תזונה: BMI נמוך / קכקטי — שקול הפנייה לדיאטנית, בדוק אלבומין ופרה-אלבומין
🔴 בליעה: קשיי בליעה ללא הערכת קלינאית תקשורת — הזמן הערכה דחוף
```

### 7. Falls Risk

**Flag:**
- ≥2 falls in past year — 🟠
- Orthostatic hypotension on exam — 🟠
- Psychotropic medications (benzos, antipsychotics, opioids) — 🟠
- No PT/OT referral for mobility decline — 🔵
- Missing vitamin D assessment — 🔵

```
🟠 נפילות: בנזודיאזפין + הליכון — סיכון מוגבר. שקול הפסקת Lorazepam
🔵 חסר: הפנייה לפיזיותרפיה — ירידה תפקודית מתועדת
```

### 8. Delirium

**Flag:**
- CAM/4AT not documented — 🔵
- Anticholinergic drugs in delirious patient — 🔴
- Physical restraints without documented reasoning — 🔴
- Missing sleep-wake cycle interventions — 🔵
- Benzodiazepine in non-alcohol/non-seizure delirium — 🔴

```
🔴 דליריום: Lorazepam בדליריום לא-אלכוהולי — מחמיר דליריום. שקול Quetiapine 12.5-25mg
🔵 חסר: הערכת דליריום (CAM/4AT) לא מתועדת
```

### 9. VTE Prophylaxis

**Flag:**
- Padua ≥4 without prophylaxis — 🔴
- Padua not documented — 🔵
- Enoxaparin without renal adjustment — 🔴
- Active bleeding on anticoagulation — 🔴

```
🔴 VTE: Padua 5, ללא מניעה — התחל Clexane 40mg SC x1/d (בדוק CrCl)
🔵 חסר: Padua score לא מתועד
```

### 10. Code Status / Goals of Care

**Flag:**
- Frail/advanced dementia patient without documented GOC discussion — 🟠
- DNR/DNI documented but no reasoning — 🔵
- Comfort care without symptom management plan — 🟠
- Advanced directive status unknown — 🔵

```
🟠 מטרות טיפול: מטופל/ת עם דמנציה מתקדמת, סיעודי/ת — שקול דיון GOC עם המשפחה
🔵 חסר: סטטוס החייאה לא מתועד
```

### 11. Missing Labs / Assessments

**Flag when not mentioned in the note:**
- TSH (if hypothyroid on treatment) — 🔵
- B12/Folate (if cognitive decline or anemia) — 🔵
- HbA1c (if diabetic) — 🔵
- 25-OH Vitamin D (if falls/fractures) — 🔵
- Albumin/Pre-albumin (if malnutrition suspected) — 🔵
- Blood cultures (if sepsis suspected but not sent) — 🔴

```
🔵 חסר: TSH — היפותירואידיזם ברקע תחת Euthyrox, ללא TSH באשפוז
🔵 חסר: B12 — ירידה קוגניטיבית ללא בירור B12
```

### 12. Discharge Planning (for discharge summaries)

**Flag:**
- Complex patient without social work referral — 🔵
- Functional decline without PT assessment documented — 🔵
- New medications without clear education plan — 🟠
- No follow-up appointment scheduled — 🟠
- Anticoagulation without clear duration — 🔴

---

## Priority Order

1. 🔴 Critical drug interactions / safety
2. 🔴 Beers high-risk drugs
3. 🔴 Renal dosing errors
4. 🟠 STOPP violations
5. 🟠 Falls / delirium risk
6. 🟠 Goals-of-care gaps
7. 🔵 Missing assessments / labs
8. 🔵 START recommendations
9. 💡 Teaching points
