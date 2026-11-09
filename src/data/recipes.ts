export type Recipe = {
  id: string;
  title: string;
  subtitle: string;
  timeMin: number;
  calories: number;
  rating: number;
  image: string;
  ingredients: { name: string; qty: string }[];
  steps: string[];
  tags: string[];
};

export const recipes: Recipe[] = [
  {
    id: "chicken-pasta",
    title: "پاستا مرغ و قارچ",
    subtitle: "غذای سریع و خوش‌طعم",
    timeMin: 25,
    calories: 520,
    rating: 4.8,
    image: "🍝",
    ingredients: [
      { name: "پاستا", qty: "۲۰۰ گرم" },
      { name: "مرغ", qty: "۱۵۰ گرم" },
      { name: "قارچ", qty: "۱۰۰ گرم" },
      { name: "شیر", qty: "۱ پیمانه" }
    ],
    steps: ["پاستا را طبق دستور روی بسته بپزید.", "مرغ خردشده را با کمی روغن تفت دهید.", "قارچ را اضافه کنید و سپس شیر و ادویه را بیفزایید.", "پاستا را با سس مخلوط و سرو کنید."],
    tags: ["سریع", "شام", "خانوادگی"]
  },
  {
    id: "ghormeh-sabzi",
    title: "قورمه‌سبزی",
    subtitle: "طعم اصیل غذای ایرانی",
    timeMin: 100,
    calories: 610,
    rating: 4.9,
    image: "🍲",
    ingredients: [
      { name: "سبزی قورمه", qty: "۳۰۰ گرم" },
      { name: "لوبیا قرمز", qty: "۱ پیمانه" },
      { name: "گوشت خورشتی", qty: "۲۵۰ گرم" },
      { name: "لیمو عمانی", qty: "۲ عدد" }
    ],
    steps: ["لوبیا را از قبل خیس کنید.", "سبزی را خرد و با حرارت ملایم تفت دهید.", "گوشت و لوبیا را اضافه کنید و بپزید.", "لیموعمانی و چاشنی را اضافه کنید تا خورش جا بیفتد."],
    tags: ["ایرانی", "ناهار"]
  },
  {
    id: "omelette",
    title: "املت گوجه",
    subtitle: "ساده، اقتصادی و فوری",
    timeMin: 12,
    calories: 280,
    rating: 4.7,
    image: "🍳",
    ingredients: [
      { name: "تخم‌مرغ", qty: "۲ عدد" },
      { name: "گوجه‌فرنگی", qty: "۲ عدد" },
      { name: "روغن", qty: "۱ قاشق" }
    ],
    steps: ["گوجه‌ها را خرد کنید و در تابه بپزید.", "کمی نمک و ادویه اضافه کنید.", "تخم‌مرغ‌ها را اضافه کنید و تا زمان دلخواه بپزید."],
    tags: ["سریع", "اقتصادی", "صبحانه"]
  }
];