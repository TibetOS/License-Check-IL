/* סריקת לוחית במצלמה — כפתור מצלמה צף בלוחית פותח שכבת-על עם תצוגה חיה,
   והמספר מזוהה במכשיר עצמו (Tesseract.js, נטען מ-CDN רק בלחיצה הראשונה).
   אף פריים לא עוזב את הדפדפן. הפיצ'ר תוספתי בלבד: ללא תמיכת מצלמה הכפתור
   לא מוצג כלל, וכל כשל בזמן ריצה מחזיר להקלדה ידנית עם הודעה ברורה */

// גרסאות נעוצות — ליבת ה-WASM ונתוני השפה חייבים להתאים לגרסת הספרייה
const TESSERACT_CDN = {
  script: "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js",
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
  langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
};

const SCANNER_MESSAGES = {
  noCamera: "לא ניתנה גישה למצלמה — אפשר להקליד את המספר ידנית",
  ocrLoadFailed: "טעינת רכיב הזיהוי נכשלה — בדקו את החיבור לאינטרנט או הקלידו את המספר ידנית",
  requesting: "מבקש גישה למצלמה…",
  loadingOcr: "טוען רכיב זיהוי…",
  scanning: "כוונו את הלוחית למסגרת",
  privacy: "הזיהוי מתבצע כולו במכשיר — התמונות אינן נשלחות לשום שרת",
};

// רוחב הקנבס שמוזן ל-OCR — החיתוך ממוגדל כך שהספרות גדולות וחדות
const OCR_CANVAS_WIDTH = 800;

let scannerOverlay = null;
let scannerVideo = null;
let scannerGuide = null;
let scannerStatus = null;
let scannerCloseBtn = null;
let cameraButton = null;

// קנבס ה-OCR משוחזר בין פריימים — יצירת קנבס חדש לכל פריים גורמת
// לזבל-זיכרון מיותר, בעיקר בניידים
let ocrCanvas = null;

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
        }),
      )
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789",
          // שורת טקסט יחידה — מתאים בדיוק ללוחית בתוך מסגרת הכיוון
          tessedit_pageseg_mode: "7",
        });
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

  const frame = el("div", "scanner-frame");
  scannerGuide = el("div", "scanner-guide");
  scannerStatus = el("p", "scanner-status");
  frame.append(scannerGuide, scannerStatus);

  scannerOverlay.append(
    scannerVideo,
    closeBtn,
    frame,
    el("p", "scanner-privacy", SCANNER_MESSAGES.privacy),
  );
  document.body.appendChild(scannerOverlay);
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
  setScannerStatus(SCANNER_MESSAGES.requesting);
  clearMessage();
  // נגישות: המיקוד עובר אל תוך הדיאלוג — לכפתור הסגירה
  scannerCloseBtn.focus();

  // רכיב הזיהוי נטען במקביל לבקשת המצלמה — כשל בטעינתו מטופל בהמשך,
  // ולכן דוחסים כאן catch ריק כדי שלא תיווצר דחייה לא-מטופלת
  const workerPromise = getTesseractWorker();
  workerPromise.catch(() => {});

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
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

// חיתוך אזור מסגרת הכיוון מתוך פריים הווידאו. הווידאו מוצג ב-object-fit:
// cover, ולכן ממפים את מלבן המסגרת (בקואורדינטות מסך) חזרה לקואורדינטות
// הפריים המקורי דרך יחס הכיסוי וההיסט
function grabGuideRegion() {
  const vw = scannerVideo.videoWidth;
  const vh = scannerVideo.videoHeight;
  if (!vw || !vh) return null;

  const videoRect = scannerVideo.getBoundingClientRect();
  const guideRect = scannerGuide.getBoundingClientRect();
  if (!videoRect.width || !videoRect.height || !guideRect.width) return null;

  const scale = Math.max(videoRect.width / vw, videoRect.height / vh);
  const offsetX = (videoRect.width - vw * scale) / 2;
  const offsetY = (videoRect.height - vh * scale) / 2;

  const sx = (guideRect.left - videoRect.left - offsetX) / scale;
  const sy = (guideRect.top - videoRect.top - offsetY) / scale;
  const sw = guideRect.width / scale;
  const sh = guideRect.height / scale;
  if (sw <= 0 || sh <= 0) return null;

  if (!ocrCanvas) ocrCanvas = document.createElement("canvas");
  const canvas = ocrCanvas;
  // קביעת המידות מנקה את הקנבס לקראת הפריים החדש
  canvas.width = OCR_CANVAS_WIDTH;
  canvas.height = Math.max(1, Math.round((OCR_CANVAS_WIDTH * sh) / sw));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(scannerVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // עיבוד מקדים: גווני אפור ומתיחת ניגודיות — ספרות שחורות על צהוב
  // נהפכות לשחור מובהק על רקע בהיר, מה שמשפר משמעותית את הזיהוי
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    pixels[i] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < pixels.length; i += 4) {
    const stretched = ((pixels[i] - min) / range) * 255;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = stretched;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// קבלת תוצאה: אותה מחרוזת בת 7-8 ספרות בשני פריימים רצופים.
// לוחיות ישראליות מודרניות הן 7-8 ספרות — תוצאה קצרה לעולם לא מתקבלת
// אוטומטית (גם אם המאגר תומך במספרים היסטוריים קצרים בהקלדה ידנית)
async function scanLoop(worker, session) {
  let previous = null;
  while (session === scanSession) {
    const canvas = grabGuideRegion();
    if (canvas) {
      let digits = null;
      try {
        const result = await worker.recognize(canvas);
        digits = (result?.data?.text || "").replace(/\D/g, "");
      } catch {
        // פריים בעייתי — פשוט ממשיכים לפריים הבא
      }
      if (session !== scanSession) return;

      if (digits && (digits.length === 7 || digits.length === 8)) {
        if (digits === previous) {
          acceptPlate(digits);
          return;
        }
        previous = digits;
      } else {
        previous = null;
      }
    }
    // הפוגה קצרה בין פריימים — משאירה את ה-UI נשים ומונעת חימום מיותר
    await new Promise((resolve) => setTimeout(resolve, 150));
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
