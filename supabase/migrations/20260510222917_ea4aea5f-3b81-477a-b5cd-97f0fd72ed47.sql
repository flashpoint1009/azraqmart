
-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  min_order_total numeric(10,2) DEFAULT 0,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage coupons" ON public.coupons FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role) OR private.has_role(auth.uid(),'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role) OR private.has_role(auth.uid(),'developer'::app_role));
CREATE POLICY "Anyone read active coupons" ON public.coupons FOR SELECT TO authenticated
  USING (is_active = true);
CREATE TRIGGER trg_coupons_updated BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Purchase returns
CREATE TABLE public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  supplier_name text NOT NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accounting manage returns" ON public.purchase_returns FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role) OR private.has_role(auth.uid(),'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role) OR private.has_role(auth.uid(),'developer'::app_role));

CREATE TABLE public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  qty integer NOT NULL,
  unit_cost numeric(10,2) NOT NULL,
  line_total numeric(10,2) NOT NULL
);
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accounting manage return items" ON public.purchase_return_items FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role) OR private.has_role(auth.uid(),'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'accountant'::app_role) OR private.has_role(auth.uid(),'developer'::app_role));

-- Per-user custom permissions
CREATE TABLE public.user_permissions (
  user_id uuid PRIMARY KEY,
  can_dashboard boolean NOT NULL DEFAULT true,
  can_products boolean NOT NULL DEFAULT false,
  can_categories boolean NOT NULL DEFAULT false,
  can_purchases boolean NOT NULL DEFAULT false,
  can_orders boolean NOT NULL DEFAULT false,
  can_customers boolean NOT NULL DEFAULT false,
  can_offers boolean NOT NULL DEFAULT false,
  can_users boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own perms" ON public.user_permissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'developer'::app_role));
CREATE POLICY "Admin manage perms" ON public.user_permissions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'developer'::app_role));
