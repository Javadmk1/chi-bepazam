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

export function getExpiryStatus(rawDate?: string | null, now = new Date()): ExpiryStatus {
  if (!rawDate) return "unknown";
  const normalized = rawDate.trim().replace(/[۰-۹٠-٩]/g, digit => digits[digit] ?? digit).replace(/-/g, "/");
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "unknown";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = month >= 1 && month <= 6 ? 31 : month >= 7 && month <= 11 ? 30 : 29;
  if (year < 1200 || month < 1 || month > 12 || day < 1 || day > maxDay) return "unknown";

  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
      year: "numeric", month: "numeric", day: "numeric"
    }).formatToParts(now);
    const todayYear = Number(parts.find(part => part.type === "year")?.value);
    const todayMonth = Number(parts.find(part => part.type === "month")?.value);
    const todayDay = Number(parts.find(part => part.type === "day")?.value);
    if (![todayYear, todayMonth, todayDay].every(Number.isFinite)) return "unknown";
    const difference = jalaliDayNumber(year, month, day) - jalaliDayNumber(todayYear, todayMonth, todayDay);
    if (difference < 0) return "expired";
    if (difference <= 7) return "soon";
    return "safe";
  } catch {
    return "unknown";
  }
}

export function expiryLabel(rawDate?: string | null): string {
  const status = getExpiryStatus(rawDate);
  if (status === "expired") return "منقضی‌شده";
  if (status === "soon") return "نزدیک به انقضا";
  if (status === "safe") return "مهلت کافی";
  return rawDate ? "تاریخ نامعتبر" : "بدون تاریخ انقضا";
}
