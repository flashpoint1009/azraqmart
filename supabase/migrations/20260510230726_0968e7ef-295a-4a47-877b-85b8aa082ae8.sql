
-- Categories table (with optional parent for subcategories)
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'accountant'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'accountant'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role));

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_url_2 text;

-- Storage policies for app-assets bucket (public bucket, only authenticated can write)
DO $$ BEGIN
  CREATE POLICY "Authenticated upload to app-assets" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'app-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated update app-assets" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'app-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated delete app-assets" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'app-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
