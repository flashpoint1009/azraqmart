import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.zonemart.app",
  appName: "Zone Mart",
  webDir: "dist",

  // 👇 حط الـ Production URL بتاعك هنا بعد الـ deploy
  // مثال: https://azraqmart.your-domain.com
  server: {
    url: "https://azraqmart.your-domain.workers.dev",
    cleartext: false,
    androidScheme: "https",
  },

  android: {
    allowMixedContent: false,
    backgroundColor: "#0f1f3a",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0f1f3a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f1f3a",
    },
  },
};

export default config;
