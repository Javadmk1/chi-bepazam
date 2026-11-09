export type IngredientSeed = { name: string; category: string; unit: string; aliases: string[] };

export const ingredientSeeds: IngredientSeed[] = [
  { name: "گوجه‌فرنگی", category: "سبزیجات", unit: "عدد", aliases: ["گوجه", "گوجه فرنگی", "tomato"] },
  { name: "سیب‌زمینی", category: "سبزیجات", unit: "عدد", aliases: ["سیب زمینی", "potato"] },
  { name: "پیاز", category: "سبزیجات", unit: "عدد", aliases: ["onion"] },
  { name: "تخم‌مرغ", category: "لبنیات و پروتئین", unit: "عدد", aliases: ["تخم مرغ", "egg", "eggs"] },
  { name: "مرغ", category: "گوشت و پروتئین", unit: "گرم", aliases: ["chicken"] },
  { name: "برنج", category: "غلات", unit: "گرم", aliases: ["rice"] },
  { name: "شیر", category: "لبنیات", unit: "میلی‌لیتر", aliases: ["milk"] },
  { name: "قارچ", category: "سبزیجات", unit: "گرم", aliases: ["mushroom", "mushrooms"] },
  { name: "روغن", category: "مواد پایه", unit: "میلی‌لیتر", aliases: ["روغن مایع", "oil"] },
  { name: "پاستا", category: "غلات", unit: "گرم", aliases: ["ماکارونی فرنگی", "pasta"] },
  { name: "سبزی قورمه", category: "سبزیجات", unit: "گرم", aliases: ["سبزی خورشتی"] },
  { name: "لوبیا قرمز", category: "حبوبات", unit: "گرم", aliases: ["red beans"] },
  { name: "گوشت خورشتی", category: "گوشت و پروتئین", unit: "گرم", aliases: ["گوشت گوسفندی خورشتی"] },
  { name: "لیمو عمانی", category: "چاشنی", unit: "عدد", aliases: ["لیموعمانی"] },
  { name: "عدس", category: "حبوبات", unit: "گرم", aliases: ["lentil"] },
  { name: "کشمش", category: "خشکبار", unit: "گرم", aliases: ["raisins"] },
  { name: "لوبیا سبز", category: "سبزیجات", unit: "گرم", aliases: ["green beans"] },
  { name: "گوشت چرخ‌کرده", category: "گوشت و پروتئین", unit: "گرم", aliases: ["گوشت چرخ کرده", "minced meat"] },
  { name: "زرشک", category: "خشکبار", unit: "گرم", aliases: ["barberry"] },
  { name: "زعفران", category: "چاشنی", unit: "گرم", aliases: ["saffron"] },
  { name: "سبزی کوکو", category: "سبزیجات", unit: "گرم", aliases: ["سبزی کوکویی"] },
  { name: "گردو", category: "خشکبار", unit: "گرم", aliases: ["walnut"] },
  { name: "خیارشور", category: "سبزیجات", unit: "عدد", aliases: ["خیار شور", "pickle"] },
  { name: "سس مایونز", category: "چاشنی", unit: "گرم", aliases: ["مایونز", "mayonnaise"] },
  { name: "ماکارونی", category: "غلات", unit: "گرم", aliases: ["macaroni"] },
  { name: "رب گوجه‌فرنگی", category: "چاشنی", unit: "گرم", aliases: ["رب گوجه", "tomato paste"] },
  { name: "لوبیا چیتی", category: "حبوبات", unit: "گرم", aliases: ["pinto beans"] },
  { name: "هویج", category: "سبزیجات", unit: "عدد", aliases: ["carrot"] },
  { name: "تن ماهی", category: "گوشت و پروتئین", unit: "قوطی", aliases: ["تن", "tuna"] },
  { name: "ذرت", category: "سبزیجات", unit: "گرم", aliases: ["corn"] }

export function normalizeIngredient(input: string): string {
  const clean = input.trim().toLocaleLowerCase("fa").replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/\s+/g, " ");
  const match = ingredientSeeds.find(item =>
    item.name.toLocaleLowerCase("fa") === clean ||
    item.aliases.some(alias => alias.toLocaleLowerCase("fa") === clean)
  );
  return match?.name ?? input.trim();
}