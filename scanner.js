/* סריקת לוחית במצלמה — כפתור מצלמה צף בלוחית פותח שכבת-על עם תצוגה חיה,
   והמספר מזוהה במכשיר עצמו (Tesseract.js, נטען מ-CDN רק בלחיצה הראשונה).
   אף פריים לא עוזב את הדפדפן. הפיצ'ר תוספתי בלבד: ללא תמיכת מצלמה הכפתור
   לא מוצג כלל, וכל כשל בזמן ריצה מחזיר להקלדה ידנית עם הודעה ברורה */

// גרסאות נעוצות — ליבת ה-WASM ונתוני השפה חייבים להתאים לגרסת הספרייה
const TESSERACT_CDN = {
  script: "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js",
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
  // מודל ה-fast הרשמי ולא best_int: מהיר משמעותית בזיהוי — הכרחי לסריקה
  // חיה — וגם ההורדה הראשונה קטנה יותר. הקובץ מאוחסן לא דחוס (gzip: false
  // ביצירת ה-worker), והדחיסה נעשית בשכבת התעבורה של ה-CDN
  langPath: "https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@4.1.0",
};

// מפתח המטמון של נתוני השפה ב-IndexedDB אינו כולל את כתובת ההורדה —
// בלי נתיב מטמון חדש, מכשירים שסרקו בעבר היו נשארים עם המודל האיטי הישן
const TESSERACT_CACHE_PATH = "tessdata-fast-4.1.0";

// ניקוי חד-פעמי של המודל הישן והכבד מהמטמון (נשמר בעבר תחת המפתח
// שלהלן). משוחרר-כשלים: בדפדפן בלי indexedDB.databases פשוט מדלגים,
// כדי לא ליצור בטעות מסד ריק שישבור את המטמון של הספרייה
function purgeLegacyOcrCache() {
  try {
    if (typeof indexedDB === "undefined" || !indexedDB || typeof indexedDB.databases !== "function") return;
    indexedDB
      .databases()
      .then((dbs) => {
        if (!dbs?.some((db) => db.name === "keyval-store")) return;
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => {
          const db = open.result;
          try {
            db.transaction("keyval", "readwrite").objectStore("keyval").delete("./eng.traineddata");
          } catch {
            // מבנה לא צפוי — לא נוגעים
          }
          db.close();
        };
      })
      .catch(() => {});
  } catch {
    // אין IndexedDB — אין מה לנקות
  }
}

const SCANNER_MESSAGES = {
  noCamera: "לא ניתנה גישה למצלמה — אפשר להקליד את המספר ידנית",
  ocrLoadFailed: "טעינת רכיב הזיהוי נכשלה — בדקו את החיבור לאינטרנט או הקלידו את המספר ידנית",
  requesting: "מבקש גישה למצלמה…",
  loadingOcr: "טוען רכיב זיהוי…",
  scanning: "כוונו את המצלמה אל הלוחית",
  confirming: "מזהה… החזיקו יציב לאימות",
  locked: "זוהה ✓",
  help: "לא נקרא? התקרבו ללוחית, יַשְּׁרו את הזווית והימנעו מסנוור — או השתמשו בהעלאת תמונה",
  photoScanning: "מחפש מספר בתמונה…",
  photoNone: "לא זוהה מספר בתמונה — נסו תמונה קרובה או חדה יותר",
  photoPick: "נמצאו כמה מספרים — בחרו את המספר הנכון",
  uploadLabel: "העלאת תמונה",
  privacy: "הזיהוי מתבצע כולו במכשיר — התמונות אינן נשלחות לשום שרת",
};

// אחרי כמה זמן ללא קריאה מוצלחת מוחלפת ההנחיה בטיפ עזרה
const SCAN_HELP_AFTER_MS = 8000;

// גבולות רוחב הקנבס שמוזן ל-OCR: התקרה שומרת על זמן זיהוי קצר, והרוחב
// בפועל נצמד למספר הפיקסלים האמיתי שנחתך מהפריים — הגדלה מלאכותית מעבר
// לכך רק מאטה את הזיהוי בלי להוסיף פרטים
const OCR_CANVAS_WIDTH = 800;
const OCR_CANVAS_MIN_WIDTH = 320;

// בידוד הלוחית לפי צבע, בדגימת עמודות גסה: לוחית ישראלית היא צהובה,
// והפס הכחול (סמל המדינה) בקצה נקרא על-ידי הרשימה הלבנה כספרת-רפאים.
// שומרים רק את רצף העמודות הצהוב הקרוב למרכז המסגרת ומלבינים את השאר;
// בלי אות צהוב (תאורה קשה) מלבינים לפחות את העמודות הכחולות
const PLATE_SAMPLE_COLS = 96;
const PLATE_YELLOW_MIN = 20;
const PLATE_BLUE_MIN = 16;
const PLATE_RUN_MIN_COLS = 10;
const PLATE_RUN_PAD_COLS = 2;

// סינון קצוות: ברגים, צל בשפת הלוחית ולכלוך נקראים כספרות בקצות הרצף,
// וגובהם חורג בבירור מגובה הספרות האמיתיות. חריג גובה בקצה מוסר (עד
// שניים מכל צד); באמצע הרצף התו נשמר — שם ה-bbox לעיתים שגוי אך התו נכון
const EDGE_HEIGHT_HIGH = 1.4;
const EDGE_HEIGHT_LOW = 0.6;
const EDGE_STRIP_MAX = 2;

// אימות: אותה קריאה פעמיים מתוך שלוש הקריאות התקינות האחרונות — סובלני
// לפריים רועש בודד באמצע, בניגוד לדרישת רצף שנשברת מכל שגיאה. היסטוריה
// שלא התחדשה זמן-מה נמחקת: המצלמה כנראה הופנתה ללוחית אחרת
const SCAN_VOTE_WINDOW = 3;
const SCAN_STALE_MS = 2500;

// איתור אזורי לוחית בתמונה שהועלתה: רשת דגימה גסה של תאי-צבע, שורות עם
// די תאים צהובים מרכיבות רצועות-מועמדות, ובכל רצועה נלקח רצף העמודות
// הרחב. עד שלושה אזורים נבדקים במסלול הרצועה של הסריקה החיה
const PHOTO_GRID_COLS = 160;
const PHOTO_MIN_CELLS = 6;
const PHOTO_REGIONS_MAX = 3;

