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
  confirming: "מזהה… החזיקו יציב לאימות",
  locked: "זוהה ✓",
  help: "לא נקרא? התקרבו או הגדילו זום כך שהלוחית תמלא את המסגרת, והימנעו מסנוור",
  photoScanning: "מחפש מספר בתמונה…",
  photoNone: "לא זוהה מספר בתמונה — נסו תמונה קרובה או חדה יותר",
  photoPick: "נמצאו כמה מספרים — בחרו את המספר הנכון",
  uploadLabel: "העלאת תמונה",
  privacy: "הזיהוי מתבצע כולו במכשיר — התמונות אינן נשלחות לשום שרת",
};

// אחרי כמה זמן ללא קריאה מוצלחת מוחלפת ההנחיה בטיפ עזרה
const SCAN_HELP_AFTER_MS = 8000;

// רוחב הקנבס שמוזן ל-OCR — החיתוך ממוגדל כך שהספרות גדולות וחדות
const OCR_CANVAS_WIDTH = 800;

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

  stretchContrastGrayscale(ctx, canvas);
  return canvas;
}

// עיבוד מקדים: גווני אפור ומתיחת ניגודיות — ספרות שחורות על צהוב
// נהפכות לשחור מובהק על רקע בהיר, מה שמשפר משמעותית את הזיהוי.
// משמש גם את פריימי הווידאו וגם תמונות שהועלו
function stretchContrastGrayscale(ctx, canvas) {
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
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    stretchContrastGrayscale(ctx, canvas);

    const worker = await getTesseractWorker();
    if (session !== scanSession) return;
    // פילוח עמוד אוטומטי (PSM 3) — מאתר את המספר בכל מקום בתמונה.
    // מצבי הטקסט-הפזור (11/12) מחזירים ריק בשילוב עם רשימת הספרות,
    // ולכן לא בשימוש. מוחזר למצב השורה של הסריקה החיה מיד אחרי
    await worker.setParameters({ tessedit_pageseg_mode: "3" });
    let text = "";
    try {
      const result = await worker.recognize(canvas);
      text = result?.data?.text || "";
    } finally {
      await worker.setParameters({ tessedit_pageseg_mode: "7" });
    }
    if (session !== scanSession) return;

    // מועמדים: שורות שלאחר ניקוי מכילות בדיוק 7-8 ספרות
    const candidates = [...new Set(
      text
        .split("\n")
        .map((line) => line.replace(/\D/g, ""))
        .filter((digits) => digits.length === 7 || digits.length === 8),
    )].slice(0, 4);

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

// קבלת תוצאה: אותה מחרוזת בת 7-8 ספרות בשני פריימים רצופים.
// לוחיות ישראליות מודרניות הן 7-8 ספרות — תוצאה קצרה לעולם לא מתקבלת
// אוטומטית (גם אם המאגר תומך במספרים היסטוריים קצרים בהקלדה ידנית).
// הלולאה מזינה משוב חי: קריאה חלקית מוצגת מעומעמת, מועמד מלא צובע את
// המסגרת בכתום, ואימות מהבהב בירוק לרגע לפני הסגירה — כך שהמשתמש רואה
// שהזיהוי חי, מתקדם ומצליח
async function scanLoop(worker, session) {
  let previous = null;
  let lastReadAt = Date.now();
  while (session === scanSession) {
    // בזמן עיבוד תמונה שהועלתה (או בחירת מועמד ממנה) הסריקה החיה מושהית
    if (photoHold) {
      previous = null;
      lastReadAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }
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
        lastReadAt = Date.now();
        if (digits === previous) {
          setScanReading(digits, "locked");
          setScannerStatus(SCANNER_MESSAGES.locked);
          // הבזק ירוק קצר — רגע ההצלחה נראה לפני שהשכבה נסגרת
          await new Promise((resolve) => setTimeout(resolve, 350));
          if (session !== scanSession) return;
          acceptPlate(digits);
          return;
        }
        previous = digits;
        setScanReading(digits, "candidate");
        setScannerStatus(SCANNER_MESSAGES.confirming);
      } else {
        previous = null;
        if (digits && digits.length >= 4) {
          // קריאה חלקית — עדיין לא לוחית, אבל מראים שהזיהוי חי
          lastReadAt = Date.now();
          setScanReading(digits, "partial");
        } else {
          setScanReading(null);
        }
        setScannerStatus(
          Date.now() - lastReadAt > SCAN_HELP_AFTER_MS
            ? SCANNER_MESSAGES.help
            : SCANNER_MESSAGES.scanning,
        );
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
