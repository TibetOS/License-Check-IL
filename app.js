const API_URL = "https://data.gov.il/api/3/action/datastore_search";
const REQUEST_TIMEOUT_MS = 10000;

const RESOURCES = {
  main: "053cea08-09bc-40ec-8f7a-156f0677aff3",
  continuation: "0866573c-40cd-4ca8-91d2-9dd2d7a492e5",
  wltp: "142afde2-6228-49f9-8a29-9b6c3a0cbe40",
  recalls: "36bf1404-0be4-49d2-82dc-2f1ead4a8b93",
  recallDetails: "2c33523f-87aa-44ec-a736-edbb0a82975e",
  priceList: "39f455bf-6db0-4926-859d-017f34eacbcb",
  disabledPermit: "c8b9f9c8-4612-4068-934f-d4acd2e3c06e",
  inactive: "f6efe89a-fb3d-43a4-bb61-9bf12a9b9099",
  motorcycles: "bf9df4e2-d90d-4c0a-a400-19e15af8e95f",
  personalImport: "03adc637-b6fe-402b-9937-7c3d3afc9140",
  publicTransport: "cf29862d-ca25-4691-84f6-1be60dcb4a1e",
  heavyTrucks: "cd3acc5c-03c3-4c89-9c54-d40f93c0d790",
  cancelledFinal: "851ecab1-0622-4dbe-a6c7-f950cf82abf9",
  cancelledArchive2010: "4e6b9724-4c1e-43f0-909a-154d4cc4e046",
  cancelledArchive2000: "ec8cbc34-72e1-4b69-9c48-22821ba0bd6c",
  inactiveOld: "6f6acd03-f351-4a8f-8ecf-df792f4f573a",
  vehicleHistory: "56063a99-8a3e-4ff4-912e-5966c0279bad",
  ownershipHistory: "bb2355dc-9ec7-4f06-9c3f-3344672171da",
  safetyDiscount: "83bfb278-7be1-4dab-ae2d-40125a923da1",
  particleFilter: "7cb2bd95-bf2e-49b6-aea1-fcb5ff6f0473",
  cargoAnchors: "786b33b5-75c4-42a3-a241-b1af3c9ca487",
  constructionEquipment: "58dc4654-16b1-42ed-8170-98fadec153ea",
  busFleet: "91d298ed-a260-4f93-9d50-d5e3c5b82ce1",
  constructionPollution: "f2e130e8-bc94-4443-91bd-3ba3353b1494",
};

const RECENT_KEY = "lci_recent_v1";
const RECENT_MAX = 8;

const form = document.getElementById("search-form");
const input = document.getElementById("plate-input");
const clearInputBtn = document.getElementById("clear-input");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultCard = document.getElementById("result");
const resultBanner = document.getElementById("result-banner");
const resultPlate = document.getElementById("result-plate");
const resultTitle = document.getElementById("result-title");
const brandLogo = document.getElementById("brand-logo");
const resultSubtitle = document.getElementById("result-subtitle");
const vehicleImageBox = document.getElementById("vehicle-image");
const resultDetails = document.getElementById("result-details");
const renewalBox = document.getElementById("renewal-box");
const timelineBox = document.getElementById("timeline-box");
const historyBox = document.getElementById("history-box");
const indicatorBox = document.getElementById("indicator-box");
const safetyBox = document.getElementById("safety-box");
const permitBox = document.getElementById("permit-box");
const recallBox = document.getElementById("recall-box");
const recentSection = document.getElementById("recent");
const recentList = document.getElementById("recent-list");
const clearRecentBtn = document.getElementById("clear-recent");
const shareBtn = document.getElementById("share-btn");
const shareBtnLabel = document.getElementById("share-btn-label");
const myCarBtn = document.getElementById("mycar-btn");
const myCarBtnLabel = document.getElementById("mycar-btn-label");
const myCarSection = document.getElementById("mycar");

const MESSAGES = {
  invalid: "מספר רישוי חייב להכיל 2 עד 8 ספרות",
  notFound: "הרכב לא נמצא באף אחד מהמאגרים. ייתכן שמדובר ברכב חדש מאוד או במספר שגוי.",
  notFoundPartial: "הרכב לא נמצא, אך חלק מהמאגרים לא היו זמינים לבדיקה — נסו שוב בעוד רגע.",
  apiError: "שגיאה בגישה למאגר הממשלתי. נסו שוב בעוד רגע.",
  offline: "אין חיבור לאינטרנט. הבדיקה דורשת חיבור למאגר הממשלתי.",
  loading: "בודק את המאגר…",
  loadingFallback: "לא נמצא במאגר הראשי, בודק מאגרים נוספים…",
};

// מזהה חיפוש רץ — מונע עדכון הכרטיס מתוצאות של חיפוש ישן
let searchToken = 0;

function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

// לוחיות מודרניות הן 7-8 ספרות, אבל מאגר הרכב הכבד מכיל רכבי אספנות
// עם מספרים היסטוריים קצרים (למשל 870), לכן מתירים גם מספרים קצרים
function isValidPlate(digits) {
  return /^\d{2,8}$/.test(digits);
}

// 7 ספרות: 12-345-67, 8 ספרות: 123-45-678
function formatPlate(digits) {
  if (digits.length === 7) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

function formatDate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value);
  return `${match[3]}.${match[2]}.${match[1]}`;
}

// תאריך כמספר שלם בסגנון 20230419 (מאגר תווי החניה)
function formatIntDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value));
  if (!match) return null;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

// "2011-6" -> "6/2011"
function formatMonthYear(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{1,2})/.exec(String(value));
  if (!match) return String(value);
  return `${match[2]}/${match[1]}`;
}

// תאריך כמספר שלם בסגנון 202210 (מאגר החלפות הבעלות) -> "10/2022"
function formatYearMonthInt(value) {
  const match = /^(\d{4})(\d{2})$/.exec(String(value));
  if (!match) return null;
  return `${Number(match[2])}/${match[1]}`;
}

function formatKm(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num.toLocaleString("he-IL");
}

function withUnit(value, unit) {
  return value != null && value !== "" ? `${value} ${unit}` : null;
}

// ערך שמוצג רק כשהוא מספר חיובי (מאגרים ישנים ממלאים 0 במקום ריק)
function positiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

// דגל אבזור (0/1) בטבלת הדגמים — מציגים "כן" רק כשהאבזור קיים.
// היעדר אינו מוצג כ"אין": ייתכן שהאבזור פשוט לא תועד בטבלת הדגם
function yesOnly(value) {
  return Number(value) === 1 ? "כן" : null;
}

// ממוצע נסועה שנתי מוערך: מד האוץ בטסט האחרון חלקי הוותק מהרישום הראשון.
// הערכה בלבד (מד האוץ נכון לתאריך הטסט, לא להיום) — מסומן "~" בתצוגה.
// רכב צעיר מחצי שנה מוחזר null כדי לא להציג ממוצע לא-אמין
// ממוצע נסועה שנתי ארצי משוער (ק"מ) — בסיס להשוואת "נמוך/גבוה מהממוצע"
const NATIONAL_AVG_KM_PER_YEAR = 15000;

function annualMileage(kmValue, firstRegDate) {
  const km = Number(kmValue);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(firstRegDate || ""));
  if (!Number.isFinite(km) || km <= 0 || !match) return null;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const years = (Date.now() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0.5) return null;
  return Math.round(km / years);
}

/* קודי עומס ומהירות של צמיגים (תקן ETRTO): 88H -> 560 ק"ג, עד 210 קמ"ש */

// עומס מרבי בק"ג לפי מדד עומס, החל ממדד 50
const TIRE_LOAD_KG = [
  190, 195, 200, 206, 212, 218, 224, 230, 236, 243, // 50-59
  250, 257, 265, 272, 280, 290, 300, 307, 315, 325, // 60-69
  335, 345, 355, 365, 375, 387, 400, 412, 425, 437, // 70-79
  450, 462, 475, 487, 500, 515, 530, 545, 560, 580, // 80-89
  600, 615, 630, 650, 670, 690, 710, 730, 750, 775, // 90-99
  800, 825, 850, 875, 900, 925, 950, 975, 1000, 1030, // 100-109
  1060, 1090, 1120, 1150, 1180, 1215, 1250, 1285, 1320, 1360, // 110-119
  1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750, 1800, 1850, // 120-129
  1900, 1950, 2000, 2060, 2120, 2180, 2240, 2300, 2360, 2430, // 130-139
  2500, 2575, 2650, 2725, 2800, 2900, 3000, 3075, 3150, 3250, // 140-149
  3350, 3450, 3550, 3650, 3750, 3875, 4000, 4125, 4250, 4375, // 150-159
  4500, 4625, 4750, 4875, 5000, 5150, 5300, 5450, 5600, 5800, // 160-169
  6000, // 170
];

const TIRE_SPEED_KMH = {
  B: 50, C: 60, D: 65, E: 70, F: 80, G: 90, J: 100, K: 110, L: 120,
  M: 130, N: 140, P: 150, Q: 160, R: 170, S: 180, T: 190, U: 200,
  H: 210, V: 240, W: 270, Y: 300,
};

function decodeTireCodes(loadCode, speedCode) {
  const load = TIRE_LOAD_KG[Number(loadCode) - 50];
  const speed = TIRE_SPEED_KMH[String(speedCode || "").trim().toUpperCase()];
  const parts = [];
  if (load) parts.push(`${load} ק"ג`);
  if (speed) parts.push(`עד ${speed} קמ"ש`);
  return parts.length ? parts.join(", ") : null;
}

function tireRating(record) {
  const front = decodeTireCodes(record.kod_omes_tzmig_kidmi, record.kod_mehirut_tzmig_kidmi);
  const rear = decodeTireCodes(record.kod_omes_tzmig_ahori, record.kod_mehirut_tzmig_ahori);
  if (front && rear && front !== rear) return `קדמי: ${front} · אחורי: ${rear}`;
  return front || rear;
}

function formatPrice(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `₪${num.toLocaleString("he-IL")}`;
}

// סף "מסתיים בקרוב" לתוקף רישיון הרכב (ימים)
const EXPIRY_SOON_DAYS = 30;

// ימים שנותרו עד תאריך ISO (שלילי = עבר); null כשאין תאריך תקין
function daysUntil(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ""));
  if (!match) return null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiry = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.round((expiry - startOfToday) / 86400000);
}

// תג תוקף לפי תאריך ISO: "בתוקף" / "פג תוקף", וכשהתוקף מסתיים בתוך
// 30 יום — תג כתום עם ספירת הימים שנותרו
function validityBadge(isoDate) {
  const days = daysUntil(isoDate);
  if (days == null) return null;
  if (days < 0) return { text: "פג תוקף", tone: "expired" };
  if (days === 0) return { text: "מסתיים היום", tone: "expiring" };
  if (days <= EXPIRY_SOON_DAYS) {
    return { text: days === 1 ? "עוד יום" : `עוד ${days} ימים`, tone: "expiring" };
  }
  return { text: "בתוקף", tone: "valid" };
}

async function ckanSearch(resourceId, filters, limit = 1) {
  const params = new URLSearchParams({
    resource_id: resourceId,
    filters: JSON.stringify(filters),
    limit: String(limit),
  });
  // AbortController + setTimeout במקום AbortSignal.timeout() כדי לתמוך גם
  // בדפדפנים ישנים יותר (לפני ~2022). ה-timer מבוטל תמיד ב-finally.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.success) throw new Error("CKAN request failed");
    return data?.result?.records || [];
  } finally {
    clearTimeout(timer);
  }
}

// שליפת מונה בלבד (total) לפי מסנן — limit=0 חוסך העברת רשומות.
// משמש לחישוב נפוצות הדגם ("כמה כאלה על הכביש")
async function ckanCount(resourceId, filters) {
  const params = new URLSearchParams({
    resource_id: resourceId,
    filters: JSON.stringify(filters),
    limit: "0",
    include_total: "true",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.success) throw new Error("CKAN request failed");
    const total = data?.result?.total;
    return typeof total === "number" ? total : null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- הצגת תוצאות ---------- */

// יצירת אלמנט בשורה אחת — כל התוכן מוזן דרך textContent (בטוח מ-XSS)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function showMessage(text, type) {
  statusEl.replaceChildren(el("p", `message ${type}`, text));
}

// כשל רשת: הודעת "אין אינטרנט" ברורה כשהדפדפן יודע שהוא לא-מקוון,
// אחרת הודעת שגיאת המאגר הרגילה
function networkErrorMessage() {
  return navigator.onLine === false ? MESSAGES.offline : MESSAGES.apiError;
}

function clearMessage() {
  statusEl.replaceChildren();
}

function hideResult() {
  resultCard.classList.add("hidden");
  resultBanner.classList.add("hidden");
  myCarCandidate = null;
  myCarBtn.classList.add("hidden");
  resultDetails.replaceChildren();
  resultSubtitle.classList.add("hidden");
  resultSubtitle.textContent = "";
  brandLogo.onload = null;
  brandLogo.removeAttribute("src");
  brandLogo.classList.add("hidden");
  const vehicleImg = vehicleImageBox.querySelector("img");
  vehicleImg.onload = null;
  vehicleImg.removeAttribute("src");
  vehicleImageBox.classList.add("hidden");
  for (const box of [renewalBox, timelineBox, historyBox, indicatorBox, safetyBox, permitBox, recallBox]) {
    box.classList.add("hidden");
    box.replaceChildren();
  }
  recallBox.classList.remove("recall-ok", "recall-unavailable");
  permitBox.classList.remove("permit-none");
}

function setBanner(banner) {
  resultBanner.replaceChildren();
  if (!banner) {
    resultBanner.classList.add("hidden");
    return;
  }
  resultBanner.className = `banner banner-${banner.tone}`;
  resultBanner.appendChild(el("strong", null, banner.title));
  if (banner.subtitle) {
    resultBanner.appendChild(el("span", null, banner.subtitle));
  }
}

/* ---------- הסברי שורות ("מה זה?") ----------
   מונחים מקצועיים מקבלים כפתור ⓘ ליד התווית; לחיצה פותחת הסבר קצר
   ושורת מקור — שקיפות על מקור כל נתון היא הבסיס לאמון בכלי. עובד במגע
   (בלי hover), נסגר בלחיצה חוזרת */

const SOURCE_MOT = "מאגר הרישוי, משרד התחבורה";
const SOURCE_WLTP = "טבלת נתוני הדגמים, משרד התחבורה";

const ROW_INFO = {
  "קבוצת זיהום": ["דירוג זיהום האוויר של הדגם בסולם 1 (נקי ביותר) עד 15 (מזהם ביותר). משפיע על גובה אגרת הרישוי.", SOURCE_MOT],
  "מספר שלדה": ["מספר הזיהוי הייחודי של הרכב (VIN) — מוטבע על השלדה ומלווה את הרכב כל חייו. כדאי לוודא שהוא תואם למוטבע ברכב עצמו.", SOURCE_MOT],
  "יצרן לפי מספר השלדה": ["קידומת מספר השלדה מזהה את היצרן באופן בלתי תלוי ברישום. אי-התאמה ליצרן הרשום עלולה להעיד על לוחית שהועתקה מרכב אחר או על שגיאת רישום.", "פענוח מקומי של קידומת ה-VIN (ללא שליחת נתונים)"],
  "רמת גימור": ["שם תצורת האבזור של הדגם כפי שנרשמה על ידי היבואן.", SOURCE_MOT],
  "דירוג צמיגים": ["העומס והמהירות המרביים המותרים לצמיג, מפוענחים מהקוד המוטבע על דופן הצמיג (תקן ETRTO).", "מאגר הרישוי (קובץ המשך), משרד התחבורה"],
  "מדד ירוק": ["ציון סביבתי משוקלל של הדגם — ככל שהמספר נמוך יותר, הרכב מזהם פחות.", SOURCE_WLTP],
  "קבוצת אגרת רישוי": ["קבוצת המחיר של אגרת הרישוי השנתית — נקבעת לפי מחיר הרכב ורמת הזיהום שלו.", SOURCE_WLTP],
  "ניקוד בטיחות": ["ניקוד מערכות הבטיחות המותקנות בדגם; ככל שגבוה יותר — אבזור הבטיחות עשיר יותר.", SOURCE_WLTP],
  "רמת אבזור בטיחותי": ["דירוג משרד התחבורה לאבזור הבטיחות של הדגם, בסולם 0 עד 8.", SOURCE_WLTP],
  "טכנולוגיית הנעה": ["סוג מערכת ההנעה: בנזין/דיזל רגיל, היברידי, פלאג-אין או חשמלי מלא.", SOURCE_WLTP],
  "כושר גרירה": ["המשקל המרבי המותר לגרירה עם גרור בעל בלמים, לפי אישור היצרן.", SOURCE_WLTP],
  "מחיר מחירון מקורי": ["מחיר המחירון של הדגם בעת עלייתו לכביש, לפי דיווח היבואן. אינו מחיר שוק נוכחי.", "מחירוני היבואנים, משרד התחבורה"],
  "כמה כאלה על הכביש": ["ספירה חיה של רכבים מאותו דגם במאגר הרכב הפעיל — אינדיקציה לנפוצות (חלפים וביקוש) או לנדירות.", SOURCE_MOT],
  "סיווג EU": ["קטגוריית הרישוי האירופית של הרכב (L לדו-גלגלי, M לנוסעים, N למסחרי).", SOURCE_MOT],
  "רישיון נדרש (משוער)": ["הערכה לפי נפח המנוע וההספק: A1 עד 125 סמ\"ק, A2 עד 47 כ\"ס, A מעל. הדרגה המחייבת היא זו שברישיון הרכב.", "חישוב מקומי לפי נפח והספק"],
};

function attachRowInfo(dt, dd) {
  const info = ROW_INFO[dt.textContent];
  if (!info) return;
  const button = el("button", "info-btn", "?");
  button.type = "button";
  button.setAttribute("aria-label", `מה זה ${dt.textContent}?`);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const existing = dd.querySelector(".row-note");
    if (existing) {
      existing.remove();
      button.setAttribute("aria-expanded", "false");
      return;
    }
    const note = el("div", "row-note");
    note.append(el("span", null, info[0]), el("span", "row-note-source", `מקור: ${info[1]}`));
    dd.appendChild(note);
    button.setAttribute("aria-expanded", "true");
  });
  dt.appendChild(button);
}