// איתור הלוחית בפריים החי — במקום חיתוך מסגרת קבועה. אותו איתור-צבע של
// מסלול התמונה רץ על הפריים כולו, כך שהלוחית נקראת היכן שהיא בתמונה ולא
// רק כשהיא ממורכזת במסגרת. גריד עדין יותר (הלוחית קטנה יותר יחסית לפריים)
// ובחירת האזור בעל צורת-הלוחית הטובה ביותר — לא הגדול ביותר, כדי לא לבלוע
// גוף רכב צהבהב. העלות זולה: הקטנה אחת + קריאת פיקסלים של גריד זעיר
const LIVE_DETECT_WIDTH = 640;
const LIVE_GRID_COLS = 200;
const LIVE_MIN_CELLS = 5;
const LIVE_REGIONS_MAX = 5;
const PLATE_MIN_ASPECT = 1.8;

// שער-הטיה: לוחית מוטה בבירור נקראת לעיתים כמספר באורך תקין אך שגוי
// (ספרת-רפאים מהקצה המוטה). מוטב לא לנעול קריאה כזו אלא להנחות ליישור.
// הזווית מוערכת גאומטרית מפיזור הצהוב (בלי OCR); ההערכה נוטה להמעיט, ולכן
// סף נמוך יחסית — הטיה מוערכת מעל ~4° (≈8° בפועל) חוסמת נעילה. פרספקטיבה
// קלה (רוב הצילומים מהיד) נשארת מתחת לסף ונקראת רגיל
const SKEW_LOCK_MAX = 4;

// קצב הלולאה: זמן הזיהוי עצמו מנוכה מההפוגה, וכשמועמד ממתין לאימות
// הפריים הבא נדגם כמעט מיד — ההמתנה הקבועה הקודמת האטה כל נעילה
const SCAN_IDLE_MS = 150;
const SCAN_CONFIRM_IDLE_MS = 40;
const SCAN_MIN_YIELD_MS = 20;

let scannerOverlay = null;
let scannerVideo = null;
let scannerGuide = null;
let scannerStatus = null;
let scannerReading = null;
let scannerCloseBtn = null;
let scannerTorchBtn = null;
let scannerZoomRow = null;
let scannerUploadInput = null;
let scannerCandidates = null;
let cameraButton = null;
let torchOn = false;

// זום: כשהמצלמה תומכת בזום מקורי (getCapabilities().zoom) משתמשים בו;
// אחרת זום דיגיטלי — הגדלת התצוגה ב-CSS. חיתוך ה-OCR נגזר ממלבן המסגרת
// ביחס למלבן הווידאו המוצג (getBoundingClientRect), ולכן ה-transform
// מקטין אוטומטית את אזור המקור — אותו אפקט כמו זום אמיתי
let zoomLevel = 1;
let maxZoom = 3;
let nativeZoomMax = null;
let nativeZoomBusy = false;

// עצירת הסריקה החיה בזמן עיבוד תמונה שהועלתה או בחירת מועמד ממנה
let photoHold = false;

// קריאת progress של טעינת רכיב הזיהוי — נקבעת בפתיחת הסורק ומעדכנת
// את שורת הסטטוס באחוזים בזמן ההורדה הראשונה (כמה MB ברשת סלולרית)
let ocrLoadProgress = null;

// קנבס ה-OCR משוחזר בין פריימים — יצירת קנבס חדש לכל פריים גורמת
// לזבל-זיכרון מיותר, בעיקר בניידים. קנבס ה-OCR נשאר ב-GPU (בלי קריאת
// פיקסלים): קריאת פיקסלים ממנו הייתה גוררת העתקת פריים 4K למעבד בכל
// מחזור — הסיבה המרכזית לגמגום התצוגה. דגימת הצבע לבידוד הלוחית נעשית
// על קנבס זעיר נפרד, שקריאתו זולה
let ocrCanvas = null;
let plateSampleCanvas = null;
// קנבס-האיתור של הפריים החי (מוקטן), משוחזר בין פריימים כמו קנבס ה-OCR
let frameCanvas = null;

// מזהה סשן רץ — סוגר לולאות זיהוי ישנות כשהשכבה נסגרת ונפתחת מחדש
let scanSession = 0;
let activeStream = null;

let tesseractScriptPromise = null;
let tesseractWorkerPromise = null;

function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve();
  if (!tesseractScriptPromise) {
    tesseractScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_CDN.script;
      script.onload = resolve;
      script.onerror = () => {
        // כישלון טעינה (אין רשת וכו') — מאפשרים ניסיון חוזר בפתיחה הבאה
        tesseractScriptPromise = null;
        script.remove();
        reject(new Error("tesseract script load failed"));
      };
      document.head.appendChild(script);
    });
  }
  return tesseractScriptPromise;
}

// ה-worker נבנה פעם אחת ונשמר להמשך הסשן — פתיחה חוזרת של הסורק מיידית
function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = loadTesseractScript()
      .then(() =>
        Tesseract.createWorker("eng", 1, {
          workerPath: TESSERACT_CDN.workerPath,
          corePath: TESSERACT_CDN.corePath,
          langPath: TESSERACT_CDN.langPath,
          gzip: false,
          cachePath: TESSERACT_CACHE_PATH,
          // אירועי טעינה בלבד (לא אירועי זיהוי) מדווחים לשורת הסטטוס
          logger: (m) => {
            if (typeof m?.progress === "number" && /loading/.test(String(m?.status))) {
              ocrLoadProgress?.(m.progress);
            }
          },
        }),
      )
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789",
          // שורה גולמית (PSM 13) ולא "שורה יחידה" (7): מצב 7 מפעיל איתור
          // שורות פנימי שנכשל כליל על רצועת החיתוך של המסגרת — הוא החזיר
          // ריק או זבל גם כשהלוחית מילאה את המסגרת. מצב 13 מזין את הרצועה
          // ישירות לרשת הזיהוי
          tessedit_pageseg_mode: "13",
          // הלוחית תמיד כהה-על-בהיר — ביטול ניסיון-ההיפוך של פריימים
          // חלשים חוסך עד מחצית מזמן הזיהוי בדיוק בפריימים הקשים
          tessedit_do_invert: "0",
        });
        purgeLegacyOcrCache();
        return worker;
      })
      .catch((error) => {
        tesseractWorkerPromise = null;
        throw error;
      });
  }
  return tesseractWorkerPromise;
}

/* ---------- שכבת הסריקה (נבנית בעצלתיים בפתיחה הראשונה) ---------- */

