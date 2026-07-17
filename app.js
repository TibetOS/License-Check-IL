const API_URL = "https://data.gov.il/api/3/action/datastore_search";
const RESOURCE_ID = "053cea08-09bc-40ec-8f7a-156f0677aff3";
const REQUEST_TIMEOUT_MS = 10000;

const form = document.getElementById("search-form");
const input = document.getElementById("plate-input");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultCard = document.getElementById("result");
const resultPlate = document.getElementById("result-plate");
const resultTitle = document.getElementById("result-title");
const resultDetails = document.getElementById("result-details");

const MESSAGES = {
  invalid: "מספר רישוי חייב להכיל 7 או 8 ספרות",
  notFound: "הרכב לא נמצא במאגר. ייתכן שמדובר ברכב חדש מאוד, אופנוע, או רכב שירד מהכביש.",
  apiError: "שגיאה בגישה למאגר הממשלתי. נסו שוב בעוד רגע.",
  loading: "בודק את המאגר…",
};

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
}

function showResult(record, plateDigits) {
  resultPlate.textContent = formatPlate(plateDigits);

  const manufacturer = record.tozeret_nm || "";
  const model = record.kinuy_mishari || record.degem_nm || "";
  resultTitle.textContent = [manufacturer, model].filter(Boolean).join(" ");

  const rows = [
    ["יצרן", record.tozeret_nm],
    ["דגם", record.kinuy_mishari || record.degem_nm],
    ["שנת ייצור", record.shnat_yitzur],
    ["צבע", record.tzeva_rechev],
    ["סוג דלק", record.sug_delek_nm],
    ["בעלות", record.baalut],
    ["טסט אחרון", formatDate(record.mivchan_acharon_dt)],
    ["תוקף רישיון רכב", formatDate(record.tokef_dt)],
  ];

  resultDetails.innerHTML = "";
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value != null && value !== "" ? String(value) : "—";
    resultDetails.appendChild(dt);
    resultDetails.appendChild(dd);
  }

  resultCard.classList.remove("hidden");
}

async function fetchVehicle(plateDigits) {
  // המאגר שומר את מספר הרכב כמספר, ולכן מסירים אפסים מובילים
  const plateNumber = String(parseInt(plateDigits, 10));
  const params = new URLSearchParams({
    resource_id: RESOURCE_ID,
    filters: JSON.stringify({ mispar_rechev: plateNumber }),
    limit: "1",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error("CKAN request failed");
    return data.result.records[0] || null;
  } finally {
    clearTimeout(timer);
  }
}

input.addEventListener("input", () => {
  const digits = digitsOnly(input.value).slice(0, 8);
  input.value = formatPlate(digits);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const digits = digitsOnly(input.value);
  if (!isValidPlate(digits)) {
    hideResult();
    showMessage(MESSAGES.invalid, "error");
    input.focus();
    return;
  }

  hideResult();
  showMessage(MESSAGES.loading, "loading");
  submitBtn.disabled = true;

  try {
    const record = await fetchVehicle(digits);
    if (record) {
      clearMessage();
      showResult(record, digits);
    } else {
      showMessage(MESSAGES.notFound, "notfound");
    }
  } catch (error) {
    console.error(error);
    showMessage(MESSAGES.apiError, "error");
  } finally {
    submitBtn.disabled = false;
  }
});