// opts: skip — לדלג על שורה ריקה במקום להציג "—"; ltr — ערך טכני (VIN וכד');
// badge — תג {text, tone} שמוצג ליד הערך
function appendDetailRow(label, value, opts = {}) {
  const empty = value == null || value === "";
  if (opts.skip && empty) return;
  const dd = el("dd", null, empty ? "—" : String(value));
  if (opts.ltr && !empty) dd.dir = "ltr";
  if (opts.badge && !empty) {
    dd.appendChild(el("span", `badge badge-${opts.badge.tone}`, opts.badge.text));
  }
  const dt = el("dt", null, label);
  attachRowInfo(dt, dd);
  resultDetails.append(dt, dd);
}

function renderCard({ plateDigits, title, banner, rows }) {
  resultPlate.textContent = formatPlate(plateDigits);
  resultTitle.textContent = title;
  setBanner(banner);
  resultDetails.replaceChildren();
  for (const [label, value, opts] of rows) {
    appendDetailRow(label, value, opts);
  }
  resetShareButton(plateDigits);
  resultCard.classList.remove("hidden");
}

function vehicleTitle(record) {
  const manufacturer = record.tozeret_nm || record.shilda_totzar_en_nm || "";
  const model = record.kinuy_mishari || record.degem_nm || record.sug_tzama_nm || "";
  return [manufacturer, model].filter(Boolean).join(" ");
}

function tireSizes(record) {
  const front = record.zmig_kidmi || record.mida_zmig_kidmi;
  const rear = record.zmig_ahori || record.mida_zmig_ahori;
  if (!front && !rear) return null;
  if (front && rear && front !== rear) return `${front} / ${rear}`;
  return front || rear;
}

/* ---------- מאגרים: שורות תצוגה לכל סוג רשומה ---------- */

function mainRegistryRows(record) {
  return [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.kinuy_mishari || record.degem_nm],
    ["רמת גימור", record.ramat_gimur, { skip: true }],
    ["שנת ייצור", record.shnat_yitzur],
    ["צבע", record.tzeva_rechev],
    ["סוג דלק", record.sug_delek_nm],
    ["בעלות", record.baalut],
    ["מספר שלדה", record.misgeret, { skip: true, ltr: true }],
    ["דגם מנוע", record.degem_manoa, { skip: true, ltr: true }],
    ["קבוצת זיהום", record.kvutzat_zihum, { skip: true }],
    ["מידת צמיגים", tireSizes(record), { skip: true, ltr: true }],
    ["עלה לכביש", formatMonthYear(record.moed_aliya_lakvish)],
    ["טסט אחרון", formatDate(record.mivchan_acharon_dt)],
    ["תוקף רישיון רכב", formatDate(record.tokef_dt), { badge: validityBadge(record.tokef_dt) }],
  ];
}

// דרגת רישיון נהיגה מוערכת לאופנוע לפי נפח והספק (כ"ס). ספי החוק בישראל:
// A1 עד 125 סמ"ק והספק עד 14.6 כ"ס; A2 הספק עד 47 כ"ס; A מעל זה.
// כשאין הספק אפשר להבחין רק לפי נפח — מוחזרת הערכה גסה
function motorcycleLicense(record) {
  const cc = Number(record.nefach_manoa);
  if (!Number.isFinite(cc) || cc <= 0) return null;
  const hp = Number(record.hespek);
  const hasHp = Number.isFinite(hp) && hp > 0;
  if (cc <= 125 && (!hasHp || hp <= 14.6)) return "A1";
  if (!hasHp) return "A2 ומעלה";
  if (hp <= 47) return "A2";
  return "A";
}

// דירוג צמיגים לאופנוע — שמות השדות שונים מרכב פרטי (zmig ולא tzmig)
function motorcycleTireRating(record) {
  const front = decodeTireCodes(record.kod_omes_zmig_kidmi, record.kod_mehirut_zmig_kidmi);
  const rear = decodeTireCodes(record.kod_omes_zmig_ahori, record.kod_mehirut_zmig_ahori);
  if (front && rear && front !== rear) return `קדמי: ${front} · אחורי: ${rear}`;
  return front || rear;
}

function motorcycleRows(record) {
  return [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.degem_nm],
    ["סוג רכב", record.sug_rechev_nm],
    ["סיווג EU", record.sug_rechev_EU_cd, { skip: true }],
    ["שנת ייצור", record.shnat_yitzur],
    ["ארץ ייצור", record.tozeret_eretz_nm, { skip: true }],
    ["נפח מנוע", withUnit(record.nefach_manoa, 'סמ"ק')],
    ["הספק", withUnit(record.hespek, 'כ"ס')],
    ["רישיון נדרש (משוער)", motorcycleLicense(record), { skip: true }],
    ["סוג דלק", record.sug_delek_nm],
    ["מספר מקומות", record.mispar_mekomot, { skip: true }],
    ["משקל כולל", withUnit(positiveNumber(record.mishkal_kolel), 'ק"ג'), { skip: true }],
    ["בעלות", record.baalut],
    ["מספר שלדה", record.misgeret, { skip: true, ltr: true }],
    ["מידת צמיגים", tireSizes(record), { skip: true, ltr: true }],
    ["דירוג צמיגים", motorcycleTireRating(record), { skip: true }],
    ["עלה לכביש", formatMonthYear(record.moed_aliya_lakvish)],
  ];
}

function personalImportRows(record) {
  return [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.degem_nm],
    ["סוג רכב", record.sug_rechev_nm],
    ["סוג יבוא", record.sug_yevu],
    ["שנת ייצור", record.shnat_yitzur],
    ["ארץ ייצור", record.tozeret_eretz_nm],
    ["נפח מנוע", withUnit(record.nefach_manoa, 'סמ"ק')],
    ["סוג דלק", record.sug_delek_nm],
    ["מספר שלדה", record.shilda, { skip: true, ltr: true }],
    ["דגם מנוע", record.degem_manoa, { skip: true, ltr: true }],
    ["משקל כולל", withUnit(record.mishkal_kolel, 'ק"ג'), { skip: true }],
    ["עלה לכביש", formatMonthYear(record.moed_aliya_lakvish)],
    ["טסט אחרון", formatDate(record.mivchan_acharon_dt)],
    ["תוקף רישיון רכב", formatDate(record.tokef_dt), { badge: validityBadge(record.tokef_dt) }],
  ];
}

function publicTransportRows(record) {
  const rows = [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.kinuy_mishari || record.degem_nm],
    ["סוג רכב", record.sug_rechev_nm],
    ["שנת ייצור", record.shnat_yitzur],
    ["צבע", record.tzeva_rechev, { skip: true }],
    ["משקל כולל", withUnit(record.mishkal_kolel, 'ק"ג'), { skip: true }],
    ["מספר מקומות", record.mispar_mekomot, { skip: true }],
    ["תוקף רישיון רכב", formatDate(record.tokef_dt), { badge: validityBadge(record.tokef_dt) }],
  ];
  if (record.bitul_nm) {
    const when = formatDate(record.bitul_dt);
    rows.push(["סטטוס רישום", when ? `${record.bitul_nm} (${when})` : record.bitul_nm]);
  }
  return rows;
}

function inactiveOldRows(record) {
  return [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.degem_nm],
    ["שנת ייצור", record.shnat_yitzur],
    ["ארץ ייצור", record.tozeret_eretz_nm],
    ["סוג דלק", record.sug_delek_nm],
    ["נפח מנוע", withUnit(record.nefach_manoa, 'סמ"ק')],
    ["דגם מנוע", record.degem_manoa, { skip: true, ltr: true }],
    ["מספר שלדה", record.mispar_shilda, { skip: true, ltr: true }],
    ["משקל כולל", withUnit(record.mishkal_kolel, 'ק"ג')],
  ];
}

function heavyTruckRows(record) {
  return [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.degem_nm],
    ["סוג רכב", record.kvutzat_sug_rechev, { skip: true }],
    ["שנת ייצור", record.shnat_yitzur],
    ["ארץ ייצור", record.tozeret_eretz_nm, { skip: true }],
    ["סוג דלק", record.sug_delek_nm],
    ["נפח מנוע", withUnit(positiveNumber(record.nefach_manoa), 'סמ"ק'), { skip: true }],
    ["דגם מנוע", record.degem_manoa, { skip: true, ltr: true }],
    ["מספר שלדה", record.mispar_shilda, { skip: true, ltr: true }],
    ["הנעה", record.hanaa_nm, { skip: true }],
    ["משקל כולל", withUnit(positiveNumber(record.mishkal_kolel), 'ק"ג'), { skip: true }],
    ["משקל עצמי", withUnit(positiveNumber(record.mishkal_azmi), 'ק"ג'), { skip: true }],
    ["מקומות ליד הנהג", record.mispar_mekomot_leyd_nahag, { skip: true }],
    ["וו גרירה", record.grira_nm, { skip: true }],
    ["מידת צמיגים", tireSizes(record), { skip: true, ltr: true }],
    ["עלה לכביש", formatMonthYear(record.moed_aliya_lakvish), { skip: true }],
  ];
}

function cancelledRows(record) {
  return [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.kinuy_mishari || record.degem_nm],
    ["סוג רכב", record.sug_rechev_nm, { skip: true }],
    ["רמת גימור", record.ramat_gimur, { skip: true }],
    ["שנת ייצור", record.shnat_yitzur],
    ["צבע", record.tzeva_rechev, { skip: true }],
    ["סוג דלק", record.sug_delek_nm, { skip: true }],
    ["בעלות אחרונה", record.baalut, { skip: true }],
    ["מספר שלדה", record.misgeret, { skip: true, ltr: true }],
    ["דגם מנוע", record.degem_manoa, { skip: true, ltr: true }],
    ["משקל כולל", withUnit(positiveNumber(record.mishkal_kolel), 'ק"ג'), { skip: true }],
    ["מידת צמיגים", tireSizes(record), { skip: true, ltr: true }],
    ["עלה לכביש", formatMonthYear(record.moed_aliya_lakvish), { skip: true }],
    ["תאריך ביטול", formatDate(record.bitul_dt)],
  ];
}

function cancelledBanner(record) {
  const when = formatDate(record.bitul_dt);
  return {
    tone: "error",
    title: "הרכב בוטל סופית",
    subtitle: when
      ? `רישום הרכב בוטל לצמיתות במשרד התחבורה בתאריך ${when}`
      : "רישום הרכב בוטל לצמיתות במשרד התחבורה",
  };
}

// כלי צמ"ה (ציוד מכני הנדסי) — מלגזות, מנופים, טרקטורים. מאגר נפרד
// עם מפתח משלו (mispar_tzama) ושדות ייחודיים (כושר הרמה, מגבלות)
function constructionEquipmentRows(record) {
  const restrictions = [record.hagbala_nm_1, record.hagbala_nm_2, record.hagbala_nm_3, record.hagbala_nm_4]
    .map((x) => (x || "").trim())
    .filter(Boolean)
    .join(", ");
  return [
    ["סוג כלי", record.sug_tzama_nm],
    ["יצרן", record.shilda_totzar_en_nm, { skip: true, ltr: true }],
    ["דגם", record.degem_nm, { skip: true, ltr: true }],
    ["שנת ייצור", record.shnat_yitzur],
    ["הנעה", record.hanaa_nm, { skip: true }],
    ["הספק", withUnit(positiveNumber(record.koah_sus), 'כ"ס'), { skip: true }],
    ["כושר הרמה", withUnit(positiveNumber(record.kosher_harama_ton), "טון"), { skip: true }],
    ["משקל עצמי", withUnit(positiveNumber(record.mishkal_ton), "טון"), { skip: true }],
    ["משקל כולל", withUnit(positiveNumber(record.mishkal_kolel_ton), "טון"), { skip: true }],
    ["מספר שלדה", record.mispar_shilda, { skip: true, ltr: true }],
    ["תאריך רישום", formatDate(record.rishum_date), { skip: true }],
    ["מגבלות", restrictions, { skip: true }],
  ];
}

// מאגרי ארכיון הביטולים שומרים את מספר הרכב כטקסט עם אפסים מובילים
// (למשל "04252235") — סינון מספרי נכשל שם, חובה מחרוזת בת 8 תווים
function paddedPlateFilters(digits) {
  return { mispar_rechev: digits.padStart(8, "0") };
}

