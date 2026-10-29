// Gregorian -> Hebrew calendar, formatted the traditional way: כ״ח בתשרי תשפ״ז.
//
// Implemented here rather than with Intl because Hermes (the Android JS
// engine) does not reliably support the `hebrew` calendar, and the gematria
// for the day and year is not something Intl produces at all. The arithmetic
// follows the standard molad-based rules (as in hebcal / Calendrical
// Calculations), and was checked day by day against ICU for 1990-2060.

const EPOCH = -1373428; // R.D. offset so EPOCH + elapsedDays(y) is 1 Tishrei of y

const isLeap = (y: number) => (1 + 7 * y) % 19 < 7;

// Days from the epoch to 1 Tishrei of year y, postponements included.
function elapsedDays(y: number): number {
  const prev = y - 1;
  const months = 235 * Math.floor(prev / 19) + 12 * (prev % 19) + Math.floor(((prev % 19) * 7 + 1) / 19);
  const pElapsed = 204 + 793 * (months % 1080);
  const hElapsed = 5 + 12 * months + 793 * Math.floor(months / 1080) + Math.floor(pElapsed / 1080);
  const parts = (pElapsed % 1080) + 1080 * (hElapsed % 24);
  const day = 1 + 29 * months + Math.floor(hElapsed / 24);
  let alt = day;
  if (parts >= 19440
    || (day % 7 === 2 && parts >= 9924 && !isLeap(y))
    || (day % 7 === 1 && parts >= 16789 && isLeap(y - 1))) {
    alt += 1;
  }
  if (alt % 7 === 0 || alt % 7 === 3 || alt % 7 === 5) alt += 1;
  return alt;
}

const daysInYear = (y: number) => elapsedDays(y + 1) - elapsedDays(y);

// Months are numbered from Nisan = 1; the year starts at Tishrei = 7.
function daysInMonth(m: number, y: number): number {
  if ([2, 4, 6, 10, 13].includes(m)) return 29;
  if (m === 12 && !isLeap(y)) return 29;
  if (m === 8 && daysInYear(y) % 10 !== 5) return 29;  // short Cheshvan
  if (m === 9 && daysInYear(y) % 10 === 3) return 29;  // short Kislev
  return 30;
}

// Rata Die: days since 1 January of year 1 (proleptic Gregorian), day 1.
function rataDie(year: number, month: number, day: number): number {
  const y = year - 1;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const before = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1]
    + (month > 2 && leap ? 1 : 0);
  return 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + before + day;
}

export function toHebrew(year: number, month: number, day: number) {
  const abs = rataDie(year, month, day);
  let hy = year + 3760;
  while (EPOCH + elapsedDays(hy + 1) <= abs) hy += 1;
  while (EPOCH + elapsedDays(hy) > abs) hy -= 1;
  let rest = abs - (EPOCH + elapsedDays(hy));  // 0 = 1 Tishrei
  const order = isLeap(hy) ? [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  for (const m of order) {
    const len = daysInMonth(m, hy);
    if (rest < len) return { year: hy, month: m, day: rest + 1, leap: isLeap(hy) };
    rest -= len;
  }
  throw new Error('unreachable');
}

const MONTHS: Record<number, string> = {
  1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב׳',
};

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

// 1..999 as Hebrew letters with geresh / gershayim: ט״ו, ט״ז, תשפ״ז, ה׳.
export function gematria(n: number): string {
  let s = '';
  let rest = n % 1000;
  while (rest >= 400) { s += 'ת'; rest -= 400; }
  if (rest >= 100) { s += HUNDREDS[Math.floor(rest / 100)]; rest %= 100; }
  if (rest === 15) s += 'טו';
  else if (rest === 16) s += 'טז';
  else s += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}

// Accepts a 'YYYY-MM-DD' date column (read as a calendar day, no time zone
// shift) or any timestamp / Date (read in the device's local time).
export function formatHebrewDate(value: string | Date): string {
  let y: number; let m: number; let d: number;
  const plain = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (plain) {
    [y, m, d] = (value as string).split('-').map(Number);
  } else {
    const date = value instanceof Date ? value : new Date(value);
    y = date.getFullYear(); m = date.getMonth() + 1; d = date.getDate();
  }
  const h = toHebrew(y, m, d);
  const month = h.month === 12 && h.leap ? 'אדר א׳' : MONTHS[h.month];
  return `${gematria(h.day)} ב${month} ${gematria(h.year)}`;
}
