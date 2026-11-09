export type ExpiryStatus = "expired" | "soon" | "safe" | "unknown";

const digits: Record<string, string> = {
  "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9"
};

function jalaliDayNumber(year: number, month: number, day: number): number {
  const adjustedYear = year + 1595;
  return -355668 + 365 * adjustedYear +
    Math.floor(adjustedYear / 33) * 8 +
    Math.floor(((adjustedYear % 33) + 3) / 4) +
    day + (month < 7 ? (month - 1) * 31 : (month - 7) * 30 + 186);
}

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const monthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy > 1600 ? 979 : 0;
  gy -= gy > 1600 ? 1600 : 621;
  const adjustedYear = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((adjustedYear + 3) / 4) -
    Math.floor((adjustedYear + 99) / 100) + Math.floor((adjustedYear + 399) / 400) -
    80 + gd + monthDays[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

export function getExpiryStatus(rawDate?: string | null, now = new Date()): ExpiryStatus {
  if (!rawDate) return "unknown";
  const normalized = rawDate.trim().replace(/[۰-۹٠-٩]/g, digit => digits[digit] ?? digit).replace(/-/g, "/");
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "unknown";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const esfandDays = jalaliDayNumber(year + 1, 1, 1) - jalaliDayNumber(year, 1, 1) - 336;
  const maxDay = month >= 1 && month <= 6 ? 31 : month >= 7 && month <= 11 ? 30 : esfandDays;
  if (year < 1200 || month < 1 || month > 12 || day < 1 || day > maxDay) return "unknown";

  const [todayYear, todayMonth, todayDay] = gregorianToJalali(
    now.getFullYear(), now.getMonth() + 1, now.getDate()
  );
  const difference = jalaliDayNumber(year, month, day) - jalaliDayNumber(todayYear, todayMonth, todayDay);
  if (difference < 0) return "expired";
  if (difference <= 7) return "soon";
  return "safe";
}

export function expiryLabel(rawDate?: string | null): string {
  const status = getExpiryStatus(rawDate);
  if (status === "expired") return "منقضی‌شده";
  if (status === "soon") return "نزدیک به انقضا";
  if (status === "safe") return "مهلت کافی";
  return rawDate ? "تاریخ نامعتبر" : "بدون تاریخ انقضا";
}
