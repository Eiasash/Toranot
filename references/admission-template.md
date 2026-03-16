# SZMC Ward Admission Note Template — קבלה רפואית

## Target Departments

- גריאטריה -מח (Geriatrics)
- גריאטריה מוגבר (Geriatrics Enhanced)
- רפואה פנימית (Internal Medicine)

## Section Order

Each section below maps to a separate EMR field. The physician copies content into the corresponding field in the SZMC system. Sections must appear in this exact order.

---

### 1. כותרת (Header)

```
מחלקה: גריאטריה -מח
תאריך קבלה: DD/MM/YYYY
```

### 2. הצגת החולה (Patient Presentation)

Format: single line, comma-separated demographics.

```
בן/בת [AGE], הגיע/ה מרפואה דחופה-מיון, מקור מידע [SOURCE], מתגורר/ת ב[LIVING]
```

Sources: בן/בת, אשה/בעל, מטופל/ת, רשומה רפואית, עובד/ת זר/ה, מטב"ים, צוות בית אבות

Living: בבית, דיור מוגן, בית אבות, מוסד סיעודי

Optional additions: community physician, HMO:
```
פרטי רופא בקהילה: שם רופא: ד"ר [NAME], סניף: קופ"ח [HMO]
```

### 3. אבחנות פעילות (Active Diagnoses)

- **Always in English**
- One per line
- Most relevant to admission first
- Add qualifiers: `- Suspected`, `- Right`, `- BE`, `- Resolved, STEROID INDUCED`
- Urinary catheter: `URINARY CATHETERIZATION — inserted DD/MM/YY`
- Blood transfusion: `BLOOD TRANSFUSION — [N] units pRBC`
- Delirium with date: `DELIRIUM MM/YY`

Example:
```
ASPIRATION PNEUMONIA
ACUTE KIDNEY INJURY (AKI)
SEIZURES / CONVULSIONS - Suspected
URINARY CATHETERIZATION — inserted 01/03/26
HYPERNATREMIA — SEVERE
```

### 4. אבחנות ברקע (Background Diagnoses)

- **Always in English**
- Include laterality, procedure type, status
- "Resolved" suffix for conditions no longer active

Example:
```
ENDOCARDITIS
BPH (BENIGN PROSTATIC HYPERTROPHY)
HIP FRACTURE - Right, s/p repair
CABG (CORONARY ARTERY BYPASS GRAFT)
MACULAR DEGENERATION - BE
COGNITIVE DECLINE / IMPAIRMENT
HYPERGLYCEMIA - Resolved, STEROID INDUCED
```

### 5. ניתוחים בעבר (Past Surgeries)

English. One per line.

```
CABG
AORTIC VALVE REPLACEMENT
ROTATOR CUFF SYNDROME RT. S/P SUPRASCAPULAR NERVE BLOCK
```

### 6. תלונה עיקרית (Chief Complaint)

Brief Hebrew, 1-2 sentences.

```
חשד לפרכוס
```
OR longer with context:
```
קוצר נשימה עם ירידה בסטורציה, על רקע אי-ספיקת לב ידועה
```

### 7. רקע רפואי (Medical Background) — MANDATORY

**Per-system or per-disease narrative expansion.** This section ALWAYS appears. Uses organ-based or disease-based headers with dash.

**Style A — Organ-based dashes:**
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

