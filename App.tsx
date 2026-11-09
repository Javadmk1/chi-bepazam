import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import { initializeDatabase } from "./src/db/database";
import { recipes, type Recipe } from "./src/data/recipes";
import { ingredientSeeds, normalizeIngredient } from "./src/data/ingredients";

type PantryItem = { id: number; ingredient_name: string; quantity: number; unit: string };
type ShoppingItem = { id: number; ingredient_name: string; quantity: number; unit: string; checked: number };

const C = {
  bg: "#090B0A", panel: "#151816", panel2: "#1D211E", gold: "#E6B33D",
  goldSoft: "#A9822D", green: "#168A3B", green2: "#20A64C", text: "#F7F2E8",
  muted: "#A9A69D", line: "#302F28", white: "#FFFFFF", red: "#D66B55"
};

function AppContent() {
  const db = useSQLiteContext();
  const [tab, setTab] = useState("خانه");
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [filter, setFilter] = useState("همه");

  const loadData = async () => {
    const p = await db.getAllAsync<PantryItem>("SELECT id, ingredient_name, quantity, unit FROM pantry WHERE deleted = 0 ORDER BY ingredient_name");
    const s = await db.getAllAsync<ShoppingItem>("SELECT id, ingredient_name, quantity, unit, checked FROM shopping_items ORDER BY checked, ingredient_name");
    setPantry(p);
    setShopping(s);
  };

  useEffect(() => { loadData().catch(() => Alert.alert("خطا", "خواندن اطلاعات محلی انجام نشد.")); }, []);

  const addPantry = async (name: string, qty = 1) => {
    const normalized = normalizeIngredient(name);
    const seed = ingredientSeeds.find(x => x.name === normalized);
    await db.runAsync(
      "INSERT INTO pantry (ingredient_name, quantity, unit, updated_at, deleted) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0) ON CONFLICT(ingredient_name) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP, deleted = 0",
      normalized, Math.max(1, qty), seed?.unit ?? "عدد"
    );
    await loadData();
  };

  const addShopping = async (name: string, qty = 1, unit = "عدد") => {
    await db.runAsync("INSERT INTO shopping_items (ingredient_name, quantity, unit) VALUES (?, ?, ?)", normalizeIngredient(name), qty, unit);
    await loadData();
  };

  const toggleShopping = async (item: ShoppingItem) => {
    await db.runAsync("UPDATE shopping_items SET checked = ? WHERE id = ?", item.checked ? 0 : 1, item.id);
    await loadData();
  };

  const removePantry = async (item: PantryItem) => {
    await db.runAsync("UPDATE pantry SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", item.id);
    await loadData();
  };

  const matchingRecipes = useMemo(() => {
    return recipes.filter(r => {
      const q = query.trim();
      const textMatch = !q || r.title.includes(q) || r.tags.some(t => t.includes(q));
      const filterMatch = filter === "همه" || (filter === "سریع" && r.timeMin <= 30) || (filter === "اقتصادی" && r.tags.includes("اقتصادی"));
      return textMatch && filterMatch;
    });
  }, [query, filter]);

  const addRecipeToShopping = async (recipe: Recipe) => {
    for (const item of recipe.ingredients) {
      const owned = pantry.some(p => p.ingredient_name === normalizeIngredient(item.name));
      if (!owned) await addShopping(item.name, 1, "مقدار لازم");
    }
    setSelected(null);
    setTab("لیست خرید");
    Alert.alert("انجام شد", "مواد موردنیاز به لیست خرید اضافه شدند.");
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
      <View style={styles.logo}><Ionicons name="restaurant" size={22} color={C.gold} /></View>
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
      <View style={styles.foodThumb}><Text style={styles.foodEmoji}>{recipe.image}</Text><View style={styles.rating}><Ionicons name="star" size={11} color={C.gold}/><Text style={styles.ratingText}>{recipe.rating}</Text></View></View>
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
      <TextInput value={query} onChangeText={setQuery} placeholder="جستجو در مواد..." placeholderTextColor={C.muted} style={styles.search}/>
      <View style={styles.filterRow}>{["همه", "سبزیجات", "لبنیات و پروتئین"].map(x => <Pressable key={x} onPress={() => setFilter(x)} style={[styles.chip, filter === x && styles.chipActive]}><Text style={[styles.chipText, filter === x && styles.chipTextActive]}>{x}</Text></Pressable>)}</View>
      {pantry.filter(p => p.ingredient_name.includes(query) && (filter === "همه" || ingredientSeeds.find(i => i.name === p.ingredient_name)?.category === filter)).map(item => (
        <View key={item.id} style={styles.listRow}><View style={styles.ingredientIcon}><Text>🥬</Text></View><View style={styles.listMain}><Text style={styles.listTitle}>{item.ingredient_name}</Text><Text style={styles.muted}>{item.quantity} {item.unit}</Text></View><Pressable onPress={() => removePantry(item)} hitSlop={10}><Ionicons name="trash-outline" size={19} color={C.red}/></Pressable></View>
      ))}
      {pantry.length === 0 ? <View style={styles.empty}><Text style={styles.emptyEmoji}>🧺</Text><Text style={styles.emptyTitle}>انبارت هنوز خالیه</Text><Text style={styles.muted}>چند ماده پرکاربرد اضافه کن تا پیشنهادهای بهتری بگیری.</Text><Pressable style={styles.greenButton} onPress={addQuickItems}><Text style={styles.greenButtonText}>افزودن مواد پرکاربرد</Text></Pressable></View> : null}
      <Pressable style={styles.greenButton} onPress={() => { setNewName(""); setNewQty("1"); setModal(true); }}><Ionicons name="add" size={19} color={C.white}/><Text style={styles.greenButtonText}>افزودن ماده غذایی</Text></Pressable>
    </ScrollView>
  );

  const Suggestions = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="پیشنهاد غذا" subtitle="غذای مناسب با شرایط تو" />
      <TextInput value={query} onChangeText={setQuery} placeholder="نام غذا یا نوع آن را جستجو کن..." placeholderTextColor={C.muted} style={styles.search}/>
      <View style={styles.filterRow}>{["همه", "سریع", "اقتصادی"].map(x => <Pressable key={x} onPress={() => setFilter(x)} style={[styles.chip, filter === x && styles.chipActive]}><Text style={[styles.chipText, filter === x && styles.chipTextActive]}>{x}</Text></Pressable>)}</View>
      {matchingRecipes.map(r => <RecipeCard key={r.id} recipe={r}/>)}
      {matchingRecipes.length === 0 ? <Text style={styles.muted}>غذایی پیدا نشد؛ عبارت دیگری را امتحان کن.</Text> : null}
    </ScrollView>
  );

  const Shopping = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="لیست خرید" subtitle="چیزهایی که باید تهیه کنی" />
      <View style={styles.summary}><Text style={styles.summaryNumber}>{shopping.filter(x => !x.checked).length}</Text><Text style={styles.summaryText}>مورد برای خرید باقی مانده</Text></View>
      {shopping.map(item => <Pressable key={item.id} onPress={() => toggleShopping(item)} style={styles.listRow}><Ionicons name={item.checked ? "checkbox" : "square-outline"} size={22} color={item.checked ? C.green2 : C.muted}/><View style={styles.listMain}><Text style={[styles.listTitle, !!item.checked && styles.checkedText]}>{item.ingredient_name}</Text><Text style={styles.muted}>{item.quantity} {item.unit}</Text></View></Pressable>)}
      {shopping.length === 0 ? <View style={styles.empty}><Text style={styles.emptyEmoji}>🛒</Text><Text style={styles.emptyTitle}>لیست خرید خالی است</Text><Text style={styles.muted}>از جزئیات دستور پخت، مواد لازم را اضافه کن.</Text></View> : null}
      <Pressable style={styles.outlineButton} onPress={() => Alert.alert("راهنما", "برای افزودن مواد، وارد پیشنهاد غذا شو و یک دستور را باز کن.")}><Text style={styles.outlineButtonText}>چطور لیست خرید بسازم؟</Text></Pressable>
    </ScrollView>
  );

  const Plan = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="برنامه هفتگی" subtitle="برای وعده‌هایت از قبل برنامه‌ریزی کن" />
      {["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"].map((day, i) => (
        <View key={day} style={styles.dayCard}><View style={styles.dayBadge}><Text style={styles.dayText}>{day}</Text><Text style={styles.dayNumber}>{i + ۱}</Text></View><View style={styles.listMain}><Text style={styles.listTitle}>{i === 0 ? "پاستا مرغ و قارچ" : "برای این روز غذایی انتخاب نشده"}</Text><Text style={styles.muted}>{i === 0 ? "شام • ۲۵ دقیقه" : "برای افزودن غذا لمس کن"}</Text></View><Pressable onPress={() => setTab("پیشنهادها")}><Ionicons name="add-circle-outline" size={24} color={C.gold}/></Pressable></View>
      ))}
    </ScrollView>
  );

  const Settings = () => (
    <ScrollView contentContainerStyle={styles.page}>
      <Header title="تنظیمات" subtitle="شخصی‌سازی تجربه آشپزی" />
      <View style={styles.profile}><Ionicons name="person-circle-outline" size={54} color={C.gold}/><View><Text style={styles.listTitle}>حساب مهمان</Text><Text style={styles.muted}>اطلاعات فعلاً فقط روی همین دستگاه ذخیره می‌شود.</Text></View></View>
      {["ترجیحات غذایی", "حساسیت‌های غذایی", "تعداد اعضای خانواده", "بودجه هفتگی", "پشتیبان‌گیری و همگام‌سازی", "درباره چی بپزم؟"].map((x, i) => <Pressable key={x} style={styles.settingRow} onPress={() => Alert.alert(x, "این بخش در گام بعدی توسعه تکمیل می‌شود.")}><Ionicons name={["leaf-outline", "alert-circle-outline", "people-outline", "wallet-outline", "sync-outline", "information-circle-outline"][i] as keyof typeof Ionicons.glyphMap} size={20} color={C.gold}/><Text style={styles.listTitle}>{x}</Text><Ionicons name="chevron-back" size={17} color={C.muted}/></Pressable>)}
    </ScrollView>
  );

  const tabs = [
    { name: "خانه", icon: "home-outline" },
    { name: "انبار", icon: "basket-outline" },
    { name: "پیشنهادها", icon: "restaurant-outline" },
    { name: "لیست خرید", icon: "cart-outline" },
    { name: "برنامه", icon: "calendar-outline" },
    { name: "تنظیمات", icon: "settings-outline" }
  ] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={styles.content}>
        {selected ? (
          <ScrollView contentContainerStyle={styles.page}>
            <Pressable onPress={() => setSelected(null)} style={styles.back}><Ionicons name="arrow-forward" size={21} color={C.text}/><Text style={styles.backText}>بازگشت</Text></Pressable>
            <View style={styles.detailHero}><Text style={styles.detailEmoji}>{selected.image}</Text></View>
            <Text style={styles.detailTitle}>{selected.title}</Text><Text style={styles.muted}>{selected.subtitle}</Text>
            <View style={styles.metaPanel}><Text style={styles.metaText}>⏱ {selected.timeMin} دقیقه</Text><Text style={styles.metaText}>🔥 {selected.calories} کالری</Text><Text style={styles.metaText}>⭐ {selected.rating}</Text></View>
            <SectionTitle title="مواد لازم"/>
            {selected.ingredients.map(x => <View key={x.name} style={styles.ingredientLine}><Text style={styles.listTitle}>{x.name}</Text><Text style={styles.muted}>{x.qty}</Text></View>)}
            <SectionTitle title="مراحل پخت"/>
            {selected.steps.map((x, i) => <View key={x} style={styles.step}><Text style={styles.stepNum}>{i + 1}</Text><Text style={styles.stepText}>{x}</Text></View>)}
            <Pressable style={styles.greenButton} onPress={() => addRecipeToShopping(selected)}><Ionicons name="cart-outline" color={C.white} size={19}/><Text style={styles.greenButtonText}>افزودن مواد به لیست خرید</Text></Pressable>
          </ScrollView>
        ) : tab === "خانه" ? <Home/> : tab === "انبار" ? <Pantry/> : tab === "پیشنهادها" ? <Suggestions/> : tab === "لیست خرید" ? <Shopping/> : tab === "برنامه" ? <Plan/> : <Settings/>}
      </View>
      <View style={styles.tabBar}>{tabs.map(t => <Pressable key={t.name} onPress={() => { setSelected(null); setTab(t.name); }} style={styles.tabItem}><Ionicons name={t.icon as keyof typeof Ionicons.glyphMap} size={21} color={tab === t.name ? C.gold : C.muted}/><Text style={[styles.tabLabel, tab === t.name && styles.tabLabelActive]}>{t.name}</Text></Pressable>)}</View>
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalShade}>
          <View style={styles.modalCard}><Text style={styles.modalTitle}>افزودن به انبار</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="نام ماده غذایی" placeholderTextColor={C.muted} style={styles.input}/>
            <TextInput value={newQty} onChangeText={setNewQty} keyboardType="numeric" placeholder="تعداد یا مقدار" placeholderTextColor={C.muted} style={styles.input}/>
            <View style={styles.modalActions}><Pressable style={styles.cancelButton} onPress={() => setModal(false)}><Text style={styles.cancelText}>انصراف</Text></Pressable><Pressable style={styles.greenButtonSmall} onPress={async () => { if (!newName.trim()) { Alert.alert("نام ماده را وارد کن"); return; } await addPantry(newName, Number(newQty) || 1); setModal(false); }}><Text style={styles.greenButtonText}>ذخیره</Text></Pressable></View>
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
  detailHero: { height: 190, borderRadius: 22, backgroundColor: "#292318", alignItems: "center", justifyContent: "center" },
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