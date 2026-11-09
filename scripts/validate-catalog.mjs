import fs from "node:fs";

const recipesSource = fs.readFileSync("src/data/recipes.ts", "utf8");
const ingredientsSource = fs.readFileSync("src/data/ingredients.ts", "utf8");

const ids = [...recipesSource.matchAll(/\\bid:\\s*"([^"]+)"/g)].map(match => match[1]);
const recipeIngredientNames = [...recipesSource.matchAll(/\\bname:\\s*"([^"]+)"/g)].map(match => match[1]);
const pantryIngredientNames = new Set([...ingredientsSource.matchAll(/\\{\\s*name:\\s*"([^"]+)"/g)].map(match => match[1]));
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const missingIngredients = [...new Set(recipeIngredientNames)].filter(name => !pantryIngredientNames.has(name));
const stepBlocks = [...recipesSource.matchAll(/\\bsteps:\\s*(\\[[^\\n]*\\])/g)];
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
if (missingIngredients.length) errors.push(`Missing pantry ingredient seeds: ${missingIngredients.join(", ")}`);
if (stepBlocks.length !== ids.length) errors.push(`Expected steps for every recipe; found ${stepBlocks.length} step blocks for ${ids.length} recipes`);
if (invalidSteps.length) errors.push(`${invalidSteps.length} recipes have invalid or too-short instructions`);

if (errors.length) {
  console.error(errors.join("\\n"));
  process.exit(1);
}

console.log(`Catalog validation passed: ${ids.length} unique recipes, all ingredients seeded, and usable step lists.`);