function buildScannerOverlay() {
  scannerOverlay = el("div", "scanner-overlay");
  scannerOverlay.setAttribute("role", "dialog");
  scannerOverlay.setAttribute("aria-modal", "true");
  scannerOverlay.setAttribute("aria-label", "סריקת לוחית רישוי במצלמה");

  scannerVideo = el("video", "scanner-video");
  // playsinline כמאפיין HTML — חובה ב-iOS כדי שהווידאו לא ייפתח במסך מלא
  scannerVideo.setAttribute("playsinline", "");
  scannerVideo.muted = true;
  scannerVideo.autoplay = true;

  const closeBtn = (scannerCloseBtn = el("button", "scanner-close"));
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "סגירת הסורק");
  const closeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  closeSvg.setAttribute("viewBox", "0 0 24 24");
  closeSvg.setAttribute("aria-hidden", "true");
  const closePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  closePath.setAttribute("d", "M6 6L18 18M18 6L6 18");
  closeSvg.appendChild(closePath);
  closeBtn.appendChild(closeSvg);
  closeBtn.addEventListener("click", () => closeScanner());

  // כפתור פנס — מוצג רק כשהמצלמה תומכת (updateTorchButton אחרי פתיחת הזרם)
  scannerTorchBtn = el("button", "scanner-torch");
  scannerTorchBtn.type = "button";
  scannerTorchBtn.hidden = true;
  scannerTorchBtn.setAttribute("aria-label", "פנס");
  scannerTorchBtn.setAttribute("aria-pressed", "false");
  const torchSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  torchSvg.setAttribute("viewBox", "0 0 24 24");
  torchSvg.setAttribute("aria-hidden", "true");
  const torchPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  torchPath.setAttribute("d", "M13 2L4.5 13.5H10L9 22l8.5-11.5H12z");
  torchSvg.appendChild(torchPath);
  scannerTorchBtn.appendChild(torchSvg);
  scannerTorchBtn.addEventListener("click", toggleTorch);

  const frame = el("div", "scanner-frame");
  scannerGuide = el("div", "scanner-guide");
  // רצועת הקריאה החיה — מציגה בזמן אמת את הספרות שהזיהוי קורא.
  // הרצועה והסטטוס יושבים במיכל נפרד שממוקם אבסולוטית מתחת למסגרת:
  // הופעתם והיעלמותם אסור שיזיזו את המסגרת, כי אזור החיתוך של ה-OCR
  // נגזר ממיקומה — הזזה באמצע זיהוי שוברת את אימות שני הפריימים
  scannerReading = el("div", "scanner-reading");
  scannerReading.dir = "ltr";
  scannerReading.hidden = true;
  scannerStatus = el("p", "scanner-status");
  const feedback = el("div", "scanner-feedback");
  feedback.append(scannerReading, scannerStatus);
  frame.append(scannerGuide, feedback);

  // מועמדים מתוך תמונה שהועלתה — כשנמצאו כמה מספרים, בוחרים ידנית
  scannerCandidates = el("div", "scanner-candidates");
  scannerCandidates.hidden = true;

  // סרגל תחתון: כפתורי זום + העלאת תמונה
  scannerZoomRow = el("div", "scanner-zoom");
  scannerUploadInput = el("input");
  scannerUploadInput.type = "file";
  scannerUploadInput.accept = "image/*";
  scannerUploadInput.hidden = true;
  scannerUploadInput.addEventListener("change", () => {
    const file = scannerUploadInput.files?.[0];
    // איפוס מיידי — מאפשר לבחור שוב את אותו קובץ בניסיון הבא
    scannerUploadInput.value = "";
    handlePhotoFile(file);
  });
  const uploadBtn = el("button", "scanner-upload");
  uploadBtn.type = "button";
  const uploadSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  uploadSvg.setAttribute("viewBox", "0 0 24 24");
  uploadSvg.setAttribute("aria-hidden", "true");
  const uploadPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  uploadPath.setAttribute("d", "M4 17V5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5zm0 0l4.5-5 3.5 4 3-3.5 5 4.5M9.5 9.5a1.3 1.3 0 11-2.6 0 1.3 1.3 0 012.6 0z");
  uploadSvg.appendChild(uploadPath);
  uploadBtn.append(uploadSvg, el("span", null, SCANNER_MESSAGES.uploadLabel));
  uploadBtn.addEventListener("click", () => scannerUploadInput.click());
  const controls = el("div", "scanner-controls");
  controls.append(scannerZoomRow, uploadBtn, scannerUploadInput);

  scannerOverlay.append(
    scannerVideo,
    closeBtn,
    scannerTorchBtn,
    frame,
    scannerCandidates,
    controls,
    el("p", "scanner-privacy", SCANNER_MESSAGES.privacy),
  );
  document.body.appendChild(scannerOverlay);
  attachPinchZoom();
}

/* ---------- זום (מקורי כשנתמך, דיגיטלי כגיבוי) ---------- */

function setZoom(level) {
  zoomLevel = Math.min(maxZoom, Math.max(1, level));
  for (const button of scannerZoomRow.querySelectorAll("button")) {
    button.classList.toggle("active", Math.abs(Number(button.dataset.zoom) - zoomLevel) < 0.5);
  }
  if (nativeZoomMax) {
    scannerVideo.style.transform = "";
    applyNativeZoom();
  } else {
    scannerVideo.style.transform = zoomLevel > 1 ? `scale(${zoomLevel})` : "";
  }
}

// applyConstraints הוא אסינכרוני — לולאת ההחלה רצה עד שהערך המבוקש
// האחרון הוחל, בלי לערום קריאות במהלך תנועת צביטה
async function applyNativeZoom() {
  if (nativeZoomBusy) return;
  nativeZoomBusy = true;
  const track = activeStream?.getVideoTracks?.()[0];
  let applied = null;
  try {
    while (track && applied !== zoomLevel) {
      applied = zoomLevel;
      await track.applyConstraints({ advanced: [{ zoom: applied }] });
    }
  } catch {
    // הזום המקורי נכשל בפועל — נסוגים לזום דיגיטלי
    nativeZoomMax = null;
    scannerVideo.style.transform = zoomLevel > 1 ? `scale(${zoomLevel})` : "";
  } finally {
    nativeZoomBusy = false;
  }
}

function updateZoomSupport() {
  scannerVideo.style.transform = "";
  const caps = activeStream?.getVideoTracks?.()[0]?.getCapabilities?.();
  nativeZoomMax = caps?.zoom?.max > 1 ? caps.zoom.max : null;
  maxZoom = nativeZoomMax ? Math.min(nativeZoomMax, 5) : 3;
  scannerZoomRow.replaceChildren();
  for (const level of [1, 2, 3].filter((l) => l <= maxZoom)) {
    const button = el("button", "scanner-zoom-btn", `${level}×`);
    button.type = "button";
    button.dataset.zoom = String(level);
    button.addEventListener("click", () => setZoom(level));
    scannerZoomRow.appendChild(button);
  }
  setZoom(1);
}

// צביטה לזום — שתי אצבעות על הווידאו; touch-action: none במסך מונע
// מהדפדפן לפרש את המחווה כזום עמוד
function attachPinchZoom() {
  const pointers = new Map();
  let pinchBase = null;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  scannerVideo.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) pinchBase = { dist: distance(), zoom: zoomLevel };
  });
  scannerVideo.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinchBase) {
      setZoom(pinchBase.zoom * (distance() / pinchBase.dist));
    }
  });
  for (const type of ["pointerup", "pointercancel"]) {
    scannerVideo.addEventListener(type, (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchBase = null;
    });
  }
}

