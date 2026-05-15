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
    backgroundColor: "#1a3d2e",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1a3d2e",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1a3d2e",
    },
  },
};

export default config;