// שרשרת הגיבוי לפי סדר עדיפות — הראשון שמחזיר רשומה קובע.
// banner יכול להיות פונקציה של הרשומה, filters פונקציה של הספרות שהוקלדו
const FALLBACK_CHAIN = [
  {
    resourceId: RESOURCES.inactive,
    banner: {
      tone: "warn",
      title: "הרכב ירד מהכביש",
      subtitle: "הרכב מופיע במאגר כלי הרכב הלא פעילים של משרד התחבורה",
    },
    rows: mainRegistryRows,
    enrich: { wltp: true, priceList: true, recalls: true },
  },
  {
    resourceId: RESOURCES.motorcycles,
    banner: {
      tone: "info",
      title: "רכב דו-גלגלי",
      subtitle: "הרכב מופיע במאגר האופנועים והקטנועים",
    },
    rows: motorcycleRows,
    enrich: { recalls: true },
  },
  {
    resourceId: RESOURCES.personalImport,
    banner: {
      tone: "info",
      title: "יבוא אישי",
      subtitle: "הרכב נרשם בישראל בהליך של יבוא אישי",
    },
    rows: personalImportRows,
    enrich: { recalls: true, renewal: true },
  },
  {
    resourceId: RESOURCES.publicTransport,
    banner: {
      tone: "info",
      title: "רכב ציבורי",
      subtitle: "הרכב מופיע במאגר כלי הרכב הציבוריים (אוטובוסים ומוניות)",
    },
    rows: publicTransportRows,
    enrich: { wltp: true, priceList: true, recalls: true, busFleet: true },
  },
  {
    resourceId: RESOURCES.heavyTrucks,
    banner: {
      tone: "info",
      title: "רכב כבד",
      subtitle: "הרכב מופיע במאגר כלי הרכב שמעל 3.5 טון (משאיות ורכבי אספנות ותיקים)",
    },
    rows: heavyTruckRows,
    enrich: { recalls: true },
  },
  {
    resourceId: RESOURCES.cancelledFinal,
    banner: cancelledBanner,
    rows: cancelledRows,
    enrich: { wltp: true, priceList: true, recalls: true },
  },
  {
    resourceId: RESOURCES.cancelledArchive2010,
    filters: paddedPlateFilters,
    banner: cancelledBanner,
    rows: cancelledRows,
    enrich: { recalls: true },
  },
  {
    resourceId: RESOURCES.cancelledArchive2000,
    filters: paddedPlateFilters,
    banner: cancelledBanner,
    rows: cancelledRows,
    enrich: { recalls: true },
  },
  {
    resourceId: RESOURCES.inactiveOld,
    banner: {
      tone: "warn",
      title: "הרכב ירד מהכביש",
      subtitle: "נמצאה רשומה חלקית במאגר כלי רכב לא פעילים (ללא קוד דגם)",
    },
    rows: inactiveOldRows,
    enrich: { recalls: true },
  },
  {
    // מפתח שונה (mispar_tzama) ומרחב מספור נפרד — לכן אין להריץ העשרות
    // לפי mispar_rechev (ריקול / תו חניה / היסטוריה), כדי לא להצליב בטעות
    // עם רכב אחר שמספר הרישוי שלו זהה
    resourceId: RESOURCES.constructionEquipment,
    filters: (digits) => ({ mispar_tzama: parseInt(digits, 10) }),
    banner: {
      tone: "info",
      title: 'כלי צמ"ה',
      subtitle: 'הרכב מופיע במאגר כלי הצמ"ה (ציוד מכני הנדסי — מלגזות, מנופים, טרקטורים)',
    },
    rows: constructionEquipmentRows,
    enrich: { plateKeyed: false, constructionPollution: true },
  },
];

/* ---------- תמונת הדגם (ויקיפדיה) ----------
   תמונה מייצגת של הדגם מוויקיפדיה האנגלית — API חופשי, ללא מפתח, תומך
   CORS. פרטיות: לוויקיפדיה נשלח שם הדגם בלבד, לעולם לא מספר הרישוי.
   התמונה להמחשה בלבד (עשויה להציג דור/צבע אחרים) ומסומנת ככזו.
   כל כשל או ספק = פשוט אין תמונה — לעולם לא תמונה שגויה */

const WIKI_API = "https://en.wikipedia.org/w/api.php";

// מילון יצרנים עברית→אנגלית לפי האיות בפועל במאגר (שדה tozeret_nm מתחיל
// בשם היצרן ואחריו ארץ ייצור). ההתאמה לפי הקידומת הארוכה ביותר
const MAKER_EN = {
  "אאודי": "Audi", "אודי": "Audi", "אופל": "Opel", "איווקו": "Iveco",
  "איסוזו": "Isuzu", "אינפיניטי": "Infiniti", "אלפא רומיאו": "Alfa Romeo",
  "אסטון מרטין": "Aston Martin", "אקספנג": "XPeng", "אומודה": "Omoda",
  "ב מ וו": "BMW", "בי ווי די": "BYD", "ביואיק": "Buick", "בנטלי": "Bentley",
  "ג'יפ": "Jeep", "גיפ": "Jeep", "גילי": "Geely", "גרייט וול": "Great Wall",
  "דאציה": "Dacia", "דודג'": "Dodge", "דונגפנג": "Dongfeng", "דייהטסו": "Daihatsu",
  "הונדה": "Honda", "וולבו": "Volvo", "זיקר": "Zeekr", "טויוטה": "Toyota",
  "טסלה": "Tesla", "יגואר": "Jaguar", "יונדאי": "Hyundai", "לוטוס": "Lotus",
  "לינק אנד קו": "Lynk & Co", "לינקולן": "Lincoln", "ליפמוטור": "Leapmotor",
  "למבורגיני": "Lamborghini", "לנדרובר": "Land Rover", "לקסוס": "Lexus",
  "מ.ג": "MG", "מאן": "MAN", "מזארטי": "Maserati", "מזדה": "Mazda",
  "מיני": "Mini", "מיצובישי": "Mitsubishi", "מקלארין": "McLaren",
  "מקסוס": "Maxus", "מרצדס": "Mercedes-Benz", "ניאו": "NIO", "ניסאן": "Nissan",
  "מרוטי-סוזוקי": "Suzuki",
  "סאאב": "Saab", "סאנגיונג": "SsangYong", "סובארו": "Subaru", "סוזוקי": "Suzuki",
  "סיאט": "SEAT", "סיטרואן": "Citroen", "סמארט": "Smart", "סקודה": "Skoda",
  "פולסטאר": "Polestar", "פולקסווגן": "Volkswagen", "פורד": "Ford",
  "פורשה": "Porsche", "פיאג'ו": "Piaggio", "פיאט": "Fiat", "פיג'ו": "Peugeot",
  "פיגו": "Peugeot", "פרארי": "Ferrari", "צ'רי": "Chery", "קאדילאק": "Cadillac",
  "קופרה": "Cupra", "קיה": "Kia", "קרייזלר": "Chrysler", "רובר": "Rover",
  "רולס-רויס": "Rolls-Royce", "רנו": "Renault", "שברולט": "Chevrolet",
  // יצרני דו-גלגלי (לפי האיות בפועל במאגר האופנועים)
  "ימהה": "Yamaha", "קוואסאקי": "Kawasaki", "אפריליה": "Aprilia",
  "טריומף": "Triumph", "בנלי": "Benelli",
};

function makerEnglish(tozeretNm) {
  const name = String(tozeretNm || "").trim();
  let best = null;
  for (const [he, en] of Object.entries(MAKER_EN)) {
    if (name.startsWith(he) && (!best || he.length > best.length)) {
      best = he;
    }
  }
  return best ? MAKER_EN[best] : null;
}

/* ---------- לוגו היצרן ----------
   סמל היצרן מוצג בכותרת הכרטיס. הקבצים שמורים בריפו עצמו (תיקיית logos/‏,
   מתוך car-logos-dataset) — נטענים מאותו origin, בלי בקשה לשרת חיצוני
   ובלי לשלוח לאף גורם מה חיפשנו. שם הקובץ נגזר מהשם האנגלי של היצרן;
   יצרן בלי קובץ לוגו (יצרני דו-גלגלי וכד') פשוט אינו מציג לוגו */

const BRAND_LOGO_SLUGS = new Set([
  "alfa-romeo", "aston-martin", "audi", "bentley", "bmw", "buick", "byd",
  "cadillac", "chery", "chevrolet", "chrysler", "citroen", "cupra", "dacia",
  "daihatsu", "dodge", "dongfeng", "ferrari", "fiat", "ford", "geely",
  "great-wall", "honda", "hyundai", "infiniti", "isuzu", "iveco", "jaguar",
  "jeep", "kia", "lamborghini", "land-rover", "leapmotor", "lexus", "lincoln",
  "lotus", "lynk-and-co", "man", "maserati", "maxus", "mazda", "mclaren",
  "mercedes-benz", "mg", "mini", "mitsubishi", "nio", "nissan", "omoda",
  "opel", "peugeot", "polestar", "porsche", "renault", "rolls-royce", "rover",
  "saab", "seat", "skoda", "smart", "ssangyong", "subaru", "suzuki", "tesla",
  "toyota", "volkswagen", "volvo", "xpeng", "zeekr",
]);

function brandLogoPath(enBrand) {
  if (!enBrand) return null;
  const slug = String(enBrand)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return BRAND_LOGO_SLUGS.has(slug) ? `logos/${slug}.png` : null;
}

function renderBrandLogo(record) {
  // כלי צמ"ה שומר את שם היצרן באנגלית בשדה נפרד (shilda_totzar_en_nm) —
  // כך מלגזת TOYOTA או VOLVO מקבלת את הלוגו הנכון. התאמה חלקית אינה
  // אפשרית: רק שם שנגזר בדיוק לקובץ קיים מציג לוגו
  const enBrand = makerEnglish(record.tozeret_nm) || record.shilda_totzar_en_nm;
  const path = brandLogoPath(enBrand);
  if (!path) return;
  // הלוגו נחשף רק אחרי שנטען בפועל — קובץ חסר לא משאיר אייקון שבור.
  // הלוגו דקורטיבי (שם היצרן ממילא כתוב בכותרת), ולכן alt ריק
  brandLogo.onload = () => brandLogo.classList.remove("hidden");
  brandLogo.src = path;
}

/* ---------- זיהוי יצרן לפי מספר השלדה (VIN) ----------
   שלושת התווים הראשונים במספר שלדה תקני (WMI) מזהים את היצרן — פענוח
   סטטי, ללא בקשת רשת. הצלבה מול היצרן הרשום במאגר: אי-התאמה היא דגל
   אדום (רכב "משוכפל" הנושא לוחית של רכב אחר, או שגיאת רישום), בדיוק מה
   שבדיקה לפני קנייה נועדה לתפוס.
   זהירות מובנית: WMI לא מוכר או יצרן רשום לא מזוהה = אין שורה ואין
   התרעה — לעולם לא מתריעים על סמך "לא יודע". מדינת הייצור אינה מוצגת
   ואינה מוצלבת: יצרנים אירופיים חותמים WMI של מדינת האם גם במפעלים
   אחרים (WF0 לפורד ספרד/טורקיה), והמדינה ממילא כתובה ב-tozeret_nm */

