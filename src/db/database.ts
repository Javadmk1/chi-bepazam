import type { SQLiteDatabase } from "expo-sqlite";
import { ingredientSeeds } from "../data/ingredients";

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      base_unit TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS pantry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_name TEXT NOT NULL UNIQUE,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL,
      expires_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS shopping_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    DELETE FROM shopping_items WHERE checked = 0 AND id NOT IN (SELECT MIN(id) FROM shopping_items WHERE checked = 0 GROUP BY ingredient_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_open_item ON shopping_items (ingredient_name) WHERE checked = 0;
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      diet TEXT NOT NULL DEFAULT 'همه',
      allergies_json TEXT NOT NULL DEFAULT '[]',
      household_size INTEGER NOT NULL DEFAULT 2,
      weekly_budget REAL NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO user_preferences (id, diet, allergies_json, household_size, weekly_budget) VALUES (1, 'همه', '[]', 2, 0);
    CREATE TABLE IF NOT EXISTS meal_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      recipe_id TEXT NOT NULL
    );
  `);

  const statement = await db.prepareAsync(
    "INSERT OR IGNORE INTO ingredients (canonical_name, category, base_unit, aliases_json) VALUES ($name, $category, $unit, $aliases)"
  );
  try {
    for (const item of ingredientSeeds) {
      await statement.executeAsync({
        $name: item.name,
        $category: item.category,
        $unit: item.unit,
        $aliases: JSON.stringify(item.aliases)
      });
    }
  } finally {
    await statement.finalizeAsync();
  }
}