-- 1. add can_banners permission column
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_banners boolean NOT NULL DEFAULT false;

-- 2. home_banners table
CREATE TABLE IF NOT EXISTS public.home_banners (
  key text PRIMARY KEY,
  title text,
  subtitle text,
  eyebrow text,
  cta_label text,
  cta_link text,
  image_url text,
  is_visible boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read home banners" ON public.home_banners;
CREATE POLICY "Anyone can read home banners"
  ON public.home_banners FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Banners managers manage home banners" ON public.home_banners;
CREATE POLICY "Banners managers manage home banners"
  ON public.home_banners FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_banners = true)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_banners = true)
  );

-- 3. seed defaults
INSERT INTO public.home_banners (key, title, subtitle, eyebrow, cta_label, cta_link, is_visible) VALUES
  ('hero',         'أهلاً بيك',                  'ابدأ طلب جديد دلوقتي', 'مرحبا',         'ابدأ طلب جديد',     '/products', true),
  ('offers',       'خصومات تصل لـ 25%',          'مختارات لينا بأسعار جملة لا تُقاوم — لفترة محدودة', 'عروض الأسبوع',  'شوف العروض',        '/products', true),
  ('bestsellers',  'منتجاتنا المميزة',           'الأكثر طلبًا عند تجار الجملة في سوقنا', 'الأعلى مبيعًا', 'اكتشف الأكثر مبيعًا','/products', true)
ON CONFLICT (key) DO NOTHING;

-- 4. broaden login_banner_settings policy to include can_banners
DROP POLICY IF EXISTS "Admin manages login banner" ON public.login_banner_settings;
CREATE POLICY "Banners managers manage login banner"
  ON public.login_banner_settings FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_banners = true)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_banners = true)
  );