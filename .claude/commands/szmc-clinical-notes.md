---
description: >
  Generate professional SZMC (Shaare Zedek Medical Center) ward clinical notes in exact
  institutional format. PRIMARY USE: geriatric and internal medicine ward admission notes
  (קבלה רפואית) and ward discharge summaries (סיכום שחרור / סיכום אשפוז זמני).
  Also supports ED discharge (סיכום שחרור מיון) as secondary use.
  Trigger on: "כתוב לי קבלה", "כתוב סיכום שחרור", "סיכום אשפוז", "draft a note",
  "format this admission", or when user uploads תיק אשפוז / EMR data / patient data.
  For geriatric ward notes, auto-runs Beers/STOPP-START/drug interaction analysis.
  Always generates HTML export for RTL copy-paste into EMR.
  Do not attempt ad-hoc formatting — always use this skill.
allowed-tools: Read, Write, Bash, Grep, Glob, Agent
---

# SZMC Clinical Notes Skill

## NOTE TYPE PRIORITY

**Primary (ward):** קבלה רפואית גריאטריה / רפואה פנימית — full problem-based admission note with # headers, תפקוד checklist, geriatric analysis, Padua score, functional assessment.

**Primary (ward):** סיכום שחרור / סיכום אשפוז זמני — ward discharge with hospital course per # problem, discharge Rx, recommendations.

**Secondary (ED):** סיכום שחרור מיון — supported but not the focus. See discharge template for ED-specific rules if needed.


## OUTPUT FORMAT — CRITICAL

**Plain text only. No HTML, no tables, no markdown formatting in the note itself.**

User copies each section into SZMC EMR fields. The hospital system generates the printout.
- No bold, no markdown headers in output
- Labs always inline prose: `נתרן 136, אשלגן 4.8, CRP 18.4.`
- Medications: one per line in SZMC format (see `references/medication-formats.md`)
- Problem headers use `#` as plain text (ward notes only — not ED discharge)
- תוכנית is a bare verb list, no bullet symbols

## WORKFLOW

1. Collect patient data (see Input Requirements)
2. Determine note type — ward admission / ward discharge / ED discharge
3. Read `references/admission-template.md` (ward admissions) or `references/discharge-template.md` (discharge/ED)
4. Read `references/medication-formats.md` for drug formatting
5. Generate note as plain text in chat, labeled by section
6. Generate HTML export file (see HTML Export section)
7. For geriatric ward notes: read `references/geriatric-analysis.md`, run analysis, show flags in chat

## INPUT REQUIREMENTS

**Mandatory for ward admission:** Patient demographics, HMO, department, admission date, chief complaint, active/background diagnoses (English), רקע רפואי per system, current illness narrative, home medications, physical exam, labs (inline prose), auxiliary tests (ECG, CXR, CT, US, echo), discussion and plan per # problem.

**Additional for ward discharge:** Discharge date, hospital course per problem, trends in key labs, discharge medications, discharge recommendations.