// הקידומות שוקפו מול שלדות אמיתיות במאגר (דגימה לכל יצרן, 2026-07-18).
// הערך: [שם תצוגה, שם היצרן באנגלית להצלבה מול MAKER_EN]
const WMI_MAKERS = {
  // יפן — קידומות דו-תוויות רק כשכל הטווח שייך ליצרן אחד
  JT: ["טויוטה / לקסוס", "Toyota"], JH: ["הונדה", "Honda"],
  JN: ["ניסאן / אינפיניטי", "Nissan"], JS: ["סוזוקי", "Suzuki"],
  JMZ: ["מזדה", "Mazda"], JM1: ["מזדה", "Mazda"], JM6: ["מזדה", "Mazda"],
  JM7: ["מזדה", "Mazda"],
  JMB: ["מיצובישי", "Mitsubishi"], JMY: ["מיצובישי", "Mitsubishi"],
  JA3: ["מיצובישי", "Mitsubishi"], JA4: ["מיצובישי", "Mitsubishi"],
  JF1: ["סובארו", "Subaru"], JF2: ["סובארו", "Subaru"],
  JDA: ["דייהטסו", "Daihatsu"],
  JAA: ["איסוזו", "Isuzu"], JAC: ["איסוזו", "Isuzu"], JAL: ["איסוזו", "Isuzu"],
  JYA: ["ימהה", "Yamaha"], JKA: ["קוואסאקי", "Kawasaki"], JKB: ["קוואסאקי", "Kawasaki"],
  // דרום קוריאה
  KMH: ["יונדאי", "Hyundai"], KM8: ["יונדאי", "Hyundai"], KMF: ["יונדאי", "Hyundai"],
  KMJ: ["יונדאי", "Hyundai"], KMT: ["יונדאי / ג'נסיס", "Hyundai"], KMU: ["יונדאי / ג'נסיס", "Hyundai"],
  KNA: ["קיה", "Kia"], KNC: ["קיה", "Kia"], KND: ["קיה", "Kia"], KNE: ["קיה", "Kia"],
  KNM: ["רנו", "Renault"],
  KPT: ["סאנגיונג", "SsangYong"], KPA: ["סאנגיונג", "SsangYong"],
  KL: ["שברולט / GM", "Chevrolet"],
  // סין
  LRW: ["טסלה", "Tesla"], LGX: ["בי ווי די", "BYD"], LC0: ["בי ווי די", "BYD"],
  LNN: ["צ'רי / אומודה", "Chery"], LVT: ["צ'רי / אומודה", "Chery"],
  LVU: ["צ'רי / אומודה", "Chery"], LVV: ["צ'רי / אומודה", "Chery"],
  LSJ: ["MG", "MG"], LSK: ["מקסוס", "Maxus"], LSH: ["מקסוס", "Maxus"], LSF: ["מקסוס", "Maxus"],
  LB3: ["קבוצת ג'ילי", "Geely"], L6T: ["קבוצת ג'ילי", "Geely"],
  LGW: ["גרייט וול", "Great Wall"], LFZ: ["ליפמוטור", "Leapmotor"],
  L1N: ["אקספנג", "XPeng"], LJ1: ["ניאו", "NIO"], HJN: ["ניאו", "NIO"],
  LDP: ["דונגפנג", "Dongfeng"], LVY: ["וולבו", "Volvo"], LHG: ["הונדה", "Honda"],
  LC6: ["סוזוקי", "Suzuki"], LC2: ["קימקו", "Kymco"], YSM: ["פולסטאר", "Polestar"],
  HES: ["סמארט", "Smart"],
  // גרמניה
  WVW: ["פולקסווגן", "Volkswagen"], WVG: ["פולקסווגן", "Volkswagen"],
  WV1: ["פולקסווגן", "Volkswagen"], WV2: ["פולקסווגן", "Volkswagen"],
  WAU: ["אאודי", "Audi"], WUA: ["אאודי", "Audi"],
  WB: ["ב.מ.וו", "BMW"], WMW: ["מיני", "Mini"],
  WDB: ["מרצדס", "Mercedes-Benz"], WDC: ["מרצדס", "Mercedes-Benz"],
  WDD: ["מרצדס", "Mercedes-Benz"], WDF: ["מרצדס", "Mercedes-Benz"],
  W1K: ["מרצדס", "Mercedes-Benz"], W1N: ["מרצדס", "Mercedes-Benz"],
  W1V: ["מרצדס", "Mercedes-Benz"], W1Y: ["מרצדס", "Mercedes-Benz"],
  W1A: ["מרצדס / סמארט", "Mercedes-Benz"], WME: ["סמארט", "Smart"],
  WP0: ["פורשה", "Porsche"], WP1: ["פורשה", "Porsche"],
  W0L: ["אופל", "Opel"], W0V: ["אופל", "Opel"], VXK: ["אופל", "Opel"],
  WF0: ["פורד", "Ford"], WMA: ["מאן", "MAN"],
  // צרפת
  VF1: ["רנו", "Renault"], VF6: ["רנו", "Renault"], VNV: ["ניסאן / רנו", "Nissan"],
  VF3: ["פיג'ו", "Peugeot"], VR3: ["פיג'ו", "Peugeot"],
  VF7: ["סיטרואן", "Citroen"], VR7: ["סיטרואן", "Citroen"], VR1: ["סיטרואן / DS", "Citroen"],
  VNK: ["טויוטה", "Toyota"], VG5: ["ימהה", "Yamaha"],
  // איטליה
  ZFA: ["פיאט", "Fiat"], ZAR: ["אלפא רומיאו", "Alfa Romeo"], ZAA: ["אלפא רומיאו", "Alfa Romeo"],
  ZAC: ["ג'יפ", "Jeep"], ZFF: ["פרארי", "Ferrari"], ZAM: ["מזראטי", "Maserati"],
  ZHW: ["למבורגיני", "Lamborghini"], ZCF: ["איווקו", "Iveco"],
  ZAP: ["פיאג'ו", "Piaggio"], ZDC: ["הונדה", "Honda"], ZDM: ["דוקאטי", "Ducati"],
  ZD4: ["אפריליה", "Aprilia"], ZBN: ["בנלי", "Benelli"],
  // ספרד
  VSS: ["סיאט / קופרה", "SEAT"], VSK: ["ניסאן", "Nissan"],
  // בריטניה
  SAJ: ["יגואר", "Jaguar"], SAD: ["יגואר", "Jaguar"], SAL: ["לנד רובר", "Land Rover"],
  SAR: ["רובר", "Rover"], SB1: ["טויוטה", "Toyota"],
  SHS: ["הונדה", "Honda"], SHH: ["הונדה", "Honda"], SJN: ["ניסאן", "Nissan"],
  SCA: ["רולס-רויס", "Rolls-Royce"], SCB: ["בנטלי", "Bentley"], SCC: ["לוטוס", "Lotus"],
  SMT: ["טריומף", "Triumph"],
  // מרכז אירופה וטורקיה
  TMB: ["סקודה", "Skoda"], TMA: ["יונדאי", "Hyundai"], TSM: ["סוזוקי", "Suzuki"],
  U5Y: ["קיה", "Kia"], U6Y: ["קיה", "Kia"], UU1: ["דאציה", "Dacia"],
  NMT: ["טויוטה", "Toyota"], NM0: ["פורד", "Ford"], NM4: ["פיאט", "Fiat"],
  NLH: ["יונדאי", "Hyundai"], NLA: ["הונדה", "Honda"],
  // סקנדינביה והולנד
  YV1: ["וולבו", "Volvo"], YV2: ["וולבו", "Volvo"], YV3: ["וולבו", "Volvo"],
  YV4: ["וולבו", "Volvo"], YS3: ["סאאב", "Saab"],
  YS2: ["סקאניה", "Scania"], YS4: ["סקאניה", "Scania"], XLR: ["DAF", "DAF"],
  // אוסטריה
  VBK: ["KTM", "KTM"],
  // צפון אמריקה
  "1FA": ["פורד", "Ford"], "1FM": ["פורד", "Ford"], "1FT": ["פורד", "Ford"],
  "1FD": ["פורד", "Ford"], "2FM": ["פורד", "Ford"], "3FA": ["פורד", "Ford"],
  "1G": ["שברולט / GM", "Chevrolet"], "2G": ["שברולט / GM", "Chevrolet"], "3G": ["שברולט / GM", "Chevrolet"],
  "1C3": ["קרייזלר / ג'יפ / דודג'", "Chrysler"], "1C4": ["קרייזלר / ג'יפ / דודג'", "Chrysler"],
  "1C6": ["קרייזלר / ג'יפ / דודג'", "Chrysler"], "2C3": ["קרייזלר / ג'יפ / דודג'", "Chrysler"],
  "1J4": ["ג'יפ", "Jeep"], "1J8": ["ג'יפ", "Jeep"],
  "3N1": ["ניסאן", "Nissan"], "3N6": ["ניסאן", "Nissan"], "3N8": ["ניסאן", "Nissan"],
  "3VW": ["פולקסווגן", "Volkswagen"], "3KP": ["קיה", "Kia"],
  "5UX": ["ב.מ.וו", "BMW"], "5YM": ["ב.מ.וו", "BMW"], "4US": ["ב.מ.וו", "BMW"],
  "5YJ": ["טסלה", "Tesla"], "7SA": ["טסלה", "Tesla"], XP7: ["טסלה", "Tesla"],
  "1HG": ["הונדה", "Honda"], "1HF": ["הונדה", "Honda"], "1HD": ["הארלי דיווידסון", "Harley-Davidson"],
  // אסיה (מחוץ ליפן/סין) ואפריקה
  MR0: ["טויוטה", "Toyota"], AHT: ["טויוטה", "Toyota"], AFA: ["פורד", "Ford"],
  MPA: ["איסוזו", "Isuzu"], MNB: ["פורד", "Ford"],
  MMB: ["מיצובישי", "Mitsubishi"], MMC: ["מיצובישי", "Mitsubishi"], MMT: ["מיצובישי", "Mitsubishi"],
  MAL: ["יונדאי", "Hyundai"], MDH: ["ניסאן", "Nissan"],
  MA3: ["סוזוקי", "Suzuki"], MB8: ["סוזוקי", "Suzuki"], MAK: ["הונדה", "Honda"],
  MLH: ["הונדה", "Honda"], RLH: ["הונדה", "Honda"], ML5: ["קוואסאקי", "Kawasaki"],
  MH3: ["ימהה", "Yamaha"], RP8: ["אפריליה / פיאג'ו", "Piaggio"], MET: ["אפריליה", "Aprilia"],
  RFB: ["קימקו", "Kymco"],
};

// קבוצות יצרנים: מותגים מאותו קונצרן חולקים מפעלים ופלטפורמות (רכב
// ממותג-מחדש נושא WMI של המותג הבונה), ולכן התאמה נבדקת ברמת הקבוצה —
// מותג שאינו ברשימה הוא קבוצה של עצמו. עדיף לפספס זיוף נדיר מאשר
// להתריע לשווא על רכב כשר
const BRAND_GROUP = {
  Lexus: "Toyota", Daihatsu: "Toyota",
  Audi: "Volkswagen", SEAT: "Volkswagen", Cupra: "Volkswagen", Skoda: "Volkswagen",
  Porsche: "Volkswagen", Bentley: "Volkswagen", Lamborghini: "Volkswagen", MAN: "Volkswagen",
  "Alfa Romeo": "Fiat", Peugeot: "Fiat", Citroen: "Fiat", Opel: "Fiat",
  Jeep: "Fiat", Dodge: "Fiat", Chrysler: "Fiat", Maserati: "Fiat",
  Dacia: "Renault", Nissan: "Renault", Infiniti: "Renault", Mitsubishi: "Renault",
  Kia: "Hyundai",
  Buick: "Chevrolet", Cadillac: "Chevrolet",
  Mini: "BMW", "Rolls-Royce": "BMW",
  Smart: "Mercedes-Benz",
  Volvo: "Geely", Polestar: "Geely", "Lynk & Co": "Geely", Zeekr: "Geely", Lotus: "Geely",
  Lincoln: "Ford",
  Omoda: "Chery", Maxus: "MG",
  "Land Rover": "Jaguar",
  Aprilia: "Piaggio",
};

function brandGroup(enBrand) {
  return BRAND_GROUP[enBrand] || enBrand;
}

