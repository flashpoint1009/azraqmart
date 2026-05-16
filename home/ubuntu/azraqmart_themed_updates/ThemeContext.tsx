import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface ThemeSettings {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url?: string;
  favicon_url?: string;
  font_family_primary: string;
  font_family_secondary: string;
  custom_css?: string;
}

const defaultTheme: ThemeSettings = {
  primary_color: '0 123 255', // Default Bootstrap Blue
  secondary_color: '108 117 125', // Default Bootstrap Gray
  accent_color: '40 167 69', // Default Bootstrap Green
  font_family_primary: '"Cairo", sans-serif',
  font_family_secondary: '"Open Sans", sans-serif',
};

const ThemeContext = createContext<ThemeSettings>(defaultTheme);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  const { data: clientTheme } = useQuery<ThemeSettings | null>({
    queryKey: ['client_theme', user?.id],
    enabled: !!user, // Only fetch if user is logged in
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_settings')
        .select('*')
        .eq('client_id', user!.id)
        .maybeSingle();
      if (error) {
        console.error('Error fetching client theme:', error);
        return null;
      }
      return data;
    },
  });

  const currentTheme = clientTheme || defaultTheme;

  useEffect(() => {
    const root = document.documentElement;
    if (currentTheme) {
      root.style.setProperty('--color-primary', currentTheme.primary_color);
      root.style.setProperty('--color-secondary', currentTheme.secondary_color);
      root.style.setProperty('--color-accent', currentTheme.accent_color);
      root.style.setProperty('--font-family-primary', currentTheme.font_family_primary);
      root.style.setProperty('--font-family-secondary', currentTheme.font_family_secondary);

      // Handle logo and favicon
      if (currentTheme.logo_url) {
        const logoElement = document.getElementById('app-logo');
        if (logoElement) logoElement.setAttribute('src', currentTheme.logo_url);
      }
      if (currentTheme.favicon_url) {
        let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (!favicon) {
          favicon = document.createElement('link');
          favicon.rel = 'icon';
          document.head.appendChild(favicon);
        }
        favicon.href = currentTheme.favicon_url;
      }

      // Handle custom CSS
      if (currentTheme.custom_css) {
        let customStyle = document.getElementById('custom-client-css');
        if (!customStyle) {
          customStyle = document.createElement('style');
          customStyle.id = 'custom-client-css';
          document.head.appendChild(customStyle);
        }
        customStyle.textContent = currentTheme.custom_css;
      }
    } else {
      // Reset to default if no theme settings (or user logs out)
      Object.keys(defaultTheme).forEach(key => {
        if (key.includes('_color') || key.includes('_font')) {
          root.style.removeProperty(`--color-${key.replace('_color', '')}`);
          root.style.removeProperty(`--${key.replace('_family', '')}`);
        }
      });
      // Remove custom logo, favicon, and CSS
      const logoElement = document.getElementById('app-logo');
      if (logoElement) logoElement.removeAttribute('src');
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) favicon.remove();
      const customStyle = document.getElementById('custom-client-css');
      if (customStyle) customStyle.remove();
    }
  }, [currentTheme]);

  return (
    <ThemeContext.Provider value={currentTheme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
