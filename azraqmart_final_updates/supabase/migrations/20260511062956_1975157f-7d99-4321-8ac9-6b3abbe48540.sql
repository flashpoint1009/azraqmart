
-- Licenses table for reselling the platform to multiple companies
CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text,
  contact_phone text,
  license_key text NOT NULL UNIQUE,
  max_users integer NOT NULL DEFAULT 5,
  max_customers integer NOT NULL DEFAULT 500,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developer manages licenses"
  ON public.licenses FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Admin reads licenses"
  ON public.licenses FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admin needs to manage user_roles too (existing policy already includes admin via has_role check, but make sure)
-- existing: "Admins manage roles" already covers admin + developer. Good.

-- Admin manage profiles (currently admins can SELECT but cannot UPDATE other profiles)
CREATE POLICY "Admin update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role));
