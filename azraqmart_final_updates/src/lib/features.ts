export type SystemFeatureKey =
  | "dashboard"
  | "catalog"
  | "cart"
  | "customer_orders"
  | "account"
  | "orders"
  | "products"
  | "categories"
  | "purchases"
  | "offers"
  | "customers"
  | "debts"
  | "accounting"
  | "warehouse"
  | "messages"
  | "reports"
  | "users"
  | "delivery"
  | "notifications"
  | "push_notifications"
  | "chatbot";

export const SYSTEM_FEATURES: { key: SystemFeatureKey; label: string; group: string }[] = [
  { key: "dashboard", label: "لوحة الإدارة", group: "الإدارة" },
  { key: "users", label: "المستخدمين والصلاحيات", group: "الإدارة" },
  { key: "catalog", label: "كتالوج العميل", group: "البيع" },
  { key: "cart", label: "سلة الشراء", group: "البيع" },
  { key: "customer_orders", label: "طلبات العميل", group: "البيع" },
  { key: "account", label: "حساب وبيانات العميل", group: "البيع" },
  { key: "orders", label: "إدارة الطلبات", group: "البيع" },
  { key: "products", label: "المنتجات", group: "البيع" },
  { key: "categories", label: "الأقسام", group: "البيع" },
  { key: "offers", label: "العروض", group: "البيع" },
  { key: "customers", label: "العملاء", group: "البيع" },
  { key: "messages", label: "الإعلانات والرسائل", group: "البيع" },
  { key: "chatbot", label: "روبوت الدردشة (FAQs)", group: "البيع" },
  { key: "purchases", label: "المشتريات", group: "التشغيل" },
  { key: "warehouse", label: "المخزن", group: "التشغيل" },
  { key: "accounting", label: "المحاسبة", group: "الماليات" },
  { key: "debts", label: "المديونيات", group: "الماليات" },
  { key: "reports", label: "التقارير", group: "الماليات" },
  { key: "delivery", label: "نظام المندوبين", group: "التوصيل" },
  { key: "notifications", label: "مركز الإشعارات", group: "التوصيل" },
  { key: "push_notifications", label: "إشعارات Push", group: "التوصيل" },
];

export const getDefaultFeatures = () => Object.fromEntries(SYSTEM_FEATURES.map((f) => [f.key, true])) as Record<SystemFeatureKey, boolean>;

export const isFeatureEnabled = (features: Record<string, boolean> | null | undefined, key: SystemFeatureKey) => features?.[key] !== false;