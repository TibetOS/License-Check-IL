/* Service Worker — מעטפת האתר זמינה גם ללא רשת, והאתר ניתן להתקנה כאפליקציה.
   אסטרטגיה: רשת-תחילה לנכסי האתר עצמו (מקוון = תמיד טרי, בלי בעיות פריסה
   ישנה), נפילה למטמון כשאין רשת. בקשות חוצות-מקור (data.gov.il) אינן
   מיורטות כלל — תוצאות חיפוש תמיד מגיעות חיות מהמאגר הממשלתי. */

// חשוב: ניווטים ללא-רשת נופלים תמיד ל-index.html מהמטמון של ההתקנה,
// ולכן כל שינוי בקבצי המעטפת (ובמיוחד index.html) מחייב העלאת גרסה כאן —
// אחרת משתמש לא-מקוון יקבל מעטפת ישנה עם סקריפטים חדשים.
// שם המטמון כולל את ה-scope: אתר ה-staging (‎/staging/‎) חי באותו origin,
// ובלי ההפרדה שני ה-workers היו מוחקים זה לזה את המטמון בכל עדכון גרסה
const CACHE_PREFIX = "lci-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v7::${self.registration.scope}`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./scanner.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // מנקים רק גרסאות ישנות של ה-scope הזה (או שמות מהתקופה שלפני ההפרדה,
  // ללא ‎::‎) — לעולם לא את המטמון החי של ה-scope השני באותו origin
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) =>
            key.startsWith(CACHE_PREFIX) &&
            key !== CACHE_NAME &&
            (!key.includes("::") || key.endsWith(`::${self.registration.scope}`)))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  // בקשות למאגר הממשלתי (חוצות-מקור) עוברות ישירות לרשת, בלי מטמון
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // עותק טרי נשמר במטמון לשימוש הבא ללא רשת. waitUntil מאריך את חיי
        // ה-SW עד שהכתיבה מסתיימת — בלעדיו הדפדפן רשאי לסיים את התהליך
        // מיד אחרי מסירת התשובה והכתיבה עלולה ללכת לאיבוד.
        // ניווטים אינם נשמרים: הנפילה ללא-רשת משתמשת תמיד ב-./index.html
        // מהמטמון, וכל ‎?plate=‎ ייחודי היה מוסיף רשומה מתה שאינה נקראת
        if (response.ok && request.mode !== "navigate") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() =>
        request.mode === "navigate"
          ? caches.match("./index.html")
          : caches.match(request),
      ),
  );
});