// עדכון רצועת הקריאה ומצב מסגרת הכיוון:
// partial — קריאה חלקית (מעומעם); candidate — מועמד מלא הממתין לאימות
// (מסגרת כתומה); locked — אומת (מסגרת ירוקה, רגע לפני הסגירה)
function setScanReading(digits, state) {
  if (!scannerReading) return;
  if (digits) {
    scannerReading.textContent = formatPlate(digits);
    scannerReading.hidden = false;
  } else {
    scannerReading.textContent = "";
    scannerReading.hidden = true;
  }
  scannerReading.classList.toggle("partial", state === "partial");
  scannerReading.classList.toggle("locked", state === "locked");
  scannerGuide.classList.toggle("candidate", state === "candidate");
  scannerGuide.classList.toggle("locked", state === "locked");
}

/* ---------- פנס (במכשירים שתומכים) ---------- */

async function toggleTorch() {
  const track = activeStream?.getVideoTracks?.()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
    torchOn = !torchOn;
    scannerTorchBtn.classList.toggle("on", torchOn);
    scannerTorchBtn.setAttribute("aria-pressed", String(torchOn));
  } catch {
    // הפנס לא נדלק — משאירים את המצב כפי שהיה
  }
}

function updateTorchButton() {
  torchOn = false;
  scannerTorchBtn.classList.remove("on");
  scannerTorchBtn.setAttribute("aria-pressed", "false");
  const caps = activeStream?.getVideoTracks?.()[0]?.getCapabilities?.();
  scannerTorchBtn.hidden = !caps?.torch;
}

function setScannerStatus(text) {
  if (scannerStatus) scannerStatus.textContent = text;
}

function onScannerKeydown(event) {
  if (event.key === "Escape") {
    closeScanner();
  } else if (event.key === "Tab") {
    // מלכודת מיקוד: כפתור הסגירה הוא האלמנט היחיד הניתן למיקוד בדיאלוג,
    // ולכן Tab נשאר עליו ואינו בורח לפקדים המוסתרים שמאחורי השכבה
    event.preventDefault();
    scannerCloseBtn.focus();
  }
}

function stopStream() {
  if (activeStream) {
    for (const track of activeStream.getTracks()) track.stop();
    activeStream = null;
  }
  if (scannerVideo) scannerVideo.srcObject = null;
}

// failureMessage — כשהסגירה נובעת מכשל, ההודעה מוצגת ליד שדה הקלט
function closeScanner(failureMessage) {
  scanSession += 1;
  stopStream();
  const wasOpen = Boolean(scannerOverlay?.classList.contains("open"));
  if (scannerOverlay) scannerOverlay.classList.remove("open");
  setScanReading(null);
  if (scannerTorchBtn) scannerTorchBtn.hidden = true;
  if (scannerCandidates) hidePhotoCandidates();
  photoHold = false;
  if (scannerVideo) scannerVideo.style.transform = "";
  document.removeEventListener("keydown", onScannerKeydown);
  if (failureMessage) showMessage(failureMessage, "warn");
  // נגישות: המיקוד חוזר לכפתור שפתח את הדיאלוג (כפתור המצלמה הוא
  // הדרך היחידה לפתיחה — מיקוד ישיר בו נכון תמיד ואינו פותח מקלדת)
  if (wasOpen && cameraButton) cameraButton.focus();
}

async function openScanner() {
  if (!scannerOverlay) buildScannerOverlay();

  const session = ++scanSession;
  scannerOverlay.classList.add("open");
  document.addEventListener("keydown", onScannerKeydown);
  setScanReading(null);
  setScannerStatus(SCANNER_MESSAGES.requesting);
  clearMessage();
  // נגישות: המיקוד עובר אל תוך הדיאלוג — לכפתור הסגירה
  scannerCloseBtn.focus();

  // בהורדה הראשונה של רכיב הזיהוי מציגים אחוזי התקדמות
  ocrLoadProgress = (progress) => {
    if (session === scanSession) {
      setScannerStatus(`${SCANNER_MESSAGES.loadingOcr} ${Math.round(progress * 100)}%`);
    }
  };

  // רכיב הזיהוי נטען במקביל לבקשת המצלמה — כשל בטעינתו מטופל בהמשך,
  // ולכן דוחסים כאן catch ריק כדי שלא תיווצר דחייה לא-מטופלת
  const workerPromise = getTesseractWorker();
  workerPromise.catch(() => {});

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        // רזולוציה גבוהה ככל האפשר — חיתוך המסגרת מקבל פי כמה יותר
        // פיקסלים של לוחית, ואפשר לסרוק ממרחק עמידה רגיל
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        // פוקוס רציף היכן שנתמך; דפדפנים מתעלמים ממגבלות לא מוכרות
        advanced: [{ focusMode: "continuous" }],
      },
      audio: false,
    });
  } catch {
    if (session === scanSession) closeScanner(SCANNER_MESSAGES.noCamera);
    return;
  }
  if (session !== scanSession || document.hidden) {
    // השכבה נסגרה בזמן ההמתנה לאישור, או שהדף עבר לרקע בזמן חלון ההרשאה —
    // משחררים את המצלמה מיד במקום להפעיל אותה ברקע
    for (const track of stream.getTracks()) track.stop();
    if (session === scanSession) closeScanner();
    return;
  }

  activeStream = stream;
  scannerVideo.srcObject = stream;
  // play() עלול להידחות אם הסשן נסגר באמצע — לא קריטי, הלולאה ממילא תיעצר
  scannerVideo.play().catch(() => {});
  updateTorchButton();
  updateZoomSupport();

  setScannerStatus(SCANNER_MESSAGES.loadingOcr);
  let worker;
  try {
    worker = await workerPromise;
  } catch {
    if (session === scanSession) closeScanner(SCANNER_MESSAGES.ocrLoadFailed);
    return;
  }
  if (session !== scanSession) return;

  setScannerStatus(SCANNER_MESSAGES.scanning);
  scanLoop(worker, session);
}

/* ---------- לולאת הזיהוי ---------- */

// דירוג אזור מועמד לפי צורת-לוחית: יחס רוחב/גובה בטווח הלוחית מקבל ניקוד
// מלא, ואזור שממלא כמעט את כל הפריים (גוף רכב) או זעיר מדי מקבל ניקוד נמוך.
// כך נבחר האזור הדמוי-לוחית ולא בהכרח הגדול ביותר
function scorePlateRegion(region, canvas) {
  const aspect = region.w / region.h;
  const aspectScore = aspect >= 2.5 && aspect <= 6 ? 1 : aspect >= PLATE_MIN_ASPECT ? 0.6 : 0.15;
  const areaFrac = (region.w * region.h) / (canvas.width * canvas.height);
  const sizeScore = areaFrac > 0.5 ? 0.2 : areaFrac < 0.002 ? 0.3 : 1;
  return aspectScore * sizeScore;
}

