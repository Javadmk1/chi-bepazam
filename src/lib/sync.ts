import type { SQLiteDatabase } from "expo-sqlite";
import type { SupabaseClient } from "@supabase/supabase-js";

type CloudRow = Record<string, any> & { id: string; updated_at: string; deleted_at?: string | null };
type LocalRow = Record<string, any> & { id: number; cloud_id?: string | null; updated_at: string; deleted?: number };
type EntityConfig = {
  localTable: "pantry" | "shopping_items" | "meal_plan";
  remoteTable: "pantry_items" | "shopping_items" | "meal_plan_items";
  conflictColumns: string;
  keyOfLocal: (row: Record<string, any>) => string;
  keyOfRemote: (row: Record<string, any>) => string;
  toRemote: (row: LocalRow) => Record<string, any>;
  toLocal: (row: CloudRow) => Record<string, any>;
};

function time(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableKey(parts: unknown[]) {
  return parts.map(value => String(value ?? "").trim()).join("\u001f");
}

async function fetchAllRemote(client: SupabaseClient, table: string, userId: string) {
  const rows: CloudRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from(table).select("*").eq("user_id", userId).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as CloudRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function syncEntity(db: SQLiteDatabase, client: SupabaseClient, userId: string, config: EntityConfig) {
  const { localTable, remoteTable } = config;
  const local = await db.getAllAsync<LocalRow>(`SELECT * FROM ${localTable} ORDER BY id`);
  const remote = await fetchAllRemote(client, remoteTable, userId);
  const remoteById = new Map(remote.map(row => [row.id, row]));
  const remoteByKey = new Map(remote.map(row => [config.keyOfRemote(row), row]));
  const matchedRemoteIds = new Set<string>();
  const matchedLocalIds = new Set<number>();
  const localByKey = new Map(local.map(row => [config.keyOfLocal(row), row]));

  const applyRemoteToLocal = async (localRow: LocalRow, remoteRow: CloudRow) => {
    const values = { ...config.toLocal(remoteRow), cloud_id: remoteRow.id };
    const keys = Object.keys(values);
    await db.runAsync(
      `UPDATE ${localTable} SET ${keys.map(key => `${key} = ?`).join(", ")} WHERE id = ?`,
      ...Object.values(values), localRow.id
    );
  };

  for (const row of local) {
    const key = config.keyOfLocal(row);
    const remoteRow = (row.cloud_id ? remoteById.get(row.cloud_id) : undefined) ?? remoteByKey.get(key);
    if (!remoteRow) {
      if (row.deleted) continue;
      const payload = { ...config.toRemote(row), user_id: userId };
      const { data, error } = await client.from(remoteTable)
        .upsert(payload, { onConflict: `user_id,${config.conflictColumns}` })
        .select("id, updated_at").single();
      if (error) throw error;
      await db.runAsync(`UPDATE ${localTable} SET cloud_id = ?, updated_at = ? WHERE id = ?`, data.id, data.updated_at, row.id);
      matchedLocalIds.add(row.id);
      matchedRemoteIds.add(data.id);
      continue;
    }

    matchedLocalIds.add(row.id);
    matchedRemoteIds.add(remoteRow.id);
    if (row.cloud_id !== remoteRow.id) {
      await db.runAsync(`UPDATE ${localTable} SET cloud_id = ? WHERE id = ?`, remoteRow.id, row.id);
    }

    if (time(row.updated_at) >= time(remoteRow.updated_at)) {
      const payload = { ...config.toRemote(row), user_id: userId };
      const { data, error } = await client.from(remoteTable)
        .update(payload).eq("id", remoteRow.id).select("updated_at").single();
      if (error) throw error;
      // The database trigger owns the authoritative server timestamp.
      if (data?.updated_at) await db.runAsync(`UPDATE ${localTable} SET updated_at = ? WHERE id = ?`, data.updated_at, row.id);
    } else {
      await applyRemoteToLocal(row, remoteRow);
    }
  }

  for (const row of remote) {
    if (matchedRemoteIds.has(row.id)) continue;
    const key = config.keyOfRemote(row);
    const localMatch = localByKey.get(key);
    if (localMatch) {
      matchedLocalIds.add(localMatch.id);
      matchedRemoteIds.add(row.id);
      if (!localMatch.cloud_id || time(row.updated_at) > time(localMatch.updated_at)) {
        await applyRemoteToLocal(localMatch, row);
      } else {
        await db.runAsync(`UPDATE ${localTable} SET cloud_id = ? WHERE id = ?`, row.id, localMatch.id);
      }
      continue;
    }

    const values = { ...config.toLocal(row), cloud_id: row.id };
    const keys = Object.keys(values);
    await db.runAsync(
      `INSERT INTO ${localTable} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
      ...Object.values(values)
    );
    matchedRemoteIds.add(row.id);
  }
}

async function performSync(db: SQLiteDatabase, client: SupabaseClient, userId: string) {
  await syncEntity(db, client, userId, {
    localTable: "pantry", remoteTable: "pantry_items", conflictColumns: "ingredient_name",
    keyOfLocal: row => stableKey([row.ingredient_name]),
    keyOfRemote: row => stableKey([row.ingredient_name]),
    toRemote: row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      expires_at: row.expires_at || null, updated_at: row.updated_at,
      deleted_at: row.deleted ? row.updated_at : null
    }),
    toLocal: row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      expires_at: row.expires_at, updated_at: row.updated_at, deleted: row.deleted_at ? 1 : 0
    })
  });

  await syncEntity(db, client, userId, {
    localTable: "shopping_items", remoteTable: "shopping_items", conflictColumns: "ingredient_name",
    keyOfLocal: row => stableKey([row.ingredient_name]),
    keyOfRemote: row => stableKey([row.ingredient_name]),
    toRemote: row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      checked: Boolean(row.checked), updated_at: row.updated_at,
      deleted_at: row.deleted ? row.updated_at : null
    }),
    toLocal: row => ({
      ingredient_name: row.ingredient_name, quantity: row.quantity, unit: row.unit,
      checked: row.checked ? 1 : 0, updated_at: row.updated_at, deleted: row.deleted_at ? 1 : 0
    })
  });

  await syncEntity(db, client, userId, {
    localTable: "meal_plan", remoteTable: "meal_plan_items",
    conflictColumns: "meal_date,meal_type,recipe_id",
    keyOfLocal: row => stableKey([row.meal_date, row.meal_type, row.recipe_id]),
    keyOfRemote: row => stableKey([row.meal_date, row.meal_type, row.recipe_id]),
    toRemote: row => ({
      meal_date: row.meal_date, meal_type: row.meal_type, recipe_id: row.recipe_id,
      updated_at: row.updated_at, deleted_at: row.deleted ? row.updated_at : null
    }),
    toLocal: row => ({
      meal_date: row.meal_date, meal_type: row.meal_type, recipe_id: row.recipe_id,
      updated_at: row.updated_at, deleted: row.deleted_at ? 1 : 0
    })
  });

  const localPrefs = await db.getFirstAsync<any>("SELECT * FROM user_preferences WHERE id = 1");
  const { data: remotePrefs, error: prefsError } = await client.from("user_preferences")
    .select("*").eq("user_id", userId).maybeSingle();
  if (prefsError) throw prefsError;

  if (!remotePrefs || time(localPrefs?.updated_at) > time(remotePrefs.updated_at)) {
    const payload = {
      user_id: userId, diet: localPrefs?.diet ?? "همه",
      allergies: JSON.parse(localPrefs?.allergies_json ?? "[]"),
      household_size: localPrefs?.household_size ?? 2,
      weekly_budget: localPrefs?.weekly_budget ?? 0
    };
    const { data, error } = await client.from("user_preferences")
      .upsert(payload, { onConflict: "user_id" }).select("updated_at").single();
    if (error) throw error;
    if (data?.updated_at) await db.runAsync("UPDATE user_preferences SET updated_at = ? WHERE id = 1", data.updated_at);
  } else if (time(remotePrefs.updated_at) > time(localPrefs?.updated_at)) {
    await db.runAsync(
      "UPDATE user_preferences SET diet = ?, allergies_json = ?, household_size = ?, weekly_budget = ?, updated_at = ? WHERE id = 1",
      remotePrefs.diet, JSON.stringify(remotePrefs.allergies ?? []), remotePrefs.household_size,
      remotePrefs.weekly_budget, remotePrefs.updated_at
    );
  }
}

const inFlight = new Map<string, Promise<void>>();

export function syncUserData(db: SQLiteDatabase, client: SupabaseClient, userId: string) {
  const key = userId;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const task = performSync(db, client, userId).finally(() => {
    if (inFlight.get(key) === task) inFlight.delete(key);
  });
  inFlight.set(key, task);
  return task;
}
