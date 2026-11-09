import type { Recipe } from "../data/recipes";
import { normalizeIngredient } from "../data/ingredients";

export type PantryRecord = { ingredient_name: string };

export type RecipeMatch = {
  recipe: Recipe;
  availableCount: number;
  missingIngredients: string[];
  score: number;
};

export function rankRecipes(recipes: Recipe[], pantry: PantryRecord[]): RecipeMatch[] {
  const available = new Set(pantry.map(item => normalizeIngredient(item.ingredient_name)));
  return recipes.map(recipe => {
    const present = recipe.ingredients.filter(item => available.has(normalizeIngredient(item.name)));
    const missingIngredients = recipe.ingredients
      .filter(item => !available.has(normalizeIngredient(item.name)))
      .map(item => normalizeIngredient(item.name));
    const coverage = recipe.ingredients.length ? present.length / recipe.ingredients.length : 0;
    const timeBonus = recipe.timeMin <= 30 ? 12 : recipe.timeMin <= 60 ? 6 : 0;
    const score = Math.round(coverage * 88 + timeBonus);
    return { recipe, availableCount: present.length, missingIngredients, score: Math.min(100, score) };
  }).sort((a, b) => b.score - a.score);
}
