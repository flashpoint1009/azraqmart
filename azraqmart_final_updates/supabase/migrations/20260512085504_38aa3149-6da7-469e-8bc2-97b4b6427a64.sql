
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS governorate text,
  ADD COLUMN IF NOT EXISTS district text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_districts text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS assigned_governorates text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_customers_district ON public.customers(governorate, district);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_districts ON public.profiles USING gin(assigned_districts);
