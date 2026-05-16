CREATE TABLE public.login_banner_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_visible boolean NOT NULL DEFAULT true,
  badge_label text NOT NULL DEFAULT 'منصة موردين معتمدين',
  badge_title text NOT NULL DEFAULT 'أزرق ماركت',
  hero_title text NOT NULL DEFAULT 'شريكك في تجارة',
  hero_highlight text NOT NULL DEFAULT 'الجملة',
  hero_subtitle text NOT NULL DEFAULT 'نوفّر لتجار الجملة كتالوج منظّم، أسعار واضحة، وتسليم في مواعيده.',
  features jsonb NOT NULL DEFAULT '[
    {"icon":"Truck","title":"توصيل في مواعيده","desc":"تغطية لمحافظات الدلتا والقاهرة الكبرى"},
    {"icon":"Receipt","title":"فاتورة ضريبية معتمدة","desc":"متوافقة مع مصلحة الضرائب المصرية"},
    {"icon":"ShieldCheck","title":"موردين معتمدين","desc":"تعامل مع موردين ووكلاء رسميين فقط"}
  ]'::jsonb,
  stats jsonb NOT NULL DEFAULT '[
    {"value":"12K+","label":"منتج"},
    {"value":"450+","label":"مورد معتمد"},
    {"value":"8K+","label":"تاجر شريك"}
  ]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_banner_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read login banner"
  ON public.login_banner_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admin manages login banner"
  ON public.login_banner_settings FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role));

CREATE TRIGGER login_banner_updated_at
  BEFORE UPDATE ON public.login_banner_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.login_banner_settings (id) VALUES (gen_random_uuid());