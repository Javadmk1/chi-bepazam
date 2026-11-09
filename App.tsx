import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import { initializeDatabase } from "./src/db/database";
import { recipes, type Recipe } from "./src/data/recipes";
import { ingredientSeeds, normalizeIngredient } from "./src/data/ingredients";
import { rankRecipes } from "./src/engine/matcher";
import { missingRecipeQuantity, scaledRecipeQuantity } from "./src/data/recipe-quantity";
import { expiryLabel, getExpiryStatus } from "./src/data/expiry";
import { supabase, supabaseConfigured } from "./src/lib/supabase";
import { syncUserData } from "./src/lib/sync";

type PantryItem = { id: number; ingredient_name: string; quantity: number; unit: string; expires_at?: string | null };
type UserPreferences = { diet: string; allergies_json: string; household_size: number; weekly_budget: number };
type ShoppingItem = { id: number; ingredient_name: string; quantity: number; unit: string; checked: number };
type PlanItem = { id: number; meal_date: string; meal_type: string; recipe_id: string };

const C = {
  bg: "#090B0A", panel: "#151816", panel2: "#1D211E", gold: "#E6B33D",
  goldSoft: "#A9822D", green: "#168A3B", green2: "#20A64C", text: "#F7F2E8",
  muted: "#A9A69D", line: "#302F28", white: "#FFFFFF", red: "#D66B55"
};