// איתור הלוחית בכל מקום בפריים החי: הפריים מוקטן לקנבס-איתור, אזורים
// צהובים מאותרים כמו במסלול התמונה, נבחר האזור בעל צורת-הלוחית הטובה
// ביותר, וקואורדינטותיו ממופות חזרה לווידאו המלא לחיתוך רצועת ה-OCR.
// אין דרישת יישור: הלוחית נקראת גם כשאינה ממורכזת. בלי אזור צהוב — null
function grabPlateRegion() {
  const vw = scannerVideo.videoWidth;
  const vh = scannerVideo.videoHeight;
  if (!vw || !vh) return null;

  if (!frameCanvas) frameCanvas = document.createElement("canvas");
  const dw = Math.min(LIVE_DETECT_WIDTH, vw);
  frameCanvas.width = dw;
  frameCanvas.height = Math.max(1, Math.round((dw * vh) / vw));
  const fctx = frameCanvas.getContext("2d");
  fctx.drawImage(scannerVideo, 0, 0, frameCanvas.width, frameCanvas.height);

  const regions = findPlateRegions(frameCanvas, {
    gridCols: LIVE_GRID_COLS,
    minCells: LIVE_MIN_CELLS,
    maxRegions: LIVE_REGIONS_MAX,
  });
  let best = null;
  let bestScore = 0;
  for (const region of regions) {
    if (region.w / region.h < PLATE_MIN_ASPECT) continue;
    const score = scorePlateRegion(region, frameCanvas);
    if (score > bestScore) {
      bestScore = score;
      best = region;
    }
  }
  if (!best) return null;

  // מיפוי לקואורדינטות הווידאו המלא + ריפוד קטן (אנכי רחב יותר, לרווח מעל
  // ומתחת לספרות), וחיתוך ברזולוציה המלאה לפרטים מרביים
  const sxScale = vw / frameCanvas.width;
  const syScale = vh / frameCanvas.height;
  const padX = best.w * sxScale * 0.06;
  const padY = best.h * syScale * 0.18;
  const sx = Math.max(0, best.x * sxScale - padX);
  const sy = Math.max(0, best.y * syScale - padY);
  const sw = Math.min(vw - sx, best.w * sxScale + 2 * padX);
  const sh = Math.min(vh - sy, best.h * syScale + 2 * padY);
  if (sw <= 0 || sh <= 0) return null;

  return ocrStripFromSource(scannerVideo, sx, sy, sw, sh);
}

// הערכת הטיית הלוחית ללא OCR: מרכז-המסה האנכי של הפיקסלים הצהובים בכל
// עמודה יושב על ציר הלוחית, ושיפוע הרגרסיה שלו הוא טנגנס זווית ההטיה
function estimatePlateSkew(canvas) {
  const w = 120;
  const h = Math.max(8, Math.round((w * canvas.height) / canvas.width));
  const sample = document.createElement("canvas");
  sample.width = w;
  sample.height = h;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const cols = [];
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if ((px[i] + px[i + 1]) / 2 - px[i + 2] > PLATE_YELLOW_MIN) {
        sum += y;
        count++;
      }
    }
    if (count > 0) cols.push([x, sum / count]);
  }
  if (cols.length < 10) return null;
  const n = cols.length;
  const sx = cols.reduce((a, p) => a + p[0], 0);
  const sy = cols.reduce((a, p) => a + p[1], 0);
  const sxx = cols.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = cols.reduce((a, p) => a + p[0] * p[1], 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-6) return null;
  const slope = (n * sxy - sx * sy) / denom;
  return (Math.atan(slope) * 180) / Math.PI;
}

// הכנת רצועת OCR מתוך מקור (פריים וידאו או קנבס תמונה): חיתוך, מיזעור
// לרוחב העבודה ובידוד הלוחית. משותף לסריקה החיה ולאזורי לוחית בתמונה
function ocrStripFromSource(source, sx, sy, sw, sh) {
  if (!ocrCanvas) ocrCanvas = document.createElement("canvas");
  const canvas = ocrCanvas;
  // קביעת המידות מנקה את הקנבס לקראת הפריים החדש
  const width = Math.round(Math.min(OCR_CANVAS_WIDTH, Math.max(OCR_CANVAS_MIN_WIDTH, sw)));
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((width * sh) / sw));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  isolatePlateColumns(ctx, canvas);
  return canvas;
}

// פרופיל "צהיבות" לכל עמודה — ממוצע (R+G)/2 - B — מתוך דגימה גסה של
// קנבס ה-OCR. חיובי מובהק על לוחית צהובה, שלילי מובהק על הפס הכחול
function sampleColumnYellowness(canvas) {
  if (!plateSampleCanvas) plateSampleCanvas = document.createElement("canvas");
  const sample = plateSampleCanvas;
  sample.width = PLATE_SAMPLE_COLS;
  sample.height = Math.max(4, Math.round((PLATE_SAMPLE_COLS * canvas.height) / canvas.width));
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
  const profile = new Array(PLATE_SAMPLE_COLS).fill(0);
  for (let y = 0; y < sample.height; y++) {
    for (let x = 0; x < sample.width; x++) {
      const i = (y * sample.width + x) * 4;
      profile[x] += (pixels[i] + pixels[i + 1]) / 2 - pixels[i + 2];
    }
  }
  for (let x = 0; x < profile.length; x++) profile[x] /= sample.height;
  return profile;
}

// רצפי עמודות שבהם הפרופיל מעל סף
function columnRunsAbove(profile, threshold) {
  const runs = [];
  let start = null;
  for (let c = 0; c <= profile.length; c++) {
    const hit = c < profile.length && profile[c] > threshold;
    if (hit && start === null) start = c;
    if (!hit && start !== null) {
      runs.push([start, c]);
      start = null;
    }
  }
  return runs;
}

function whiteOutColumns(ctx, canvas, fromCol, toCol) {
  const x0 = Math.floor((fromCol * canvas.width) / PLATE_SAMPLE_COLS);
  const x1 = Math.ceil((toCol * canvas.width) / PLATE_SAMPLE_COLS);
  if (x1 > x0) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(x0, 0, x1 - x0, canvas.height);
  }
}

