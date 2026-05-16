import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// أنواع بيانات الثيم
interface TenantBrandingRow {
  id: string;
  tenant_id: string;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  logo_url: string | null;
  theme_tokens: Record<string, string> | null;
}

interface ThemeContextValue {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl: string | null;
  themeTokens: Record<string, string>;
  isLoading: boolean;
}

// القيم الافتراضية للثيم
const DEFAULT_PRIMARY_COLOR = "#0f1f3a";
const DEFAULT_ACCENT_COLOR = "#28a745";
const DEFAULT_FONT_FAMILY = '"Cairo", sans-serif';

const defaultThemeValue: ThemeContextValue = {
  primaryColor: DEFAULT_PRIMARY_COLOR,
  accentColor: DEFAULT_ACCENT_COLOR,
  fontFamily: DEFAULT_FONT_FAMILY,
  logoUrl: null,
  themeTokens: {},
  isLoading: true,
};

const ThemeContext = createContext<ThemeContextValue>(defaultThemeValue);

/**
 * تحويل لون HEX إلى قيم RGB مفصولة بمسافات
 * مثال: "#0f1f3a" → "15 31 58"
 */
function hexToRgb(hex: string): string {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return "";
  }

  return `${r} ${g} ${b}`;
}

/**
 * حقن متغيرات CSS في عنصر الجذر
 */
function injectCssVariables(branding: ThemeContextValue) {
  const root = document.documentElement;

  // حقن اللون الأساسي
  const primaryRgb = hexToRgb(branding.primaryColor);
  if (primaryRgb) {
    root.style.setProperty("--color-primary", primaryRgb);
  }

  // حقن لون التمييز
  const accentRgb = hexToRgb(branding.accentColor);
  if (accentRgb) {
    root.style.setProperty("--color-accent", accentRgb);
  }

  // حقن الخط
  if (branding.fontFamily) {
    root.style.setProperty("--font-family-primary", branding.fontFamily);
  }

  // حقن أي رموز ثيم مخصصة
  if (branding.themeTokens) {
    Object.entries(branding.themeTokens).forEach(([key, value]) => {
      // التأكد من أن المفتاح يبدأ بـ --
      const cssVar = key.startsWith("--") ? key : `--${key}`;
      root.style.setProperty(cssVar, value);
    });
  }
}

/**
 * مزود الثيم - يجلب بيانات العلامة التجارية من جدول tenant_branding
 * ويحقن متغيرات CSS ديناميكياً
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeContextValue>(defaultThemeValue);

  useEffect(() => {
    let cancelled = false;

    async function fetchBranding() {
      try {
        // جلب بيانات العلامة التجارية للمستأجر الافتراضي (azraqmart)
        const { data, error } = await (supabase as any)
          .from("tenant_branding")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.warn("[ThemeContext] فشل جلب بيانات الثيم:", error.message);
          setTheme((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        if (!data) {
          // لا توجد بيانات - استخدام القيم الافتراضية
          setTheme((prev) => ({ ...prev, isLoading: false }));
          injectCssVariables(defaultThemeValue);
          return;
        }

        const row = data as TenantBrandingRow;
        const newTheme: ThemeContextValue = {
          primaryColor: row.primary_color || DEFAULT_PRIMARY_COLOR,
          accentColor: row.accent_color || DEFAULT_ACCENT_COLOR,
          fontFamily: row.font_family || DEFAULT_FONT_FAMILY,
          logoUrl: row.logo_url || null,
          themeTokens:
            (row.theme_tokens as Record<string, string>) || {},
          isLoading: false,
        };

        setTheme(newTheme);
        injectCssVariables(newTheme);
      } catch (err) {
        console.warn("[ThemeContext] خطأ غير متوقع:", err);
        if (!cancelled) {
          setTheme((prev) => ({ ...prev, isLoading: false }));
        }
      }
    }

    fetchBranding();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

/**
 * هوك للوصول إلى بيانات الثيم الحالي
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
