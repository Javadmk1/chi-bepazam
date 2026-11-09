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
  { name: "روغن", category: "مواد پایه", unit: "میلی‌لیتر", aliases: ["روغن مایع", "oil"] }
];

export function normalizeIngredient(input: string): string {
  const clean = input.trim().toLocaleLowerCase("fa").replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/\s+/g, " ");
  const match = ingredientSeeds.find(item =>
    item.name.toLocaleLowerCase("fa") === clean ||
    item.aliases.some(alias => alias.toLocaleLowerCase("fa") === clean)
  );
  return match?.name ?? input.trim();
}