// בידוד הלוחית בקנבס לפני הזיהוי: נשמר רצף העמודות הצהוב (רחב מספיק)
// הקרוב ביותר למרכז המסגרת והשאר מולבן — כך נעלמים הפס הכחול, שולי
// הפגוש והרקע, שהרשימה הלבנה של ה-OCR הופכת לספרות-רפאים. בלי רצף צהוב
// (לילה, תאורה קיצונית) מולבנות לפחות העמודות הכחולות, וכשגם זה אין —
// הקנבס נשאר כפי שהוא
function isolatePlateColumns(ctx, canvas) {
  const profile = sampleColumnYellowness(canvas);
  const yellowRuns = columnRunsAbove(profile, PLATE_YELLOW_MIN).filter(
    ([from, to]) => to - from >= PLATE_RUN_MIN_COLS,
  );
  if (yellowRuns.length) {
    const mid = PLATE_SAMPLE_COLS / 2;
    yellowRuns.sort(
      (a, b) => Math.abs((a[0] + a[1]) / 2 - mid) - Math.abs((b[0] + b[1]) / 2 - mid),
    );
    const [from, to] = yellowRuns[0];
    // משמאל אין ריפוד: שם צמוד לצהוב הפס הכחול, וכל רצועה שלו שנשארת
    // נקראת כספרה מובילה. הצהוב מתחיל לפני הספרה הראשונה, כך שאין סיכון
    // לחיתוך ספרה אמיתית; מימין הריפוד נשאר ליתר ביטחון
    whiteOutColumns(ctx, canvas, 0, from);
    whiteOutColumns(ctx, canvas, Math.min(PLATE_SAMPLE_COLS, to + PLATE_RUN_PAD_COLS), PLATE_SAMPLE_COLS);
    return;
  }
  for (const [from, to] of columnRunsAbove(profile.map((v) => -v), PLATE_BLUE_MIN)) {
    whiteOutColumns(ctx, canvas, from, to);
  }
}

// JPEG במקום ברירת המחדל של הספרייה (PNG דרך toBlob) — קידוד מהיר וקובץ
// קטן בהרבה להעברה אל ה-worker
function canvasToJpegBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

// הרכבת הקריאה מרצף הסימנים שזוהו: ספרות בלבד, ובקצות הרצף מוסרים
// חריגי-גובה — ברגים, צל ושפת הלוחית שנקראו כספרות. raw (הטקסט המלא
// אחרי ניקוי) נשמר כעתודה למקרה שנתוני הסימנים חסרים
function extractScanRead(data) {
  const raw = (data?.text || "").replace(/\D/g, "");
  const symbols = [];
  for (const block of data?.blocks || []) {
    for (const paragraph of block?.paragraphs || []) {
      for (const line of paragraph?.lines || []) {
        for (const word of line?.words || []) {
          for (const symbol of word?.symbols || []) {
            if (/^\d$/.test(symbol?.text || "")) symbols.push(symbol);
          }
        }
      }
    }
  }
  if (!symbols.length) return { digits: raw, raw };

  const heights = symbols.map((s) => (s.bbox?.y1 || 0) - (s.bbox?.y0 || 0));
  const sorted = [...heights].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const isOutlier = (index) =>
    heights[index] > median * EDGE_HEIGHT_HIGH || heights[index] < median * EDGE_HEIGHT_LOW;
  let start = 0;
  let end = symbols.length;
  for (let k = 0; k < EDGE_STRIP_MAX && start < end && isOutlier(start); k++) start++;
  for (let k = 0; k < EDGE_STRIP_MAX && end > start && isOutlier(end - 1); k++) end--;
  return { digits: symbols.slice(start, end).map((s) => s.text).join(""), raw };
}

/* ---------- זיהוי מתוך תמונה שהועלתה ----------
   פותח את מצלמת המערכת (עם הזום והפוקוס שלה) או את הגלריה. התמונה
   נסרקת בשלמותה במצב טקסט-פזור: מספר יחיד מתקבל מיד; כמה מספרים —
   המשתמש בוחר; כלום — הודעה וחזרה לסריקה חיה. גם כאן דבר אינו עוזב
   את המכשיר */

// טעינת קובץ תמונה דרך <img> — הדפדפן מיישם כיוון EXIF בעצמו
function loadPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

// איתור אזורים בגודל-לוחית: תאי הרשת מסווגים לפי צהיבות, רצפי שורות עם די
// תאים צהובים נעשים אזורים, ומכל אזור נגזר מלבן עם שוליים. מוחזרים הגדולים
// תחילה, מסוננים לצורת-לוחית (רחב מגבוה). משותף למסלול התמונה (ברירות מחדל)
// ולסריקה החיה (גריד עדין יותר, יותר מועמדים) — אותו איתור, מקור אחד
function findPlateRegions(canvas, { gridCols = PHOTO_GRID_COLS, minCells = PHOTO_MIN_CELLS, maxRegions = PHOTO_REGIONS_MAX } = {}) {
  const grid = document.createElement("canvas");
  const gw = gridCols;
  const gh = Math.max(8, Math.round((gw * canvas.height) / canvas.width));
  grid.width = gw;
  grid.height = gh;
  const ctx = grid.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, gw, gh);
  const pixels = ctx.getImageData(0, 0, gw, gh).data;
  const isYellow = (x, y) => {
    const i = (y * gw + x) * 4;
    return (pixels[i] + pixels[i + 1]) / 2 - pixels[i + 2] > PLATE_YELLOW_MIN;
  };

  const found = [];
  let rowStart = null;
  for (let y = 0; y <= gh; y++) {
    let hit = false;
    if (y < gh) {
      let count = 0;
      for (let x = 0; x < gw; x++) if (isYellow(x, y)) count++;
      hit = count >= minCells;
    }
    if (hit && rowStart === null) rowStart = y;
    if (!hit && rowStart !== null) {
      const y0 = rowStart;
      const y1 = y;
      rowStart = null;
      // רצף העמודות הצהובות הרחב ביותר בתחום השורות
      let best = null;
      let colStart = null;
      for (let x = 0; x <= gw; x++) {
        let colHit = false;
        for (let yy = y0; x < gw && yy < y1; yy++) {
          if (isYellow(x, yy)) {
            colHit = true;
            break;
          }
        }
        if (colHit && colStart === null) colStart = x;
        if (!colHit && colStart !== null) {
          if (!best || x - colStart > best[1] - best[0]) best = [colStart, x];
          colStart = null;
        }
      }
      if (best && best[1] - best[0] >= minCells) {
        found.push({ x0: best[0], x1: best[1], y0, y1 });
      }
    }
  }

  found.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  const scaleX = canvas.width / gw;
  const scaleY = canvas.height / gh;
  return found.slice(0, maxRegions).map((region) => ({
    x: region.x0 * scaleX,
    y: region.y0 * scaleY,
    w: (region.x1 - region.x0) * scaleX,
    h: (region.y1 - region.y0) * scaleY,
  }));
}