**ED discharge:** Shorter — vitals, exam, מהלך ודיון (no # headers), תרופות באשפוז with timestamps, המלצות, המשך טיפול תרופתי.

If data is incomplete, ask targeted questions — don't invent clinical facts.

## NOTE TYPES

| Type | Hebrew | Format | Template |
|------|--------|--------|----------|
| Ward admission | קבלה רפואית | # problem headers, תפקוד MCQ, full geriatric analysis | `references/admission-template.md` |
| Ward discharge | סיכום שחרור | # problem-based hospital course, discharge Rx | `references/discharge-template.md` |
| Temporary ward discharge | סיכום אשפוז זמני | Same as ward discharge | `references/discharge-template.md` |


## KEY STRUCTURAL RULES

Full templates with examples are in the reference files. Summary of critical conventions:

**Sections order (admission):** כותרת → הצגת החולה → אבחנות פעילות → אבחנות ברקע → ניתוחים בעבר → תלונה עיקרית → **רקע רפואי** → מחלה נוכחית → רגישויות → תרופות בבית → הרגלים → תפקוד → בדיקה גופנית → בדיקות עזר → בדיקות מעבדה → דיון ותוכנית → חתימה

**Sections order (discharge/ED):** כותרת → תנועות → אבחנות פעילות → אבחנות ברקע → הצגת החולה → תלונה עיקרית → **רקע רפואי** → רגישויות → הרגלים → בדיקה גופנית → מהלך ודיון → תרופות באשפוז → תרופות בבית → פרוט ניתוחים → המלצות בשחרור → **המשך טיפול תרופתי** → תוצאות מעבדה → תרביות → חתימה

**Discussion structure:**
- Opening paragraph (patient, baseline, reason)
- `-בקבלתו/ה למיון:` (with leading dash) — vitals, exam, workup, treatment started
- `בקבלתו/ה למחלקתנו:` (no dash) — vitals, exam, key labs inline
- `המטופל/ת מציג/ה את הבעיות הבאות להתייחס:`
- `# PROBLEM` headers (3-6 sentences each) — **ward admission and ward discharge summaries only. NOT used in ED discharge notes.** Headers always in **Hebrew**. Preferred clinical category headers:
  `# זיהומית` / `# נשימתית` / `# המודינמית` / `# המטולוגית` / `# כלייתית` / `# נוירולוגית` / `# מטבולית` / `# תפקודית` / `# לבבית` / `# עורית` / `# סוציאלית` — or specific Hebrew diagnosis name as header
- `תוכנית:` bare verb list

**`רקע רפואי` section (MANDATORY — admission and discharge):**
Appears immediately after diagnosis lists. Per-system/per-disease narrative expansion of background conditions. Use organ-based headers with dash: `לבבי -`, `GI -`, `זיהומי -`, `ניתוחים/פעולות:`. Describe each condition briefly in 1-3 sentences — treatment, severity, relevant history. This section always appears in real SZMC documents and must never be omitted.

**Labs format note:** The physician **does** write labs in the note as **inline prose** in the `בדיקות מעבדה` section, plus imaging findings in `בדיקות עזר`. The tabular lab display with reference ranges seen in printouts is auto-generated by the SZMC EMR — that table is never written manually. Write all labs as flowing prose:

`כימיה: נתרן 136, אשלגן 3.6, קריאטינין 1.19, BUN 21, CRP 9.29, eGFR 59.`
`ספירה: לויקוציטים 21.9, ניוטרופילים 87.7%, המוגלובין 12.7, טסיות 289 (אלפים).`
`קואגולציה: INR 1.22, פיברינוגן 640.`
`גזים: PH 7.44, PCO2 39, HCO3 26.5, לקטט 1.2.`

Imaging (אקג, צ"ח, CT, US, אקו לב) always written in `בדיקות עזר` as free prose per modality.

**`המשך טיפול תרופתי` (discharge):**
Separate section from `תרופות בבית`. Contains the discharge prescription list — medications the patient takes home. Format: numbered list, SZMC medication format. Distinct from in-hospital medications (`תרופות באשפוז`).

**`תרופות באשפוז` format:** `DD/MM/YY HH:MM  [DRUG] [DOSE]` — one per line with timestamp prefix.

**`מהלך ודיון` in ED discharge:** Does NOT use `#` problem headers — that is ward-only. Two real styles:
Style 1 (`במיון- / לסיכום-`): Used for longer ED stays/observation. Opens with `במיון —` (exam, labs, imaging as prose lines), then `לסיכום —` (clinical decision and disposition).
Style 2 (bare lines): Used for short visits. Each line is a finding, impression, or decision. No connectors, no headers.

**Urinary catheter:** If a urinary catheter was inserted on or during admission, add as a diagnosis entry: `URINARY CATHETERIZATION — inserted DD/MM/YY`. If the reason was retention, add: `URINARY RETENTION — [X] ml at presentation`. Both go in the active diagnoses list.

**Blood transfusion:** If patient received transfusions, add as diagnosis: `BLOOD TRANSFUSION — [N] units pRBC` (with date if relevant). Goes in active diagnoses list.



**Functional status (geriatrics):** Pick ONE value per field, never list options with slashes.

## LANGUAGE RULES

- **Diagnoses**: English always
- **Narrative**: Hebrew
- **Drug names**: Generic English + brand Hebrew in parentheses
- **Abbreviations**: יל"ד, ל"ד, כ"א, דו"צ, מ/א, ע"ר, א"ח, בא"ח, NC, מלר"ד
- **Gender agreement** throughout Hebrew text
- **No bullet points** in narrative — flowing prose only

## GERIATRIC REQUIREMENTS

For גריאטריה -מח / גריאטריה מוגבר notes, mandatory items:
1. Functional baseline (pre-morbid AND current)
2. Mobility aid, cognitive status, caregiver, living situation
3. Padua score, delirium assessment if relevant
4. Code status (DNR/DNI) if discussed
5. PT/OT referral noted

## GERIATRIC ANALYSIS

**Read `references/geriatric-analysis.md` for full framework.**

Auto-run for geriatric ward notes. Skip if user says "בלי ניתוח" or "just the note".

Show in chat after note (NOT in EMR output):
```
ניתוח גריאטרי — {patient}
[Critical — immediate action]
[Warning — this admission]
[Missing workup / assessment]
[Teaching point]
```
Max 10-12 flags. Covers: Beers 2023, STOPP/START, drug interactions, anticholinergic burden, renal dosing, nutrition, falls, delirium, VTE, code status, missing labs/assessments.

## HTML EXPORT

Always generate an HTML file alongside the chat output. Purpose: user emails to self, opens on phone, copies each section into EMR fields with correct RTL.

**Requirements:**
- `dir="rtl"` on html and all containers, `unicode-bidi: embed; direction: rtl;` on text
- Font: David for Hebrew, Calibri fallback
- Each EMR section in a separate `<div class="section">` with label and content
- English medical terms wrapped in `<span dir="ltr" style="direction:ltr;unicode-bidi:embed;">` to prevent RTL reordering
- `white-space: pre-wrap` on content divs
- No geriatric analysis in HTML (stays in chat only)
- File naming: `kabala_{last}_{first}_{date}.html` or `shichrur_{last}_{first}_{date}.html`
- Save to `/mnt/user-data/outputs/` and present via `present_files`

## QUALITY CHECKS

Before output, verify:
- [ ] All diagnoses in English
- [ ] `רקע רפואי` section present with per-system narrative
- [ ] Medications in SZMC format (`תרופות באשפוז` with timestamps; `המשך טיפול תרופתי` for discharge Rx)
- [ ] Padua score included (end of מחלה נוכחית)
- [ ] Problem-based `#` discussion (ward notes) or short narrative (ED discharge)
- [ ] No bullet points in narrative sections
- [ ] Gender agreement in Hebrew
- [ ] O2 delivery method documented
- [ ] Functional status complete (geriatric notes)
- [ ] HTML file generated with RTL
- [ ] Geriatric analysis shown in chat
- [ ] Consultant recommendations documented when present
- [ ] CHADS2/CHA2DS2-VASc included if AF present
- [ ] Goals-of-care reasoning documented for complex/frail patients
- [ ] Anticoagulation hold/bridge plan documented if applicable

## SZMC DEPARTMENTS

- `גריאטריה -מח` — Geriatrics ward
- `גריאטריה מוגבר` — Geriatrics enhanced
- `רפואה דחופה-מיון` — ED
- `רפואה פנימית` — Internal medicine

---

## REAL-WORLD EXAMPLES — PATTERNS FROM ACTUAL SZMC NOTES

The following patterns are extracted from real SZMC geriatric ward admission notes and interim discharge summaries. Use these as authoritative style/structure references when generating notes. They demonstrate the exact voice, phrasing, section ordering, and clinical reasoning style used by SZMC geriatrics physicians.

### EXAMPLE A: Geriatric Admission — Suspected Seizure + Aspiration Pneumonia + AKI (Male, 84)

**הצגת החולה:**
```
בן 84, הגיע מרפואה דחופה-מיון, מקור מידע בן/בת, מתגורר בבית
```

**תלונה עיקרית:**
```
חשד לפרכוס
```

**רקע רפואי — per-system format (note the dash headers):**
```
מחלות:
לבבי -
לפני 10 שנים ניתוח לב פתוח בקנדה עם החלפת מסתם אאורטלי מכני וCABG.
תחת סטטינים, ואספירין
GI-
דימום בעברו, על כן תחת PPI.
BPH-
תחת טמסולין.
זיהומי-
אושפז במוסדנו ב2.25 עם אנדוקרדיטיס, טופל אנטיביוטית דרך PICCLINE
פרוט ניתוחים/פעולות:
CABG
החלפת מסתם אאורטלי - לא ברור סוג
```

**מחלה נוכחית — narrative style:**
```
בן 84, במקור מדרום אפריקה ומתגורר בקנדה ובישראל, נשוי מתגורר עם אשתו, סיעודי עם דמנציה, יש עובדת זרה.
ברקע BPH, IHD, דיליפידמיה, עבר לפני 10 שנים CABG + החלפת מסתם אאורטלי (ביולוגי).
סיפור של ירידה כללית עם כותרת של דמנציה. לדברי אשתו הולך עם הליכון בבית. בשנים האחרונים ירידה ניכרת בתאבון ובמשקל.
ביום קבלתו חולשה כללית ניכרת, סירב ללכת עם הילכון, בהמשך אירוע של סטיית מבט וחוסר תקשורת שנמשך כ20 דקות. קיבל דורמיקום ממדא ולאחריו הפסקה. ללא תנועות טוני קלונוית. כמו כן קיבל אקמול ונוזלים לאור חום וטכיקרדיה. ללא סיפור של שיעול במהלך האכילה, ללא תלונות נוספות.
```

**ED workup embedded in narrative (before ward admission):**
```
בבדיקתו ללא מקור ברור לחום
מעבדה-נוירטופיליה.
אנמיה נורמוציטי 9 (ירידה מבדיקה קודמת)
קריאטינין 1.7 החמרה מבסיס
עליה במדדי דלקת
צילום-ללא הצללה ברורה
CT ראש-ללא ממצאים
לאור חום ממקור לא ברור ואירוע של סטיית מבט הושלם LP. כמו כן קיבל כיסוי אנטיביוטי
אושפז בגריאטריה להמשך בירור וטיפול
```

**בקבלתו למחלקה — vitals + focused exam:**
```
סימנים חיוניים: לחץ דם 124/68, דופק 112, ללא חום
שקוע, TEMPORAL WASTING, חלש מאוד
לב סדיר ללא אוושות
ראות כניסת אוויר ירודה משמאל, ללא צפצופים
בטן רכה ללא רגישות
גפיים ללא בצקות או סימני צלוליטיס
```

**Problem-based discussion with # headers:**
```
# זהומית: מטופל עם רקע של דמנציה, לאחרונה החמרה בחולשה, נזקק לכ"ג. ביום קבלתו חום עד 38. בבדיקתו כניסת אוויר ירודה משמאל, במעבדה עליה קלה בCRP, בצילום חזה תסנין בLLL- ככל הנראה מדובר באספירציה - הוחל טיפול אנטיביוטי בCEFTRIAXONE.
- בחשד למנינגיטיס עקב החמרה הכרתית, בוצע CT מוח ללא ממצא, ניקור מותני בצורה סטירילית כמקובל בשעה 0430 בדקירה אח, יצא נוזל צלול ושקוף, ל.פ. 6 ס"מ מים, נלקחו 5 מבחנות, נשלחו כימיה, תרביות, ספירה ו2 מבחנות לשמירה.
**לציין קיבל צפטריאקסון טרם ה-LP.
# נוירולוגית: מטופל עם רקע של דמנציה, התקבל בשל חשד לפרכוס. CT מוח תקין, LP ללא ממצא. ייתכן ע"ר מטבולי- נשלים EEG מחר. בינתיים ללא צורך בהתחלת טיפול נגד פרכוסים
# AKI: מטופל עם קריאטינין בסיס תקין, כעת התקבל עם החמרה כלייתית עם קריאטינין עד 1.4 עם BUN 24. ככל הנראה מדובר בATN. נתחיל טיפול בנוזלים ונחזור על מעבדה מחר. נשלים שתן למיקרוסקופיה.
# תפקודית: מטופל הולך עם הליכון עד לפני יומיים, נזמין הערכת פיזיותרפיה.
```

**תוכנית — bare verb list:**
```
IV ABX
IV נוזלים
שתן למיקרוסקופיה
EEG
```

### EXAMPLE B: ED Admission — Cholecystitis (Female, 92)

**תלונה עיקרית (ED style — brief, one-liner):**
```
בת 92, ברקע יל"ד, סוכרת, אפלפסיה. מתהלכת בעזרת הליכון.
כשעה טרם קבלתה החלה לסבול מכאבים בחזה אינם מקרינים, לא קשורים לנשימה. ללא בחילות או הקאות. ללא חום.
לדברי בנה מיום טרם קבלתה חלשה.
לא ידועה על כאבים בחזה מלפני.
כעת במיון מתלוננת על כאבים בבטן ימנית עליונה
```

**בדיקות עזר (US at bedside):**
```
א.ס- ללא הידרונפרוזיס דו"צ, ללא נוזל חופשי בבטן, כיס מרה מכיל אבנים מרובים, יתכן עיבוי דופן. מרפי סונוגרפי חיובי.
```

**ED discussion with # headers (note: this is an ED-to-ward admission, NOT a pure ED discharge — so # headers ARE used):**
```
במהלך שהותה במיון מצייגה את הבעיות הבאות:
# לבבית- מטופלת ללא רקע של מחלות לב התקבלה לאחר כאבים בחזה, אקג תקין, טרופונין שלילי וצל"ח ללא ממצא חריג לציין. ייתכן שכאב חזה ללא מקור לבבי.
# גסטרו- בבדיקתה רגישות בבטן ימנית עליונה עם מדדי דלקת מוגברים, בא"ס ליד המיטה ניראה כיס המרה מכיל אבנים מרובים עם מרפי סונוגרפי חיובי. ייתכן שמדובר על CHOLECYSTITIS. במיון קיבלה נוזלים והחלה טיפול א"ב
```

### EXAMPLE C: Geriatric Admission — Hypernatremic Dehydration + Dysphagia (Male, 94)

**הצגת החולה — note the community physician detail:**
```
הגיע מרפואה דחופה-מיון, בן 94, גרוש, אב לילד אחד, מתגורר לבד בדיור מוגן.
פרטי רופא בקהילה: שם רופא: ד"ר בוריס מוהירמן, סניף: קופ"ח מכבי
```

**רקע רפואי — using # markers per disease:**
```
מחלות:
# HYPOTHYROIDISM
נוטל EUTHYROX.
TSH אחרון (16/01/22): 3.58
# IHD
כותרת מ"אופק". נוטל סטטינים ואספירין.
# יל"ד
נוטל LERCAPRESS
# BPH
# היפונתרמיה
כותרת מבדיקת אנדוקרינולוג בקהילה. ב"אופק" ערכים בין 127 ל135)
ניתוחים/פעולות:
# ROTATOR CUFF SYNDROME RT. S/P SUPRASCAPULAR NERVE BLOCK
```

**מחלה נוכחית — with prior ED visit referenced:**
```
בן 94, הידרדרות קוגנטיבית, גר לבד, נעזר על יד מטב"ים למספר שעות ביממה.
ברקע יתר ל"ד, מחלת לב איסכמית, BPH משתמש בקטטר קבוע, היפותאירואידיזם, היפרליפידימיה.
פניה רצנטית למיון בשל הידרדרות כללית ונפילה וחבלת ראש שבועיים טרם קבלתו כעת
במיון אז נעשה CT מוח
ללא ממצא אינטרה-קרניאלי חד בבדיקה זו ובפרט ללא דימום או בצקת מוחית.
שינויים מוחיים איסכמיים ומיקרווסקולופתיים כרוניים.
טופל בנוזלים עם רושם להטבה, כמו כן הוחלף קטטר שתן עם הטבה ביציאת השתן לאחר מכן.
כעת חזר למיון עקב מיעוט באכילה ושתייה במידה רבה עד שבימים אחרונים כמעט לא אכל או שתה. הבן מסביר כי המטופל התלונן על קשיי בליעה ללא פירוט נוסף וכי הם הגורם לצמצום המשמעותי.
```

**תפקוד — full ADL assessment (geriatric mandatory):**
```
מגורים: מתגורר בבית
עזרה: מט"ב - מספר שעות: 10
ניידות: הולך בעזרת הליכון
התמצאות: ירידה קוגניטיבית קלה
הלבשה: עזרה מלאה
רחצה: עזרה מלאה
אכילה: עזרה חלקית
הכנת אוכל: עזרה מלאה
ניידות: עזרה מלאה
מעברים: עזרה מלאה
שליטה על שתן: עזרה חלקית
שליטה על יציאה: עזרה חלקית
הזנה: כלכלה רגילה פומית
```

**בדיקה גופנית — with POCUS:**
```
הופעה כללית: ל"ד 176/69, דופק 68, חום 36.4 PO, סטורציה 97% באוויר חדר, נלקח 23:49 01/03
מצב כללי: טוב, לא מתמצא 3X ללא מצוקה נשימתית, ללא כחלון צהבת חיווורון. קכקטי.
פה ולוע: ריריות יבשות.
ריאות: ריאות: טכיפנאי, כניסת אוויר טובה דו"צ, ללא חירחורים או ציפצופים
לב: קצב סדיר, אין איוושות
בטן: רכה ללא רגישות
גפיים: אין פגמים או סימני דלקת במפרקים, אין דליות בצקת אודם או כחלון
```

**בדיקות עזר:**
```
אק"ג- לא סדיר, רושם ל- atrial flutter ול- PVC.
צל"ח- ללא תפילטים ללא תסנינים.
POCUS- בדיקת IVC, כ- 2 ס"מ, קריסה של כ- 50%.
```

**דיון ותוכנית — with goals-of-care embedded:**
```
[...clinical summary...]
רושם להתייבשות קשה וירידה במשקל בחודשים האחרונים
החמרה כלייתית על רקע התייבשות
זקוק להערכת בליעה ונוזלים ודיון עם המשפחה אם מעוניינים בהמשך בירור ובמידת האפשר הכנסת זונדה / PEG אמבולטורי.
תוכנית:
נוזלים
קלינאית תקשורת
בירור בליעה
מעקב התייבשות
TSH
איזון ל"ד
```

### EXAMPLE D: Geriatric Admission — Esophageal Dysphagia Workup (Male, 75)

**רקע רפואי — with detailed prior hospitalization summaries:**
```
מחלות:
# ביתו סובלת מLUPUS.
# לפני 6 שנים טרם כליה לביתו.
#אשפוז בפנימית א ב3/2025 עקב ASTHMA EXACERBATION
במהלך אשפוזו בשל ממצאים ב CT, עבר הערכת רופא ריאות:
1. ללא עדות לתסחיף ריאתי מרכזי או פריפרי ברור.
2. ב-RUL הצללה זכוכית חול קלושה - ללא שינוי ביחס לבדיקה מה-18.07.17 - באבחנה מבדלת שינויים כרוניים / תהליך נאופלסטי (סרטן מסוג צמיחה ליפידית עם גדילה איטית).
3. עיבוי דופנות סימפונות דו צדדי. מעט תוכן בסימפונות.
[...pulmonologist recommendations quoted...]
אשפוז בקרדיולוגיה ב2017
עקב נפיחות ברגל ימין, בבירור עלה שמדובר ב DVT ברגל ימין, עבר מיפוי ריאות עם שלא הדגים PE
אקו לב הדגים תפקוד שמור של חדר שמאל,
RV Mildly dilated with impaired contraction
[...echo findings, CT-A findings, risk stratification, DOAC initiation...]
```

**Consultant recommendations embedded in plan:**
```
בייעוץ גסטרו הומלץ על השהיית אלקויס ולהתקדם יום שלישי לבדיקת גסטרוסקופיה באשפוז לאחר 48 שעות השהייה של אלקוויס
הומלץ על ידי גסטרו להשלים CT חזה + CT בטן-אגן
```
