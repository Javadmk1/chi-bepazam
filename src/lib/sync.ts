import type { SQLiteDatabase } from "expo-sqlite";
import type { SupabaseClient } from "@supabase/supabase-js";

type CloudRow = Record<string, any> & { id: string; updated_at: string; deleted_at?: string | null };
type LocalRow = Record<string, any> & { id: number; cloud_id?: string | null; updated_at: string; deleted?: number };

function time(value?: string | null) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function syncEntity(
  db: SQLiteDatabase,
  client: SupabaseClient,
  userId: string,
  localTable: "pantry" | "shopping_items" | "meal_plan",
  remoteTable: "pantry_items" | "shopping_items" | "meal_plan_items",
  toRemote: (row: LocalRow) => Record<string, any>,
  toLocal: (row: CloudRow) => Record<string, any>
) {
  const local = await db.getAllAsync<LocalRow>(`SELECT * FROM ${localTable} ORDER BY id`);
  const { data: remoteRows, error } = await client.from(remoteTable).select("*").eq("user_id", userId);
  if (error) throw error;
  const remote = (remoteRows ?? []) as CloudRow[];
  const remoteById = new Map(remote.map(row => [row.id, row]));
  const localCloudIds = new Set(local.map(row => row.cloud_id).filter(Boolean) as string[]);

  for (const row of local) {
    const remoteRow = row.cloud_id ? remoteById.get(row.cloud_id) : undefined;
    if (!remoteRow) {
      if (row.deleted) continue;
      const payload = { ...toRemote(row), user_id: userId };
      const { data, error: insertError } = await client.from(remoteTable).insert(payload).select("id").single();
      if (insertError) throw insertError;
      await db.runAsync(`UPDATE ${localTable} SET cloud_id = ? WHERE id = ?`, data.id, row.id);
      localCloudIds.add(data.id);
      continue;
    }

    if (time(row.updated_at) > time(remoteRow.updated_at)) {
      const payload = { ...toRemote(row), user_id: userId };
      const { error: updateError } = await client.from(remoteTable).update(payload).eq("id", remoteRow.id);
      if (updateError) throw updateError;
    } else if (time(remoteRow.updated_at) > time(row.updated_at)) {
      const values = toLocal(remoteRow);
      await db.runAsync(
        `UPDATE ${localTable} SET ${Object.keys(values).map(key => `${key} = ?`).join(", ")} WHERE id = ?`,
        ...Object.values(values), row.id
      );
    }
  }

  for (const row of remote) {
    if (localCloudIds.has(row.id)) continue;
    const values = { ...toLocal(row), cloud_id: row.id };
    const keys = Object.keys(values);
    await db.runAsync(
      `INSERT INTO ${localTable} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
      ...Object.values(values)
    );
  }
}

export async function syncUserData(db: SQLiteDatabase, client: SupabaseClient, userId: string) {
  await syncEntity(db, client, userId, "pantry", "pantry_items",
    row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      expires_at: row.expires_at || null, updated_at: row.updated_at,
      deleted_at: row.deleted ? row.updated_at : null
    }),
    row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      expires_at: row.expires_at, updated_at: row.updated_at, deleted: row.deleted_at ? 1 : 0
    })
  );

  await syncEntity(db, client, userId, "shopping_items", "shopping_items",
    row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      checked: Boolean(row.checked), updated_at: row.updated_at,
      deleted_at: row.deleted ? row.updated_at : null
    }),
    row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      checked: row.checked ? 1 : 0, updated_at: row.updated_at, deleted: row.deleted_at ? 1 : 0
    })
  );

  await syncEntity(db, client, userId, "meal_plan", "meal_plan_items",
    row => ({
      meal_date: row.meal_date, meal_type: row.meal_type, recipe_id: row.recipe_id,
      updated_at: row.updated_at, deleted_at: row.deleted ? row.updated_at : null
    }),
    row => ({
      meal_date: row.meal_date, meal_type: row.meal_type, recipe_id: row.recipe_id,
      updated_at: row.updated_at, deleted: row.deleted_at ? 1 : 0
    })
  );

  const localPrefs = await db.getFirstAsync<any>("SELECT * FROM user_preferences WHERE id = 1");
  const { data: remotePrefs, error: prefsError } = await client.from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (prefsError) throw prefsError;
  if (!remotePrefs || time(localPrefs?.updated_at) > time(remotePrefs.updated_at)) {
    const payload = {
      user_id: userId, diet: localPrefs?.diet ?? "همه",
      allergies: JSON.parse(localPrefs?.allergies_json ?? "[]"),
      household_size: localPrefs?.household_size ?? 2,
      weekly_budget: localPrefs?.weekly_budget ?? 0,
      updated_at: localPrefs?.updated_at ?? new Date().toISOString()
    };
    const { error } = await client.from("user_preferences").upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
  } else if (time(remotePrefs.updated_at) > time(localPrefs?.updated_at)) {
    await db.runAsync(
      "UPDATE user_preferences SET diet = ?, allergies_json = ?, household_size = ?, weekly_budget = ?, updated_at = ? WHERE id = 1",
      remotePrefs.diet, JSON.stringify(remotePrefs.allergies ?? []), remotePrefs.household_size,
      remotePrefs.weekly_budget, remotePrefs.updated_at
    );
  }
}