// מספר שלדה תקני: 17 תווים חוקיים (ללא I/O/Q). שלדות ישנות מאוחסנות
// לעתים עם מקף (מזדה: "JMZBG12E5-V0866477") — מסירים מקפים ורווחים.
// שלדה קצרה/לא-תקנית מוחזרת null — אין WMI אמין לפענח
function normalizedVin(record) {
  const raw = String(record.misgeret || record.shilda || record.mispar_shilda || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(raw) ? raw : null;
}

function decodeWmi(vin) {
  return WMI_MAKERS[vin.slice(0, 3)] || WMI_MAKERS[vin.slice(0, 2)] || null;
}

// שורת "יצרן לפי מספר השלדה" + הצלבה מול היצרן הרשום. סינכרוני לחלוטין.
// שלוש תוצאות: תואם (תג ירוק), לא תואם (תג אדום + צ'יפ אזהרה בשורת
// התמצית), או יצרן רשום לא מזוהה (שורת מידע בלבד, ללא תג)
function renderVinCheck(record) {
  const vin = normalizedVin(record);
  if (!vin) return;
  const decoded = decodeWmi(vin);
  if (!decoded) return;
  const [displayName, enBrand] = decoded;
  const registryBrand = makerEnglish(record.tozeret_nm);
  let badge = null;
  if (registryBrand) {
    if (brandGroup(registryBrand) === brandGroup(enBrand)) {
      badge = { text: "תואם ליצרן הרשום", tone: "valid" };
    } else {
      badge = { text: "לא תואם ליצרן הרשום", tone: "expired" };
    }
  }
  appendDetailRow("יצרן לפי מספר השלדה", displayName, badge ? { badge } : {});
}

// נירמול להשוואת כותרות: הסרת ניקוד/סימנים (Škoda → skoda) והשארת
// אותיות וספרות לטיניות בלבד
function normalizeForMatch(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// credit (אופציונלי): ייחוס לתמונה מקומית — {c: צלם, l: רישיון, d: קישור
// לעמוד הקובץ}. רישיונות CC מחייבים ציון היוצר והרישיון, ולכן הכיתוב
// מוחלף בשורת ייחוס מקושרת; בלי credit מוצג הכיתוב הכללי של ויקיפדיה
function showVehicleImage(src, title, articleUrl, credit) {
  const img = vehicleImageBox.querySelector("img");
  const link = vehicleImageBox.querySelector("a");
  const caption = vehicleImageBox.querySelector("figcaption");
  // התמונה נחשפת רק אחרי שנטענה בפועל — בלי מסגרת ריקה או אייקון שבור
  img.onload = () => vehicleImageBox.classList.remove("hidden");
  img.alt = `תמונה להמחשה: ${title}`;
  if (articleUrl) link.href = articleUrl;
  caption.replaceChildren();
  if (credit) {
    caption.append("תמונה להמחשה בלבד · ");
    const creditLink = el("a", null, `צילום: ${credit.c} · ${credit.l}`);
    creditLink.href = credit.d;
    creditLink.target = "_blank";
    creditLink.rel = "noopener";
    caption.appendChild(creditLink);
  } else {
    caption.textContent = "תמונה להמחשה בלבד · מתוך ויקיפדיה";
  }
  img.src = src;
}

/* תמונות הדגמים הנפוצים שמורות בריפו עצמו (model-images/‏, ~150 דגמים
   שמכסים כ-60% מהרכבים בכביש) — נטענות מאותו origin בלי לשלוח את שם
   הדגם לאף שרת חיצוני, עובדות גם ללא רשת, והייחוס (צלם + רישיון) שמור
   לצדן באינדקס. דגם שאינו באינדקס ממשיך למסלול ויקיפדיה הרגיל */
let modelImageIndexPromise = null;
function loadModelImageIndex() {
  // כשל בטעינה (רשת רגעית/לא-מקוון) אינו נשמר במטמון — הפרומיס מאופס
  // כדי שהחיפוש הבא ינסה לטעון את האינדקס מחדש
  modelImageIndexPromise ||= fetch("model-images/index.json")
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .catch(() => {
      modelImageIndexPromise = null;
      return null;
    });
  return modelImageIndexPromise;
}

async function fetchVehicleImage(record, guard) {
  const kinuy = String(record.kinuy_mishari || "").trim();
  const make = makerEnglish(record.tozeret_nm);
  const normKinuy = normalizeForMatch(kinuy);
  if (!normKinuy) return;

  // קודם האינדקס המקומי — התאמה מדויקת לפי יצרן+כינוי
  const index = await loadModelImageIndex();
  const local = index ? index[`${make}|${normKinuy}`] : null;
  if (local) {
    guard(() => showVehicleImage(`model-images/${local.f}`, local.t, local.a, local))();
    return;
  }

  // בלי יצרן מזוהה — שאילתה רק כשהכינוי ייחודי דיו (לא "3" וכד')
  if (!make && normKinuy.length < 4) return;

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: make ? `${make} ${kinuy}` : kinuy,
    gsrlimit: "1",
    prop: "pageimages|info",
    piprop: "thumbnail",
    pithumbsize: "480",
    inprop: "url",
    format: "json",
    origin: "*",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${WIKI_API}?${params}`, { signal: controller.signal });
    if (!response.ok) return;
    const data = await response.json();
    const page = Object.values(data?.query?.pages || {})[0];
    if (!page?.thumbnail?.source) return;
    // שומר בטיחות: כותרת הערך חייבת להכיל את שם הדגם (ואת היצרן, כשידוע) —
    // אחרת התוצאה היא כנראה ערך היצרן או ערך לא קשור, ועדיף בלי תמונה
    const normTitle = normalizeForMatch(page.title);
    if (!normTitle.includes(normKinuy)) return;
    if (make && !normTitle.includes(normalizeForMatch(make))) return;
    guard(() => showVehicleImage(page.thumbnail.source, page.title, page.fullurl))();
  } catch {
    // אין רשת / חריגה מהזמן — פשוט בלי תמונה
  } finally {
    clearTimeout(timer);
  }
}

// שורת סיפור קצרה מתחת לכותרת: גיל הרכב וסוג הבעלות במשפט אחד
function renderStory(record) {
  const parts = [];
  const year = Number(record.shnat_yitzur);
  if (Number.isFinite(year) && year > 1900) {
    const age = new Date().getFullYear() - year;
    if (age <= 0) parts.push(`שנת ${year}`);
    else if (age === 1) parts.push("בן שנה");
    else parts.push(`בן ${age} שנים`);
  }
  if (record.baalut) parts.push(`בעלות: ${record.baalut}`);
  if (!parts.length) return;
  resultSubtitle.textContent = parts.join(" · ");
  resultSubtitle.classList.remove("hidden");
}

/* ---------- סיפור הרכב — ציר זמן ----------
   ביוגרפיה כרונולוגית של הרכב מנתונים שכבר נשלפים: עלה לכביש, החלפות
   בעלות (יד 1, יד 2...), קריאות ריקול, הטסט האחרון (עם מד האוץ), סמן
   "היום", ותוקף הרישיון כאירוע עתידי. אירועים מסונכרנים מגיעים מיד,
   והשאר מצטרפים כשתשובות ההעשרה חוזרות — הציר ממוין מחדש בכל תוספת.
   הציר מוצג רק כשיש לפחות שני אירועים מתוארכים */

let timelineEvents = [];
let timelineSeq = 0;

function prepareTimeline() {
  timelineEvents = [];
  timelineBox.replaceChildren();
  timelineBox.classList.add("hidden");
}

// תאריכי המאגרים מגיעים בארבע צורות: ISO מלא ("2022-10-24 ..."),
// שנה-חודש ("2011-6"), מספר שלם YYYYMM (202210), ושנה בלבד (מאגר
// הביטולים). יום חסר ממופה לסוף החודש לצורך המיון — כך אירוע חודשי
// (יד 1 ב-10/2022) אינו נדחק לפני אירוע מדויק מאותו חודש (עלה לכביש
// ב-24.10.2022); שנה בלבד ממופה לאמצע השנה. התצוגה נשארת ברזולוציה
// המקורית
function timelineDate(value) {
  if (value == null || value === "") return null;
  const str = String(value);
  let match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(str);
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : null];
    return {
      sort: y * 10000 + m * 100 + (d ?? 28),
      display: d ? `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}` : `${m}/${y}`,
    };
  }
  match = /^(\d{4})(\d{2})$/.exec(str);
  if (match) {
    const [y, m] = [Number(match[1]), Number(match[2])];
    return { sort: y * 10000 + m * 100 + 28, display: `${m}/${y}` };
  }
  match = /^(\d{4})$/.exec(str);
  if (match) {
    const y = Number(match[1]);
    return y > 1900 && y < 2100 ? { sort: y * 10000 + 615, display: String(y) } : null;
  }
  return null;
}

function todaySortValue() {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

// הוספת אירועים לציר. אירוע עם key מחליף אירוע קודם באותו מפתח (רישום
// ראשון מדויק מחליף את "עלה לכביש" החודשי). אירוע ללא תאריך תקין נזרק
function addTimelineEvents(events) {
  for (const event of events) {
    if (!event.date) continue;
    if (event.key) timelineEvents = timelineEvents.filter((e) => e.key !== event.key);
    timelineEvents.push({ ...event, seq: timelineSeq++ });
  }
  renderTimeline();
}

// השלמת פרט לאירוע קיים (מד האוץ מצטרף לאירוע הטסט כשתשובת ההיסטוריה חוזרת)
function addTimelineDetail(key, detail) {
  const event = timelineEvents.find((e) => e.key === key);
  if (!event || !detail) return;
  event.detail = detail;
  renderTimeline();
}

function renderTimeline() {
  if (timelineEvents.length < 2) return;
  const today = todaySortValue();
  const events = [...timelineEvents].sort((a, b) => a.date.sort - b.date.sort || a.seq - b.seq);
  const list = el("ol", "timeline-list");
  const appendToday = () => {
    const li = el("li", "tl-item tl-today");
    li.append(el("span", "tl-dot"), el("span", "tl-label", "היום"));
    list.appendChild(li);
  };
  let todayShown = false;
  for (const event of events) {
    const future = event.date.sort > today;
    if (future && !todayShown) {
      appendToday();
      todayShown = true;
    }
    const li = el("li", `tl-item tl-${event.tone || "plain"}${future ? " tl-future" : ""}`);
    li.appendChild(el("span", "tl-dot"));
    const line = el("div", "tl-line");
    line.append(el("span", "tl-date", event.date.display), el("span", "tl-label", event.label));
    li.appendChild(line);
    if (event.detail) li.appendChild(el("div", "tl-detail", event.detail));
    list.appendChild(li);
  }
  if (!todayShown) appendToday();
  timelineBox.replaceChildren(el("strong", null, "סיפור הרכב"), list);
  timelineBox.classList.remove("hidden");
}

// אירועי הבסיס הנגזרים מרשומת הרכב עצמה (סינכרוני): עלייה לכביש, טסט
// אחרון, ביטול (אם קיים) ותוקף הרישיון — עתידי כצפי, עבר כפג-תוקף
function baseTimelineEvents(record) {
  const events = [];
  const aliya = timelineDate(record.moed_aliya_lakvish);
  if (aliya) events.push({ key: "start", date: aliya, label: "עלה לכביש" });
  const test = timelineDate(record.mivchan_acharon_dt);
  if (test) events.push({ key: "test", date: test, label: "עבר טסט", tone: "good" });
  const bitul = timelineDate(record.bitul_dt);
  if (bitul && String(record.bitul_cd ?? "").trim() !== "0") {
    const reason = String(record.bitul_nm || "").trim();
    events.push({ key: "bitul", date: bitul, label: reason && !/^(לא|ללא)/.test(reason) ? reason : "בוטל סופית", tone: "bad" });
  }
  const tokef = timelineDate(record.tokef_dt);
  if (tokef) {
    events.push(tokef.sort >= todaySortValue()
      ? { key: "tokef", date: tokef, label: "תוקף רישיון הרכב", tone: "good" }
      : { key: "tokef", date: tokef, label: "פג תוקף רישיון הרכב", tone: "bad" });
  }
  return events;
}

/* ---------- העשרות (בקשות מקבילות אחרי מציאת הרכב) ---------- */

// דגלי מערכות הבטיחות בטבלת הדגמים (ערך 1 = מותקן)
const SAFETY_FLAGS = [
  ["maarechet_ezer_labalam_ind", "מערכת עזר לבלימה"],
  ["blimat_hirum_lifnei_holhei_regel_ofanaim", "בלימת חירום מפני הולכי רגל ואופניים"],
  ["zihuy_holchey_regel_ind", "זיהוי הולכי רגל"],
  ["zihuy_rechev_do_galgali", "זיהוי רכב דו-גלגלי"],
  ["bakarat_stiya_menativ_ind", "התרעת סטייה מנתיב"],
  ["bakarat_stiya_activ_s", "בקרת סטייה מנתיב אקטיבית"],
  ["nitur_merhak_milfanim_ind", "ניטור מרחק מלפנים"],
  ["zihuy_matzav_hitkarvut_mesukenet_ind", "התרעת התקרבות מסוכנת"],
  ["zihuy_beshetah_nistar_ind", "זיהוי רכב בשטח מת"],
  ["hitnagshut_cad_shetah_met", "מניעת התנגשות בשטח מת"],
  ["bakarat_shyut_adaptivit_ind", "בקרת שיוט אדפטיבית"],
  ["zihuy_tamrurey_tnua_ind", "זיהוי תמרורי תנועה"],
  ["bakarat_mehirut_isa", "בקרת מהירות חכמה (ISA)"],
  ["blima_otomatit_nesia_leahor", "בלימה אוטומטית בנסיעה לאחור"],
  ["matzlemat_reverse_ind", "מצלמת רוורס"],
  ["bakarat_yatzivut_ind", "בקרת יציבות"],
  ["abs_ind", "ABS"],
  ["hayshaney_lahatz_avir_batzmigim_ind", "חיישני לחץ אוויר בצמיגים"],
  ["hayshaney_hagorot_ind", "חיישני חגורות"],
  ["teura_automatit_benesiya_kadima_ind", "תאורה אוטומטית בנסיעה קדימה"],
  ["shlita_automatit_beorot_gvohim_ind", "אורות גבוהים אוטומטיים"],
  ["alco_lock", "מנעול אלכוהול"],
];

function renderSafetyEquipment(model) {
  const installed = SAFETY_FLAGS.filter(([field]) => Number(model[field]) === 1);
  if (!installed.length) return;
  const list = el("ul");
  for (const [, label] of installed) {
    list.appendChild(el("li", null, `✓ ${label}`));
  }
  safetyBox.replaceChildren(el("strong", null, "מערכות בטיחות מותקנות"), list);
  safetyBox.classList.remove("hidden");
}

/* ---------- היסטוריית רכב (מד אוץ, דגלי שינויים, החלפות בעלות) ---------- */

// דגלי שינויים ברשומת ההיסטוריה (ערך 1 = בוצע שינוי)
const HISTORY_FLAGS = [
  ["shinui_mivne_ind", "שינוי מבנה"],
  ["gapam_ind", 'הותקן גפ"מ (גז)'],
  ["shnui_zeva_ind", "שינוי צבע"],
  ["shinui_zmig_ind", "שינוי צמיגים"],
];

// שלד הסעיף נבנה מראש עם משבצות מוסתרות בסדר קבוע — שתי הבקשות
// (רשומת היסטוריה והחלפות בעלות) ממלאות כל אחת את המשבצת שלה.
// הסעיף מוצג מיד עם משבצת-שלד מהבהבת, כדי שהמשתמש יראה שהבדיקה רצה;
// כשהתשובות מגיעות השלד מוסר, ואם אין שום תוכן הסעיף כולו נעלם
function prepareHistoryBox() {
  historyBox.replaceChildren(el("strong", null, "היסטוריית הרכב"));
  for (const key of ["km", "facts", "flags", "nodata"]) {
    const slot = el("div", `history-slot history-${key}`);
    slot.dataset.history = key;
    slot.hidden = true;
    historyBox.appendChild(slot);
  }
  const loading = el("div", "history-slot history-loading");
  loading.dataset.history = "loading";
  loading.appendChild(el("span", "skeleton"));
  historyBox.appendChild(loading);
  historyBox.classList.remove("hidden");
}

function showHistorySlot(key) {
  const slot = historyBox.querySelector(`[data-history="${key}"]`);
  if (!slot) return null;
  slot.hidden = false;
  historyBox.classList.remove("hidden");
  return slot;
}

function renderVehicleHistory(record) {
  // רישום ראשון מדויק מחליף את אירוע "עלה לכביש" החודשי על ציר הזמן,
  // ומד האוץ מצטרף כפרט לאירוע הטסט האחרון
  const firstReg = timelineDate(record.rishum_rishon_dt);
  if (firstReg) addTimelineEvents([{ key: "start", date: firstReg, label: "עלה לכביש" }]);

  const km = formatKm(record.kilometer_test_aharon);
  if (km) addTimelineDetail("test", `מד אוץ: ${km} ק"מ`);
  if (km) {
    const slot = showHistorySlot("km");
    slot.append(
      el("span", "history-km-label", "מד אוץ בטסט האחרון"),
      el("span", "history-km-value", `${km} ק"מ`),
    );
    const perYear = annualMileage(record.kilometer_test_aharon, record.rishum_rishon_dt);
    if (perYear) {
      // השוואה לממוצע הנסועה הארצי — ±20% נחשב "סביב הממוצע"
      let comparison = "סביב הממוצע הארצי";
      if (perYear < NATIONAL_AVG_KM_PER_YEAR * 0.8) comparison = "נמוך מהממוצע הארצי";
      else if (perYear > NATIONAL_AVG_KM_PER_YEAR * 1.2) comparison = "גבוה מהממוצע הארצי";
      slot.append(el("span", "history-km-sub", `ממוצע ~${perYear.toLocaleString("he-IL")} ק"מ לשנה · ${comparison}`));
    }
  }

  const facts = [
    ["רישום ראשון", formatDate(record.rishum_rishon_dt)],
    ["מקוריות", record.mkoriut_nm],
    ["מספר מנוע", record.mispar_manoa, { ltr: true }],
  ].filter(([, value]) => value != null && value !== "");
  if (facts.length) {
    const dl = el("dl", "details");
    for (const [label, value, opts] of facts) {
      const dd = el("dd", null, String(value));
      if (opts?.ltr) dd.dir = "ltr";
      dl.append(el("dt", null, label), dd);
    }
    showHistorySlot("facts").appendChild(dl);
  }

  const flags = HISTORY_FLAGS.filter(([field]) => Number(record[field]) === 1);
  if (flags.length) {
    const slot = showHistorySlot("flags");
    for (const [, label] of flags) {
      slot.appendChild(el("span", "chip chip-warn", `⚠️ ${label}`));
    }
  }
}

// מוצג רק כששתי בקשות ההיסטוריה חזרו ריקות בהצלחה — היעדר נתונים במאגר
// חלקי אינו "אין היסטוריה", ולכן הנוסח מדגיש את מגבלת הכיסוי
function renderHistoryNoData() {
  showHistorySlot("nodata").appendChild(
    el("p", null, "לא נמצאו נתוני היסטוריה לרכב זה — המאגר חלקי ומכסה בעיקר רכבים חדשים"),
  );
}

// החלפות הבעלות מוצגות כאירועי "יד N" על ציר הזמן
function renderOwnershipHistory(records) {
  if (!records.length) return;
  const sorted = [...records].sort((a, b) => Number(a.baalut_dt) - Number(b.baalut_dt));
  addTimelineEvents(sorted.map((row, index) => ({
    date: timelineDate(row.baalut_dt),
    label: row.baalut ? `יד ${index + 1} — ${row.baalut}` : `יד ${index + 1}`,
  })));
}

/* ---------- חיווים נקודתיים (בקשה אחת לכל מאגר, מוצג רק בהתאמה) ---------- */

const INDICATORS = [
  {
    key: "safetyDiscount",
    resourceId: RESOURCES.safetyDiscount,
    tone: "good",
    text: () => "מותקנת מערכת בטיחות מתקדמת (מזכה בהנחה באגרת הרישוי)",
  },
  {
    key: "particleFilter",
    resourceId: RESOURCES.particleFilter,
    tone: "info",
    text: (record) => {
      const when = formatDate(record.taarich_hatkana);
      return when ? `הותקן מסנן חלקיקים (${when})` : "הותקן מסנן חלקיקים";
    },
  },
  {
    key: "cargoAnchors",
    resourceId: RESOURCES.cargoAnchors,
    tone: "warn",
    text: () => "חלה חובת נקודות עיגון מטען",
  },
];

function prepareIndicatorBox() {
  indicatorBox.replaceChildren();
  indicatorBox.classList.add("hidden");
  for (const indicator of INDICATORS) {
    const chip = el("span", `chip chip-${indicator.tone}`);
    chip.dataset.indicator = indicator.key;
    chip.hidden = true;
    indicatorBox.appendChild(chip);
  }
}

function fillIndicator(key, text) {
  if (!text) return;
  const chip = indicatorBox.querySelector(`[data-indicator="${key}"]`);
  if (!chip) return;
  chip.textContent = text;
  chip.hidden = false;
  indicatorBox.classList.remove("hidden");
}

function renderPermit(permit) {
  const parts = [];
  if (permit["SUG TAV"] != null) parts.push(`סוג תו: ${permit["SUG TAV"]}`);
  const issued = formatIntDate(permit["TAARICH HAFAKAT TAG"]);
  if (issued) parts.push(`הונפק: ${issued}`);

  permitBox.classList.remove("permit-none");
  permitBox.replaceChildren(el("strong", null, "🅿 לרכב זה תו חניה לנכה"));
  if (parts.length) {
    permitBox.appendChild(el("p", null, parts.join(" · ")));
  }
  permitBox.classList.remove("hidden");
}

// מאגר תווי החניה מלא ומוסמך — תשובה ריקה (בהצלחה) פירושה שאין תו
function renderPermitNone() {
  permitBox.classList.add("permit-none");
  permitBox.replaceChildren(el("p", null, "אין תו חניה לנכה רשום לרכב זה"));
  permitBox.classList.remove("hidden");
}

// מצב ביניים בזמן שבדיקת הריקולים רצה — מוחלף תמיד באחת משלוש
// התוצאות (יש ריקול / אין / הבדיקה נכשלה), ולכן לעולם אינו נתקע
function renderRecallsChecking() {
  recallBox.classList.remove("recall-ok");
  recallBox.classList.add("recall-unavailable");
  const line = el("p", "recall-checking", "בודק קריאות ריקול פתוחות ");
  line.appendChild(el("span", "skeleton"));
  recallBox.replaceChildren(line);
  recallBox.classList.remove("hidden");
}

function renderRecalls(recalls) {
  recallBox.classList.remove("recall-ok", "recall-unavailable");
  recallBox.replaceChildren(el(
    "strong",
    null,
    recalls.length === 1
      ? "⚠️ קיימת קריאת ריקול פתוחה שטרם טופלה"
      : `⚠️ קיימות ${recalls.length} קריאות ריקול פתוחות שטרם טופלו`,
  ));
  for (const recall of recalls) {
    const details = [recall.SUG_TAKALA, recall.TEUR_TAKALA].filter(Boolean).join(": ");
    const opened = formatDate(recall.TAARICH_PTICHA);
    recallBox.appendChild(el("p", null, opened ? `${details} (נפתחה ב-${opened})` : details));
    // משבצת מוסתרת לפרטי התיקון של הריקול — תמולא כשמגיעה תשובת מאגר הפירוט
    if (recall.RECALL_ID != null) {
      const fix = el("p", "recall-fix");
      fix.dataset.recallId = String(recall.RECALL_ID);
      fix.hidden = true;
      recallBox.appendChild(fix);
    }
  }
  recallBox.classList.remove("hidden");
}

// מאגר הריקולים הפתוחים מוסמך — תשובה ריקה (בהצלחה) פירושה שאין ריקול פתוח
function renderRecallsAllClear() {
  recallBox.classList.remove("recall-unavailable");
  recallBox.classList.add("recall-ok");
  recallBox.replaceChildren(el("strong", null, "✅ אין קריאות ריקול פתוחות לרכב זה"));
  recallBox.classList.remove("hidden");
}

// כשל רשת אינו "אין ריקולים" — מציגים במפורש שהבדיקה לא הצליחה,
// כדי ששתיקה לא תתפרש כתשובה שלילית
function renderRecallsUnavailable() {
  recallBox.classList.remove("recall-ok");
  recallBox.classList.add("recall-unavailable");
  recallBox.replaceChildren(el("p", null, "לא ניתן היה לבדוק קריאות ריקול כעת"));
  recallBox.classList.remove("hidden");
}

function websiteHref(raw) {
  if (!raw) return null;
  const url = String(raw).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return null;
}

// פרטי תיקון ממאגר הריקולים הכללי: יבואן, טלפון, אופן תיקון ואתר.
// כל פרט קיים נהפך לקטע, והקטעים מחוברים ב-" · "
function fillRecallDetails(details) {
  for (const detail of details) {
    if (detail?.RECALL_ID == null) continue;
    const fix = recallBox.querySelector(`p[data-recall-id="${CSS.escape(String(detail.RECALL_ID))}"]`);
    if (!fix) continue;

    const parts = [];
    if (detail.OFEN_TIKUN) {
      parts.push([`אופן התיקון: ${detail.OFEN_TIKUN}`]);
    }
    if (detail.YEVUAN_TEUR || detail.TELEPHONE) {
      const contact = ["לתיאום תיקון: "];
      if (detail.YEVUAN_TEUR) contact.push(String(detail.YEVUAN_TEUR));
      if (detail.YEVUAN_TEUR && detail.TELEPHONE) contact.push(", ");
      if (detail.TELEPHONE) {
        const phone = el("span", null, String(detail.TELEPHONE));
        phone.dir = "ltr";
        contact.push(phone);
      }
      parts.push(contact);
    }
    const href = websiteHref(detail.WEBSITE);
    if (href) {
      const link = el("a", null, "אתר היבואן");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";
      parts.push([link]);
    }
    if (!parts.length) continue;

    fix.replaceChildren();
    parts.forEach((nodes, i) => {
      if (i) fix.append(" · ");
      fix.append(...nodes);
    });
    fix.hidden = false;
  }
}

/* ---------- שורות העשרה בכרטיס הפרטים ----------
   כל קבוצה היא טבלת [תווית, שליפת-ערך] אחת: אותה טבלה משמשת גם ליצירת
   שורות מקום-שמור מוסתרות (בסדר קבוע, לפני שהתשובות מגיעות) וגם למילוין.
   שליפה שמחזירה null/ריק משאירה את השורה מוסתרת */

const CONTINUATION_ROWS = [
  ["וו גרירה", (record) => record.grira_nm],
  ["דירוג צמיגים", tireRating],
];

const WLTP_ROWS = [
  ["כוח סוס", (m) => withUnit(m.koah_sus, 'כ"ס')],
  ["תיבת הילוכים", (m) => (m.automatic_ind == null ? null : Number(m.automatic_ind) === 1 ? "אוטומטית" : "ידנית")],
  ["טכנולוגיית הנעה", (m) => m.technologiat_hanaa_nm],
  ["הנעה", (m) => m.hanaa_nm],
  ["מרכב", (m) => m.merkav],
  ["מספר מושבים", (m) => m.mispar_moshavim],
  ["מספר דלתות", (m) => m.mispar_dlatot],
  ["ארץ תוצרת", (m) => m.tozeret_eretz_nm],
  ["מיזוג אוויר", (m) => yesOnly(m.mazgan_ind)],
  ["גג נפתח", (m) => yesOnly(m.halon_bagg_ind)],
  ["חישוקי סגסוגת", (m) => yesOnly(m.galgaley_sagsoget_kala_ind)],
  ["נפח מנוע", (m) => withUnit(m.nefah_manoa, 'סמ"ק')],
  ["משקל כולל", (m) => withUnit(m.mishkal_kolel, 'ק"ג')],
  ["כריות אוויר", (m) => m.mispar_kariot_avir],
  // 0 = אין אישור גרירה — אין טעם להציג
  ["כושר גרירה", (m) => withUnit(positiveNumber(m.kosher_grira_im_blamim), 'ק"ג')],
  ["פליטת CO₂", (m) => withUnit(m.CO2_WLTP ?? m.kamut_CO2, 'גר׳/ק"מ')],
  ["מדד ירוק", (m) => m.madad_yarok],
  ["קבוצת אגרת רישוי", (m) => m.kvuzat_agra_cd],
  ["ניקוד בטיחות", (m) => m.nikud_betihut],
  ["רמת אבזור בטיחותי", (m) => m.ramat_eivzur_betihuty],
];

const PRICE_ROWS = [
  ["מחיר מחירון מקורי", (listing) => formatPrice(listing.mehir)],
  ["יבואן", (listing) => listing.shem_yevuan],
];

// צי האוטובוסים (מפתח bus_license_id = מספר הרכב) — מפעיל, ק"מ מצטבר, מיגון
function busArmor(bus) {
  const armor = [];
  if (bus.stone_proof_nm && !/^לא/.test(bus.stone_proof_nm.trim())) armor.push("אבנים");
  if (bus.bullet_proof_nm && !/^לא/.test(bus.bullet_proof_nm.trim())) armor.push("ירי");
  return armor.length ? `ממוגן ${armor.join(" ו-")}` : null;
}

const BUS_ROWS = [
  ["מפעיל", (b) => b.operator_nm],
  ["אשכול", (b) => (b.cluster_nm && b.cluster_nm.trim() !== "לא מוגדר" ? b.cluster_nm : null)],
  ["סוג אוטובוס", (b) => [b.BusSize_nm, b.BusType_nm].map((x) => (x || "").trim()).filter(Boolean).join(" · ")],
  ["מקומות ישיבה", (b) => b.SeatsNum],
  ["הנעה", (b) => b.PropulsionType_nm],
  ['ק"מ מצטבר', (b) => (formatKm(b.total_kilometer) ? `${formatKm(b.total_kilometer)} ק"מ` : null)],
  ["מיגון", (b) => busArmor(b)],
];

// דרגת זיהום ואישור פעילות לכלי צמ"ה (מפתח mispar_tzama)
const TZAMA_POLLUTION_ROWS = [
  ["יצרן", (p) => p.yatzran],
  ["הספק", (p) => withUnit(positiveNumber(Math.round(Number(p.power_engine_kilowalt))), 'קו"ט')],
  ["דרגת זיהום אוויר", (p) => p.dargat_zihum_avir],
  ["מסנן חלקיקים", (p) => p.hutkan_mesanen_helkikim],
  ["מורשה פעילות", (p) => p.murshe_peelut],
];

// "כמה כאלה על הכביש" — נספר במאגר הפעיל לפי דגם (ולפי שנת ייצור).
// מתווסף כשורת פרטים בתחתית הכרטיס, רק כשיש לפחות מספר חיובי אחד
function renderRarity(yearCount, allCount, year) {
  const hasYear = typeof yearCount === "number" && yearCount > 0;
  const hasAll = typeof allCount === "number" && allCount > 0;
  if (!hasYear && !hasAll) return;
  let value;
  if (hasYear && year != null) {
    value = `${yearCount.toLocaleString("he-IL")} משנת ${year}`;
    if (hasAll && allCount !== yearCount) value += ` · ${allCount.toLocaleString("he-IL")} מכל השנים`;
  } else {
    value = `${(hasAll ? allCount : yearCount).toLocaleString("he-IL")} מכל השנים`;
  }
  appendDetailRow("כמה כאלה על הכביש", value);
}

function addPlaceholderRows(group, rowDefs) {
  rowDefs.forEach(([label], index) => {
    const dt = el("dt", null, label);
    const dd = el("dd");
    attachRowInfo(dt, dd);
    dt.hidden = dd.hidden = true;
    dt.dataset.enrich = dd.dataset.enrich = `${group}-${index}`;
    resultDetails.append(dt, dd);
  });
}

function fillPlaceholderRows(group, rowDefs, record) {
  rowDefs.forEach(([, getValue], index) => {
    const value = getValue(record);
    if (value == null || value === "") return;
    const dt = resultDetails.querySelector(`dt[data-enrich="${group}-${index}"]`);
    const dd = resultDetails.querySelector(`dd[data-enrich="${group}-${index}"]`);
    if (!dt || !dd) return;
    dd.textContent = String(value);
    dt.hidden = dd.hidden = false;
  });
}

function modelJoinFilters(record) {
  if (record.tozeret_cd == null || record.degem_cd == null || record.shnat_yitzur == null) {
    return null;
  }
  const filters = {
    tozeret_cd: record.tozeret_cd,
    degem_cd: record.degem_cd,
    shnat_yitzur: record.shnat_yitzur,
  };
  if (record.sug_degem) filters.sug_degem = record.sug_degem;
  return filters;
}

// העשרות שנשלפות לפי mispar_rechev בלבד. מופרד כדי שנוכל לדלג עליו
// עבור מאגרים עם מפתח אחר (כלי צמ"ה) בלי לסכן הצלבה שגויה עם רכב אחר
function startPlateKeyedEnrichments(plateNumber, guard, ignore) {
  // היסטוריית רכב והחלפות בעלות — הכיסוי חלקי (בעיקר רכבים חדשים),
  // לכן הסעיף מוצג רק כשיש נתונים ולעולם לא עם "—".
  // שורת "לא נמצאו נתונים" מוצגת רק כששתי הבקשות חזרו ריקות בהצלחה;
  // בקשה שנכשלה לא נספרת, כדי לא להסיק "אין" מתוך שגיאת רשת
  prepareHistoryBox();
  let historyEmptyCount = 0;
  const noteHistoryEmpty = () => {
    historyEmptyCount += 1;
    if (historyEmptyCount === 2) renderHistoryNoData();
  };
  // שלד הטעינה מוסר כששתי הבקשות הסתיימו (בהצלחה או בכשל); אם לא נותר
  // שום תוכן גלוי — הסעיף כולו מוסתר (כשל אינו מוצג כ"אין נתונים")
  let historySettled = 0;
  const settleHistory = () => {
    historySettled += 1;
    if (historySettled < 2) return;
    historyBox.querySelector('[data-history="loading"]')?.remove();
    if (!historyBox.querySelector(".history-slot:not([hidden])")) {
      historyBox.classList.add("hidden");
    }
  };
  ckanSearch(RESOURCES.vehicleHistory, { mispar_rechev: plateNumber })
    .then(guard((records) => {
      if (records[0]) renderVehicleHistory(records[0]);
      else noteHistoryEmpty();
    }))
    .catch(ignore)
    .finally(guard(settleHistory));
  ckanSearch(RESOURCES.ownershipHistory, { mispar_rechev: plateNumber }, 20)
    .then(guard((records) => {
      if (records.length) renderOwnershipHistory(records);
      else noteHistoryEmpty();
    }))
    .catch(ignore)
    .finally(guard(settleHistory));

  // חיווים נקודתיים — נבדקים לכל רכב שנמצא, מוצגים רק בהתאמה
  prepareIndicatorBox();
  for (const indicator of INDICATORS) {
    ckanSearch(indicator.resourceId, { mispar_rechev: plateNumber })
      .then(guard((records) => {
        if (records[0]) fillIndicator(indicator.key, indicator.text(records[0]));
      }))
      .catch(ignore);
  }

  // תו חניה לנכה נבדק לכל רכב שנמצא, בכל אחד מהמאגרים.
  // המאגר מוסמך, ולכן תשובה ריקה מוצגת כ"אין תו" מפורש; כשל — שתיקה.
  // שימו לב: שמות השדות במאגר זה מכילים רווחים
  ckanSearch(RESOURCES.disabledPermit, { "MISPAR RECHEV": plateNumber })
    .then(guard((records) => {
      if (records[0]) renderPermit(records[0]);
      else renderPermitNone();
    }))
    .catch(ignore);
}

function startEnrichments(record, plateNumber, options, token) {
  const guard = (fn) => (value) => {
    if (token === searchToken) fn(value);
  };
  const ignore = () => {};
  // כלי צמ"ה מגיע עם plateKeyed=false — מספרו (mispar_tzama) אינו מספר רישוי
  const plateKeyed = options.plateKeyed !== false;

  renderStory(record);
  renderBrandLogo(record);
  fetchVehicleImage(record, guard);
  // הצלבת יצרן מול מספר השלדה — פענוח מקומי, בלי בקשת רשת. השורה
  // מתווספת מיד אחרי שורות הבסיס, לפני שורות ההעשרה
  renderVinCheck(record);
  // קופסת חידוש הרישיון — רק במאגרים שבהם רישיון פג הוא מצב שאפשר
  // ומוטב לתקן (רכב פעיל בבעלות פרטית); רכב מבוטל/לא-פעיל מקבל באנר
  if (options.renewal) renderRenewalBox(record);

  // ציר הזמן נפתח מיד עם אירועי הבסיס מהרשומה; החלפות בעלות, ריקולים
  // ומד האוץ מצטרפים כשתשובות ההעשרה חוזרות
  prepareTimeline();
  addTimelineEvents(baseTimelineEvents(record));

  const joinFilters = modelJoinFilters(record);
  const wantWltp = options.wltp && joinFilters;
  const wantPrice = options.priceList && joinFilters;

  if (options.continuation) addPlaceholderRows("continuation", CONTINUATION_ROWS);
  if (wantWltp) addPlaceholderRows("wltp", WLTP_ROWS);
  if (wantPrice) addPlaceholderRows("price", PRICE_ROWS);

  // שורת-שלד "פרטים נוספים" בתחתית הטבלה כל עוד בקשות ההעשרה של
  // השורות רצות — מוסרת כשכולן הסתיימו (בהצלחה או בכשל)
  let pendingDetailFetches =
    [options.continuation, wantWltp, wantPrice, options.busFleet, options.constructionPollution]
      .filter(Boolean).length;
  if (pendingDetailFetches) {
    const dt = el("dt", "enrich-pending", "פרטים נוספים");
    const dd = el("dd", "enrich-pending");
    dd.appendChild(el("span", "skeleton"));
    dt.dataset.pending = dd.dataset.pending = "1";
    resultDetails.append(dt, dd);
  }
  const settleDetailFetch = () => {
    pendingDetailFetches -= 1;
    if (pendingDetailFetches > 0) return;
    for (const node of resultDetails.querySelectorAll('[data-pending="1"]')) node.remove();
  };

  if (options.continuation) {
    ckanSearch(RESOURCES.continuation, { mispar_rechev: plateNumber })
      .then(guard((records) => {
        if (records[0]) fillPlaceholderRows("continuation", CONTINUATION_ROWS, records[0]);
      }))
      .catch(ignore)
      .finally(guard(settleDetailFetch));
  }

  if (wantWltp) {
    ckanSearch(RESOURCES.wltp, joinFilters)
      .then(guard((records) => {
        if (!records[0]) return;
        fillPlaceholderRows("wltp", WLTP_ROWS, records[0]);
        renderSafetyEquipment(records[0]);
      }))
      .catch(ignore)
      .finally(guard(settleDetailFetch));
  }

  if (wantPrice) {
    ckanSearch(RESOURCES.priceList, joinFilters)
      .then(guard((records) => {
        if (records[0]) fillPlaceholderRows("price", PRICE_ROWS, records[0]);
      }))
      .catch(ignore)
      .finally(guard(settleDetailFetch));
  }

  // נפוצות הדגם — כמה כאלה רשומים במאגר הפעיל (שתי ספירות: שנה + כל השנים).
  // ספירות ה-total איטיות יחסית ולכן מתמלאות באיחור, בלי לעכב את הכרטיס
  if (options.rarity && record.tozeret_cd != null && record.degem_cd != null) {
    const base = { tozeret_cd: record.tozeret_cd, degem_cd: record.degem_cd };
    const yearFilter = record.shnat_yitzur != null ? { ...base, shnat_yitzur: record.shnat_yitzur } : null;
    Promise.all([
      yearFilter ? ckanCount(RESOURCES.main, yearFilter).catch(() => null) : Promise.resolve(null),
      ckanCount(RESOURCES.main, base).catch(() => null),
    ]).then(guard(([yearCount, allCount]) => renderRarity(yearCount, allCount, record.shnat_yitzur)));
  }

  // צי האוטובוסים — מפעיל, ק"מ מצטבר, מיגון (למאגר הרכב הציבורי)
  if (options.busFleet) {
    addPlaceholderRows("bus", BUS_ROWS);
    ckanSearch(RESOURCES.busFleet, { bus_license_id: plateNumber })
      .then(guard((records) => {
        if (records[0]) fillPlaceholderRows("bus", BUS_ROWS, records[0]);
      }))
      .catch(ignore)
      .finally(guard(settleDetailFetch));
  }

  // דרגת זיהום ואישור פעילות לכלי צמ"ה (מפתח mispar_tzama = plateNumber)
  if (options.constructionPollution) {
    addPlaceholderRows("tzamapoll", TZAMA_POLLUTION_ROWS);
    ckanSearch(RESOURCES.constructionPollution, { mispar_tzama: plateNumber })
      .then(guard((records) => {
        if (records[0]) fillPlaceholderRows("tzamapoll", TZAMA_POLLUTION_ROWS, records[0]);
      }))
      .catch(ignore)
      .finally(guard(settleDetailFetch));
  }

  // העשרות לפי מספר רישוי (היסטוריה, חיווים נקודתיים, תו חניה) — רק כאשר
  // המפתח הוא mispar_rechev אמיתי; עבור כלי צמ"ה מדולג כדי לא להצליב בטעות
  // עם רכב שמספרו זהה
  if (plateKeyed) startPlateKeyedEnrichments(plateNumber, guard, ignore);

  if (options.recalls) {
    // שימו לב: שמות השדות במאגר הריקולים באותיות גדולות.
    // אחרי מציאת ריקולים נשלפים פרטי התיקון לפי RECALL_ID (מסנן-מערך = OR).
    // תשובה ריקה = "אין ריקולים פתוחים" מפורש; כשל = "לא ניתן לבדוק" —
    // לעולם לא מסיקים "אין" מתוך שגיאה
    renderRecallsChecking();
    ckanSearch(RESOURCES.recalls, { MISPAR_RECHEV: plateNumber }, 10)
      .then(guard((records) => {
        if (!records.length) {
          renderRecallsAllClear();
          return;
        }
        renderRecalls(records);
        addTimelineEvents(records.map((recall) => ({
          date: timelineDate(recall.TAARICH_PTICHA),
          label: "נפתחה קריאת ריקול",
          tone: "warn",
        })));
        const recallIds = [...new Set(records.map((r) => r.RECALL_ID).filter((id) => id != null))];
        if (!recallIds.length) return;
        ckanSearch(RESOURCES.recallDetails, { RECALL_ID: recallIds }, recallIds.length)
          .then(guard(fillRecallDetails))
          .catch(ignore);
      }))
      .catch(guard(renderRecallsUnavailable));
  }
}

/* ---------- חיפושים אחרונים (localStorage בלבד) ---------- */

function loadRecent() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveRecent(entries) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries));
  } catch {
    // אחסון לא זמין (מצב פרטי וכו') — פשוט לא שומרים
  }
}