// חיתוך אזור עם שוליים אנכיים יחסיים, תחום לגבולות הקנבס. גבולות הרשת
// גסים, ולכן כל אזור נקרא בשני שיעורי שוליים — קריאות שמסכימות זו עם זו
// אמינות; מחלוקת מוצגת למשתמש כרשימת מועמדים
function padRegion(canvas, region, padRatio) {
  const padY = Math.max(4, region.h * padRatio);
  const padX = Math.max(4, canvas.width * 0.01);
  const x = Math.max(0, region.x - padX);
  const y = Math.max(0, region.y - padY);
  return {
    x,
    y,
    w: Math.min(canvas.width, region.x + region.w + padX) - x,
    h: Math.min(canvas.height, region.y + region.h + padY) - y,
  };
}

function hidePhotoCandidates() {
  scannerCandidates.hidden = true;
  scannerCandidates.replaceChildren();
  photoHold = false;
}

function showPhotoCandidates(candidates) {
  scannerCandidates.replaceChildren(
    el("span", "scanner-candidates-label", SCANNER_MESSAGES.photoPick),
  );
  for (const digits of candidates) {
    const button = el("button", "scanner-candidate", formatPlate(digits));
    button.type = "button";
    button.dir = "ltr";
    button.addEventListener("click", () => {
      hidePhotoCandidates();
      acceptPlate(digits);
    });
    scannerCandidates.appendChild(button);
  }
  const dismiss = el("button", "scanner-candidate-dismiss", "המשך סריקה");
  dismiss.type = "button";
  dismiss.addEventListener("click", () => {
    hidePhotoCandidates();
    setScannerStatus(SCANNER_MESSAGES.scanning);
  });
  scannerCandidates.appendChild(dismiss);
  scannerCandidates.hidden = false;
}

async function handlePhotoFile(file) {
  if (!file) return;
  const session = scanSession;
  photoHold = true;
  setScanReading(null);
  setScannerStatus(SCANNER_MESSAGES.photoScanning);
  try {
    const photo = await loadPhoto(file);
    // הקטנה לגודל עבודה סביר — שומרת די פיקסלים ללוחית וחוסכת זיכרון
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

    const worker = await getTesseractWorker();
    if (session !== scanSession) return;

    // מסלול עיקרי: איתור אזורים צהובים בגודל-לוחית וזיהוי כל אחד במסלול
    // הרצועה של הסריקה החיה — פילוח עמוד אוטומטי מפספס לוחיות בתמונות
    // אמיתיות לעיתים קרובות. כל אזור נקרא בשני שיעורי שוליים; קריאות
    // מסכימות מדורגות ראשונות, כך שהסכמה מלאה מתקבלת אוטומטית ומחלוקת
    // מציגה את שתי האפשרויות
    const regionReads = [];
    for (const region of findPlateRegions(canvas)) {
      if (region.w / region.h < 1.5) continue;
      // השוליים ההדוקים נקראים ראשונים — קריאתם מדויקת יותר בדרך כלל,
      // וכך במחלוקת היא מוצגת ראשונה ברשימת המועמדים
      for (const padRatio of [0.12, 0.4]) {
        const padded = padRegion(canvas, region, padRatio);
        const strip = ocrStripFromSource(canvas, padded.x, padded.y, padded.w, padded.h);
        const stripBlob = await canvasToJpegBlob(strip);
        if (session !== scanSession) return;
        let read = null;
        try {
          const result = await worker.recognize(stripBlob || strip, {}, { text: true, blocks: true });
          read = extractScanRead(result?.data);
        } catch {
          continue;
        }
        if (session !== scanSession) return;
        const value = [read.digits, read.raw].find((d) => d.length === 7 || d.length === 8);
        if (value) regionReads.push(value);
      }
    }
    const readCounts = new Map();
    for (const value of regionReads) readCounts.set(value, (readCounts.get(value) || 0) + 1);
    let candidates = [...readCounts.keys()]
      .sort((a, b) => readCounts.get(b) - readCounts.get(a))
      .slice(0, 4);
    // הסכמה בין שתי הקריאות של אזור — מקבלים אותה ומתעלמים מקריאות יחיד
    if (candidates.length && readCounts.get(candidates[0]) >= 2) candidates = candidates.slice(0, 1);

    // נפילה לאחור בלי אזור צהוב שמיש: פילוח עמוד אוטומטי (PSM 3) על
    // התמונה כולה. מצבי הטקסט-הפזור (11/12) מחזירים ריק בשילוב עם רשימת
    // הספרות, ולכן לא בשימוש. מוחזר למצב הרצועה של הסריקה החיה מיד אחרי
    if (!candidates.length) {
      const blob = await canvasToJpegBlob(canvas);
      if (session !== scanSession) return;
      await worker.setParameters({ tessedit_pageseg_mode: "3" });
      let text = "";
      try {
        const result = await worker.recognize(blob || canvas);
        text = result?.data?.text || "";
      } finally {
        await worker.setParameters({ tessedit_pageseg_mode: "13" });
      }
      if (session !== scanSession) return;

      // מועמדים: שורות שלאחר ניקוי מכילות בדיוק 7-8 ספרות
      candidates = [...new Set(
        text
          .split("\n")
          .map((line) => line.replace(/\D/g, ""))
          .filter((digits) => digits.length === 7 || digits.length === 8),
      )].slice(0, 4);
    }

    if (candidates.length === 1) {
      setScanReading(candidates[0], "locked");
      setScannerStatus(SCANNER_MESSAGES.locked);
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (session !== scanSession) return;
      acceptPlate(candidates[0]);
      return;
    }
    if (candidates.length > 1) {
      showPhotoCandidates(candidates);
      return;
    }
    setScannerStatus(SCANNER_MESSAGES.photoNone);
  } catch {
    if (session === scanSession) setScannerStatus(SCANNER_MESSAGES.photoNone);
  } finally {
    // חזרה לסריקה חיה — אלא אם ממתינים לבחירת מועמד מהתמונה
    if (scannerCandidates.hidden) photoHold = false;
  }
}

// לוחיות ישראליות מודרניות הן 7-8 ספרות — תוצאה קצרה לעולם לא מתקבלת
// אוטומטית (גם אם המאגר תומך במספרים היסטוריים קצרים בהקלדה ידנית)
function isPlateLength(digits) {
  return digits.length === 7 || digits.length === 8;
}