**Style B — Per-disease # markers:**
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
ניתוחים/פעולות:
# ROTATOR CUFF SYNDROME RT. S/P SUPRASCAPULAR NERVE BLOCK
```

Both styles are valid. Choose based on complexity — Style B for patients with many separate conditions and detailed histories.

Include: treatment for each condition, last relevant labs from community, severity, relevant prior hospitalizations.

### 8. מחלה נוכחית (Present Illness)

**Hebrew narrative, chronological.** Opens with demographics + functional baseline + abbreviated background. Then acute presentation. Closes with pertinent negatives.

Structure:
1. Age, origin, living situation, functional baseline
2. Abbreviated background (ברקע...)
3. Recent decline / prodrome
4. Acute event chronology
5. What was given pre-hospital (MDA)
6. ED workup summary (if relevant)
7. Pertinent negatives

End with Padua score (mandatory):
```
padua score: [N]
```

If AF present, add:
```
CHADS2: [N]
```
or:
```
CHA2DS2-VASc: [N]
```

### 9. רגישויות (Allergies)

```
רגישויות:
לא ידוע על רגישות
```
OR:
```
רגישויות:
סברס - תגובה: פריחה בעור
```
OR with verification:
```
רגישויות:
Iodine - תגובה: בצקת בדרכי האויר - לא מאומת, אישור אחרון ע"י [NAME] בתאריך DD/MM/YY
```

### 10. תרופות בבית (Home Medications)

One per line in SZMC format (see `medication-formats.md`).

Discrepancies documented inline:
```
Dutasteride ( Avodart ) P.O. 0.5 mg X 1 / d (לדברי הנכדה לא מקבל כעת)
```

Titration notes:
```
Lacosamide ( Vimpat ) P.O. 50 mg X 2 / d (לאחר שבוע להעלות ל100 מ"ג פעמיים ביום)
```

### 11. הרגלים (Habits)

Always present:
```
הרגלים:
מעשן: לא
שימוש באלכוהול: לא
שימוש בסמים: לא
```
OR with detail:
```
הרגלים:
מעשן: בעבר  הפסקת עישון לפני: 45 שנים
עישון סביל: לא
שימוש באלכוהול: לא
שימוש בסמים: לא
```

### 12. אנמנזה משפחתית (Family History)

```
אנמנזה משפחתית
אבא - סרטן הלוע
```
OR:
```
אנמנזה משפחתית
ללא ידוע
```

### 13. תפקוד (Functional Status) — Geriatrics mandatory

**Pick ONE value per field. Never list options with slashes.**

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

Values: עצמאי, עזרה חלקית, עזרה מלאה, עזרה רבה

### 14. בדיקה גופנית (Physical Examination)

Include timestamp for vitals:

```
הופעה כללית: ל"ד 176/69, דופק 68, חום 36.4 PO, סטורציה 97% באוויר חדר, נלקח 23:49 01/03
מצב כללי: טוב, לא מתמצא 3X ללא מצוקה נשימתית, ללא כחלון צהבת חיווורון. קכקטי.
פה ולוע: ריריות יבשות.
ריאות: כניסת אוויר טובה דו"צ, ללא חירחורים או ציפצופים
לב: קצב סדיר, אין איוושות
בטן: רכה ללא רגישות
גפיים: אין פגמים או סימני דלקת במפרקים, אין דליות בצקת אודם או כחלון
```

Document O2 delivery method when relevant (NC, mask, HFNC, BiPAP).

### 15. בדיקות עזר (Auxiliary Tests)

Imaging and bedside tests — free prose per modality:

```
אק"ג- לא סדיר, רושם ל- atrial flutter ול- PVC.
צל"ח- ללא תפילטים ללא תסנינים.
POCUS- בדיקת IVC, כ- 2 ס"מ, קריסה של כ- 50%.
```

Echo findings quoted verbatim from formal report (English):
```
אקו לב מה 3/12/25 -
Left Ventricle: Normal size. Asymmetric basal-septal LV hypertrophy. LVEF >70%.
Right Ventricle: poorly visualized. Normal size. Mild systolic dysfunction.
```

### 16. בדיקות מעבדה (Lab Results)

**Inline prose. Never tables.** Group by category:

```
כימיה: נתרן 136, אשלגן 3.6, קריאטינין 1.19, BUN 21, CRP 9.29, eGFR 59.
ספירה: לויקוציטים 21.9, ניוטרופילים 87.7%, המוגלובין 12.7, טסיות 289 (אלפים).
קואגולציה: INR 1.22, פיברינוגן 640.
גזים: PH 7.44, PCO2 39, HCO3 26.5, לקטט 1.2.
שתן: לויקוציטים +++, ניטריט חיובי
```

### 17. דיון ותוכנית (Discussion and Plan)

**Structure:**

1. Opening paragraph: patient, baseline, reason for admission
2. `-בקבלתו/ה למיון:` (with leading dash) — vitals, exam, workup, treatment started
3. `בקבלתו/ה למחלקתנו:` (no dash) — vitals, exam, key labs inline
4. `המטופל/ת מציג/ה את הבעיות הבאות להתייחס:`
5. `# PROBLEM` headers — **Hebrew preferred**

**Problem headers** (3-6 sentences each):

Preferred headers:
`# זיהומית` / `# נשימתית` / `# המודינמית` / `# המטולוגית` / `# כלייתית` / `# נוירולוגית` / `# מטבולית` / `# תפקודית` / `# לבבית` / `# עורית` / `# סוציאלית`

Each problem:
- Patient context for this problem
- What was found (labs, imaging, exam)
- Clinical reasoning
- Next step

Consultant recommendations quoted with attribution:
```
בייעוץ גסטרו הומלץ על השהיית אלקויס ולהתקדם יום שלישי לבדיקת גסטרוסקופיה
```

**Trigger analysis** for complex presentations (e.g., CHF exacerbation):
```
לסיכום, רושם להחמרה באי ספיקת לב. כרגע מבחינת הטריגר -
א. קרדיאלי - ...
ב. וסקולרי - ...
ג. שינוי אורחות חיים - ...
ד. זיהומי - ...
```

Goals-of-care reasoning embedded inline when relevant.

6. `תוכנית:` — **bare verb list, no bullets, no numbers**

```
תוכנית:
IV ABX
IV נוזלים
שתן למיקרוסקופיה
EEG
```

Valid plan items:
- `HOLD [drug]`
- `(?)` suffix for tests under consideration
- `לשקול` prefix for undecided tests
- Specific lab panels written out

### 18. חתימה (Signature)

```
נכתב ע"י: ד"ר [NAME]
חתימת רופא: [NAME]
```

For physician assistant:
```
נכתב ע"י עוזר\ת רופא: [NAME]
חתימת רופא: [NAME]
```
