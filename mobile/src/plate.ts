// לוגיקת המספר — מועברת מהמסלול המוכח של אתר ה-PWA: ספרות בלבד, אורך
// לוחית מודרנית 7-8 ספרות, ואימות "2 מתוך 3" שמונע נעילה על פריים רועש
// בודד. הזיהוי כאן הוא ML Kit (במכשיר), אך כללי הקבלה זהים

export function digitsOnly(text: string): string {
  return (text || "").replace(/\D/g, "");
}

// לוחיות ישראליות מודרניות הן 7-8 ספרות — תוצאה קצרה לעולם לא ננעלת
// אוטומטית (מספרים היסטוריים קצרים נשארים להקלדה ידנית באתר)
export function isPlateLength(digits: string): boolean {
  return digits.length === 7 || digits.length === 8;
}

// 7 ספרות: 12-345-67, 8 ספרות: 123-45-678 — כמו באתר
export function formatPlate(digits: string): string {
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return digits;
}

// מתוך תוצאת ה-OCR (בלוקים/שורות של ML Kit) — כל השורות שאחרי ניקוי הן
// בדיוק 7-8 ספרות. מוחזרים ייחודיים, לפי סדר ההופעה
export function plateCandidatesFromLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const digits = digitsOnly(line);
    if (isPlateLength(digits) && !seen.has(digits)) {
      seen.add(digits);
      out.push(digits);
    }
  }
  return out;
}

// אימות בין דגימות: אותו מספר פעמיים מתוך שלוש הדגימות התקינות האחרונות.
// היסטוריה שלא התחדשה זמן-מה נמחקת (המצלמה כוונה ללוחית אחרת)
export class PlateVoter {
  private votes: string[] = [];
  private lastAt = 0;

  constructor(
    private readonly windowSize = 3,
    private readonly needed = 2,
    private readonly staleMs = 2500,
  ) {}

  // מזין ערך תקין; מחזיר את המספר אם הושגה נעילה, אחרת null
  push(value: string, now: number): string | null {
    if (this.lastAt && now - this.lastAt > this.staleMs) this.votes = [];
    this.lastAt = now;
    this.votes.push(value);
    if (this.votes.length > this.windowSize) this.votes.shift();
    const count = this.votes.filter((v) => v === value).length;
    return count >= this.needed ? value : null;
  }

  reset(): void {
    this.votes = [];
    this.lastAt = 0;
  }
}