function FoodArt({ recipe, large = false }: { recipe: Recipe; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (recipe.imageUrl && !failed) {
    return <Image source={{ uri: recipe.imageUrl }} resizeMode="cover" onError={() => setFailed(true)} style={large ? styles.foodArtLarge : styles.foodArtThumb}/>;
  }
  return <Text style={large ? styles.detailEmoji : styles.foodEmoji}>{recipe.image}</Text>;
}

function AppContent() {
  const db = useSQLiteContext();
  const [tab, setTab] = useState("خانه");
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [mealPlan, setMealPlan] = useState<PlanItem[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newExpiry, setNewExpiry] = useState("");
  const [editingPantry, setEditingPantry] = useState<PantryItem | null>(null);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [planPickerDate, setPlanPickerDate] = useState<string | null>(null);
  const [pantryFilter, setPantryFilter] = useState("همه");
  const [recipeFilter, setRecipeFilter] = useState("همه");
  const [preferences, setPreferences] = useState<UserPreferences>({ diet: "همه", allergies_json: "[]", household_size: 2, weekly_budget: 0 });
  const [allergyInput, setAllergyInput] = useState("");
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudCode, setCloudCode] = useState("");
  const [cloudCodeSent, setCloudCodeSent] = useState(false);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);
  const [cloudSyncMessage, setCloudSyncMessage] = useState("هنوز همگام‌سازی نشده");

  const loadData = async () => {
    const p = await db.getAllAsync<PantryItem>("SELECT id, ingredient_name, quantity, unit, expires_at FROM pantry WHERE deleted = 0 ORDER BY ingredient_name");
    const s = await db.getAllAsync<ShoppingItem>("SELECT id, ingredient_name, quantity, unit, checked FROM shopping_items WHERE deleted = 0 ORDER BY checked, ingredient_name");
    const plan = await db.getAllAsync<PlanItem>("SELECT id, meal_date, meal_type, recipe_id FROM meal_plan WHERE deleted = 0 ORDER BY meal_date");
    const prefs = await db.getFirstAsync<UserPreferences>("SELECT diet, allergies_json, household_size, weekly_budget FROM user_preferences WHERE id = 1");
    setPantry(p);
    setShopping(s);
    setMealPlan(plan);
    if (prefs) { setPreferences(prefs); try { setAllergyInput((JSON.parse(prefs.allergies_json) as string[]).join(", ")); } catch { setAllergyInput(""); } }
  };

  useEffect(() => { loadData().catch(() => Alert.alert("خطا", "خواندن اطلاعات محلی انجام نشد.")); }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setCloudUserEmail(data.session?.user.email ?? null);
      if (data.session?.user.id) loadData().catch(() => setCloudSyncMessage("همگام‌سازی پس از ورود ناموفق بود"));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUserEmail(session?.user.email ?? null);
      if (session?.user.id && _event === "SIGNED_IN") {
        loadData().catch(() => setCloudSyncMessage("همگام‌سازی پس از ورود ناموفق بود"));
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const addPantry = async (name: string, qty = 1, expiresAt: string | null = null) => {
    const normalized = normalizeIngredient(name);
    const seed = ingredientSeeds.find(x => x.name === normalized);
    await db.runAsync(
      "INSERT INTO pantry (ingredient_name, quantity, unit, expires_at, updated_at, deleted) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0) ON CONFLICT(ingredient_name) DO UPDATE SET quantity = quantity + excluded.quantity, expires_at = COALESCE(excluded.expires_at, pantry.expires_at), updated_at = CURRENT_TIMESTAMP, deleted = 0",
      normalized, Math.max(0.01, qty), seed?.unit ?? "عدد", expiresAt
    );
    await loadData();
  };

  const updatePantryItem = async (item: PantryItem, name: string, quantity: number, expiresAt: string | null) => {
    const normalized = normalizeIngredient(name);
    const seed = ingredientSeeds.find(entry => entry.name === normalized);
    try {
      await db.runAsync(
        "UPDATE pantry SET ingredient_name = ?, quantity = ?, unit = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        normalized, quantity, seed?.unit ?? item.unit, expiresAt, item.id
      );
      await loadData();
    } catch {
      Alert.alert("نام تکراری", "این ماده از قبل در انبار ثبت شده است.");
    }
  };

  const openPantryEditor = (item: PantryItem) => {
    setEditingPantry(item);
    setNewName(item.ingredient_name);
    setNewQty(String(item.quantity));
    setNewExpiry(item.expires_at ?? "");
    setModal(true);
  };

  const adjustPantry = async (item: PantryItem, direction: -1 | 1) => {
    const step = item.unit === "گرم" || item.unit === "میلی‌لیتر" ? 50 : 1;
    await db.runAsync(
      "UPDATE pantry SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      direction * step, item.id
    );
    await loadData();
  };

  const expiringItems = pantry.filter(item => getExpiryStatus(item.expires_at) === "soon");
  const expiredItems = pantry.filter(item => getExpiryStatus(item.expires_at) === "expired");

  const addShopping = async (name: string, qty = 1, unit = "عدد") => {
    await db.runAsync("INSERT INTO shopping_items (ingredient_name, quantity, unit, updated_at, deleted) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0) ON CONFLICT(ingredient_name) DO UPDATE SET quantity = quantity + excluded.quantity, checked = 0, deleted = 0, updated_at = CURRENT_TIMESTAMP", normalizeIngredient(name), qty, unit);
    await loadData();
  };

  const toggleShopping = async (item: ShoppingItem) => {
    await db.runAsync("UPDATE shopping_items SET checked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", item.checked ? 0 : 1, item.id);
    await loadData();
  };

  const removeShopping = async (item: ShoppingItem) => {
    await db.runAsync("UPDATE shopping_items SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", item.id);
    await loadData();
  };

  const removePantry = async (item: PantryItem) => {
    await db.runAsync("UPDATE pantry SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", item.id);
    await loadData();
  };

  const matchingRecipes = useMemo(() => {
    const allergies = (() => { try { return (JSON.parse(preferences.allergies_json) as string[]).map(normalizeIngredient); } catch { return []; } })();
    return rankRecipes(recipes.filter(r => {
      const ingredientNames = r.ingredients.map(item => normalizeIngredient(item.name));
      const allergyBlocked = allergies.some(allergen => ingredientNames.includes(allergen));
      const dietBlocked = preferences.diet === "گیاهی" && !r.tags.includes("گیاهی");
      return !allergyBlocked && !dietBlocked;
    }), pantry)
      .filter(({ recipe: r }) => {
        const q = query.trim();
        const textMatch = !q || r.title.includes(q) || r.tags.some(t => t.includes(q));
        const filterMatch = recipeFilter === "همه" || (recipeFilter === "سریع" && r.timeMin <= 30) || (recipeFilter === "اقتصادی" && r.tags.includes("اقتصادی"));
        return textMatch && filterMatch;
      })
      .map(match => match.recipe);
  }, [query, recipeFilter, pantry, preferences]);

  const addRecipeToShopping = async (recipe: Recipe) => {
    for (const item of recipe.ingredients) {
      const normalized = normalizeIngredient(item.name);
      const owned = pantry.find(p => normalizeIngredient(p.ingredient_name) === normalized);
      const need = missingRecipeQuantity(item.qty, owned?.quantity ?? 0, owned?.unit ?? "", preferences.household_size, 2);
      if (need) {
        await db.runAsync(
          "INSERT INTO shopping_items (ingredient_name, quantity, unit, updated_at, deleted) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0) ON CONFLICT(ingredient_name) DO UPDATE SET quantity = quantity + excluded.quantity, unit = excluded.unit, checked = 0, deleted = 0, updated_at = CURRENT_TIMESTAMP",
          normalized, need.quantity, need.unit
        );
      }
    }
    await loadData();
    setSelected(null);
    setTab("لیست خرید");
    Alert.alert("انجام شد", "کسری مواد براساس تعداد نفرات و موجودی هم‌واحد انبار محاسبه شد. موارد با واحد متفاوت، کامل در لیست خرید آمده‌اند.");
  };

  const addQuickItems = async () => {
    const defaults = ["گوجه‌فرنگی", "سیب‌زمینی", "پیاز", "تخم‌مرغ", "برنج", "روغن"];
    for (const item of defaults) await addPantry(item);
  };

  const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      <View style={{flexDirection:"row", alignItems:"center", gap:9}}>
        <Pressable style={styles.headerAction} accessibilityLabel="تنظیمات" onPress={() => { setSelected(null); setTab("تنظیمات"); }}><Ionicons name="settings-outline" size={19} color={C.gold}/></Pressable>
        <View style={styles.logo}><Ionicons name="restaurant" size={22} color={C.gold} /></View>
      </View>
    </View>
  );

  const SectionTitle = ({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) => (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text onPress={onPress} style={styles.actionText}>{action}</Text> : null}
    </View>
  );

  const RecipeCard = ({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) => (
    <Pressable style={[styles.recipeCard, compact && styles.recipeCompact]} onPress={() => setSelected(recipe)}>
      <View style={styles.foodThumb}><FoodArt recipe={recipe}/><View style={styles.rating}><Ionicons name="star" size={11} color={C.gold}/><Text style={styles.ratingText}>{recipe.rating}</Text></View></View>
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle}>{recipe.title}</Text>
        <Text style={styles.muted}>{recipe.subtitle}</Text>
        <View style={styles.metaRow}><Ionicons name="time-outline" size={14} color={C.gold}/><Text style={styles.metaText}>{recipe.timeMin} دقیقه</Text><Ionicons name="flame-outline" size={14} color={C.gold}/><Text style={styles.metaText}>{recipe.calories} کالری</Text></View>
      </View>
      <Ionicons name="chevron-back" size={18} color={C.muted}/>
    </Pressable>
  );

  const Home = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="چی بپزم؟" subtitle="آشپزی هوشمند، زندگی بهتر" />
      <View style={styles.hero}>
        <View style={styles.heroTop}><Text style={styles.eyebrow}>پیشنهاد ویژه امروز</Text><Text style={styles.heroIcon}>👨‍🍳</Text></View>
        <Text style={styles.heroTitle}>امروز چی بپزم؟</Text>
        <Text style={styles.heroDesc}>با مواد داخل انبارت، یک غذای خوشمزه پیدا کن.</Text>
        <Pressable style={styles.goldButton} onPress={() => setTab("پیشنهادها")}><Text style={styles.goldButtonText}>پیشنهاد غذاها</Text><Ionicons name="arrow-back" color={C.bg} size={17}/></Pressable>
      </View>
      <View style={styles.quickGrid}>
        <Pressable style={styles.quickCard} onPress={() => setTab("انبار")}><Ionicons name="basket-outline" size={24} color={C.gold}/><Text style={styles.quickTitle}>انبار خانه</Text><Text style={styles.quickSub}>{pantry.length} قلم ماده</Text></Pressable>
        <Pressable style={styles.quickCard} onPress={() => setTab("لیست خرید")}><Ionicons name="cart-outline" size={24} color={C.gold}/><Text style={styles.quickTitle}>لیست خرید</Text><Text style={styles.quickSub}>{shopping.filter(x => !x.checked).length} مورد باقی‌مانده</Text></Pressable>
        <Pressable style={styles.quickCard} onPress={() => setTab("برنامه")}><Ionicons name="calendar-outline" size={24} color={C.gold}/><Text style={styles.quickTitle}>برنامه هفتگی</Text><Text style={styles.quickSub}>وعده‌های این هفته</Text></Pressable>
      </View>
      <SectionTitle title="پیشنهادهای محبوب" action="مشاهده همه" onPress={() => setTab("پیشنهادها")}/>
      {recipes.slice(0, 2).map(r => <RecipeCard key={r.id} recipe={r}/>)}
      <View style={styles.tip}><Ionicons name="bulb-outline" color={C.gold} size={20}/><Text style={styles.tipText}>نکته: مواد موجود در انبار را ثبت کن تا پیشنهادها دقیق‌تر شوند.</Text></View>
    </ScrollView>
  );

  const Pantry = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="انبار خانه" subtitle="مواد غذایی موجود در خانه" />
      {expiredItems.length > 0 || expiringItems.length > 0 ? <View style={[styles.expiryNotice, expiredItems.length > 0 && styles.expiryDanger]}><Ionicons name="alert-circle" size={20} color={expiredItems.length > 0 ? C.red : C.gold}/><Text style={styles.expiryNoticeText}>{expiredItems.length > 0 ? `${expiredItems.length} ماده منقضی‌شده` : ""}{expiredItems.length > 0 && expiringItems.length > 0 ? " · " : ""}{expiringItems.length > 0 ? `${expiringItems.length} ماده با انقضای حداکثر ۷ روز آینده` : ""}</Text></View> : null}
      <TextInput value={query} onChangeText={setQuery} placeholder="جستجو در مواد..." placeholderTextColor={C.muted} style={styles.search}/>
      <View style={styles.filterRow}>{["همه", "سبزیجات", "پروتئین و لبنیات", "نزدیک انقضا", "منقضی‌شده"].map(x => <Pressable key={x} onPress={() => setPantryFilter(x)} style={[styles.chip, pantryFilter === x && styles.chipActive]}><Text style={[styles.chipText, pantryFilter === x && styles.chipTextActive]}>{x}</Text></Pressable>)}</View>
      {pantry.filter(p => {
        const category = ingredientSeeds.find(i => i.name === p.ingredient_name)?.category ?? "";
        const status = getExpiryStatus(p.expires_at);
        const categoryMatch = ["همه", "نزدیک انقضا", "منقضی‌شده"].includes(pantryFilter) ||
          (pantryFilter === "سبزیجات" && category === "سبزیجات") ||
          (pantryFilter === "پروتئین و لبنیات" && ["لبنیات", "گوشت و پروتئین", "لبنیات و پروتئین"].includes(category));
        const expiryMatch = pantryFilter === "نزدیک انقضا" ? status === "soon" :
          pantryFilter === "منقضی‌شده" ? status === "expired" : true;
        return p.ingredient_name.includes(query) && categoryMatch && expiryMatch;
      }).map(item => (
        <View key={item.id} style={styles.listRow}><View style={styles.ingredientIcon}><Text>🥬</Text></View><View style={styles.listMain}><Text style={styles.listTitle}>{item.ingredient_name}</Text><Text style={styles.muted}>{item.quantity} {item.unit}</Text><Text style={styles.muted}>{item.expires_at ? `انقضا: ${item.expires_at} · ${expiryLabel(item.expires_at)}` : "تاریخ انقضا ثبت نشده"}</Text></View><Pressable onPress={() => openPantryEditor(item)} hitSlop={8}><Ionicons name="create-outline" size={19} color={C.gold}/></Pressable><Pressable onPress={() => adjustPantry(item, -1)} hitSlop={8}><Ionicons name="remove-circle-outline" size={20} color={C.gold}/></Pressable><Pressable onPress={() => adjustPantry(item, 1)} hitSlop={8}><Ionicons name="add-circle-outline" size={20} color={C.green2}/></Pressable><Pressable onPress={() => removePantry(item)} hitSlop={10}><Ionicons name="trash-outline" size={19} color={C.red}/></Pressable></View>
      ))}
      {pantry.length === 0 ? <View style={styles.empty}><Text style={styles.emptyEmoji}>🧺</Text><Text style={styles.emptyTitle}>انبارت هنوز خالیه</Text><Text style={styles.muted}>چند ماده پرکاربرد اضافه کن تا پیشنهادهای بهتری بگیری.</Text><Pressable style={styles.greenButton} onPress={addQuickItems}><Text style={styles.greenButtonText}>افزودن مواد پرکاربرد</Text></Pressable></View> : null}
      <Pressable style={styles.greenButton} onPress={() => { setEditingPantry(null); setNewName(""); setNewQty("1"); setNewExpiry(""); setModal(true); }}><Ionicons name="add" size={19} color={C.white}/><Text style={styles.greenButtonText}>افزودن ماده غذایی</Text></Pressable>
    </ScrollView>
  );

  const Suggestions = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="پیشنهاد غذا" subtitle={`${recipes.length} دستور پخت؛ مرتب‌شده بر اساس مواد موجود`} />
      <TextInput value={query} onChangeText={setQuery} placeholder="نام غذا یا نوع آن را جستجو کن..." placeholderTextColor={C.muted} style={styles.search}/>
      <View style={styles.filterRow}>{["همه", "سریع", "اقتصادی"].map(x => <Pressable key={x} onPress={() => setRecipeFilter(x)} style={[styles.chip, recipeFilter === x && styles.chipActive]}><Text style={[styles.chipText, recipeFilter === x && styles.chipTextActive]}>{x}</Text></Pressable>)}</View>
      {matchingRecipes.map(r => <RecipeCard key={r.id} recipe={r}/>)}
      {matchingRecipes.length === 0 ? <Text style={styles.muted}>غذایی پیدا نشد؛ عبارت دیگری را امتحان کن.</Text> : null}
    </ScrollView>
  );

  const Shopping = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="لیست خرید" subtitle="چیزهایی که باید تهیه کنی" />
      <View style={styles.summary}><Text style={styles.summaryNumber}>{shopping.filter(x => !x.checked).length}</Text><Text style={styles.summaryText}>مورد برای خرید باقی مانده</Text></View>
      {shopping.map(item => <View key={item.id} style={styles.listRow}><Pressable onPress={() => toggleShopping(item)} style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}><Ionicons name={item.checked ? "checkbox" : "square-outline"} size={22} color={item.checked ? C.green2 : C.muted}/><View style={styles.listMain}><Text style={[styles.listTitle, !!item.checked && styles.checkedText]}>{item.ingredient_name}</Text><Text style={styles.muted}>{item.quantity} {item.unit}</Text></View></Pressable><Pressable onPress={() => removeShopping(item)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={C.red}/></Pressable></View>)}
      {shopping.some(item => item.checked) ? <Pressable style={styles.greenButton} onPress={async () => {
        const bought = shopping.filter(item => item.checked);
        const transferred: number[] = [];
        const unitMismatches: string[] = [];
        for (const item of bought) {
          const existing = await db.getFirstAsync<{ id: number; quantity: number; unit: string }>(
            "SELECT id, quantity, unit FROM pantry WHERE ingredient_name = ? AND deleted = 0",
            item.ingredient_name
          );
          if (existing && existing.unit !== item.unit) {
            unitMismatches.push(item.ingredient_name);
            continue;
          }
          if (existing) {
            await db.runAsync(
              "UPDATE pantry SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              item.quantity, existing.id
            );
          } else {
            await db.runAsync(
              "INSERT INTO pantry (ingredient_name, quantity, unit, updated_at, deleted) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0)",
              item.ingredient_name, item.quantity, item.unit
            );
          }
          transferred.push(item.id);
        }
        for (const id of transferred) await db.runAsync("UPDATE shopping_items SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", id);
        await loadData();
        if (unitMismatches.length) {
          Alert.alert("بعضی مواد منتقل نشدند", "واحد این مواد با واحد ثبت‌شده در انبار متفاوت است؛ برای جلوگیری از جمع‌زدن مقدارهای ناسازگار، آن‌ها در لیست خرید باقی ماندند: " + unitMismatches.join("، "));
        } else {
          Alert.alert("انبار به‌روز شد", "اقلام خریداری‌شده به انبار خانه منتقل شدند.");
        }
      }}><Ionicons name="checkmark-done" color={C.white} size={18}/><Text style={styles.greenButtonText}>انتقال خریدها به انبار ({shopping.filter(item => item.checked).length})</Text></Pressable> : null}
      {shopping.length === 0 ? <View style={styles.empty}><Text style={styles.emptyEmoji}>🛒</Text><Text style={styles.emptyTitle}>لیست خرید خالی است</Text><Text style={styles.muted}>از جزئیات دستور پخت، مواد لازم را اضافه کن.</Text></View> : null}
      <Pressable style={styles.outlineButton} onPress={() => Alert.alert("راهنما", "برای افزودن مواد، وارد پیشنهاد غذا شو و یک دستور را باز کن.")}><Text style={styles.outlineButtonText}>چطور لیست خرید بسازم؟</Text></Pressable>
    </ScrollView>
  );

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    const names = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
    return { iso, label: names[date.getDay()], dayNumber: date.getDate() };
  });

  const chooseMealForDay = (date: string) => setPlanPickerDate(date);

  const addMealToSelectedDay = async (recipe: Recipe) => {
    if (!planPickerDate) return;
    await db.runAsync("INSERT INTO meal_plan (meal_date, meal_type, recipe_id, updated_at, deleted) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0) ON CONFLICT(meal_date, meal_type, recipe_id) DO UPDATE SET deleted = 0, updated_at = CURRENT_TIMESTAMP", planPickerDate, "شام", recipe.id);
    setPlanPickerDate(null);
    await loadData();
  };

  const removeMeal = async (id: number) => {
    await db.runAsync("UPDATE meal_plan SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", id);
    await loadData();
  };

  const Plan = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="برنامه هفتگی" subtitle="برای وعده‌هایت از قبل برنامه‌ریزی کن" />
      {weekDays.map(day => {
        const meals = mealPlan.filter(item => item.meal_date === day.iso);
        return (
          <View key={day.iso} style={styles.dayCard}>
            <View style={styles.dayBadge}><Text style={styles.dayText}>{day.label}</Text><Text style={styles.dayNumber}>{day.dayNumber}</Text></View>
            <View style={styles.listMain}>
              {meals.length ? meals.map(meal => {
                const recipe = recipes.find(item => item.id === meal.recipe_id);
                return recipe ? (
                  <Pressable key={meal.id} onLongPress={() => removeMeal(meal.id)} onPress={() => setSelected(recipe)}>
                    <Text style={styles.listTitle}>{recipe.title}</Text>
                    <Text style={styles.muted}>{meal.meal_type} • {recipe.timeMin} دقیقه · برای حذف نگه دار</Text>
                  </Pressable>
                ) : null;
              }) : <Text style={styles.muted}>برای این روز غذایی انتخاب نشده</Text>}
            </View>
            <Pressable onPress={() => chooseMealForDay(day.iso)} hitSlop={10}><Ionicons name="add-circle-outline" size={25} color={C.gold}/></Pressable>
          </View>
        );
      })}
      <Pressable style={styles.greenButton} onPress={async () => {
        const needs = new Map<string, { quantity: number; unit: string }>();
        for (const meal of mealPlan) {
          const recipe = recipes.find(item => item.id === meal.recipe_id);
          if (!recipe) continue;
          for (const ingredient of recipe.ingredients) {
            const normalized = normalizeIngredient(ingredient.name);
            const parsed = missingRecipeQuantity(ingredient.qty, 0, "", preferences.household_size, 2);
            if (!parsed) continue;
            const current = needs.get(normalized);
            if (!current) needs.set(normalized, { quantity: parsed.quantity, unit: parsed.unit });
            else if (current.unit === parsed.unit) current.quantity += parsed.quantity;
          }
        }
        for (const [name, need] of needs) {
          const stock = pantry.find(item => normalizeIngredient(item.ingredient_name) === name);
          const available = stock?.unit === need.unit ? stock.quantity : 0;
          const missing = Math.max(0, Math.round((need.quantity - available) * 100) / 100);
          if (missing > 0) await db.runAsync(
            "INSERT INTO shopping_items (ingredient_name, quantity, unit, updated_at, deleted) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0) ON CONFLICT(ingredient_name) WHERE checked = 0 DO UPDATE SET quantity = quantity + excluded.quantity, unit = excluded.unit, updated_at = CURRENT_TIMESTAMP",
            name, missing, need.unit
          );
        }
        await loadData();
        setTab("لیست خرید");
        Alert.alert("لیست خرید آماده شد", "کسری مواد دستورهای برنامه‌ریزی‌شده با مقیاس تعداد نفرات محاسبه شد.");
      }}><Ionicons name="cart-outline" color={C.white} size={18}/><Text style={styles.greenButtonText}>ساخت لیست خرید هفتگی</Text></Pressable>
    </ScrollView>
  );

  const savePreferences = async (next: UserPreferences) => {
    await db.runAsync("UPDATE user_preferences SET diet = ?, allergies_json = ?, household_size = ?, weekly_budget = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1", next.diet, next.allergies_json, next.household_size, next.weekly_budget);
    setPreferences(next);
  };

  const requestCloudCode = async () => {
    if (!supabase) {
      Alert.alert("اتصال آماده نیست", "آدرس پروژه و کلید عمومی Supabase هنوز در تنظیمات ساخت وارد نشده‌اند.");
      return;
    }
    const email = cloudEmail.trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      Alert.alert("ایمیل نامعتبر", "یک نشانی ایمیل معتبر وارد کن.");
      return;
    }
    setCloudBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setCloudBusy(false);
    if (error) Alert.alert("ارسال کد ناموفق بود", error.message);
    else { setCloudCodeSent(true); Alert.alert("کد ارسال شد", "کد ورود را از ایمیلت بردار و اینجا وارد کن."); }
  };

  const verifyCloudCode = async () => {
    if (!supabase) return;
    const token = cloudCode.trim().replace(/\\s/g, "");
    if (!/^\\d{6}$/.test(token)) { Alert.alert("کد نامعتبر", "کد شش‌رقمی ایمیل را وارد کن."); return; }
    setCloudBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ email: cloudEmail.trim().toLowerCase(), token, type: "email" });
    setCloudBusy(false);
    if (error) Alert.alert("ورود ناموفق بود", error.message);
    else {
      setCloudUserEmail(data.user?.email ?? cloudEmail.trim());
      setCloudCodeSent(false);
      setCloudCode("");
      Alert.alert("ورود موفق", "حساب کاربری متصل شد. اطلاعات محلی هنوز به فضای ابری منتقل نشده‌اند.");
    }
  };

  const syncCloudNow = async () => {
    if (!supabase) {
      Alert.alert("اتصال آماده نیست", "ابتدا متغیرهای Supabase را در تنظیمات ساخت وارد کن.");
      return;
    }
    setCloudSyncBusy(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session?.user.id) {
        Alert.alert("ورود لازم است", "ابتدا با ایمیل وارد حساب ابری شو.");
        return;
      }
      await syncUserData(db, supabase, data.session.user.id);
      const p = await db.getAllAsync<PantryItem>("SELECT id, ingredient_name, quantity, unit, expires_at FROM pantry WHERE deleted = 0 ORDER BY ingredient_name");
      const sh = await db.getAllAsync<ShoppingItem>("SELECT id, ingredient_name, quantity, unit, checked FROM shopping_items WHERE deleted = 0 ORDER BY checked, ingredient_name");
      const pl = await db.getAllAsync<PlanItem>("SELECT id, meal_date, meal_type, recipe_id FROM meal_plan WHERE deleted = 0 ORDER BY meal_date");
      const prefs = await db.getFirstAsync<UserPreferences>("SELECT diet, allergies_json, household_size, weekly_budget FROM user_preferences WHERE id = 1");
      setPantry(p); setShopping(sh); setMealPlan(pl);
      if (prefs) setPreferences(prefs);
      setCloudSyncMessage("همگام‌سازی موفق · " + new Date().toLocaleString("fa-IR"));
      Alert.alert("همگام‌سازی انجام شد", "انبار، لیست خرید، برنامه هفتگی و ترجیحات بین دستگاه و فضای ابری همگام شدند.");
    } catch (error: any) {
      setCloudSyncMessage("همگام‌سازی ناموفق بود");
      Alert.alert("خطای همگام‌سازی", error?.message ?? "دریافت یا ارسال اطلاعات ناموفق بود.");
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const signOutCloud = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("خطا", error.message);
    else { setCloudUserEmail(null); setCloudCodeSent(false); }
  };

  const Settings = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="تنظیمات" subtitle="ترجیحات روی همین دستگاه ذخیره می‌شوند" />
      <View style={styles.profile}><Ionicons name="person-circle-outline" size={42} color={C.gold}/><View style={{flex:1}}><Text style={styles.listTitle}>{cloudUserEmail ? "حساب متصل" : "حساب مهمان"}</Text><Text style={styles.muted}>{cloudUserEmail ?? "اطلاعات فعلاً فقط روی همین دستگاه ذخیره می‌شوند."}</Text></View></View>
      <SectionTitle title="حساب ابری و پشتیبان‌گیری"/>
      <View style={styles.profile}><Ionicons name="cloud-done-outline" size={24} color={C.green2}/><View style={{flex:1}}><Text style={styles.listTitle}>{cloudSyncMessage}</Text><Text style={styles.muted}>آخرین وضعیت همگام‌سازی این دستگاه</Text></View></View>
      <Pressable disabled={!cloudUserEmail || cloudSyncBusy} style={[styles.greenButton, (!cloudUserEmail || cloudSyncBusy) && {opacity:0.45}]} onPress={syncCloudNow}><Ionicons name="sync-outline" color={C.white} size={18}/><Text style={styles.greenButtonText}>{cloudSyncBusy ? "در حال همگام‌سازی..." : "همگام‌سازی اکنون"}</Text></Pressable>
      {!supabaseConfigured ? <View style={styles.tip}><Ionicons name="cloud-offline-outline" color={C.gold} size={20}/><Text style={styles.tipText}>اتصال ابری هنوز پیکربندی نشده؛ متغیرهای EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY لازم‌اند.</Text></View> : null}
      {cloudUserEmail ? <Pressable style={styles.settingRow} onPress={signOutCloud}><Ionicons name="log-out-outline" size={20} color={C.gold}/><Text style={styles.listTitle}>خروج از حساب ابری</Text></Pressable> : <>
        <TextInput value={cloudEmail} onChangeText={setCloudEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ایمیل برای ورود" placeholderTextColor={C.muted} style={styles.input}/>
        {cloudCodeSent ? <><TextInput value={cloudCode} onChangeText={setCloudCode} keyboardType="number-pad" maxLength={6} placeholder="کد شش‌رقمی ایمیل" placeholderTextColor={C.muted} style={styles.input}/><Pressable disabled={cloudBusy} style={[styles.greenButton, cloudBusy && {opacity:0.5}]} onPress={verifyCloudCode}><Text style={styles.greenButtonText}>{cloudBusy ? "در حال بررسی..." : "تأیید کد و ورود"}</Text></Pressable></> : <Pressable disabled={cloudBusy || !supabaseConfigured} style={[styles.greenButton, (!supabaseConfigured || cloudBusy) && {opacity:0.5}]} onPress={requestCloudCode}><Text style={styles.greenButtonText}>{cloudBusy ? "در حال ارسال..." : "ارسال کد ورود به ایمیل"}</Text></Pressable>}
      </>}
      <View style={styles.tip}><Ionicons name="shield-checkmark-outline" color={C.gold} size={20}/><Text style={styles.tipText}>نشست ورود با SecureStore نگهداری می‌شود. همگام‌سازی انبار، خرید، برنامه هفتگی و ترجیحات با سیاست‌های RLS انجام می‌شود. کلید Service Role هرگز نباید در برنامه موبایل قرار بگیرد.</Text></View>
      <SectionTitle title="الگوی غذایی"/>
      <Text style={styles.muted}>غذاهای پیشنهادی براساس این انتخاب فیلتر می‌شوند.</Text>
      <View style={styles.filterRow}>{["همه", "گیاهی"].map(option => <Pressable key={option} onPress={() => savePreferences({...preferences, diet: option})} style={[styles.chip, preferences.diet === option && styles.chipActive]}><Text style={[styles.chipText, preferences.diet === option && styles.chipTextActive]}>{option}</Text></Pressable>)}</View>
      <SectionTitle title="حساسیت‌ها و مواد ممنوع"/>
      <Text style={styles.muted}>نام مواد را با ویرگول جدا کن؛ غذاهایی که ماده‌ای با نام منطبق دارند از پیشنهادها حذف می‌شوند.</Text>
      <TextInput value={allergyInput} onChangeText={setAllergyInput} placeholder="مثلاً شیر، بادام‌زمینی، تخم‌مرغ" placeholderTextColor={C.muted} style={styles.input}/>
      <Pressable style={styles.greenButton} onPress={() => {
        const values = [...new Set(allergyInput.split(/[,،]/).map(x => normalizeIngredient(x.trim())).filter(Boolean))];
        savePreferences({...preferences, allergies_json: JSON.stringify(values)}).then(() => Alert.alert("ذخیره شد", "فیلتر مواد انتخاب‌شده در پیشنهاد غذا اعمال شد."));
      }}><Text style={styles.greenButtonText}>ذخیره حساسیت‌ها</Text></Pressable>
      <SectionTitle title="تعداد نفرات"/>
      <Text style={styles.muted}>مقدار مواد دستورها برای تعداد انتخاب‌شده مقیاس می‌شود. برای مواد با واحد متفاوت از انبار، مقدار کامل دستور در لیست خرید می‌آید.</Text>
      <View style={[styles.filterRow, {alignItems:"center"}]}>
        <Pressable style={styles.chip} onPress={() => savePreferences({...preferences, household_size: Math.max(1, preferences.household_size - 1)})}><Text style={styles.chipText}>−</Text></Pressable>
        <Text style={styles.listTitle}>{preferences.household_size} نفر</Text>
        <Pressable style={styles.chip} onPress={() => savePreferences({...preferences, household_size: Math.min(20, preferences.household_size + 1)})}><Text style={styles.chipText}>+</Text></Pressable>
      </View>
      <View style={styles.tip}><Ionicons name="information-circle-outline" color={C.gold} size={20}/><Text style={styles.tipText}>فیلتر حساسیت فقط مواد ثبت‌شده در دستورها را بررسی می‌کند؛ آلودگی متقاطع یا مواد اعلام‌نشده را پوشش نمی‌دهد. در حساسیت شدید، صرفاً به این فیلتر تکیه نکن.</Text></View>

      <Pressable style={styles.settingRow} onPress={() => Alert.alert("چی بپزم؟", "نسخه آزمایشی محلی") }><Ionicons name="information-circle-outline" size={20} color={C.gold}/><Text style={styles.listTitle}>درباره برنامه</Text></Pressable>
    </ScrollView>
  );

  const tabs = [
    { name: "خانه", icon: "home-outline" },
    { name: "انبار", icon: "basket-outline" },
    { name: "پیشنهادها", icon: "restaurant-outline" },
    { name: "لیست خرید", icon: "cart-outline" },
    { name: "برنامه", icon: "calendar-outline" }
  ] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={styles.content}>
        {selected ? (
          <ScrollView contentContainerStyle={styles.page}>
            <Pressable onPress={() => setSelected(null)} style={styles.back}><Ionicons name="arrow-forward" size={21} color={C.text}/><Text style={styles.backText}>بازگشت</Text></Pressable>
            <View style={styles.detailHero}><FoodArt recipe={selected} large/></View>
            <Text style={styles.detailTitle}>{selected.title}</Text><Text style={styles.muted}>{selected.subtitle}</Text>
            <View style={styles.metaPanel}><Text style={styles.metaText}>⏱ {selected.timeMin} دقیقه</Text><Text style={styles.metaText}>🔥 {selected.calories} کالری</Text><Text style={styles.metaText}>⭐ {selected.rating}</Text></View>
            <SectionTitle title="مواد لازم"/>
            {selected.ingredients.map(x => <View key={x.name} style={styles.ingredientLine}><Text style={styles.listTitle}>{x.name}</Text><Text style={styles.muted}>{scaledRecipeQuantity(x.qty, preferences.household_size, 2)}</Text></View>)}
            <SectionTitle title="مراحل پخت"/>
            {selected.steps.map((x, i) => <View key={x} style={styles.step}><Text style={styles.stepNum}>{i + 1}</Text><Text style={styles.stepText}>{x}</Text></View>)}
            <Pressable style={styles.greenButton} onPress={() => addRecipeToShopping(selected)}><Ionicons name="cart-outline" color={C.white} size={19}/><Text style={styles.greenButtonText}>افزودن مواد به لیست خرید</Text></Pressable>
          </ScrollView>
        ) : tab === "خانه" ? <Home/> : tab === "انبار" ? <Pantry/> : tab === "پیشنهادها" ? <Suggestions/> : tab === "لیست خرید" ? <Shopping/> : tab === "برنامه" ? <Plan/> : <Settings/>}
      </View>
      <View style={styles.tabBar}>{tabs.map(t => <Pressable key={t.name} onPress={() => { setSelected(null); setTab(t.name); }} style={styles.tabItem}><Ionicons name={t.icon as keyof typeof Ionicons.glyphMap} size={21} color={tab === t.name ? C.gold : C.muted}/><Text style={[styles.tabLabel, tab === t.name && styles.tabLabelActive]}>{t.name}</Text></Pressable>)}</View>
      <Modal visible={!!planPickerDate} transparent animationType="slide" onRequestClose={() => setPlanPickerDate(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, { maxHeight: "82%" }]}>
            <Text style={styles.modalTitle}>انتخاب غذا برای برنامه</Text>
            <ScrollView>
              {recipes.map(recipe => (
                <Pressable key={recipe.id} style={styles.recipeCard} onPress={() => addMealToSelectedDay(recipe)}>
                  <View style={styles.foodThumb}><FoodArt recipe={recipe}/></View>
                  <View style={styles.recipeInfo}><Text style={styles.recipeTitle}>{recipe.title}</Text><Text style={styles.muted}>{recipe.timeMin} دقیقه</Text></View>
                  <Ionicons name="add-circle" color={C.green2} size={22}/>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.cancelButton} onPress={() => setPlanPickerDate(null)}><Text style={styles.cancelText}>بستن</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalShade}>
          <View style={styles.modalCard}><Text style={styles.modalTitle}>{editingPantry ? "ویرایش ماده غذایی" : "افزودن به انبار"}</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="نام ماده غذایی" placeholderTextColor={C.muted} style={styles.input}/>
            <TextInput value={newQty} onChangeText={setNewQty} keyboardType="decimal-pad" placeholder="مقدار موجود" placeholderTextColor={C.muted} style={styles.input}/>
            <TextInput value={newExpiry} onChangeText={setNewExpiry} placeholder="تاریخ انقضا (اختیاری: ۱۴۰۵/۰۸/۲۰)" placeholderTextColor={C.muted} style={styles.input}/>
            <View style={styles.modalActions}><Pressable style={styles.cancelButton} onPress={() => setModal(false)}><Text style={styles.cancelText}>انصراف</Text></Pressable><Pressable style={styles.greenButtonSmall} onPress={async () => {
              const normalizedQty = newQty.replace(/٫/g, ".").replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
              const quantity = Number(normalizedQty);
              if (!newName.trim()) { Alert.alert("نام ماده را وارد کن"); return; }
              if (!Number.isFinite(quantity) || quantity <= 0) { Alert.alert("مقدار نامعتبر", "مقدار باید عددی بزرگ‌تر از صفر باشد."); return; }
              const expiryValue = newExpiry.trim().replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/-/g, "/");
              if (expiryValue && !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(expiryValue)) { Alert.alert("فرمت تاریخ", "تاریخ را به شکل 1405/08/20 وارد کن."); return; }
              if (expiryValue && getExpiryStatus(expiryValue) === "unknown") { Alert.alert("تاریخ نامعتبر", "روز و ماه واردشده در تقویم شمسی معتبر نیست."); return; }
              if (editingPantry) await updatePantryItem(editingPantry, newName, quantity, expiryValue || null);
              else await addPantry(newName, quantity, expiryValue || null);
              setModal(false);
              setEditingPantry(null);
            }}><Text style={styles.greenButtonText}>ذخیره</Text></Pressable></View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return <SQLiteProvider databaseName="chi-bepazam.db" onInit={initializeDatabase}><AppContent/></SQLiteProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },
  page: { padding: 18, paddingBottom: 28, gap: 14 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  brand: { color: C.gold, fontSize: 25, fontWeight: "900", textAlign: "right" },
  muted: { color: C.muted, fontSize: 12, textAlign: "right", lineHeight: 20 },
  logo: { width: 43, height: 43, borderRadius: 15, borderWidth: 1, borderColor: C.goldSoft, alignItems: "center", justifyContent: "center", backgroundColor: C.panel },
  headerAction: { width: 39, height: 39, borderRadius: 13, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", backgroundColor: C.panel },
  hero: { backgroundColor: "#201B10", borderColor: "#72571D", borderWidth: 1, borderRadius: 22, padding: 18, gap: 10 },
  heroTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: C.gold, fontSize: 12, fontWeight: "700" },
  heroIcon: { fontSize: 35 },
  heroTitle: { color: C.text, fontSize: 24, fontWeight: "900", textAlign: "right" },
  heroDesc: { color: "#D3C9B4", fontSize: 13, textAlign: "right" },
  goldButton: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  goldButtonText: { color: C.bg, fontWeight: "900", fontSize: 14 },
  quickGrid: { flexDirection: "row-reverse", gap: 8 },
  quickCard: { flex: 1, backgroundColor: C.panel, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, alignItems: "center", gap: 5 },
  quickTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  quickSub: { color: C.muted, fontSize: 10 },
  sectionRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: "900", textAlign: "right" },
  actionText: { color: C.gold, fontSize: 12 },
  recipeCard: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: C.panel, borderRadius: 17, padding: 10, borderWidth: 1, borderColor: C.line, gap: 12 },
  recipeCompact: { flex: 1 },
  foodThumb: { width: 82, height: 78, borderRadius: 13, backgroundColor: "#29251B", alignItems: "center", justifyContent: "center" },
  foodEmoji: { fontSize: 38 },
  rating: { position: "absolute", bottom: 4, left: 5, flexDirection: "row", alignItems: "center", gap: 2 },
  ratingText: { color: C.text, fontSize: 10 },
  recipeInfo: { flex: 1, gap: 5, alignItems: "flex-end" },
  recipeTitle: { color: C.text, fontSize: 15, fontWeight: "800", textAlign: "right" },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  metaText: { color: C.muted, fontSize: 11 },
  tip: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: C.panel, padding: 13, borderRadius: 13 },
  tipText: { color: C.muted, fontSize: 11, flex: 1, textAlign: "right" },
  search: { backgroundColor: C.panel, color: C.text, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 15, paddingVertical: 12, textAlign: "right" },
  filterRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { color: C.muted, fontSize: 11 },
  chipTextActive: { color: C.white, fontWeight: "800" },
  listRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 13 },
  expiryNotice: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#2A2415", borderColor: C.goldSoft, borderWidth: 1, borderRadius: 12, padding: 12 },
  expiryDanger: { backgroundColor: "#2B1916", borderColor: C.red },
  expiryNoticeText: { color: C.text, fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  ingredientIcon: { width: 38, height: 38, backgroundColor: C.panel2, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  listMain: { flex: 1, alignItems: "flex-end", gap: 3 },
  listTitle: { color: C.text, fontWeight: "700", fontSize: 13, textAlign: "right" },
  empty: { alignItems: "center", backgroundColor: C.panel, borderRadius: 18, padding: 24, gap: 10, borderWidth: 1, borderColor: C.line },
  emptyEmoji: { fontSize: 38 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  greenButton: { backgroundColor: C.green, borderRadius: 14, minHeight: 48, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, marginTop: 5 },
  greenButtonText: { color: C.white, fontSize: 13, fontWeight: "900" },
  summary: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, backgroundColor: "#102719", borderRadius: 15 },
  summaryNumber: { color: C.gold, fontSize: 25, fontWeight: "900" },
  summaryText: { color: C.text, fontSize: 12 },
  checkedText: { color: C.muted, textDecorationLine: "line-through" },
  outlineButton: { borderWidth: 1, borderColor: C.goldSoft, padding: 13, borderRadius: 14, alignItems: "center" },
  outlineButtonText: { color: C.gold, fontWeight: "700" },
  dayCard: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: C.panel, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: C.line, gap: 12 },
  dayBadge: { width: 54, height: 55, backgroundColor: "#292318", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dayText: { color: C.gold, fontSize: 10, fontWeight: "700" },
  dayNumber: { color: C.text, fontSize: 17, fontWeight: "900" },
  profile: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 15, backgroundColor: C.panel, borderRadius: 16 },
  settingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 13, padding: 15, backgroundColor: C.panel, borderRadius: 13 },
  back: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  backText: { color: C.text, fontWeight: "700" },
  detailHero: { height: 190, borderRadius: 22, backgroundColor: "#292318", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  foodArtThumb: { width: "100%", height: "100%", borderRadius: 13 },
  foodArtLarge: { width: "100%", height: "100%", borderRadius: 22 },
  detailEmoji: { fontSize: 100 },
  detailTitle: { color: C.text, fontSize: 23, fontWeight: "900", textAlign: "right" },
  metaPanel: { flexDirection: "row-reverse", justifyContent: "space-around", backgroundColor: C.panel, padding: 15, borderRadius: 14 },
  ingredientLine: { flexDirection: "row-reverse", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  step: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, backgroundColor: C.panel, borderRadius: 13, padding: 12 },
  stepNum: { color: C.bg, backgroundColor: C.gold, width: 25, height: 25, borderRadius: 13, textAlign: "center", textAlignVertical: "center", fontWeight: "900", overflow: "hidden" },
  stepText: { flex: 1, color: C.text, textAlign: "right", lineHeight: 22, fontSize: 12 },
  tabBar: { flexDirection: "row-reverse", backgroundColor: "#101311", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 9, paddingBottom: Platform.OS === "android" ? 8 : 5 },
  tabItem: { flex: 1, alignItems: "center", gap: 4 },
  tabLabel: { color: C.muted, fontSize: 9 },
  tabLabelActive: { color: C.gold, fontWeight: "900" },
  modalShade: { flex: 1, backgroundColor: "#000000BB", justifyContent: "center", padding: 22 },
  modalCard: { backgroundColor: C.panel, borderRadius: 20, padding: 18, gap: 13, borderWidth: 1, borderColor: C.goldSoft },
  modalTitle: { color: C.gold, fontSize: 18, fontWeight: "900", textAlign: "right" },
  input: { backgroundColor: C.bg, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 13, textAlign: "right" },
  modalActions: { flexDirection: "row-reverse", gap: 10 },
  cancelButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: C.line },
  cancelText: { color: C.muted },
  greenButtonSmall: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.green, borderRadius: 12, padding: 13 }
});