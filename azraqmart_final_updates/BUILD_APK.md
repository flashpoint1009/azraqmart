# 📱 بناء APK لأندرويد — مشروع Azraqmart المستقل

دليل خطوة بخطوة لتحويل المشروع لـ APK باستخدام **Capacitor**.

---

## ✅ المتطلبات (مرة واحدة فقط على جهازك)

1. **Node.js 18+** — [تنزيل](https://nodejs.org)
2. **Java JDK 17** — [تنزيل](https://www.oracle.com/java/technologies/downloads/)
3. **Android Studio** — [تنزيل](https://developer.android.com/studio) (لازم لبناء APK نهائي)
4. **Git** — لو هتجيب الكود من GitHub

---

## 🚀 الخطوات الكاملة

### 1️⃣ قم بنشر مشروع الويب الخاص بك
- تأكد من أن مشروع الويب الخاص بك منشور ومتاح عبر الإنترنت. ستحتاج إلى عنوان URL الخاص به في الخطوة 4.

### 2️⃣ حمّل الكود من GitHub
- على جهازك:
```bash
git clone https://github.com/<اسمك>/azraq-market.git
cd azraq-market
npm install
```

### 3️⃣ ثبّت Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/splash-screen @capacitor/status-bar
```

### 4️⃣ حدّث الـ URL في `capacitor.config.ts`
افتح الملف وغيّر:
```typescript
server: {
  url: "https://your-app.com", // 👈 استبدل هذا بعنوان URL الخاص بتطبيقك المنشور
  cleartext: false,
}
```

### 5️⃣ ابني المشروع وأضف منصة Android
```bash
npm run build
npx cap add android
npx cap sync android
```

### 6️⃣ افتح في Android Studio
```bash
npx cap open android
```
Android Studio هيفتح المشروع. استنى لحد ما Gradle يخلص (أول مرة بتاخد 5-15 دقيقة).

### 7️⃣ ابني الـ APK
في Android Studio:
- **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
- بعد ما يخلص، اضغط **locate** عشان تلاقي الملف
- المسار غالباً: `android/app/build/outputs/apk/debug/app-debug.apk`

✅ **APK جاهز للتثبيت!**

---

## 🎨 إعدادات إضافية (اختيارية)

### تغيير اسم التطبيق وأيقونته
- **الاسم**: عدّل `appName` في `capacitor.config.ts`
- **الأيقونة**: ضع صورة 1024x1024 PNG في:
  - استخدم أداة [Icon Kitchen](https://icon.kitchen) لتوليد كل المقاسات
  - ضع الناتج في `android/app/src/main/res/`

### بناء APK موقع للـ Production (Google Play)
```bash
cd android
./gradlew assembleRelease
```
الملف هيبقى في: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

لازم توقّعه قبل ما تنزله على Play Store. اقرأ:
[Sign your app](https://developer.android.com/studio/publish/app-signing)

---

## 🔄 تحديث التطبيق

إذا قمت بتغيير `Capacitor config` أو الكود الأصلي (Native Code)، ستحتاج إلى إعادة بناء ومزامنة المشروع:
```bash
npm run build
npx cap sync android
```
إذا كانت التحديثات فقط في الواجهة الأمامية (Frontend) التي يتم تحميلها من `server.url`، فستظهر التغييرات فوراً دون الحاجة لإعادة بناء الـ APK.

---

## 🐛 مشاكل شائعة

| المشكلة | الحل |
|---------|------|
| شاشة بيضاء | تأكد من `server.url` صحيح ومنشور |
| Mixed content blocked | خلي كل الـ URLs `https` |
| Gradle sync failed | حدث Android Studio + JDK 17 |
| App crashes on launch | تأكد إن `appId` مكتوب صح |

---

## 📞 محتاج مساعدة؟
- [Capacitor Docs](https://capacitorjs.com/docs/android)

