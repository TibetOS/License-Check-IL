const API_URL = "https://data.gov.il/api/3/action/datastore_search";
const REQUEST_TIMEOUT_MS = 10000;

const RESOURCES = {
  main: "053cea08-09bc-40ec-8f7a-156f0677aff3",
  continuation: "0866573c-40cd-4ca8-91d2-9dd2d7a492e5",
  wltp: "142afde2-6228-49f9-8a29-9b6c3a0cbe40",
  recalls: "36bf1404-0be4-49d2-82dc-2f1ead4a8b93",
  priceList: "39f455bf-6db0-4926-859d-017f34eacbcb",
  disabledPermit: "c8b9f9c8-4612-4068-934f-d4acd2e3c06e",
  inactive: "f6efe89a-fb3d-43a4-bb61-9bf12a9b9099",
  motorcycles: "bf9df4e2-d90d-4c0a-a400-19e15af8e95f",
  personalImport: "03adc637-b6fe-402b-9937-7c3d3afc9140",
  publicTransport: "cf29862d-ca25-4691-84f6-1be60dcb4a1e",
  inactiveOld: "6f6acd03-f351-4a8f-8ecf-df792f4f573a",
};

const RECENT_KEY = "lci_recent_v1";
const RECENT_MAX = 8;

const form = document.getElementById("search-form");
const input = document.getElementById("plate-input");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultCard = document.getElementById("result");
const resultBanner = document.getElementById("result-banner");
const resultPlate = document.getElementById("result-plate");
const resultTitle = document.getElementById("result-title");
const resultDetails = document.getElementById("result-details");
const safetyBox = document.getElementById("safety-box");
const permitBox = document.getElementById("permit-box");
const recallBox = document.getElementById("recall-box");
const recentSection = document.getElementById("recent");
const recentList = document.getElementById("recent-list");
const clearRecentBtn = document.getElementById("clear-recent");

const MESSAGES = {
  invalid: "מספר רישוי חייב להכיל 7 או 8 ספרות",
  notFound: "הרכב לא נמצא באף אחד מהמאגרים. ייתכן שמדובר ברכב חדש מאוד או במספר שגוי.",
  apiError: "שגיאה בגישה למאגר הממשלתי. נסו שוב בעוד רגע.",
  loading: "בודק את המאגר…",
  loadingFallback: "לא נמצא במאגר הראשי, בודק מאגרים נוספים…",
};

// מזהה חיפוש רץ — מונע עדכון הכרטיס מתוצאות של חיפוש ישן
let searchToken = 0;

function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

function isValidPlate(digits) {
  return /^\d{7,8}$/.test(digits);
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

function withUnit(value, unit) {
  return value != null && value !== "" ? `${value} ${unit}` : null;
}

function formatPrice(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `₪${num.toLocaleString("he-IL")}`;
}

// תג "בתוקף" / "פג תוקף" לפי תאריך ISO
function validityBadge(isoDate) {
  if (!isoDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate));
  if (!match) return null;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return match[0] >= todayIso
    ? { text: "בתוקף", tone: "valid" }
    : { text: "פג תוקף", tone: "expired" };
}