function addRecent(plateDigits, label) {
  const entries = loadRecent().filter((entry) => entry.p !== plateDigits);
  entries.unshift({ p: plateDigits, l: label });
  saveRecent(entries.slice(0, RECENT_MAX));
  renderRecent();
}

function renderRecent() {
  const entries = loadRecent();
  recentList.replaceChildren();
  recentSection.classList.toggle("hidden", !entries.length);
  for (const entry of entries) {
    const button = el("button", "recent-chip");
    button.type = "button";
    const plate = el("span", "recent-plate", formatPlate(entry.p));
    plate.dir = "ltr";
    button.appendChild(plate);
    if (entry.l) {
      button.appendChild(el("span", "recent-label", entry.l));
    }
    button.addEventListener("click", () => {
      input.value = formatPlate(entry.p);
      runSearch(entry.p);
    });
    const li = el("li");
    li.appendChild(button);
    recentList.appendChild(li);
  }
}

clearRecentBtn.addEventListener("click", () => {
  saveRecent([]);
  renderRecent();
});

/* ---------- קישור ישיר ושיתוף ---------- */

// כפתור השיתוף מוצג רק אם אפשר לשתף (Web Share API) או להעתיק ללוח
const canShare = Boolean(navigator.share || navigator.clipboard?.writeText);