// זיהוי מספר מרצועת OCR. קריאה ישרה בודדת (מהירה), והאימות בין פריימים
// (2 מתוך 3) הוא רשת הביטחון. אם הלוחית מוטה בבירור — הקריאה הישרה אינה
// אמינה (ספרת-רפאים באורך תקין), ולכן לא מחזירים מספר לנעילה אלא null,
// וההנחיה תבקש ליישר את הזווית. קריאה חלקית של לוחית מוטה עדיין מוצגת
// כחיווי-חיים דרך ה-raw, אך לעולם לא נועלת
async function recognizePlateStrip(worker, strip, session) {
  let read = null;
  try {
    const blob = await canvasToJpegBlob(strip);
    if (session !== scanSession) return null;
    const result = await worker.recognize(blob || strip, {}, { text: true, blocks: true });
    read = extractScanRead(result?.data);
  } catch {
    return null;
  }
  if (session !== scanSession) return null;

  const isValue = read && (isPlateLength(read.digits) || isPlateLength(read.raw));
  if (isValue && Math.abs(estimatePlateSkew(strip) || 0) >= SKEW_LOCK_MAX) {
    // מוטה מדי לזיהוי אמין — לא מחזירים מספר לנעילה, כדי שלא תיווצר נעילה
    // שגויה; ההנחיה תבקש ליישר את הזווית
    return null;
  }
  return read;
}

// קבלת תוצאה: אותה מחרוזת בת 7-8 ספרות פעמיים מתוך הקריאות התקינות
// האחרונות (חלון של שלוש) — פריים רועש בודד באמצע אינו מאפס את האימות.
// הלולאה מזינה משוב חי: קריאה חלקית מוצגת מעומעמת, מועמד מלא צובע את
// המסגרת בכתום, ואימות מהבהב בירוק לרגע לפני הסגירה — כך שהמשתמש רואה
// שהזיהוי חי, מתקדם ומצליח. הלוחית נקראת היכן שהיא בפריים (grabPlateRegion),
// בלי דרישת יישור למסגרת
async function scanLoop(worker, session) {
  let votes = [];
  let lastValidAt = 0;
  let lastReadAt = Date.now();
  while (session === scanSession) {
    // בזמן עיבוד תמונה שהועלתה (או בחירת מועמד ממנה) הסריקה החיה מושהית
    if (photoHold) {
      votes = [];
      lastReadAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, SCAN_IDLE_MS));
      continue;
    }
    const startedAt = Date.now();
    if (lastValidAt && startedAt - lastValidAt > SCAN_STALE_MS) votes = [];

    // איתור הלוחית בכל מקום בפריים; בלי אזור צהוב אין מה לזהות — מדלגים
    // על ה-OCR כליל, כך שפריים ריק זול ואינו מעמיס את המעבד
    const strip = grabPlateRegion();
    let read = null;
    if (strip) {
      read = await recognizePlateStrip(worker, strip, session);
      if (session !== scanSession) return;
      // עיבוד תמונה התחיל בזמן הזיהוי — לא כותבים משוב מעופש מעל שלו
      if (photoHold) continue;
    }

    const value =
      read && isPlateLength(read.digits) ? read.digits
      : read && isPlateLength(read.raw) ? read.raw
      : null;

    if (value) {
      lastValidAt = Date.now();
      lastReadAt = lastValidAt;
      votes.push(value);
      if (votes.length > SCAN_VOTE_WINDOW) votes.shift();
      if (votes.filter((v) => v === value).length >= 2) {
        setScanReading(value, "locked");
        setScannerStatus(SCANNER_MESSAGES.locked);
        // הבזק ירוק קצר — רגע ההצלחה נראה לפני שהשכבה נסגרת
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (session !== scanSession) return;
        acceptPlate(value);
        return;
      }
      setScanReading(value, "candidate");
      setScannerStatus(SCANNER_MESSAGES.confirming);
    } else {
      const partial =
        read && read.digits.length >= 4 ? read.digits
        : read && read.raw.length >= 4 ? read.raw
        : null;
      if (partial) {
        // קריאה חלקית — עדיין לא לוחית, אבל מראים שהזיהוי חי
        lastReadAt = Date.now();
        setScanReading(partial, "partial");
      } else {
        setScanReading(null);
      }
      setScannerStatus(
        Date.now() - lastReadAt > SCAN_HELP_AFTER_MS
          ? SCANNER_MESSAGES.help
          : SCANNER_MESSAGES.scanning,
      );
    }

    // הפוגה דינמית: זמן הזיהוי שחלף מנוכה ממנה, ומועמד שממתין לאימות
    // נדגם כמעט מיד — נשמר רק פסק זמן קצר שמשאיר את ה-UI נשים
    const idle = (votes.length ? SCAN_CONFIRM_IDLE_MS : SCAN_IDLE_MS) - (Date.now() - startedAt);
    await new Promise((resolve) => setTimeout(resolve, Math.max(SCAN_MIN_YIELD_MS, idle)));
  }
}

function acceptPlate(digits) {
  // רטט קצר כחיווי הצלחה (במכשירים שתומכים)
  if (navigator.vibrate) navigator.vibrate(50);
  closeScanner();

  // מילוי דרך מסלול העיצוב הקיים (אירוע input מפעיל את המקפים),
  // ושליחה כמו לחיצה ידנית על "בדיקה" — ולידציה וחיפוש במסלול הרגיל
  input.value = digits;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new Event("submit", { cancelable: true }));
  }
}

/* ---------- כפתור המצלמה (מוצג רק כשיש תמיכת מצלמה) ---------- */

function addCameraButton() {
  const wrap = document.querySelector(".plate-wrap");
  if (!wrap) return;

  // בניגוד לכפתור הניקוי, הכפתור נשאר במעבר המקלדת (ללא tabindex=-1) —
  // זו הדרך היחידה להגיע לסורק, ומשתמשי מקלדת וקורא-מסך זקוקים לה
  const button = (cameraButton = el("button", "camera-input"));
  button.type = "button";
  button.id = "camera-input";
  button.setAttribute("aria-label", "סריקת הלוחית במצלמה");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
  body.setAttribute("d", "M4 8.5A1.5 1.5 0 015.5 7h2l1.4-2h6.2L16.5 7h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z");
  const lens = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  lens.setAttribute("cx", "12");
  lens.setAttribute("cy", "13");
  lens.setAttribute("r", "3.5");
  svg.append(body, lens);
  button.appendChild(svg);

  // כמו בכפתור הניקוי — שמירת המיקוד בשדה כדי שהמקלדת בנייד לא תקפוץ
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", openScanner);
  wrap.appendChild(button);
}

// זיהוי-יכולת: הכפתור נוסף רק כשקיימת גישת מצלמה בדפדפן — אחרת שום
// זכר לפיצ'ר לא מופיע וההקלדה הידנית נשארת כפי שהיא
if (navigator.mediaDevices?.getUserMedia) {
  addCameraButton();

  // פרטיות וסוללה: מעבר לרקע (החלפת אפליקציה / מסך כבוי) סוגר את הסורק
  // ומשחרר את המצלמה מיד. הבדיקה היא על השכבה הפתוחה ולא על הזרם —
  // כך נסגר גם סורק שעדיין ממתין לאישור הרשאת המצלמה
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && scannerOverlay?.classList.contains("open")) closeScanner();
  });
}
