CREATE TABLE public.client_settings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- أو جدول العملاء الخاص بك
    primary_color text DEFAULT '#007bff', -- اللون الأساسي
    secondary_color text DEFAULT '#6c757d', -- اللون الثانوي
    accent_color text DEFAULT '#28a745', -- لون التمييز
    logo_url text, -- رابط الشعار
    favicon_url text, -- رابط الأيقونة المفضلة
    font_family_primary text DEFAULT '"Cairo", sans-serif', -- الخط الأساسي
    font_family_secondary text DEFAULT '"Open Sans", sans-serif', -- الخط الثانوي
    custom_css text, -- CSS مخصص إضافي (استخدم بحذر)
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.client_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own settings" ON public.client_settings
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Tenants can update their own settings" ON public.client_settings
  FOR UPDATE USING (auth.uid() = client_id);
