import type { Recipe } from "../data/recipes";
import { normalizeIngredient } from "../data/ingredients";
import { missingRecipeQuantity, parseRecipeQuantity } from "../data/recipe-quantity";

export type PantryRecord = { ingredient_name: string; quantity?: number; unit?: string };

export type RecipeMatch = {
  recipe: Recipe;
  availableCount: number;
  missingIngredients: string[];
  score: number;
};

export function rankRecipes(recipes: Recipe[], pantry: PantryRecord[]): RecipeMatch[] {
  return recipes.map(recipe => {
    const missingIngredients = recipe.ingredients.filter(ingredient => {
      const normalized = normalizeIngredient(ingredient.name);
      const stock = pantry.find(item => normalizeIngredient(item.ingredient_name) === normalized);
      if (!stock) return true;
      const parsed = parseRecipeQuantity(ingredient.qty);
      if (!parsed) return false;
      return missingRecipeQuantity(ingredient.qty, stock.quantity ?? 0, stock.unit ?? "", 2, 2) !== null;
    }).map(item => normalizeIngredient(item.name));
    const availableCount = recipe.ingredients.length - missingIngredients.length;
    const coverage = recipe.ingredients.length ? availableCount / recipe.ingredients.length : 0;
    const timeBonus = recipe.timeMin <= 30 ? 12 : recipe.timeMin <= 60 ? 6 : 0;
    const score = Math.round(coverage * 88 + timeBonus);
    return { recipe, availableCount, missingIngredients, score: Math.min(100, score) };
  }).sort((a, b) => b.score - a.score);
}
