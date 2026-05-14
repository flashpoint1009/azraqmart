
-- About section table
CREATE TABLE public.about_section (
  key text PRIMARY KEY DEFAULT 'main',
  is_visible boolean NOT NULL DEFAULT true,
  eyebrow text,
  title text,
  subtitle text,
  description text,
  image_url text,
  stats jsonb NOT NULL DEFAULT '[]'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta_label text,
  cta_link text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.about_section ENABLE ROW LEVEL SECURITY;

-- Add can_about permission
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_about boolean NOT NULL DEFAULT false;

-- RLS
CREATE POLICY "Anyone can read about section"
  ON public.about_section FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "About managers manage about section"
  ON public.about_section FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_about = true)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_about = true)
  );

-- Seed default row
INSERT INTO public.about_section (key, eyebrow, title, subtitle, description, stats, features, cta_label, cta_link)
VALUES (
  'main',
  'عن أزرق ماركت',
  'شريكك الأمثل في تجارة الجملة',
  'منصة موردين معتمدين لخدمة تجار الجملة في مصر',
  'نوفّر لتجار الجملة كتالوج منظّم، أسعار واضحة، وتسليم في مواعيده. أكثر من 8 آلاف تاجر يثقون بنا يومياً للحصول على أفضل المنتجات بأفضل الأسعار.',
  '[{"label":"منتج متنوع","value":"12K+"},{"label":"مورد معتمد","value":"450+"},{"label":"تاجر شريك","value":"8K+"},{"label":"محافظة نخدمها","value":"15+"}]'::jsonb,
  '[{"icon":"Truck","title":"توصيل سريع","desc":"تغطية لمحافظات الدلتا والقاهرة الكبرى"},{"icon":"ShieldCheck","title":"موردين معتمدين","desc":"تعامل مع موردين ووكلاء رسميين فقط"},{"icon":"Receipt","title":"فاتورة معتمدة","desc":"متوافقة مع مصلحة الضرائب المصرية"}]'::jsonb,
  'تواصل معنا',
  '/contact'
);
