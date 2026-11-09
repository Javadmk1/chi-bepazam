import type { Recipe } from "./recipes";

export type ParsedQuantity = { amount: number; unit: string } | null;

const digitMap: Record<string, string> = {
  "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9"
};

export function parseRecipeQuantity(raw: string): ParsedQuantity {
  const value = raw.trim().replace(/[۰-۹٠-٩]/g, d => digitMap[d] ?? d).replace(/ي/g,"ی").replace(/ك/g,"ک").replace(/٫/g,".");
  if (!value || /به مقدار لازم|دلخواه|اختیاری/.test(value)) return null;
  const fractions: Record<string, number> = { "نصف": 0.5, "یک‌چهارم": 0.25, "ربع": 0.25, "سه‌چهارم": 0.75 };
  const fraction = Object.entries(fractions).find(([word]) => value.startsWith(word));
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  const amount = fraction ? Number(fraction[1]) : match ? Number(match[1]) : NaN;
  const rest = fraction ? value.slice(fraction[0].length).trim() : match?.[2]?.trim() ?? "";
  if (!Number.isFinite(amount) || amount <= 0) return null;
  let unit = rest.replace(/^عدد\s*/, "عدد").trim();
  if (/^(گرم|کیلوگرم|کیلو|میلی‌لیتر|میلی لیتر|لیتر|عدد|تکه|قوطی|پیمانه|لیوان|قاشق غذاخوری|قاشق|قاشق چای‌خوری)$/.test(unit)) {
    if (unit === "کیلو") unit = "کیلوگرم";
    if (unit === "لیتر") unit = "لیتر";
    if (unit === "میلی لیتر") unit = "میلی‌لیتر";
    return { amount: amount * (unit === "کیلوگرم" ? 1000 : unit === "لیتر" ? 1000 : 1), unit: unit === "کیلوگرم" ? "گرم" : unit === "لیتر" ? "میلی‌لیتر" : unit };
  }
  if (!unit) return { amount, unit: "عدد" };
  return { amount, unit };
}

export function scaledRecipeQuantity(raw: string, servings: number, baseServings = 2): string {
  const parsed = parseRecipeQuantity(raw);
  if (!parsed) return raw;
  const amount = parsed.amount * Math.max(1, servings) / Math.max(1, baseServings);
  const rounded = Math.round(amount * 100) / 100;
  const localized = String(rounded).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]).replace(".", "٫");
  return parsed.unit === "عدد" ? `${localized} عدد` : `${localized} ${parsed.unit}`;
}

export function missingRecipeQuantity(raw: string, pantryQuantity: number, pantryUnit: string, servings: number, baseServings = 2): { quantity: number; unit: string } | null {
  const parsed = parseRecipeQuantity(raw);
  if (!parsed) return null;
  const required = parsed.amount * Math.max(1, servings) / Math.max(1, baseServings);
  const owned = pantryUnit === parsed.unit ? Math.max(0, pantryQuantity) : 0;
  const missing = Math.max(0, required - owned);
  return missing > 0 ? { quantity: Math.round(missing * 100) / 100, unit: parsed.unit } : null;
}

export function aggregateRecipeNeeds(recipes: Recipe[], servings: number): Map<string, { quantity: number; unit: string }> {
  const needs = new Map<string, { quantity: number; unit: string }>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const parsed = parseRecipeQuantity(ingredient.qty);
      if (!parsed) continue;
      const current = needs.get(ingredient.name);
      if (!current) needs.set(ingredient.name, { quantity: parsed.amount * servings / 2, unit: parsed.unit });
      else if (current.unit === parsed.unit) current.quantity += parsed.amount * servings / 2;
    }
  }
  return needs;
}