let currentPlateDigits = null;
let shareFeedbackTimer = null;

function plateUrl(digits) {
  const url = new URL(location.href);
  url.searchParams.set("plate", digits);
  url.hash = "";
  return url.toString();
}

// משקף את המספר הנבדק בכתובת הדפדפן, כך שאפשר לשתף גם מסרגל הכתובת
function reflectPlateInUrl(digits) {
  try {
    history.replaceState(null, "", plateUrl(digits));
  } catch {
    // replaceState עלול להיחסם בפתיחה ישירה מ-file:// — מוותרים על העדכון
  }
}

function resetShareButton(plateDigits) {
  currentPlateDigits = plateDigits;
  clearTimeout(shareFeedbackTimer);
  shareBtn.classList.remove("copied");
  shareBtnLabel.textContent = "שיתוף קישור";
  shareBtn.classList.toggle("hidden", !canShare);
}

shareBtn.addEventListener("click", async () => {
  if (!currentPlateDigits) return;
  const url = plateUrl(currentPlateDigits);

  // קודם מנסים לשתף את תמונת הכרטיס עם הקישור (וואטסאפ ודומיו); ביטול
  // על ידי המשתמש עוצר כאן, וכל כשל אחר נופל בשקט לשיתוף הקישור הרגיל
  if (navigator.canShare) {
    try {
      const blob = await buildShareCardBlob();
      if (blob) {
        const file = new File([blob], `rechev-${currentPlateDigits}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `פרטי רכב ${formatPlate(currentPlateDigits)}`,
            text: url,
          });
          return;
        }
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    if (navigator.share) {
      await navigator.share({ title: `פרטי רכב ${formatPlate(currentPlateDigits)}`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    shareBtn.classList.add("copied");
    shareBtnLabel.textContent = "הקישור הועתק ✓";
    clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = setTimeout(() => {
      shareBtn.classList.remove("copied");
      shareBtnLabel.textContent = "שיתוף קישור";
    }, 2500);
  } catch {
    // המשתמש ביטל את חלון השיתוף או שהגישה ללוח נדחתה
  }
});

/* ---------- חידוש רישיון רכב ----------
   "פג תוקף" בלי צעד הבא הוא אבחנה שנוטשת את המשתמש. כשהרישיון פג (או
   מסתיים בקרוב) מוצגת קופסת פעולה עם שלושת שלבי החידוש וקישור לתשלום
   האגרה בשירות הממשלתי. הטון מדורג לפי גיל הפקיעה, ולפקיעה של יותר
   משנה אין רשימת שלבים — שם החידוש בדרך כלל דורש טיפול במשרד הרישוי,
   ועדיף להפנות לעמוד הרשמי מאשר להעמיד פנים שהתהליך המקוון מספיק.
   מידע כללי בלבד — לא ייעוץ משפטי */

const RENEWAL_PAY_URL = "https://ecom.gov.il/voucherspa/input/260";
const RENEWAL_INFO_URL = "https://www.gov.il/he/service/car_licence_renewal";

function renewalLink(text, href) {
  const link = el("a", null, text);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}

function renewalSteps() {
  const list = el("ol", "renewal-steps");
  const pay = el("li");
  pay.append(
    renewalLink("תשלום אגרת הרישוי בשירות התשלומים הממשלתי", RENEWAL_PAY_URL),
    el("span", "renewal-substep", " — אפשר גם בטלפון 5678*, ובפריסה של עד 12 תשלומים"),
  );
  list.append(
    pay,
    el("li", null, "ביטוח חובה בתוקף — נדרש בכניסה לטסט"),
    el("li", null, "טסט במכון רישוי, עם אישור התשלום ותעודת הביטוח"),
  );
  return list;
}

function renderRenewalBox(record) {
  const days = daysUntil(record.tokef_dt);
  if (days == null || days > EXPIRY_SOON_DAYS) return;
  renewalBox.replaceChildren();
  renewalBox.classList.remove("renewal-soon", "renewal-expired");

  if (days >= 0) {
    // מסתיים בקרוב — תזכורת רכה: אפשר לשלם כבר עכשיו
    renewalBox.classList.add("renewal-soon");
    renewalBox.append(
      el("strong", null, days === 0
        ? "🗓 רישיון הרכב מסתיים היום — אפשר לחדש אונליין"
        : `🗓 רישיון הרכב מסתיים בקרוב — אפשר לחדש כבר עכשיו`),
      renewalSteps(),
      el("p", "renewal-note", "טיפ: כפתור ⭐ שומר את הרכב ומציע תזכורת ליומן לקראת הטסט הבא"),
    );
  } else if (days >= -365) {
    renewalBox.classList.add("renewal-expired");
    let message;
    if (days >= -30) {
      message = "אסור לנהוג ברכב ללא רישיון בתוקף — החידוש אונליין לוקח דקות:";
    } else if (days >= -180) {
      message = "הרישיון פג לפני יותר מחודש — נהיגה במצב הזה חושפת לקנס. כך מחדשים:";
    } else {
      message = "הרישיון פג לפני יותר מחצי שנה — מעבר לקנס, קיים סיכון להזמנה לדין ולהורדת הרכב מהכביש. כך מחדשים:";
    }
    renewalBox.append(
      el("strong", null, "⚠️ רישיון הרכב פג — כך מסדרים את זה"),
      el("p", "renewal-msg", message),
      renewalSteps(),
      el("p", "renewal-note", "מידע כללי בלבד — ההנחיות המחייבות באתר משרד התחבורה"),
    );
  } else {
    renewalBox.classList.add("renewal-expired");
    const message = el("p", "renewal-msg", "במצב כזה החידוש בדרך כלל אינו מסתיים אונליין ונדרש טיפול מול משרד הרישוי. ");
    message.appendChild(renewalLink("לפרטים באתר משרד התחבורה", RENEWAL_INFO_URL));
    renewalBox.append(
      el("strong", null, "רישיון הרכב פג לפני יותר משנה"),
      message,
      el("p", "renewal-note", "מידע כללי בלבד — ההנחיות המחייבות באתר משרד התחבורה"),
    );
  }
  renewalBox.classList.remove("hidden");
}

/* ---------- הרכב שלי ----------
   שמירה מקומית (localStorage בלבד) של רכב אחד — בדרך כלל הרכב של
   המשתמש עצמו: כפתור ⭐ בכרטיס שומר, ופאנל במסך הבית מציג את הרכב עם
   ספירה לאחור לתוקף הטסט, בדיקה חוזרת בלחיצה, והורדת תזכורת ליומן
   (קובץ ‎.ics‎ שנוצר במכשיר). בדיקה חוזרת של הרכב השמור מרעננת את
   הנתונים השמורים אוטומטית. שום דבר לא נשלח לשרת */

const MYCAR_KEY = "lci_mycar_v1";

// הרכב שמוצג כרגע בכרטיס — מועמד לשמירה בלחיצת הכפתור
let myCarCandidate = null;

function loadMyCar() {
  try {
    const stored = JSON.parse(localStorage.getItem(MYCAR_KEY));
    return stored && stored.p ? stored : null;
  } catch {
    return null;
  }
}

function saveMyCar(car) {
  try {
    if (car) localStorage.setItem(MYCAR_KEY, JSON.stringify(car));
    else localStorage.removeItem(MYCAR_KEY);
  } catch {
    // אחסון לא זמין — הפיצ'ר פשוט לא פעיל
  }
}

function refreshMyCarButton() {
  const saved = loadMyCar();
  const isSaved = Boolean(saved && myCarCandidate && saved.p === myCarCandidate.p);
  myCarBtnLabel.textContent = isSaved ? "★ נשמר כרכב שלי" : "☆ שמירה כרכב שלי";
  myCarBtn.classList.toggle("mycar-saved", isSaved);
  myCarBtn.classList.toggle("hidden", !myCarCandidate);
}

// נקרא בכל תוצאה: מעדכן את המועמד לשמירה, ואם זה הרכב השמור — מרענן
// את הנתונים השמורים (כותרת ותוקף) מהבדיקה הטרייה
function updateMyCarCandidate(digits, title, tokefDt, record) {
  myCarCandidate = {
    p: digits,
    l: title || "",
    tokef: tokefDt || null,
    // מפתחות זיהוי התמונה/לוגו בפאנל — נגזרים כמו ב-fetchVehicleImage.
    // רכב שנשמר לפני התוספת הזו יקבל אותם ברענון הבא של הבדיקה
    mk: record ? makerEnglish(record.tozeret_nm) : null,
    kn: record ? normalizeForMatch(String(record.kinuy_mishari || "").trim()) || null : null,
  };
  const saved = loadMyCar();
  if (saved && saved.p === digits) {
    saveMyCar(myCarCandidate);
    renderMyCarPanel();
  }
  refreshMyCarButton();
}

myCarBtn.addEventListener("click", () => {
  if (!myCarCandidate) return;
  const saved = loadMyCar();
  saveMyCar(saved && saved.p === myCarCandidate.p ? null : myCarCandidate);
  refreshMyCarButton();
  renderMyCarPanel();
});

// צ'יפ מצב הטסט בפאנל — אותם ספים כמו תג התוקף בכרטיס
function myCarTestChip(tokef) {
  const days = daysUntil(tokef);
  if (days == null) return null;
  if (days < 0) return el("span", "chip chip-bad", "❌ הטסט פג תוקף");
  if (days === 0) return el("span", "chip chip-warn", "⚠️ הטסט מסתיים היום");
  if (days <= EXPIRY_SOON_DAYS) {
    return el("span", "chip chip-warn", days === 1 ? "⚠️ הטסט מסתיים מחר" : `⚠️ הטסט מסתיים בעוד ${days} ימים`);
  }
  return el("span", "chip chip-good", `✅ טסט בתוקף עד ${formatDate(tokef)} (עוד ${days} ימים)`);
}

// קובץ תזכורת ליומן: אירוע יום-שלם שבועיים לפני תום התוקף (או מחר,
// אם נשארו פחות משבועיים), עם קישור לבדיקה עדכנית
function downloadTestReminder(car) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(car.tokef || ""));
  if (!match) return;
  const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let remind = new Date(due);
  remind.setDate(remind.getDate() - 14);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (remind < tomorrow) remind = tomorrow;
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const esc = (s) => String(s).replace(/([\\;,])/g, "\\$1");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//License-Check-IL//HE",
    "BEGIN:VEVENT",
    `UID:lci-${car.p}-${ymd(due)}@license-check-il`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd(remind)}`,
    `SUMMARY:${esc(`תזכורת: טסט לרכב ${formatPlate(car.p)} עד ${formatDate(car.tokef)}`)}`,
    `DESCRIPTION:${esc(`תוקף רישיון הרכב מסתיים ב-${formatDate(car.tokef)}. לבדיקה עדכנית: ${plateUrl(car.p)}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `test-reminder-${car.p}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function renderMyCarPanel() {
  const car = loadMyCar();
  myCarSection.replaceChildren();
  myCarSection.classList.toggle("hidden", !car);
  if (!car) return;

  const head = el("div", "recent-head");
  head.appendChild(el("h3", null, "⭐ הרכב שלי"));
  const removeBtn = el("button", null, "הסרה");
  removeBtn.type = "button";
  removeBtn.addEventListener("click", () => {
    saveMyCar(null);
    renderMyCarPanel();
    refreshMyCarButton();
  });
  head.appendChild(removeBtn);

  const row = el("div", "mycar-row");

  // תמונת הדגם מהמאגר המקומי — או לוגו היצרן כשאין תמונה. נחשפת רק
  // אחרי טעינה מוצלחת; ברכב שמור ישן (בלי מפתחות) פשוט לא מוצג דבר
  const thumb = el("img", "mycar-thumb hidden");
  thumb.alt = "";
  thumb.decoding = "async";
  row.appendChild(thumb);
  loadModelImageIndex().then((index) => {
    const entry = index && car.kn ? index[`${car.mk}|${car.kn}`] : null;
    const src = entry ? `model-images/${entry.f}` : brandLogoPath(car.mk);
    if (!src) return;
    if (entry) thumb.title = `צילום: ${entry.c} · ${entry.l}`;
    thumb.classList.toggle("mycar-thumb-logo", !entry);
    thumb.onload = () => thumb.classList.remove("hidden");
    thumb.src = src;
  });

  const checkBtn = el("button", "recent-chip");
  checkBtn.type = "button";
  const plateSpan = el("span", "recent-plate", formatPlate(car.p));
  plateSpan.dir = "ltr";
  checkBtn.appendChild(plateSpan);
  if (car.l) checkBtn.appendChild(el("span", "recent-label", car.l));
  checkBtn.addEventListener("click", () => {
    input.value = formatPlate(car.p);
    runSearch(car.p);
  });
  row.appendChild(checkBtn);

  const testChip = myCarTestChip(car.tokef);
  if (testChip) row.appendChild(testChip);

  const remindDays = daysUntil(car.tokef);
  if (remindDays != null && remindDays >= 0) {
    const icsBtn = el("button", "recent-chip mycar-ics", "🗓 תזכורת ליומן");
    icsBtn.type = "button";
    icsBtn.addEventListener("click", () => downloadTestReminder(car));
    row.appendChild(icsBtn);
  }

  // כשהתוקף מסתיים בקרוב (או פג) — קיצור דרך לחידוש. אחרי יותר משנה
  // התשלום המקוון בדרך כלל לא מספיק (כמו בקופסת החידוש) — מפנים לעמוד
  // הרשמי במקום לשירות התשלומים
  if (remindDays != null && remindDays <= EXPIRY_SOON_DAYS) {
    const longExpired = remindDays < -365;
    const renew = el(
      "a",
      "recent-chip mycar-renew",
      longExpired ? "ℹ️ חידוש מול משרד הרישוי" : "💳 לתשלום ולחידוש",
    );
    renew.href = longExpired ? RENEWAL_INFO_URL : RENEWAL_PAY_URL;
    renew.target = "_blank";
    renew.rel = "noopener";
    row.appendChild(renew);
  }

  myCarSection.append(head, row);
}

/* ---------- כרטיס שיתוף — תמונת תמצית ----------
   במקום קישור יבש, שיתוף מפיק תמונת כרטיס (canvas) שנוחתת יפה בוואטסאפ:
   הלוחית הצהובה, שם הדגם, צ'יפי התמצית, תמונת הדגם (אם נטענה), עובדות
   מפתח, וחותמת תאריך הבדיקה — צילום מסך שחי מחוץ לאפליקציה חייב לשאת
   את התאריך שלו. הקישור החי מצורף לשיתוף, כך שכל נמען במרחק הקלה אחת
   מבדיקה עדכנית. בדפדפן בלי שיתוף קבצים — נופלים לשיתוף הקישור הרגיל */

const CARD_FONT = "-apple-system, 'Segoe UI', Roboto, 'Heebo', Arial, sans-serif";

// טעינה מחדש של תמונת הדגם עם CORS כדי שהקנבס לא "יוכתם" —
// upload.wikimedia.org מגיש עם Access-Control-Allow-Origin: *
function loadCardImage() {
  const domImg = vehicleImageBox.querySelector("img");
  if (vehicleImageBox.classList.contains("hidden") || !domImg?.src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 4000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = domImg.src;
  });
}

// התוכן נאסף מה-DOM החי — תמיד מסונכרן עם מה שהמשתמש רואה
function collectCardData() {
  const wanted = ["שנת ייצור", "צבע", "סוג דלק", "בעלות"];
  const facts = [];
  for (const dt of resultDetails.querySelectorAll("dt")) {
    if (!wanted.includes(dt.textContent) || dt.hidden) continue;
    const dd = dt.nextElementSibling;
    const value = dd?.childNodes[0]?.textContent?.trim();
    if (value && value !== "—") facts.push([dt.textContent, value]);
  }
  return {
    plate: formatPlate(currentPlateDigits || ""),
    title: resultTitle.textContent,
    subtitle: resultSubtitle.classList.contains("hidden") ? "" : resultSubtitle.textContent,
    facts: facts.slice(0, 4),
  };
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildShareCardBlob() {
  const data = collectCardData();
  if (!data.plate || !data.title) return null;
  const vehicleImg = await loadCardImage();

  const W = 1080;
  const PAD = 72;
  const imgH = vehicleImg
    ? Math.min(430, Math.round((W - PAD * 2) * (vehicleImg.naturalHeight / vehicleImg.naturalWidth)))
    : 0;
  const headerH = 150 + 78 + (data.subtitle ? 48 : 0);
  const factsH = data.facts.length * 54 + (data.facts.length ? 26 : 0);
  const footerH = 118;
  const H = PAD + headerH + 16 + (imgH ? imgH + 36 : 6) + factsH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.direction = "rtl";
  ctx.textAlign = "center";

  ctx.fillStyle = "#f6f8fb";
  ctx.fillRect(0, 0, W, H);

  let y = PAD;

  // הלוחית: צהוב ישראלי, מסגרת שחורה, פס כחול עם IL בקצה
  const plateW = 460;
  const plateH = 104;
  const plateX = (W - plateW) / 2;
  roundedRectPath(ctx, plateX, y, plateW, plateH, 14);
  ctx.fillStyle = "#ffd320";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1f2937";
  ctx.stroke();
  ctx.save();
  roundedRectPath(ctx, plateX, y, plateW, plateH, 14);
  ctx.clip();
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(plateX, y, 56, plateH);
  ctx.fillStyle = "#fff";
  ctx.font = `700 30px ${CARD_FONT}`;
  ctx.fillText("IL", plateX + 28, y + plateH / 2 + 11);
  ctx.restore();
  ctx.fillStyle = "#111827";
  ctx.font = `700 60px ${CARD_FONT}`;
  // ממורכז בשטח הצהוב, אחרי הפס הכחול
  ctx.fillText(data.plate, plateX + 56 + (plateW - 56) / 2, y + plateH / 2 + 22);
  y += 150;

  ctx.fillStyle = "#111827";
  ctx.font = `700 52px ${CARD_FONT}`;
  ctx.fillText(data.title, W / 2, y + 40, W - PAD * 2);
  y += 78;
  if (data.subtitle) {
    ctx.fillStyle = "#6b7280";
    ctx.font = `400 32px ${CARD_FONT}`;
    ctx.fillText(data.subtitle, W / 2, y + 22, W - PAD * 2);
    y += 48;
  }

  y += 16;

  if (vehicleImg && imgH) {
    const imgW = W - PAD * 2;
    ctx.save();
    roundedRectPath(ctx, PAD, y, imgW, imgH, 18);
    ctx.clip();
    ctx.drawImage(vehicleImg, PAD, y, imgW, imgH);
    ctx.restore();
    y += imgH + 36;
  } else {
    y += 6;
  }

  if (data.facts.length) {
    ctx.font = `400 32px ${CARD_FONT}`;
    for (const [label, value] of data.facts) {
      ctx.fillStyle = "#6b7280";
      ctx.textAlign = "right";
      ctx.fillText(label, W - PAD, y + 24);
      ctx.fillStyle = "#111827";
      ctx.textAlign = "left";
      ctx.font = `600 32px ${CARD_FONT}`;
      ctx.fillText(value, PAD, y + 24);
      ctx.font = `400 32px ${CARD_FONT}`;
      y += 54;
    }
    ctx.textAlign = "center";
    y += 26;
  }

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  const checkedAt = new Date();
  const stamp = `${String(checkedAt.getDate()).padStart(2, "0")}.${String(checkedAt.getMonth() + 1).padStart(2, "0")}.${checkedAt.getFullYear()}`;
  ctx.fillStyle = "#6b7280";
  ctx.font = `400 28px ${CARD_FONT}`;
  ctx.fillText(`🚗 בדיקת כלי רכב · נבדק ב-${stamp} · הנתונים ממאגרי משרד התחבורה`, W / 2, y + 52, W - PAD * 2);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/* ---------- זרימת החיפוש ---------- */

async function runSearch(digits) {
  const token = ++searchToken;
  // המאגר שומר את מספר הרכב כמספר, ולכן מסירים אפסים מובילים
  const plateNumber = parseInt(digits, 10);

  reflectPlateInUrl(digits);
  hideResult();
  showMessage(MESSAGES.loading, "loading");
  submitBtn.disabled = true;

  try {
    const mainRecords = await ckanSearch(RESOURCES.main, { mispar_rechev: plateNumber });
    if (token !== searchToken) return;

    if (mainRecords.length) {
      const record = mainRecords[0];
      clearMessage();
      renderCard({
        plateDigits: digits,
        title: vehicleTitle(record),
        banner: null,
        rows: mainRegistryRows(record),
      });
      addRecent(digits, vehicleTitle(record));
      updateMyCarCandidate(digits, vehicleTitle(record), record.tokef_dt, record);
      startEnrichments(record, plateNumber, { continuation: true, wltp: true, priceList: true, recalls: true, rarity: true, renewal: true }, token);
      return;
    }

    showMessage(MESSAGES.loadingFallback, "loading");
    // כל מאגרי הגיבוי נשאלים במקביל; הראשון בסדר העדיפות שמחזיר רשומה מוצג
    const results = await Promise.allSettled(
      FALLBACK_CHAIN.map((fallback) =>
        ckanSearch(fallback.resourceId, fallback.filters ? fallback.filters(digits) : { mispar_rechev: plateNumber })
      )
    );
    if (token !== searchToken) return;

    const hitIndex = results.findIndex(
      (result) => result.status === "fulfilled" && result.value.length
    );
    if (hitIndex !== -1) {
      const fallback = FALLBACK_CHAIN[hitIndex];
      const record = results[hitIndex].value[0];
      clearMessage();
      renderCard({
        plateDigits: digits,
        title: vehicleTitle(record),
        banner: typeof fallback.banner === "function" ? fallback.banner(record) : fallback.banner,
        rows: fallback.rows(record),
      });
      addRecent(digits, vehicleTitle(record));
      updateMyCarCandidate(digits, vehicleTitle(record), record.tokef_dt, record);
      startEnrichments(record, plateNumber, fallback.enrich, token);
      return;
    }

    // אם המאגר הראשי ענה אבל כל מאגרי הגיבוי נכשלו — זו שגיאת API, לא "לא נמצא".
    // כשל חלקי (חלק מהמאגרים לא נבדקו) לעולם לא מוצג כ"לא נמצא באף מאגר" —
    // הרכב עשוי להימצא דווקא במאגר שנכשל
    if (results.every((result) => result.status === "rejected")) {
      showMessage(networkErrorMessage(), "error");
    } else if (results.some((result) => result.status === "rejected")) {
      showMessage(MESSAGES.notFoundPartial, "notfound");
    } else {
      showMessage(MESSAGES.notFound, "notfound");
    }
  } catch (error) {
    if (token !== searchToken) return;
    console.error(error);
    showMessage(networkErrorMessage(), "error");
  } finally {
    if (token === searchToken) submitBtn.disabled = false;
  }
}

input.addEventListener("input", () => {
  const digitsBeforeCursor = digitsOnly(input.value.slice(0, input.selectionStart)).length;
  const digits = digitsOnly(input.value).slice(0, 8);
  const formatted = formatPlate(digits);
  if (input.value === formatted) return;

  input.value = formatted;
  // מחזירים את הסמן למקומו: אחרי אותו מספר ספרות שהיו לפניו
  let pos = 0;
  let seen = 0;
  while (pos < formatted.length && seen < digitsBeforeCursor) {
    if (/\d/.test(formatted[pos])) seen += 1;
    pos += 1;
  }
  input.setSelectionRange(pos, pos);
});

/* הדבקה חכמה: אפשר להדביק טקסט שלם (מודעת יד 2, הודעת וואטסאפ) —
   מספר הרישוי מחולץ מתוכו והבדיקה רצה מיד. עדיפות למספר בפורמט לוחית
   (12-345-67); אחרת רצף חשוף של 7-8 ספרות. טלפונים (9-10 ספרות) ומחירים
   עם פסיקים אינם נתפסים; הכול מקומי, בלי לשלוח את הטקסט לשום מקום */
function extractPlateFromText(text) {
  const str = String(text);
  for (const match of str.matchAll(/(?<!\d)\d{2,3}[-־.]\d{2,3}[-־.]\d{2,3}(?!\d)/g)) {
    const digits = digitsOnly(match[0]);
    if (digits.length === 7 || digits.length === 8) return digits;
  }
  return /(?<!\d)(\d{7,8})(?!\d)/.exec(str)?.[1] || null;
}

input.addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text") || "";
  // מספר נקי (ספרות/מקפים/רווחים בלבד) ממשיך במסלול ההקלדה הרגיל
  if (!text || /^[\d\s־.-]*$/.test(text)) return;
  const plate = extractPlateFromText(text);
  if (!plate) return;
  event.preventDefault();
  input.value = formatPlate(plate);
  runSearch(plate);
});

// מיקוד בשדה בוחר את כל המספר, כך שהקלדה מחליפה אותו מיד — הזנת מספר
// חדש בלחיצה אחת ואז הקלדה. rAF כדי לרוץ אחרי מיקום הסמן של הדפדפן
input.addEventListener("focus", () => {
  requestAnimationFrame(() => {
    if (document.activeElement === input && input.value) input.select();
  });
});

// כפתור ✕ — ניקוי מיידי; preventDefault ב-mousedown שומר על המיקוד כדי
// שהמקלדת בנייד לא תיסגר ותיפתח מחדש, וההקלדה החדשה מתחילה מיד
clearInputBtn.addEventListener("mousedown", (event) => event.preventDefault());
clearInputBtn.addEventListener("click", () => {
  input.value = "";
  input.focus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const digits = digitsOnly(input.value);
  if (!isValidPlate(digits)) {
    hideResult();
    showMessage(MESSAGES.invalid, "error");
    input.focus();
    return;
  }

  runSearch(digits);
});

renderRecent();
renderMyCarPanel();

// כניסה דרך קישור משותף (?plate=) — ממלאים את השדה ומריצים בדיקה אוטומטית
const initialPlate = digitsOnly(new URLSearchParams(location.search).get("plate") || "");
if (isValidPlate(initialPlate)) {
  input.value = formatPlate(initialPlate);
  runSearch(initialPlate);
}

// Service Worker — מעטפת האתר נטענת גם ללא רשת והאתר ניתן להתקנה כאפליקציה.
// נתוני חיפוש עצמם תמיד מגיעים חיים מהמאגר (ה-SW לא נוגע בבקשות ל-data.gov.il)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
