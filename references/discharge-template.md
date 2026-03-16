# SZMC Discharge Note Templates

## Note Types

| Type | Hebrew | When |
|------|--------|------|
| Ward discharge | סיכום שחרור | Patient leaving hospital |
| Temporary discharge | סיכום אשפוז זמני | Interim summary (still admitted) |
| ED discharge | סיכום שחרור מיון | Patient discharged from ED |

---

## Ward Discharge / Temporary Discharge (סיכום שחרור / סיכום אשפוז זמני)

### Section Order

1. כותרת (Header)
2. תנועות (Movements — admission/discharge dates)
3. אבחנות פעילות (Active Diagnoses — English)
4. אבחנות ברקע (Background Diagnoses — English)
5. הצגת החולה (Patient Presentation)
6. תלונה עיקרית (Chief Complaint)
7. רקע רפואי (Medical Background) — MANDATORY
8. רגישויות (Allergies)
9. הרגלים (Habits)
10. בדיקה גופנית (Physical Examination)
11. מהלך ודיון (Hospital Course & Discussion) — uses `#` problem headers
12. תרופות באשפוז (In-Hospital Medications) — timestamped
13. תרופות בבית (Home Medications on Admission)
14. פרוט ניתוחים (Procedures During Admission)
15. המלצות בשחרור (Discharge Recommendations)
16. המשך טיפול תרופתי (Discharge Prescription)
17. תוצאות מעבדה (Lab Results — inline prose)
18. תרביות (Culture Results)
19. בדיקות בעבודה (Pending Tests)
20. חתימה (Signature)

### Section Details

#### תנועות (Movements)

```
תאריך קבלה: DD/MM/YYYY
תאריך שחרור: DD/MM/YYYY
```

#### מהלך ודיון (Hospital Course)

Uses `#` problem headers — same as admission note. Each problem now includes the full hospital course:

```
# זיהומית: מטופל/ת התקבל/ה עם... במהלך האשפוז... טופל/ה ב... בשחרור...

# כלייתית: בקבלה קריאטינין... במהלך האשפוז... בשחרור...

# תפקודית: בקבלה... הערכת פיזיותרפיה מה-DD/MM... בשחרור...
```

Alternatively, numbered list is valid:
```
לסיכום:
1. [Problem 1 — full course]
2. [Problem 2 — full course]
3. [Problem 3 — full course]
```

#### תרופות באשפוז (In-Hospital Medications)

**Timestamped format:** `DD/MM/YY HH:MM  [DRUG] [DOSE]`

```
01/03/26 04:30  Ceftriaxone 2g IV
01/03/26 04:30  Paracetamol 1g IV
01/03/26 06:00  NaCl 0.9% 500ml IV
02/03/26 08:00  Enoxaparin 40mg SC
```

One per line. Chronological order.

#### המלצות בשחרור (Discharge Recommendations)

Hebrew prose. Key categories:
- Follow-up appointments
- Lab monitoring schedule
- Activity restrictions
- Diet
- Wound care
- When to return to ED
- Referrals

#### המשך טיפול תרופתי (Discharge Prescription)

**Separate from תרופות בבית** — this is what the patient TAKES HOME.
Numbered list, SZMC medication format:

```
1. Omeprazole ( Losec ) P.O. 20 mg X 1 / d
2. Metoprolol ( Betaloc ) P.O. 25 mg X 2 / d
3. Ceftriaxone ( Rocephin ) IV 2 g X 1 / d — עד DD/MM/YY
4. Enoxaparin ( Clexane ) SC 40 mg X 1 / d — למשך 14 ימים
```

#### תרביות (Culture Results)

```
תרביות חיוביות
סוג דגימה: Urine
חיידק: Pseudomonas aeruginosa
רגיש ל: Amikacin (4), Ceftazidime (2), Ciprofloxacin (0.5), Meropenem (<=0.25)
תאריך: 11/02/2026
```

#### בדיקות בעבודה (Pending Tests)

```
בדיקות בעבודה
סוג דגימה: Blood
תאריך: 16/02/2026
```

#### PT Assessment (if available)

Include in interim/discharge:
```
מצב תפקודי לפי הערכת הפיזיותרפיה
מצב תפקודי:
מעבר משכיבה לישיבה במיטה: עזרה רבה
מעבר מישיבה במיטה לשכיבה: עזרה רבה
ממצאים פיזיקאלים:
חולשה ביד ורגל שמאל- צריך לברר
```

---

## ED Discharge (סיכום שחרור מיון)

### Key Differences from Ward Notes

1. **NO `#` problem headers** — use flowing narrative or bare lines
2. Shorter format overall
3. תרופות באשפוז uses timestamps
4. המשך טיפול תרופתי for take-home prescriptions

### Section Order

1. כותרת
2. תנועות (arrival/discharge times)
3. אבחנות פעילות (English)
4. אבחנות ברקע (English)
5. הצגת החולה
6. תלונה עיקרית — often more detailed than ward (includes timeline + negatives)
7. רקע רפואי
8. רגישויות
9. הרגלים
10. בדיקה גופנית (vitals + focused exam)
11. בדיקות עזר (imaging, US, ECG)
12. בדיקות מעבדה (inline prose)
13. מהלך ודיון — **NO `#` headers**
14. תרופות באשפוז (timestamped)
15. המשך טיפול תרופתי
16. המלצות
17. חתימה

### מהלך ודיון — ED Styles

**Style 1 — `במיון- / לסיכום-`** (longer ED stays/observation):

```
במיון —
בבדיקתה רגישות בבטן ימנית עליונה. ל"ד 130/75, דופק 88, חום 37.8.
מעבדה: לויקוציטים 15.2, CRP 45. תפקודי כבד תקינים.
א"ס ליד המיטה: כיס מרה מכיל אבנים, מרפי סונוגרפי חיובי.
קיבלה נוזלים, פרמין, וסטרון.

לסיכום —
רושם לכולציסטיטיס חדה. הוחל טיפול א"ב. מאושפזת בגריאטריה להמשך טיפול.
```

**Style 2 — Bare lines** (short visits):

```
הגיעה בשל סחרחורת.
בבדיקה ללא ממצא נוירולוגי.
ל"ד 160/90, ירידה לאחר טיפול.
CT מוח תקין.
משוחררת עם המלצה למעקב קופ"ח.
```

### Important: ED Admission Notes to Ward

When the ED physician writes an admission note for a patient going to a ward (not going home), `#` problem headers ARE used:

```
במהלך שהותה במיון מצייגה את הבעיות הבאות:
# לבבית- מטופלת ללא רקע של מחלות לב התקבלה לאחר כאבים בחזה, אקג תקין, טרופונין שלילי...
# גסטרו- בבדיקתה רגישות בבטן ימנית עליונה עם מדדי דלקת מוגברים...
```

The distinction: ED *discharge* (home) = no headers. ED *admission* (to ward) = headers allowed.
