# License-Check-IL 🚗

בדיקת פרטי רכב לפי מספר לוחית רישוי — ישירות ממאגר כלי הרכב של משרד התחבורה ב-[data.gov.il](https://data.gov.il/dataset/private-and-commercial-vehicles).

אפליקציית עמוד יחיד (HTML/CSS/JS בלבד), ללא שרת: השאילתות נשלחות מהדפדפן ישירות ל-API הציבורי של data.gov.il.

## הרצה מקומית

אין תהליך build. כל שרת סטטי יעבוד, למשל:

```bash
python3 -m http.server 8000
```

ואז לפתוח את http://localhost:8000 בדפדפן.

(אפשר גם פשוט לפתוח את `index.html` ישירות בדפדפן — ה-API תומך ב-CORS.)

## פריסה ל-GitHub Pages

1. בעמוד ה-repository ב-GitHub: **Settings → Pages**.
2. תחת **Build and deployment**, בחרו Source: **Deploy from a branch**.
3. בחרו את branch `main` ואת התיקייה `/ (root)`, ולחצו **Save**.
4. תוך דקות ספורות האתר יהיה זמין בכתובת `https://<username>.github.io/License-Check-IL/`.

## מקור הנתונים

- CKAN API: `https://data.gov.il/api/3/action/datastore_search`
- מאגר רכב פרטי ומסחרי, resource: `053cea08-09bc-40ec-8f7a-156f0677aff3`
- סינון לפי שדה `mispar_rechev` (מספר רכב)
- ללא מפתח API; המאגר ציבורי ואינו כולל פרטים אישיים.