async function ckanSearch(resourceId, filters, limit = 1) {
  const params = new URLSearchParams({
    resource_id: resourceId,
    filters: JSON.stringify(filters),
    limit: String(limit),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.success) throw new Error("CKAN request failed");
    return data?.result?.records || [];
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- הצגת תוצאות ---------- */

function showMessage(text, type) {
  statusEl.innerHTML = "";
  const p = document.createElement("p");
  p.className = `message ${type}`;
  p.textContent = text;
  statusEl.appendChild(p);
}

function clearMessage() {
  statusEl.innerHTML = "";
}

function hideResult() {
  resultCard.classList.add("hidden");
  resultBanner.classList.add("hidden");
  for (const box of [safetyBox, permitBox, recallBox]) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

function setBanner(banner) {
  if (!banner) {
    resultBanner.classList.add("hidden");
    resultBanner.innerHTML = "";
    return;
  }
  resultBanner.innerHTML = "";
  resultBanner.className = `banner banner-${banner.tone}`;
  const strong = document.createElement("strong");
  strong.textContent = banner.title;
  resultBanner.appendChild(strong);
  if (banner.subtitle) {
    const span = document.createElement("span");
    span.textContent = banner.subtitle;
    resultBanner.appendChild(span);
  }
}

// opts: skip — לדלג על שורה ריקה במקום להציג "—"; ltr — ערך טכני (VIN וכד');
// badge — תג {text, tone} שמוצג ליד הערך
function appendDetailRow(label, value, opts = {}) {
  const empty = value == null || value === "";
  if (opts.skip && empty) return;
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = empty ? "—" : String(value);
  if (opts.ltr && !empty) dd.dir = "ltr";
  if (opts.badge && !empty) {
    const badge = document.createElement("span");
    badge.className = `badge badge-${opts.badge.tone}`;
    badge.textContent = opts.badge.text;
    dd.appendChild(badge);
  }
  resultDetails.appendChild(dt);
  resultDetails.appendChild(dd);
}

function renderCard({ plateDigits, title, banner, rows }) {
  resultPlate.textContent = formatPlate(plateDigits);
  resultTitle.textContent = title;
  setBanner(banner);
  resultDetails.innerHTML = "";
  for (const [label, value, opts] of rows) {
    appendDetailRow(label, value, opts);
  }
  resultCard.classList.remove("hidden");
}

function vehicleTitle(record) {
  const manufacturer = record.tozeret_nm || "";
  const model = record.kinuy_mishari || record.degem_nm || "";
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

function motorcycleRows(record) {
  return [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.degem_nm],
    ["סוג רכב", record.sug_rechev_nm],
    ["שנת ייצור", record.shnat_yitzur],
    ["ארץ ייצור", record.tozeret_eretz_nm, { skip: true }],
    ["נפח מנוע", withUnit(record.nefach_manoa, 'סמ"ק')],
    ["הספק", withUnit(record.hespek, 'כ"ס')],
    ["סוג דלק", record.sug_delek_nm],
    ["בעלות", record.baalut],
    ["מספר שלדה", record.misgeret, { skip: true, ltr: true }],
    ["מידת צמיגים", tireSizes(record), { skip: true, ltr: true }],
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

// שרשרת הגיבוי לפי סדר עדיפות — הראשון שמחזיר רשומה קובע
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
    enrich: { recalls: true },
  },
  {
    resourceId: RESOURCES.publicTransport,
    banner: {
      tone: "info",
      title: "רכב ציבורי",
      subtitle: "הרכב מופיע במאגר כלי הרכב הציבוריים (אוטובוסים ומוניות)",
    },
    rows: publicTransportRows,
    enrich: { wltp: true, priceList: true, recalls: true },
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
];

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
  safetyBox.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent = "מערכות בטיחות מותקנות";
  safetyBox.appendChild(title);
  const list = document.createElement("ul");
  for (const [, label] of installed) {
    const li = document.createElement("li");
    li.textContent = `✓ ${label}`;
    list.appendChild(li);
  }
  safetyBox.appendChild(list);
  safetyBox.classList.remove("hidden");
}

function renderPermit(permit) {
  permitBox.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent = "🅿 לרכב זה תו חניה לנכה";
  permitBox.appendChild(title);
  const parts = [];
  if (permit["SUG TAV"] != null) parts.push(`סוג תו: ${permit["SUG TAV"]}`);
  const issued = formatIntDate(permit["TAARICH HAFAKAT TAG"]);
  if (issued) parts.push(`הונפק: ${issued}`);
  if (parts.length) {
    const p = document.createElement("p");
    p.textContent = parts.join(" · ");
    permitBox.appendChild(p);
  }
  permitBox.classList.remove("hidden");
}

function renderRecalls(recalls) {
  recallBox.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent =
    recalls.length === 1
      ? "⚠️ קיימת קריאת ריקול פתוחה שטרם טופלה"
      : `⚠️ קיימות ${recalls.length} קריאות ריקול פתוחות שטרם טופלו`;
  recallBox.appendChild(title);
  for (const recall of recalls) {
    const p = document.createElement("p");
    const details = [recall.SUG_TAKALA, recall.TEUR_TAKALA].filter(Boolean).join(": ");
    const opened = formatDate(recall.TAARICH_PTICHA);
    p.textContent = opened ? `${details} (נפתחה ב-${opened})` : details;
    recallBox.appendChild(p);
  }
  recallBox.classList.remove("hidden");
}

// שורות ההעשרה נוצרות מראש מוסתרות, בסדר קבוע, כדי שהתצוגה לא תשתנה
// לפי סדר ההגעה של התשובות מהרשת
function addPlaceholderRow(key, label) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  dt.hidden = true;
  dt.dataset.enrich = key;
  const dd = document.createElement("dd");
  dd.hidden = true;
  dd.dataset.enrich = key;
  resultDetails.appendChild(dt);
  resultDetails.appendChild(dd);
}

function fillPlaceholderRow(key, value) {
  if (value == null || value === "") return;
  const dd = resultDetails.querySelector(`dd[data-enrich="${key}"]`);
  const dt = resultDetails.querySelector(`dt[data-enrich="${key}"]`);
  if (!dd || !dt) return;
  dd.textContent = String(value);
  dt.hidden = false;
  dd.hidden = false;
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

function startEnrichments(record, plateNumber, options, token) {
  const guard = (fn) => (value) => {
    if (token === searchToken) fn(value);
  };
  const ignore = () => {};

  const joinFilters = modelJoinFilters(record);
  const wantWltp = options.wltp && joinFilters;
  const wantPrice = options.priceList && joinFilters;

  if (options.towHitch) addPlaceholderRow("towHitch", "וו גרירה");
  if (wantWltp) {
    addPlaceholderRow("horsePower", "כוח סוס");
    addPlaceholderRow("gearbox", "תיבת הילוכים");
    addPlaceholderRow("drivetrain", "טכנולוגיית הנעה");
    addPlaceholderRow("body", "מרכב");
    addPlaceholderRow("seats", "מספר מושבים");
    addPlaceholderRow("doors", "מספר דלתות");
    addPlaceholderRow("displacement", "נפח מנוע");
    addPlaceholderRow("weight", "משקל כולל");
    addPlaceholderRow("airbags", "כריות אוויר");
    addPlaceholderRow("towing", "כושר גרירה");
    addPlaceholderRow("co2", "פליטת CO₂");
    addPlaceholderRow("green", "מדד ירוק");
    addPlaceholderRow("safetyScore", "ניקוד בטיחות");
    addPlaceholderRow("safetyLevel", "רמת אבזור בטיחותי");
  }
  if (wantPrice) {
    addPlaceholderRow("listPrice", "מחיר מחירון מקורי");
    addPlaceholderRow("importer", "יבואן");
  }

  if (options.towHitch) {
    ckanSearch(RESOURCES.continuation, { mispar_rechev: plateNumber })
      .then(guard((records) => {
        fillPlaceholderRow("towHitch", records[0]?.grira_nm);
      }))
      .catch(ignore);
  }

  if (wantWltp) {
    ckanSearch(RESOURCES.wltp, joinFilters)
      .then(guard((records) => {
        const model = records[0];
        if (!model) return;
        fillPlaceholderRow("horsePower", withUnit(model.koah_sus, 'כ"ס'));
        if (model.automatic_ind != null) {
          fillPlaceholderRow("gearbox", Number(model.automatic_ind) === 1 ? "אוטומטית" : "ידנית");
        }
        fillPlaceholderRow("drivetrain", model.technologiat_hanaa_nm);
        fillPlaceholderRow("body", model.merkav);
        fillPlaceholderRow("seats", model.mispar_moshavim);
        fillPlaceholderRow("doors", model.mispar_dlatot);
        fillPlaceholderRow("displacement", withUnit(model.nefah_manoa, 'סמ"ק'));
        fillPlaceholderRow("weight", withUnit(model.mishkal_kolel, 'ק"ג'));
        fillPlaceholderRow("airbags", model.mispar_kariot_avir);
        // 0 = אין אישור גרירה — אין טעם להציג
        if (Number(model.kosher_grira_im_blamim) > 0) {
          fillPlaceholderRow("towing", withUnit(model.kosher_grira_im_blamim, 'ק"ג'));
        }
        fillPlaceholderRow("co2", withUnit(model.CO2_WLTP ?? model.kamut_CO2, 'גר׳/ק"מ'));
        fillPlaceholderRow("green", model.madad_yarok);
        fillPlaceholderRow("safetyScore", model.nikud_betihut);
        fillPlaceholderRow("safetyLevel", model.ramat_eivzur_betihuty);
        renderSafetyEquipment(model);
      }))
      .catch(ignore);
  }

  if (wantPrice) {
    ckanSearch(RESOURCES.priceList, joinFilters)
      .then(guard((records) => {
        const listing = records[0];
        if (!listing) return;
        fillPlaceholderRow("listPrice", formatPrice(listing.mehir));
        fillPlaceholderRow("importer", listing.shem_yevuan);
      }))
      .catch(ignore);
  }

  // תו חניה לנכה נבדק לכל רכב שנמצא, בכל אחד מהמאגרים
  // שימו לב: שמות השדות במאגר זה מכילים רווחים
  ckanSearch(RESOURCES.disabledPermit, { "MISPAR RECHEV": plateNumber })
    .then(guard((records) => {
      if (records[0]) renderPermit(records[0]);
    }))
    .catch(ignore);

  if (options.recalls) {
    // שימו לב: שמות השדות במאגר הריקולים באותיות גדולות
    ckanSearch(RESOURCES.recalls, { MISPAR_RECHEV: plateNumber }, 10)
      .then(guard((records) => {
        if (records.length) renderRecalls(records);
      }))
      .catch(ignore);
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
  if (!entries.length) {
    recentSection.classList.add("hidden");
    recentList.innerHTML = "";
    return;
  }
  recentList.innerHTML = "";
  for (const entry of entries) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-chip";
    const plate = document.createElement("span");
    plate.className = "recent-plate";
    plate.dir = "ltr";
    plate.textContent = formatPlate(entry.p);
    button.appendChild(plate);
    if (entry.l) {
      const label = document.createElement("span");
      label.className = "recent-label";
      label.textContent = entry.l;
      button.appendChild(label);
    }
    button.addEventListener("click", () => {
      input.value = formatPlate(entry.p);
      runSearch(entry.p);
    });
    li.appendChild(button);
    recentList.appendChild(li);
  }
  recentSection.classList.remove("hidden");
}

clearRecentBtn.addEventListener("click", () => {
  saveRecent([]);
  renderRecent();
});

/* ---------- זרימת החיפוש ---------- */

async function runSearch(digits) {
  const token = ++searchToken;
  // המאגר שומר את מספר הרכב כמספר, ולכן מסירים אפסים מובילים
  const plateNumber = parseInt(digits, 10);

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
      startEnrichments(record, plateNumber, { towHitch: true, wltp: true, priceList: true, recalls: true }, token);
      return;
    }

    showMessage(MESSAGES.loadingFallback, "loading");
    // כל מאגרי הגיבוי נשאלים במקביל; הראשון בסדר העדיפות שמחזיר רשומה מוצג
    const results = await Promise.allSettled(
      FALLBACK_CHAIN.map((fallback) => ckanSearch(fallback.resourceId, { mispar_rechev: plateNumber }))
    );
    if (token !== searchToken) return;

    for (let i = 0; i < FALLBACK_CHAIN.length; i++) {
      if (results[i].status !== "fulfilled" || !results[i].value.length) continue;
      const fallback = FALLBACK_CHAIN[i];
      const record = results[i].value[0];
      clearMessage();
      renderCard({
        plateDigits: digits,
        title: vehicleTitle(record),
        banner: fallback.banner,
        rows: fallback.rows(record),
      });
      addRecent(digits, vehicleTitle(record));
      startEnrichments(record, plateNumber, fallback.enrich, token);
      return;
    }

    // אם המאגר הראשי ענה אבל כל מאגרי הגיבוי נכשלו — זו שגיאת API, לא "לא נמצא"
    if (results.every((result) => result.status === "rejected")) {
      showMessage(MESSAGES.apiError, "error");
    } else {
      showMessage(MESSAGES.notFound, "notfound");
    }
  } catch (error) {
    if (token !== searchToken) return;
    console.error(error);
    showMessage(MESSAGES.apiError, "error");
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
