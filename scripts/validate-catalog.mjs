import fs from "node:fs";

const recipesSource = fs.readFileSync("src/data/recipes.ts", "utf8");
const ingredientsSource = fs.readFileSync("src/data/ingredients.ts", "utf8");

const ids = [...recipesSource.matchAll(/\bid:\s*"([^"]+)"/g)].map(match => match[1]);
const recipeIngredientNames = [...recipesSource.matchAll(/\bname:\s*"([^"]+)"/g)].map(match => match[1]);
const pantryIngredientNames = new Set([...ingredientsSource.matchAll(/\{\s*name:\s*"([^"]+)"/g)].map(match => match[1]));
const seedEntries = [...ingredientsSource.matchAll(/\{\s*name:\s*"([^"]+)", category:\s*"[^"]+", unit:\s*"([^"]+)"/g)];
const seedUnits = new Map(seedEntries.map(match => [match[1], match[2]]));
const duplicateSeedNames = seedEntries.map(match => match[1]).filter((name, index, all) => all.indexOf(name) !== index);
const ingredientPairs = [...recipesSource.matchAll(/\{\s*name:\s*"([^"]+)",\s*qty:\s*"([^"]+)"\s*\}/g)];
const unitMismatches = ingredientPairs.filter(match => {
  const normalized = match[2].replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/٫/g, ".");
  const quantityMatch = normalized.match(/^\d+(?:\.\d+)?\s*(.*)$/);
  const recipeUnit = quantityMatch?.[1]?.trim() || "عدد";
  const normalizedUnit = recipeUnit === "کیلوگرم" || recipeUnit === "کیلو" ? "گرم" :
    recipeUnit === "لیتر" || recipeUnit === "میلی لیتر" ? "میلی‌لیتر" : recipeUnit;
  return seedUnits.has(match[1]) && seedUnits.get(match[1]) !== normalizedUnit;
});
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const missingIngredients = [...new Set(recipeIngredientNames)].filter(name => !pantryIngredientNames.has(name));
const stepBlocks = [...recipesSource.matchAll(/\bsteps:\s*(\[[^\n]*?\])(?=,\s*tags:)/g)];
const quantities = [...recipesSource.matchAll(/\bqty:\s*"([^"]+)"/g)].map(match => match[1]);
const invalidQuantities = quantities.filter(value => {
  const normalized = value.replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/٫/g, ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  return !match || Number(match[1]) <= 0 || /به مقدار لازم|دلخواه|اختیاری/.test(normalized);
});
const invalidSteps = stepBlocks.filter(match => {
  try {
    const steps = JSON.parse(match[1]);
    return !Array.isArray(steps) || steps.length < 3 || steps.some(step => typeof step !== "string" || !step.trim());
  } catch {
    return true;
  }
});

const errors = [];
if (ids.length !== 150) errors.push(`Expected exactly 150 recipes, found ${ids.length}`);
if (duplicateIds.length) errors.push(`Duplicate recipe IDs: ${[...new Set(duplicateIds)].join(", ")}`);
if (duplicateSeedNames.length) errors.push(`Duplicate pantry ingredient seeds: ${[...new Set(duplicateSeedNames)].join(", ")}`);
if (unitMismatches.length) errors.push(`${unitMismatches.length} recipe ingredients use units different from their pantry base units`);
if (missingIngredients.length) errors.push(`Missing pantry ingredient seeds: ${missingIngredients.join(", ")}`);
if (stepBlocks.length !== ids.length) errors.push(`Expected steps for every recipe; found ${stepBlocks.length} step blocks for ${ids.length} recipes`);
if (invalidSteps.length) errors.push(`${invalidSteps.length} recipes have invalid or too-short instructions`);
if (!quantities.length || quantities.length < ids.length * 2) errors.push("Some recipe ingredients are missing quantities");
if (invalidQuantities.length) errors.push(`${invalidQuantities.length} ingredient quantities are not numeric or are unspecified`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Catalog validation passed: ${ids.length} unique recipes, all ingredients seeded, and usable step lists.`);
