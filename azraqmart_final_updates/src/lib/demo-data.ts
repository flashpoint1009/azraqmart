import type { Product } from "@/components/ProductCard";

const img = (seed: string) => `https://images.unsplash.com/${seed}?auto=format&fit=crop&w=600&q=70`;

export const categories = [
  { id: "all", name: "الكل", icon: "🛒", count: 1240 },
  { id: "groceries", name: "بقالة", icon: "🥫", count: 412 },
  { id: "beverages", name: "مشروبات", icon: "🧃", count: 186 },
  { id: "dairy", name: "ألبان وأجبان", icon: "🧀", count: 94 },
  { id: "snacks", name: "سناكس وحلوى", icon: "🍫", count: 220 },
  { id: "cleaning", name: "منظفات", icon: "🧴", count: 158 },
  { id: "personal", name: "عناية شخصية", icon: "🧼", count: 102 },
  { id: "baby", name: "مستلزمات الأطفال", icon: "🍼", count: 68 },
];

export const products: Product[] = [
  { id: "1", brand: "كوكاكولا", name: "كوكاكولا 1 لتر — كرتونة 12 زجاجة", image: img("photo-1554866585-cd94860890b7"), unitPrice: 22, cartonPrice: 240, unitsPerCarton: 12, moq: 1, stock: "in", badge: "hot" },
  { id: "2", brand: "نستله",   name: "حليب نستله مبستر طويل الصلاحية 1 لتر",   image: img("photo-1563636619-e9143da7973b"), unitPrice: 38, cartonPrice: 420, unitsPerCarton: 12, moq: 1, stock: "in", badge: "deal" },
  { id: "3", brand: "إنديومي", name: "نودلز إنديومي بطعم الدجاج 70 جم",          image: img("photo-1612927601601-6638404737ce"), unitPrice: 6,  cartonPrice: 165, unitsPerCarton: 30, moq: 2, stock: "low" },
  { id: "4", brand: "جالكسي",  name: "شوكولاتة جالكسي 40 جم",                       image: img("photo-1623660053975-cf75a8be0908"), unitPrice: 14, cartonPrice: 580, unitsPerCarton: 48, moq: 1, stock: "in", badge: "new" },
  { id: "5", brand: "بيرسيل",  name: "بيرسيل مسحوق غسيل 6 كجم",                    image: img("photo-1583947215259-38e31be8751f"), unitPrice: 280, cartonPrice: 1620, unitsPerCarton: 6, moq: 1, stock: "in" },
  { id: "6", brand: "تايد",     name: "سائل غسيل تايد سحري 2.5 لتر",                image: img("photo-1610557892470-55d9e80c0bce"), unitPrice: 195, cartonPrice: 1080, unitsPerCarton: 6, moq: 1, stock: "in", badge: "deal" },
  { id: "7", brand: "نسكافيه",  name: "نسكافيه جولد جرة 200 جم",                    image: img("photo-1559056199-641a0ac8b55e"), unitPrice: 320, cartonPrice: 1820, unitsPerCarton: 6, moq: 1, stock: "in" },
  { id: "8", brand: "بامبرز",   name: "حفاضات بامبرز مقاس 4 — 64 حفاضة",        image: img("photo-1632037503044-bbc11200c83e"), unitPrice: 360, cartonPrice: 2040, unitsPerCarton: 6, moq: 1, stock: "low", badge: "hot" },
  { id: "9", brand: "أبو وليد",  name: "زيت عباد الشمس أبو وليد 1.5 لتر",          image: img("photo-1474979266404-7eaacbcd87c5"), unitPrice: 95, cartonPrice: 540, unitsPerCarton: 6, moq: 1, stock: "in" },
  { id: "10", brand: "العربية", name: "أرز مصري درجة أولى 5 كجم",                  image: img("photo-1586201375761-83865001e31c"), unitPrice: 240, cartonPrice: 1380, unitsPerCarton: 6, moq: 1, stock: "in", badge: "new" },
  { id: "11", brand: "هاينز",   name: "كاتشب هاينز 460 جم",                            image: img("photo-1607330289024-1535c6b4e1c1"), unitPrice: 65, cartonPrice: 720, unitsPerCarton: 12, moq: 1, stock: "in" },
  { id: "12", brand: "لوزين",   name: "عصير لوزين برتقال 1 لتر",                     image: img("photo-1600271886742-f049cd451bba"), unitPrice: 28, cartonPrice: 312, unitsPerCarton: 12, moq: 1, stock: "out" },
];
