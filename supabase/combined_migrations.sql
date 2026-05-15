-- ============================================
-- Combined Supabase Migrations (42 files)
-- Generated in chronological order
-- ============================================

-- ============================================
-- Migration: 20260510203435_7258e928-0560-40e8-9c73-e4e0edcb914f.sql
-- ============================================

-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'merchant', 'delivery', 'warehouse');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  shop_name TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + default merchant role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone, shop_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'shop_name'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'merchant');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS policies for profiles
CREATE POLICY "Users view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- RLS policies for user_roles
CREATE POLICY "Users view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ============================================
-- Migration: 20260510203500_6312d451-7694-4f13-aef8-9bfc5e014322.sql
-- ============================================

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- ============================================
-- Migration: 20260510205335_c40e63f7-04c0-4f3e-86ff-c7c1a0e95dde.sql
-- ============================================

-- 1. Extend roles enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse';


-- ============================================
-- Migration: 20260510205419_5c8f5f37-7983-4340-8766-3f5d85023a2a.sql
-- ============================================

-- App settings (singleton)
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name text NOT NULL DEFAULT 'أزرق ماركت',
  app_slogan text DEFAULT 'منصة تجار الجملة',
  logo_url text,
  primary_color text DEFAULT 'oklch(0.55 0.22 260)',
  accent_color text DEFAULT 'oklch(0.75 0.18 70)',
  background_color text DEFAULT 'oklch(0.98 0.005 260)',
  font_family text DEFAULT 'Cairo',
  max_users int DEFAULT 10,
  max_customers int DEFAULT 1000,
  license_key text,
  features jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Developer manages settings" ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'developer')) WITH CHECK (has_role(auth.uid(), 'developer'));
INSERT INTO public.app_settings (app_name) VALUES ('أزرق ماركت');

-- Products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text,
  sku text UNIQUE,
  barcode text,
  category text,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  carton_price numeric(10,2) NOT NULL DEFAULT 0,
  stock_qty int NOT NULL DEFAULT 0,
  low_stock_threshold int DEFAULT 10,
  image_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant/Dev manage products" ON public.products FOR ALL TO authenticated
  USING (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'developer') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'developer') OR has_role(auth.uid(),'admin'));
CREATE POLICY "Warehouse update stock" ON public.products FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'warehouse')) WITH CHECK (has_role(auth.uid(),'warehouse'));

-- Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  shop_name text NOT NULL,
  owner_name text,
  phone text NOT NULL,
  city text,
  address text,
  tier text DEFAULT 'برونزي',
  credit_limit numeric(10,2) DEFAULT 0,
  balance numeric(10,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view all customers" ON public.customers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'));
CREATE POLICY "Customer view self" ON public.customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff manage customers" ON public.customers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'developer'));

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number serial,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  total numeric(10,2) NOT NULL DEFAULT 0,
  payment_status text DEFAULT 'unpaid',
  notes text,
  created_by uuid,
  assigned_warehouse uuid,
  assigned_delivery uuid,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view orders" ON public.orders FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'));
CREATE POLICY "Staff manage orders" ON public.orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'));
CREATE POLICY "Customer view own orders" ON public.orders FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));
CREATE POLICY "Customer create own order" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Order items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  qty int NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  line_total numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View items if can view order" ON public.order_items FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders));
CREATE POLICY "Staff manage items" ON public.order_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'))
  WITH CHECK (true);

-- Purchase invoices
CREATE TABLE public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  supplier_name text NOT NULL,
  total numeric(10,2) NOT NULL DEFAULT 0,
  paid numeric(10,2) NOT NULL DEFAULT 0,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accounting view invoices" ON public.purchase_invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));
CREATE POLICY "Accounting manage invoices" ON public.purchase_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));

CREATE TABLE public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  qty int NOT NULL,
  unit_cost numeric(10,2) NOT NULL,
  line_total numeric(10,2) NOT NULL
);
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accounting access invoice items" ON public.purchase_invoice_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));

-- Cash transactions
CREATE TABLE public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('in','out')),
  amount numeric(10,2) NOT NULL,
  reference_type text,
  reference_id uuid,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accounting access cash" ON public.cash_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'developer'));

-- Updated_at triggers
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for app assets (logo)
INSERT INTO storage.buckets (id, name, public) VALUES ('app-assets','app-assets', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Public read app assets" ON storage.objects FOR SELECT USING (bucket_id = 'app-assets');
CREATE POLICY "Developer upload app assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'app-assets' AND has_role(auth.uid(),'developer'));
CREATE POLICY "Developer update app assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'app-assets' AND has_role(auth.uid(),'developer'));
CREATE POLICY "Developer delete app assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'app-assets' AND has_role(auth.uid(),'developer'));


-- ============================================
-- Migration: 20260510205436_17aa0a50-2c3a-45c9-9392-9c6693ed62fd.sql
-- ============================================

DROP POLICY IF EXISTS "Staff manage items" ON public.order_items;
CREATE POLICY "Staff manage items" ON public.order_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'));

-- ============================================
-- Migration: 20260510210259_b9d67328-fd11-4385-ad18-b74886d88554.sql
-- ============================================

-- Create users with phone-based fake emails and password '0000'
DO $$
DECLARE
  admin_id uuid;
  wh_id uuid;
  dev_id uuid;
BEGIN
  -- Admin
  SELECT id INTO admin_id FROM auth.users WHERE email = '01000000001@phone.azraq.local';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      '01000000001@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المدير','phone','01000000001','shop_name','الإدارة'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', '01000000001@phone.azraq.local'),
      'email', admin_id::text, now(), now(), now());
  END IF;
  DELETE FROM public.user_roles WHERE user_id = admin_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin');

  -- Warehouse
  SELECT id INTO wh_id FROM auth.users WHERE email = '01000000002@phone.azraq.local';
  IF wh_id IS NULL THEN
    wh_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', wh_id, 'authenticated', 'authenticated',
      '01000000002@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','أمين المخزن','phone','01000000002','shop_name','المخزن'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), wh_id,
      jsonb_build_object('sub', wh_id::text, 'email', '01000000002@phone.azraq.local'),
      'email', wh_id::text, now(), now(), now());
  END IF;
  DELETE FROM public.user_roles WHERE user_id = wh_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (wh_id, 'warehouse');

  -- Developer
  SELECT id INTO dev_id FROM auth.users WHERE email = '01153338337@phone.azraq.local';
  IF dev_id IS NULL THEN
    dev_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', dev_id, 'authenticated', 'authenticated',
      '01153338337@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المطور','phone','01153338337','shop_name','التطوير'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), dev_id,
      jsonb_build_object('sub', dev_id::text, 'email', '01153338337@phone.azraq.local'),
      'email', dev_id::text, now(), now(), now());
  END IF;
  DELETE FROM public.user_roles WHERE user_id = dev_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (dev_id, 'developer');
END $$;

-- ============================================
-- Migration: 20260510210810_967ea524-345a-4377-ad7a-f5c23860098e.sql
-- ============================================

UPDATE auth.users
SET encrypted_password = crypt('383100', gen_salt('bf')),
    updated_at = now()
WHERE email IN (
  '01000000001@phone.azraq.local',
  '01000000002@phone.azraq.local',
  '01153338337@phone.azraq.local'
);


-- ============================================
-- Migration: 20260510211609_c45056de-c8f8-4816-ac69-9668b85a715f.sql
-- ============================================

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- ============================================
-- Migration: 20260510211733_215c11a5-9607-4fe8-ac1a-50706bab7fb2.sql
-- ============================================

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "Developer manages settings" ON public.app_settings;
CREATE POLICY "Developer manages settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'developer'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'developer'::public.app_role));

DROP POLICY IF EXISTS "Accounting access cash" ON public.cash_transactions;
CREATE POLICY "Accounting access cash"
ON public.cash_transactions
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Staff manage customers" ON public.customers;
CREATE POLICY "Staff manage customers"
ON public.customers
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Staff view all customers" ON public.customers;
CREATE POLICY "Staff view all customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'warehouse'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Staff manage items" ON public.order_items;
CREATE POLICY "Staff manage items"
ON public.order_items
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'warehouse'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'warehouse'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Staff manage orders" ON public.orders;
CREATE POLICY "Staff manage orders"
ON public.orders
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'warehouse'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'warehouse'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Staff view orders" ON public.orders;
CREATE POLICY "Staff view orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'warehouse'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Accountant/Dev manage products" ON public.products;
CREATE POLICY "Accountant/Dev manage products"
ON public.products
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Warehouse update stock" ON public.products;
CREATE POLICY "Warehouse update stock"
ON public.products
FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'warehouse'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'warehouse'::public.app_role));

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Accounting access invoice items" ON public.purchase_invoice_items;
CREATE POLICY "Accounting access invoice items"
ON public.purchase_invoice_items
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Accounting manage invoices" ON public.purchase_invoices;
CREATE POLICY "Accounting manage invoices"
ON public.purchase_invoices
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Accounting view invoices" ON public.purchase_invoices;
CREATE POLICY "Accounting view invoices"
ON public.purchase_invoices
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'accountant'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'developer'::public.app_role)
);

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;


-- ============================================
-- Migration: 20260510211820_cc8bf798-0519-4329-9733-b083e854795b.sql
-- ============================================

DROP POLICY IF EXISTS "Public read app assets" ON storage.objects;
CREATE POLICY "Public read direct app assets"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'app-assets'
  AND (
    name = 'logo.png'
    OR name LIKE 'branding/%'
    OR name LIKE 'logos/%'
  )
);

DROP POLICY IF EXISTS "Developer upload app assets" ON storage.objects;
CREATE POLICY "Developer upload app assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Developer update app assets" ON storage.objects;
CREATE POLICY "Developer update app assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Developer delete app assets" ON storage.objects;
CREATE POLICY "Developer delete app assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
);

-- ============================================
-- Migration: 20260510220510_eac609ca-bfe5-4596-bd9a-70e7307d038a.sql
-- ============================================

-- Welcome / floating messages
CREATE TABLE public.welcome_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  bg_color text DEFAULT 'oklch(0.55 0.22 260)',
  text_color text DEFAULT '#ffffff',
  pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  target_customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.welcome_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage messages"
ON public.welcome_messages FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'developer'))
WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'developer'));

CREATE POLICY "Customers read targeted or global messages"
ON public.welcome_messages FOR SELECT TO authenticated
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (
    target_customer_id IS NULL
    OR target_customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  )
);

CREATE TRIGGER welcome_messages_updated_at
BEFORE UPDATE ON public.welcome_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track per-user dismissals so non-pinned messages disappear after first close
CREATE TABLE public.welcome_dismissals (
  user_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.welcome_messages(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

ALTER TABLE public.welcome_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dismissals"
ON public.welcome_dismissals FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================
-- Migration: 20260510222635_d5356cc9-181d-4537-8c56-09b024cbc79d.sql
-- ============================================

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;

-- ============================================
-- Migration: 20260510222917_ea4aea5f-3b81-477a-b5cd-97f0fd72ed47.sql
-- ============================================

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


-- ============================================
-- Migration: 20260510230726_0968e7ef-295a-4a47-877b-85b8aa082ae8.sql
-- ============================================

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

-- ============================================
-- Migration: 20260510233429_51dad8df-428d-4c60-b540-8741b5e127ef.sql
-- ============================================

-- Seed 5 main categories with sub-categories for the storefront
INSERT INTO public.categories (id, name, parent_id, sort_order, is_active) VALUES
  ('11111111-1111-1111-1111-111111111101', 'بقالة وأطعمة', NULL, 1, true),
  ('11111111-1111-1111-1111-111111111102', 'مشروبات', NULL, 2, true),
  ('11111111-1111-1111-1111-111111111103', 'منظفات وأدوات منزلية', NULL, 3, true),
  ('11111111-1111-1111-1111-111111111104', 'عناية شخصية', NULL, 4, true),
  ('11111111-1111-1111-1111-111111111105', 'ألبان ومجمدات', NULL, 5, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub-categories
INSERT INTO public.categories (name, parent_id, sort_order, is_active) VALUES
  -- بقالة وأطعمة
  ('أرز', '11111111-1111-1111-1111-111111111101', 1, true),
  ('سكر وملح', '11111111-1111-1111-1111-111111111101', 2, true),
  ('زيوت وسمن', '11111111-1111-1111-1111-111111111101', 3, true),
  ('معكرونة', '11111111-1111-1111-1111-111111111101', 4, true),
  ('بقوليات', '11111111-1111-1111-1111-111111111101', 5, true),
  ('معلبات', '11111111-1111-1111-1111-111111111101', 6, true),
  -- مشروبات
  ('مياه معدنية', '11111111-1111-1111-1111-111111111102', 1, true),
  ('مشروبات غازية', '11111111-1111-1111-1111-111111111102', 2, true),
  ('عصائر', '11111111-1111-1111-1111-111111111102', 3, true),
  ('شاي وقهوة', '11111111-1111-1111-1111-111111111102', 4, true),
  -- منظفات
  ('منظفات أرضيات', '11111111-1111-1111-1111-111111111103', 1, true),
  ('مساحيق غسيل', '11111111-1111-1111-1111-111111111103', 2, true),
  ('سائل أطباق', '11111111-1111-1111-1111-111111111103', 3, true),
  ('مناديل ورقية', '11111111-1111-1111-1111-111111111103', 4, true),
  -- عناية شخصية
  ('شامبو وبلسم', '11111111-1111-1111-1111-111111111104', 1, true),
  ('صابون', '11111111-1111-1111-1111-111111111104', 2, true),
  ('معجون أسنان', '11111111-1111-1111-1111-111111111104', 3, true),
  -- ألبان ومجمدات
  ('ألبان', '11111111-1111-1111-1111-111111111105', 1, true),
  ('أجبان', '11111111-1111-1111-1111-111111111105', 2, true),
  ('مجمدات', '11111111-1111-1111-1111-111111111105', 3, true)
ON CONFLICT DO NOTHING;


-- ============================================
-- Migration: 20260510235120_f7dd12bc-35ad-413a-ba14-c821e784cf86.sql
-- ============================================

-- Allow anonymous (storefront) visitors to read active categories & products
DROP POLICY IF EXISTS "Anyone read categories" ON public.categories;
CREATE POLICY "Public read active categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated read products" ON public.products;
CREATE POLICY "Public read active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Seed demo products across the 5 main categories
WITH cats AS (
  SELECT id, name FROM public.categories WHERE parent_id IS NULL
)
INSERT INTO public.products (name, brand, category_id, unit_price, carton_price, stock_qty, image_url, is_active)
SELECT * FROM (VALUES
  ('أرز مصري فاخر 1كجم', 'الدوحة', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 38, 900, 120, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400', true),
  ('سكر أبيض ناعم 1كجم', 'السكر المصري', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 32, 760, 200, 'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=400', true),
  ('زيت عباد الشمس 1.5لتر', 'كريستال', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 95, 1100, 80, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400', true),
  ('مكرونة سباجيتي 400جم', 'الملكة', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 18, 425, 150, 'https://images.unsplash.com/photo-1551462147-37885acc36f1?w=400', true),
  ('شاي العروسة 250جم', 'العروسة', (SELECT id FROM cats WHERE name='مشروبات'), 65, 770, 90, 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=400', true),
  ('قهوة سريعة الذوبان 200جم', 'نسكافيه', (SELECT id FROM cats WHERE name='مشروبات'), 185, 2200, 60, 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400', true),
  ('عصير مانجو 1لتر', 'جهينة', (SELECT id FROM cats WHERE name='مشروبات'), 28, 660, 110, 'https://images.unsplash.com/photo-1546173159-315724a31696?w=400', true),
  ('بيبسي 1لتر', 'بيبسي', (SELECT id FROM cats WHERE name='مشروبات'), 22, 520, 180, 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400', true),
  ('مسحوق غسيل أوتوماتيك 3كجم', 'بيرسيل', (SELECT id FROM cats WHERE name='منظفات وأدوات منزلية'), 220, 1300, 45, 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=400', true),
  ('سائل تنظيف الأطباق 750مل', 'فيري', (SELECT id FROM cats WHERE name='منظفات وأدوات منزلية'), 45, 530, 100, 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400', true),
  ('مطهر أرضيات 1لتر', 'ديتول', (SELECT id FROM cats WHERE name='منظفات وأدوات منزلية'), 70, 825, 75, 'https://images.unsplash.com/photo-1585672840563-f2af2d50a1ad?w=400', true),
  ('شامبو 400مل', 'هيد آند شولدرز', (SELECT id FROM cats WHERE name='عناية شخصية'), 110, 1300, 65, 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400', true),
  ('معجون أسنان 100مل', 'سيجنال', (SELECT id FROM cats WHERE name='عناية شخصية'), 38, 450, 140, 'https://images.unsplash.com/photo-1559591935-c6c92c6cd3f9?w=400', true),
  ('صابون استحمام 175جم', 'لوكس', (SELECT id FROM cats WHERE name='عناية شخصية'), 22, 260, 200, 'https://images.unsplash.com/photo-1607006333439-505849ef4f76?w=400', true),
  ('مزيل عرق 150مل', 'نيفيا', (SELECT id FROM cats WHERE name='عناية شخصية'), 75, 880, 85, 'https://images.unsplash.com/photo-1585104370307-5d8f15b3e8e4?w=400', true),
  ('حليب طويل الأجل 1لتر', 'المراعي', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 42, 990, 95, 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400', true),
  ('جبن أبيض 500جم', 'دومتي', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 78, 920, 50, 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400', true),
  ('زبادي طبيعي 170جم', 'جهينة', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 12, 280, 220, 'https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=400', true),
  ('بيض بلدي 30 بيضة', 'مزرعة الفجر', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 165, 1900, 40, 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400', true),
  ('زبدة طبيعية 200جم', 'لورباك', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 95, 1120, 55, 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400', true)
) AS v(name, brand, category_id, unit_price, carton_price, stock_qty, image_url, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.products LIMIT 1);


-- ============================================
-- Migration: 20260511001313_304a3da4-fe82-4a1a-9764-513b19c4bf3a.sql
-- ============================================

CREATE POLICY "Customer insert own profile"
ON public.customers FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Customer update own profile"
ON public.customers FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Migration: 20260511002044_c7ae2841-52b0-4d7e-b786-c03e860f50e9.sql
-- ============================================

CREATE POLICY "Customer insert own order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  order_id IN (
    SELECT o.id FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Customer view own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  order_id IN (
    SELECT o.id FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE c.user_id = auth.uid()
  )
);

-- ============================================
-- Migration: 20260511002612_f1240f3e-4f92-4956-bb73-fd96fe9e1d02.sql
-- ============================================

DELETE FROM public.order_items WHERE order_id IN ('7b5ed924-00a1-4c2b-b35b-674ae1f77cc6','9d4af6e4-db0d-4633-b4f9-8165ba4da82e');
DELETE FROM public.orders WHERE id IN ('7b5ed924-00a1-4c2b-b35b-674ae1f77cc6','9d4af6e4-db0d-4633-b4f9-8165ba4da82e');

-- ============================================
-- Migration: 20260511003923_9b9353b0-1237-45b3-8112-f7191a564f9f.sql
-- ============================================

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


-- ============================================
-- Migration: 20260511004738_4e211ce9-cf68-407a-a8e7-3c3636095ea0.sql
-- ============================================

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','adjust','return')),
  qty integer NOT NULL,
  qty_before integer,
  qty_after integer,
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Staff insert stock movements"
  ON public.stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  );

-- RPC: adjust stock and record movement atomically
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id uuid,
  _delta integer,
  _movement_type text,
  _reason text DEFAULT NULL
)
RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _before integer;
  _after integer;
  _row public.stock_movements;
BEGIN
  IF NOT (
    private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _movement_type NOT IN ('in','out','adjust','return') THEN
    RAISE EXCEPTION 'invalid movement_type';
  END IF;

  SELECT stock_qty INTO _before FROM public.products WHERE id = _product_id FOR UPDATE;
  IF _before IS NULL THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  _after := _before + _delta;
  IF _after < 0 THEN
    RAISE EXCEPTION 'insufficient stock';
  END IF;

  UPDATE public.products SET stock_qty = _after, updated_at = now() WHERE id = _product_id;

  INSERT INTO public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, created_by)
  VALUES (_product_id, _movement_type, _delta, _before, _after, _reason, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- ============================================
-- Migration: 20260511004752_a7651c1c-aea8-4ff3-997a-f14895795f53.sql
-- ============================================

REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, integer, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, integer, text, text) TO authenticated;

-- ============================================
-- Migration: 20260511004950_b9dd02ab-fae6-4263-991d-e273f4918251.sql
-- ============================================

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


-- ============================================
-- Migration: 20260511053126_4376960b-d71a-4c7f-9d29-d1e0c61bbad4.sql
-- ============================================

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ============================================
-- Migration: 20260511061024_e992a528-ff02-441a-9385-25629b542626.sql
-- ============================================

-- Add per-screen permissions and active flag
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_debts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_accounting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_warehouse boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_messages boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_login_banner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_developer boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ============================================
-- Migration: 20260511062956_1975157f-7d99-4321-8ac9-6b3abbe48540.sql
-- ============================================

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

-- Admin manage profiles (currently admins can SELECT but cannot UPDATE other profiles)
CREATE POLICY "Admin update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'developer'::app_role));


-- ============================================
-- Migration: 20260511095544_54c00427-c409-449b-a5f6-7477dff37a18.sql
-- ============================================

-- 1. Orders: assignment & delivery tracking columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS delivery_status_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Ensure assigned_delivery is uuid pointing to auth user (column already exists)
CREATE INDEX IF NOT EXISTS idx_orders_assigned_delivery ON public.orders(assigned_delivery);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON public.orders(delivery_status);

-- 2. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info',
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff create notifications" ON public.notifications;
CREATE POLICY "Staff create notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'delivery'::app_role)
  );

-- 3. Orders RLS: let delivery users see their assigned orders
DROP POLICY IF EXISTS "Delivery view assigned orders" ON public.orders;
CREATE POLICY "Delivery view assigned orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'delivery'::app_role)
    AND assigned_delivery = auth.uid()
  );

DROP POLICY IF EXISTS "Delivery update assigned orders" ON public.orders;
CREATE POLICY "Delivery update assigned orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'delivery'::app_role)
    AND assigned_delivery = auth.uid()
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'delivery'::app_role)
    AND assigned_delivery = auth.uid()
  );

-- order_items: delivery user can view items of their assigned orders
DROP POLICY IF EXISTS "Delivery view assigned items" ON public.order_items;
CREATE POLICY "Delivery view assigned items" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'delivery'::app_role)
    AND order_id IN (SELECT id FROM public.orders WHERE assigned_delivery = auth.uid())
  );

-- customers: delivery user can view customers of their assigned orders
DROP POLICY IF EXISTS "Delivery view assigned customers" ON public.customers;
CREATE POLICY "Delivery view assigned customers" ON public.customers
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'delivery'::app_role)
    AND id IN (SELECT customer_id FROM public.orders WHERE assigned_delivery = auth.uid())
  );

-- 4. Trigger: prevent delivery user from modifying fields outside their allowed set
CREATE OR REPLACE FUNCTION public.guard_delivery_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- only enforce when caller is delivery role (not staff)
  IF private.has_role(auth.uid(), 'delivery'::app_role)
     AND NOT (
       private.has_role(auth.uid(), 'admin'::app_role)
       OR private.has_role(auth.uid(), 'developer'::app_role)
       OR private.has_role(auth.uid(), 'accountant'::app_role)
       OR private.has_role(auth.uid(), 'warehouse'::app_role)
     )
  THEN
    -- prevent changing critical fields
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.assigned_delivery IS DISTINCT FROM OLD.assigned_delivery
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR NEW.order_number IS DISTINCT FROM OLD.order_number
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    THEN
      RAISE EXCEPTION 'delivery user can only modify delivery_status and delivery_notes';
    END IF;
    -- auto-sync top-level status based on delivery_status
    IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
      IF NEW.delivery_status = 'delivered' THEN
        NEW.status := 'delivered';
        NEW.delivered_at := now();
      ELSIF NEW.delivery_status = 'on_the_way' THEN
        NEW.status := 'shipping';
      ELSIF NEW.delivery_status = 'received' THEN
        NEW.status := 'ready';
      END IF;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_delivery_update ON public.orders;
CREATE TRIGGER trg_guard_delivery_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_delivery_update();

-- 5. Assign-to-delivery RPC
CREATE OR REPLACE FUNCTION public.assign_order_to_delivery(
  _order_id uuid,
  _delivery_user_id uuid,
  _note text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.orders;
  _cust_name text;
  _order_num integer;
BEGIN
  IF NOT (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT private.has_role(_delivery_user_id, 'delivery'::app_role) THEN
    RAISE EXCEPTION 'target user is not a delivery user';
  END IF;

  UPDATE public.orders
  SET assigned_delivery = _delivery_user_id,
      assigned_by = auth.uid(),
      assigned_at = now(),
      delivery_status = 'assigned',
      delivery_notes = COALESCE(_note, delivery_notes),
      status = CASE WHEN status IN ('pending','preparing') THEN 'ready' ELSE status END,
      delivery_status_history = delivery_status_history || jsonb_build_object(
        'status', 'assigned',
        'at', now(),
        'by', auth.uid()
      ),
      updated_at = now()
  WHERE id = _order_id
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  SELECT shop_name, _row.order_number INTO _cust_name, _order_num
    FROM public.customers WHERE id = _row.customer_id;

  -- notify the delivery user
  INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
  VALUES (
    _delivery_user_id,
    'طلب جديد مسند إليك',
    COALESCE('طلب #'||_row.order_number||' — '||COALESCE(_cust_name,'عميل'), 'طلب جديد'),
    'order_assigned',
    '/delivery/'||_row.id,
    jsonb_build_object('order_id', _row.id, 'order_number', _row.order_number)
  );

  RETURN _row;
END;
$$;

-- 6. Delivery status update RPC (also writes history + notifies staff)
CREATE OR REPLACE FUNCTION public.update_delivery_status(
  _order_id uuid,
  _new_status text,
  _note text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.orders;
  _entry jsonb;
  _assigner uuid;
  _staff_id uuid;
BEGIN
  IF _new_status NOT IN ('received','on_the_way','delivered','failed','returned','assigned') THEN
    RAISE EXCEPTION 'invalid delivery status';
  END IF;

  SELECT * INTO _row FROM public.orders WHERE id = _order_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;

  -- caller must be the assigned delivery (or staff)
  IF NOT (
    (_row.assigned_delivery = auth.uid() AND private.has_role(auth.uid(),'delivery'::app_role))
    OR private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'developer'::app_role)
    OR private.has_role(auth.uid(),'accountant'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  _entry := jsonb_build_object('status', _new_status, 'at', now(), 'by', auth.uid(), 'note', _note);

  UPDATE public.orders
  SET delivery_status = _new_status,
      delivery_notes = COALESCE(_note, delivery_notes),
      delivery_status_history = delivery_status_history || _entry,
      status = CASE
        WHEN _new_status = 'delivered' THEN 'delivered'
        WHEN _new_status = 'on_the_way' THEN 'shipping'
        WHEN _new_status = 'received' THEN 'ready'
        WHEN _new_status = 'failed' THEN 'rejected'
        WHEN _new_status = 'returned' THEN 'cancelled'
        ELSE status
      END,
      delivered_at = CASE WHEN _new_status='delivered' THEN now() ELSE delivered_at END,
      updated_at = now()
  WHERE id = _order_id
  RETURNING * INTO _row;

  -- notify the user who assigned + all admins
  _assigner := _row.assigned_by;
  IF _assigner IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
    VALUES (_assigner,
      'تحديث حالة توصيل',
      'طلب #'||_row.order_number||' — '||_new_status,
      'delivery_update',
      '/admin/orders',
      jsonb_build_object('order_id', _row.id, 'status', _new_status));
  END IF;

  FOR _staff_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','accountant') LOOP
    IF _staff_id IS DISTINCT FROM _assigner THEN
      INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
      VALUES (_staff_id,
        'تحديث حالة توصيل',
        'طلب #'||_row.order_number||' — '||_new_status,
        'delivery_update',
        '/admin/orders',
        jsonb_build_object('order_id', _row.id, 'status', _new_status));
    END IF;
  END LOOP;

  RETURN _row;
END;
$$;

-- 7. Enable realtime on notifications & orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ============================================
-- Migration: 20260511095558_1182bed5-05d0-4b40-92d5-abb0af12cd25.sql
-- ============================================

REVOKE ALL ON FUNCTION public.assign_order_to_delivery(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_delivery_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_delivery_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_to_delivery(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(uuid, text, text) TO authenticated;

-- ============================================
-- Migration: 20260511100536_cd34b33b-bc26-454a-8b1d-3a383f116618.sql
-- ============================================

-- Push tokens table
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android', -- android | ios | web
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  role text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.user_push_tokens(user_id) WHERE is_active = true;

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens" ON public.user_push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff view push tokens" ON public.user_push_tokens
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'developer'::app_role)
  );

-- Trigger: on new order -> notify admins/accountants
CREATE OR REPLACE FUNCTION public.notify_staff_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _staff_id uuid;
  _cust_name text;
BEGIN
  SELECT shop_name INTO _cust_name FROM public.customers WHERE id = NEW.customer_id;
  FOR _staff_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','accountant') LOOP
    INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
    VALUES (
      _staff_id,
      'طلب جديد من عميل',
      'طلب #'||NEW.order_number||' — '||COALESCE(_cust_name,'عميل')||' — '||ROUND(NEW.total)::text||' ج.م',
      'order_new',
      '/admin/orders',
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number, 'total', NEW.total)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_staff_new_order ON public.orders;
CREATE TRIGGER trg_notify_staff_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_new_order();

-- Trigger: on order status change -> notify customer
CREATE OR REPLACE FUNCTION public.notify_customer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT user_id INTO _user_id FROM public.customers WHERE id = NEW.customer_id;
    IF _user_id IS NOT NULL THEN
      _label := CASE NEW.status
        WHEN 'pending' THEN 'قيد المراجعة'
        WHEN 'preparing' THEN 'قيد التحضير'
        WHEN 'ready' THEN 'جاهز للشحن'
        WHEN 'shipping' THEN 'في الطريق'
        WHEN 'delivered' THEN 'تم التسليم'
        WHEN 'cancelled' THEN 'ملغي'
        WHEN 'rejected' THEN 'مرفوض'
        ELSE NEW.status
      END;
      INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
      VALUES (
        _user_id,
        'تم تحديث حالة طلبك',
        'طلب #'||NEW.order_number||' — '||_label,
        'order_status',
        '/account',
        jsonb_build_object('order_id', NEW.id, 'status', NEW.status)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_customer_status ON public.orders;
CREATE TRIGGER trg_notify_customer_status
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_status_change();

-- pg_net for outbound push HTTP
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Settings table for push config (internal)
CREATE TABLE IF NOT EXISTS public.push_config (
  id integer PRIMARY KEY DEFAULT 1,
  endpoint_url text,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_row CHECK (id = 1)
);
INSERT INTO public.push_config(id, endpoint_url) VALUES (1, NULL) ON CONFLICT DO NOTHING;
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dev manage push_config" ON public.push_config
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'developer'::app_role) OR private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'developer'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));

-- Trigger on notifications insert -> ping push endpoint
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text;
  _enabled boolean;
BEGIN
  SELECT endpoint_url, is_enabled INTO _url, _enabled FROM public.push_config WHERE id = 1;
  IF _enabled IS NOT TRUE OR _url IS NULL OR _url = '' THEN
    RETURN NEW;
  END IF;
  PERFORM extensions.net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'type', NEW.type,
      'link', NEW.link,
      'metadata', NEW.metadata
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_push ON public.notifications;
CREATE TRIGGER trg_dispatch_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();


-- ============================================
-- Migration: 20260511134947_975e20b0-f5e8-4bb1-98ed-332e314d93f7.sql
-- ============================================

DO $$
DECLARE
  d1 uuid;
  d2 uuid;
BEGIN
  -- Delivery user 1
  SELECT id INTO d1 FROM auth.users WHERE email = '010000000003@phone.azraq.local';
  IF d1 IS NULL THEN
    d1 := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', d1, 'authenticated', 'authenticated',
      '010000000003@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المندوب 1','phone','010000000003','shop_name','التوصيل'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), d1,
      jsonb_build_object('sub', d1::text, 'email', '010000000003@phone.azraq.local'),
      'email', d1::text, now(), now(), now());
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('0000', gen_salt('bf')), updated_at = now() WHERE id = d1;
  END IF;
  INSERT INTO public.profiles (user_id, full_name, phone, shop_name)
    VALUES (d1, 'المندوب 1', '010000000003', 'التوصيل')
    ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET full_name='المندوب 1', phone='010000000003', is_active=true WHERE user_id = d1;
  DELETE FROM public.user_roles WHERE user_id = d1;
  INSERT INTO public.user_roles (user_id, role) VALUES (d1, 'delivery');

  -- Delivery user 2
  SELECT id INTO d2 FROM auth.users WHERE email = '010000000004@phone.azraq.local';
  IF d2 IS NULL THEN
    d2 := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', d2, 'authenticated', 'authenticated',
      '010000000004@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المندوب 2','phone','010000000004','shop_name','التوصيل'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), d2,
      jsonb_build_object('sub', d2::text, 'email', '010000000004@phone.azraq.local'),
      'email', d2::text, now(), now(), now());
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('0000', gen_salt('bf')), updated_at = now() WHERE id = d2;
  END IF;
  INSERT INTO public.profiles (user_id, full_name, phone, shop_name)
    VALUES (d2, 'المندوب 2', '010000000004', 'التوصيل')
    ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET full_name='المندوب 2', phone='010000000004', is_active=true WHERE user_id = d2;
  DELETE FROM public.user_roles WHERE user_id = d2;
  INSERT INTO public.user_roles (user_id, role) VALUES (d2, 'delivery');
END $$;


-- ============================================
-- Migration: 20260512085504_38aa3149-6da7-469e-8bc2-97b4b6427a64.sql
-- ============================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS governorate text,
  ADD COLUMN IF NOT EXISTS district text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_districts text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS assigned_governorates text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_customers_district ON public.customers(governorate, district);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_districts ON public.profiles USING gin(assigned_districts);

-- ============================================
-- Migration: 20260512090321_690bf7e4-d31f-46a8-8781-4327d272bc17.sql
-- ============================================

-- Security definer helper that bypasses RLS to check if a customer has an order assigned to a delivery user
CREATE OR REPLACE FUNCTION private.is_customer_assigned_to_delivery(_customer_id uuid, _delivery_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE customer_id = _customer_id
      AND assigned_delivery = _delivery_user_id
  )
$$;

DROP POLICY IF EXISTS "Delivery view assigned customers" ON public.customers;

CREATE POLICY "Delivery view assigned customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'delivery'::app_role)
  AND private.is_customer_assigned_to_delivery(id, auth.uid())
);

-- Same recursion risk on order_items policy
DROP POLICY IF EXISTS "Delivery view assigned items" ON public.order_items;

CREATE OR REPLACE FUNCTION private.is_order_assigned_to_delivery(_order_id uuid, _delivery_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = _order_id
      AND assigned_delivery = _delivery_user_id
  )
$$;

CREATE POLICY "Delivery view assigned items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'delivery'::app_role)
  AND private.is_order_assigned_to_delivery(order_id, auth.uid())
);


-- ============================================
-- Migration: 20260512093359_2c315033-0491-4399-baf9-4d9a286223f5.sql
-- ============================================

-- Add username to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- Update handle_new_user to also save username from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone, shop_name, username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'shop_name',
    NULLIF(NEW.raw_user_meta_data ->> 'username', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'merchant');
  RETURN NEW;
END;
$function$;

-- Resolve a login identifier (username OR phone) to a phone string.
CREATE OR REPLACE FUNCTION public.resolve_login_phone(_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _trim text := btrim(coalesce(_identifier,''));
  _digits text;
  _phone text;
BEGIN
  IF _trim = '' THEN RETURN NULL; END IF;
  _digits := regexp_replace(_trim, '\D', '', 'g');
  -- if mostly digits and looks like a phone, return digits
  IF length(_digits) >= 10 AND length(_digits) >= length(_trim) - 2 THEN
    RETURN _digits;
  END IF;
  SELECT phone INTO _phone FROM public.profiles
   WHERE lower(username) = lower(_trim) AND phone IS NOT NULL
   LIMIT 1;
  RETURN _phone;
END;
$$;

-- Check if a username is available (case-insensitive)
CREATE OR REPLACE FUNCTION public.is_username_available(_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(btrim(_username))
  );
$$;

-- Allow current user to set their own username (validates uniqueness + format)
CREATE OR REPLACE FUNCTION public.set_my_username(_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _u text := btrim(coalesce(_username,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _u !~ '^[A-Za-z][A-Za-z0-9_.]{2,29}$' THEN
    RAISE EXCEPTION 'invalid username format';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_u) AND user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'username already taken';
  END IF;
  UPDATE public.profiles SET username = _u, updated_at = now() WHERE user_id = auth.uid();
  RETURN _u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_username(text) TO authenticated;


-- ============================================
-- Migration: 20260512095830_df64a122-2c7e-402d-accd-68a3fb22bbfc.sql
-- ============================================

-- Update update_delivery_status: also affect stock and cash on delivered / returned
CREATE OR REPLACE FUNCTION public.update_delivery_status(_order_id uuid, _new_status text, _note text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.orders;
  _old_delivery text;
  _was_delivered boolean;
  _entry jsonb;
  _assigner uuid;
  _staff_id uuid;
  _it record;
  _stock_before integer;
BEGIN
  IF _new_status NOT IN ('received','on_the_way','delivered','failed','returned','assigned') THEN
    RAISE EXCEPTION 'invalid delivery status';
  END IF;

  SELECT * INTO _row FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;

  IF NOT (
    (_row.assigned_delivery = auth.uid() AND private.has_role(auth.uid(),'delivery'::app_role))
    OR private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'developer'::app_role)
    OR private.has_role(auth.uid(),'accountant'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  _old_delivery := _row.delivery_status;
  _was_delivered := (_old_delivery = 'delivered');

  _entry := jsonb_build_object('status', _new_status, 'at', now(), 'by', auth.uid(), 'note', _note);

  -- DELIVERED: deduct stock, mark paid, add cash income (only if not already delivered)
  IF _new_status = 'delivered' AND NOT _was_delivered THEN
    FOR _it IN SELECT product_id, qty FROM public.order_items WHERE order_id = _order_id AND product_id IS NOT NULL LOOP
      SELECT stock_qty INTO _stock_before FROM public.products WHERE id = _it.product_id FOR UPDATE;
      IF _stock_before IS NOT NULL THEN
        UPDATE public.products SET stock_qty = GREATEST(0, _stock_before - _it.qty), updated_at = now() WHERE id = _it.product_id;
        INSERT INTO public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, reference_type, reference_id, created_by)
        VALUES (_it.product_id, 'out', -_it.qty, _stock_before, GREATEST(0, _stock_before - _it.qty),
                'تسليم طلب #'||_row.order_number, 'order', _row.id, auth.uid());
      END IF;
    END LOOP;
    INSERT INTO public.cash_transactions(amount, type, description, reference_type, reference_id, created_by)
    VALUES (_row.total, 'income', 'تحصيل طلب #'||_row.order_number, 'order', _row.id, auth.uid());
  END IF;

  -- RETURNED or FAILED after delivered: restore stock and reverse cash
  IF _new_status IN ('returned','failed') AND _was_delivered THEN
    FOR _it IN SELECT product_id, qty FROM public.order_items WHERE order_id = _order_id AND product_id IS NOT NULL LOOP
      SELECT stock_qty INTO _stock_before FROM public.products WHERE id = _it.product_id FOR UPDATE;
      IF _stock_before IS NOT NULL THEN
        UPDATE public.products SET stock_qty = _stock_before + _it.qty, updated_at = now() WHERE id = _it.product_id;
        INSERT INTO public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, reference_type, reference_id, created_by)
        VALUES (_it.product_id, 'return', _it.qty, _stock_before, _stock_before + _it.qty,
                'مرتجع طلب #'||_row.order_number, 'order', _row.id, auth.uid());
      END IF;
    END LOOP;
    INSERT INTO public.cash_transactions(amount, type, description, reference_type, reference_id, created_by)
    VALUES (-_row.total, 'expense', 'إلغاء/مرتجع طلب #'||_row.order_number, 'order', _row.id, auth.uid());
  END IF;

  UPDATE public.orders
  SET delivery_status = _new_status,
      delivery_notes = COALESCE(_note, delivery_notes),
      delivery_status_history = delivery_status_history || _entry,
      status = CASE
        WHEN _new_status = 'delivered' THEN 'delivered'
        WHEN _new_status = 'on_the_way' THEN 'shipping'
        WHEN _new_status = 'received' THEN 'ready'
        WHEN _new_status = 'failed' THEN 'rejected'
        WHEN _new_status = 'returned' THEN 'cancelled'
        ELSE status
      END,
      payment_status = CASE
        WHEN _new_status = 'delivered' THEN 'paid'
        WHEN _new_status IN ('returned','failed') AND _was_delivered THEN 'refunded'
        ELSE payment_status
      END,
      delivered_at = CASE WHEN _new_status='delivered' THEN now() ELSE delivered_at END,
      updated_at = now()
  WHERE id = _order_id
  RETURNING * INTO _row;

  _assigner := _row.assigned_by;
  IF _assigner IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
    VALUES (_assigner,
      'تحديث حالة توصيل',
      'طلب #'||_row.order_number||' — '||_new_status,
      'delivery_update',
      '/admin/orders',
      jsonb_build_object('order_id', _row.id, 'status', _new_status));
  END IF;

  FOR _staff_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','accountant') LOOP
    IF _staff_id IS DISTINCT FROM _assigner THEN
      INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
      VALUES (_staff_id,
        'تحديث حالة توصيل',
        'طلب #'||_row.order_number||' — '||_new_status,
        'delivery_update',
        '/admin/orders',
        jsonb_build_object('order_id', _row.id, 'status', _new_status));
    END IF;
  END LOOP;

  RETURN _row;
END;
$function$;


-- ============================================
-- Migration: 20260512101407_a5688d1c-3361-4ace-840b-58fc218af763.sql
-- ============================================

CREATE OR REPLACE FUNCTION public.update_delivery_status(_order_id uuid, _new_status text, _note text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.orders;
  _old_delivery text;
  _was_delivered boolean;
  _entry jsonb;
  _assigner uuid;
  _staff_id uuid;
  _it record;
  _stock_before integer;
BEGIN
  IF _new_status NOT IN ('received','on_the_way','delivered','failed','returned','assigned') THEN
    RAISE EXCEPTION 'invalid delivery status';
  END IF;

  SELECT * INTO _row FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;

  IF NOT (
    (_row.assigned_delivery = auth.uid() AND private.has_role(auth.uid(),'delivery'::app_role))
    OR private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'developer'::app_role)
    OR private.has_role(auth.uid(),'accountant'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  _old_delivery := _row.delivery_status;
  _was_delivered := (_old_delivery = 'delivered');

  _entry := jsonb_build_object('status', _new_status, 'at', now(), 'by', auth.uid(), 'note', _note);

  IF _new_status = 'delivered' AND NOT _was_delivered THEN
    FOR _it IN SELECT product_id, qty FROM public.order_items WHERE order_id = _order_id AND product_id IS NOT NULL LOOP
      SELECT stock_qty INTO _stock_before FROM public.products WHERE id = _it.product_id FOR UPDATE;
      IF _stock_before IS NOT NULL THEN
        UPDATE public.products SET stock_qty = GREATEST(0, _stock_before - _it.qty), updated_at = now() WHERE id = _it.product_id;
        INSERT INTO public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, reference_type, reference_id, created_by)
        VALUES (_it.product_id, 'out', -_it.qty, _stock_before, GREATEST(0, _stock_before - _it.qty),
                'تسليم طلب #'||_row.order_number, 'order', _row.id, auth.uid());
      END IF;
    END LOOP;
    INSERT INTO public.cash_transactions(amount, type, description, reference_type, reference_id, created_by)
    VALUES (_row.total, 'in', 'تحصيل طلب #'||_row.order_number, 'order', _row.id, auth.uid());
  END IF;

  IF _new_status IN ('returned','failed') AND _was_delivered THEN
    FOR _it IN SELECT product_id, qty FROM public.order_items WHERE order_id = _order_id AND product_id IS NOT NULL LOOP
      SELECT stock_qty INTO _stock_before FROM public.products WHERE id = _it.product_id FOR UPDATE;
      IF _stock_before IS NOT NULL THEN
        UPDATE public.products SET stock_qty = _stock_before + _it.qty, updated_at = now() WHERE id = _it.product_id;
        INSERT INTO public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, reference_type, reference_id, created_by)
        VALUES (_it.product_id, 'return', _it.qty, _stock_before, _stock_before + _it.qty,
                'مرتجع طلب #'||_row.order_number, 'order', _row.id, auth.uid());
      END IF;
    END LOOP;
    INSERT INTO public.cash_transactions(amount, type, description, reference_type, reference_id, created_by)
    VALUES (-_row.total, 'out', 'إلغاء/مرتجع طلب #'||_row.order_number, 'order', _row.id, auth.uid());
  END IF;

  UPDATE public.orders
  SET delivery_status = _new_status,
      delivery_notes = COALESCE(_note, delivery_notes),
      delivery_status_history = delivery_status_history || _entry,
      status = CASE
        WHEN _new_status = 'delivered' THEN 'delivered'
        WHEN _new_status = 'on_the_way' THEN 'shipping'
        WHEN _new_status = 'received' THEN 'ready'
        WHEN _new_status = 'failed' THEN 'rejected'
        WHEN _new_status = 'returned' THEN 'cancelled'
        ELSE status
      END,
      payment_status = CASE
        WHEN _new_status = 'delivered' THEN 'paid'
        WHEN _new_status IN ('returned','failed') AND _was_delivered THEN 'refunded'
        ELSE payment_status
      END,
      delivered_at = CASE WHEN _new_status='delivered' THEN now() ELSE delivered_at END,
      updated_at = now()
  WHERE id = _order_id
  RETURNING * INTO _row;

  _assigner := _row.assigned_by;
  IF _assigner IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
    VALUES (_assigner,
      'تحديث حالة توصيل',
      'طلب #'||_row.order_number||' — '||_new_status,
      'delivery_update',
      '/admin/orders',
      jsonb_build_object('order_id', _row.id, 'status', _new_status));
  END IF;

  FOR _staff_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','accountant') LOOP
    IF _staff_id IS DISTINCT FROM _assigner THEN
      INSERT INTO public.notifications(user_id, title, body, type, link, metadata)
      VALUES (_staff_id,
        'تحديث حالة توصيل',
        'طلب #'||_row.order_number||' — '||_new_status,
        'delivery_update',
        '/admin/orders',
        jsonb_build_object('order_id', _row.id, 'status', _new_status));
    END IF;
  END LOOP;

  RETURN _row;
END;
$function$;

-- ============================================
-- Migration: 20260512101609_423c0ee8-bb23-4150-83a3-85fab6f06287.sql
-- ============================================

CREATE OR REPLACE FUNCTION public.guard_delivery_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF private.has_role(auth.uid(), 'delivery'::app_role)
     AND NOT (
       private.has_role(auth.uid(), 'admin'::app_role)
       OR private.has_role(auth.uid(), 'developer'::app_role)
       OR private.has_role(auth.uid(), 'accountant'::app_role)
       OR private.has_role(auth.uid(), 'warehouse'::app_role)
     )
  THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.assigned_delivery IS DISTINCT FROM OLD.assigned_delivery
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR NEW.order_number IS DISTINCT FROM OLD.order_number
    THEN
      RAISE EXCEPTION 'delivery user can only modify delivery fields';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;


-- ============================================
-- Migration: 20260512115856_4dbbe7d7-e163-4edb-ba9a-947ee1ab4243.sql
-- ============================================

-- 1) Add internal_secret column to push_config
ALTER TABLE public.push_config
  ADD COLUMN IF NOT EXISTS internal_secret text;

-- 2) Generate and store a random secret if not set
UPDATE public.push_config
   SET internal_secret = encode(gen_random_bytes(24), 'hex')
 WHERE id = 1 AND (internal_secret IS NULL OR internal_secret = '');

-- 3) Update the trigger to include the secret as a header
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text;
  _enabled boolean;
  _secret text;
BEGIN
  SELECT endpoint_url, is_enabled, internal_secret
    INTO _url, _enabled, _secret
    FROM public.push_config WHERE id = 1;

  IF _enabled IS NOT TRUE OR _url IS NULL OR _url = '' THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', COALESCE(_secret, '')
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'type', NEW.type,
      'link', NEW.link,
      'metadata', NEW.metadata
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;


-- ============================================
-- Migration: 20260512165844_14970a25-b2ba-4a13-9d84-f472910a8932.sql
-- ============================================

-- Warehouse Advanced (adapted to existing schema: stock_qty, existing stock_movements)

create table if not exists public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'draft' check (status in ('draft','in_progress','completed','cancelled')),
  notes text,
  total_items integer not null default 0,
  discrepancies integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.stocktake_items (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references public.stocktakes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  system_quantity integer not null default 0,
  counted_quantity integer,
  discrepancy integer generated always as (coalesce(counted_quantity,0) - system_quantity) stored,
  notes text,
  counted_at timestamptz,
  counted_by uuid references public.profiles(id) on delete set null
);
create index if not exists idx_stocktake_items_stocktake on public.stocktake_items(stocktake_id);

create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade unique,
  min_quantity integer not null default 5,
  is_active boolean not null default true,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  reason text not null,
  total_amount numeric(12,2) not null default 0,
  notes text,
  processed_by uuid references public.profiles(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.customer_returns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  condition text default 'good' check (condition in ('good','damaged','expired'))
);

create table if not exists public.bin_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  zone text,
  capacity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_locations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  bin_location_id uuid not null references public.bin_locations(id) on delete cascade,
  quantity integer not null default 0,
  is_primary boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(product_id, bin_location_id)
);

alter table public.stocktakes enable row level security;
alter table public.stocktake_items enable row level security;
alter table public.stock_alerts enable row level security;
alter table public.customer_returns enable row level security;
alter table public.customer_return_items enable row level security;
alter table public.bin_locations enable row level security;
alter table public.product_locations enable row level security;

create policy "Authenticated full access" on public.stocktakes for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.stocktake_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.stock_alerts for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.customer_returns for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.customer_return_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.bin_locations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.product_locations for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- record_stock_movement adapted to existing stock_movements schema (qty, qty_before, qty_after)
create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text default null,
  p_reference_id uuid default null,
  p_reference_type text default null,
  p_actor_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_after integer;
  v_id uuid;
begin
  select stock_qty into v_before from public.products where id = p_product_id for update;
  if v_before is null then raise exception 'Product not found'; end if;

  if p_movement_type in ('in','return') then
    v_after := v_before + p_quantity;
  elsif p_movement_type in ('out','damage') then
    v_after := greatest(0, v_before - p_quantity);
  else
    v_after := p_quantity;
  end if;

  update public.products set stock_qty = v_after, updated_at = now() where id = p_product_id;

  insert into public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, reference_type, reference_id, created_by)
  values (p_product_id, p_movement_type, p_quantity, v_before, v_after, p_reason, p_reference_type, p_reference_id, coalesce(p_actor_id, auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;


-- Delivery GPS

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  heading double precision,
  speed double precision,
  is_online boolean not null default true,
  last_updated_at timestamptz not null default now()
);

create table if not exists public.driver_location_history (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_driver_location_history_driver on public.driver_location_history(driver_id, recorded_at desc);

alter table public.driver_locations enable row level security;
alter table public.driver_location_history enable row level security;
create policy "Authenticated full access" on public.driver_locations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.driver_location_history for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter publication supabase_realtime add table public.driver_locations;

-- Developer SaaS Panel

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  changes jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id, created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action, created_at desc);

create table if not exists public.app_labels (
  key text primary key,
  value text not null,
  default_value text not null,
  category text not null default 'general',
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_typography (
  key text primary key,
  value text not null,
  category text not null default 'font',
  label text not null,
  css_variable text,
  updated_at timestamptz not null default now()
);

insert into public.app_typography (key, value, category, label, css_variable) values
  ('font_family_primary', 'Cairo, sans-serif', 'font', 'الخط الأساسي', '--font-primary'),
  ('font_family_display', 'Cairo, sans-serif', 'font', 'خط العناوين', '--font-display'),
  ('font_family_mono', 'IBM Plex Mono, monospace', 'font', 'خط الأكواد', '--font-mono'),
  ('font_size_xs', '0.75rem', 'size', 'حجم صغير جدًا', '--text-xs'),
  ('font_size_sm', '0.875rem', 'size', 'حجم صغير', '--text-sm'),
  ('font_size_base', '1rem', 'size', 'حجم عادي', '--text-base'),
  ('font_size_lg', '1.125rem', 'size', 'حجم كبير', '--text-lg'),
  ('font_size_xl', '1.25rem', 'size', 'حجم كبير جدًا', '--text-xl'),
  ('font_size_2xl', '1.5rem', 'size', 'حجم عنوان', '--text-2xl'),
  ('font_size_3xl', '1.875rem', 'size', 'حجم عنوان كبير', '--text-3xl'),
  ('font_weight_normal', '400', 'weight', 'وزن عادي', '--font-normal'),
  ('font_weight_medium', '500', 'weight', 'وزن متوسط', '--font-medium'),
  ('font_weight_bold', '700', 'weight', 'وزن ثقيل', '--font-bold'),
  ('font_weight_extrabold', '800', 'weight', 'وزن ثقيل جدًا', '--font-extrabold'),
  ('line_height_tight', '1.25', 'spacing', 'تباعد أسطر ضيق', '--leading-tight'),
  ('line_height_normal', '1.5', 'spacing', 'تباعد أسطر عادي', '--leading-normal'),
  ('line_height_relaxed', '1.75', 'spacing', 'تباعد أسطر مريح', '--leading-relaxed'),
  ('letter_spacing_tight', '-0.025em', 'spacing', 'تقارب حروف', '--tracking-tight'),
  ('letter_spacing_normal', '0em', 'spacing', 'مسافة حروف عادية', '--tracking-normal'),
  ('letter_spacing_wide', '0.025em', 'spacing', 'تباعد حروف', '--tracking-wide'),
  ('border_radius_sm', '0.5rem', 'spacing', 'استدارة صغيرة', '--radius-sm'),
  ('border_radius_md', '1rem', 'spacing', 'استدارة متوسطة', '--radius-md'),
  ('border_radius_lg', '1.5rem', 'spacing', 'استدارة كبيرة', '--radius-lg'),
  ('border_radius_full', '9999px', 'spacing', 'استدارة كاملة', '--radius-full')
on conflict (key) do nothing;

create table if not exists public.plan_config (
  id text primary key,
  name text not null,
  name_ar text not null,
  price_monthly numeric(10,2) default 0,
  price_yearly numeric(10,2) default 0,
  currency text default 'EGP',
  limits jsonb not null default '{}',
  features jsonb not null default '[]',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  badge_text text,
  updated_at timestamptz not null default now()
);

insert into public.plan_config (id, name, name_ar, price_monthly, price_yearly, limits, features, sort_order, badge_text) values
  ('free', 'Free', 'مجاني', 0, 0, '{"products": 50, "ordersPerMonth": 100, "branches": 1}', '["products", "orders", "branches"]', 1, null),
  ('pro', 'Pro', 'احترافي', 299, 2990, '{"products": 500, "ordersPerMonth": "unlimited", "branches": 3}', '["products", "orders", "branches", "sms", "analytics"]', 2, 'الأكثر شيوعًا'),
  ('enterprise', 'Enterprise', 'مؤسسات', 799, 7990, '{"products": "unlimited", "ordersPerMonth": "unlimited", "branches": "unlimited"}', '["products", "orders", "branches", "sms", "analytics", "custom_domain", "developer"]', 3, 'للشركات')
on conflict (id) do nothing;

create table if not exists public.app_custom_css (
  id text primary key default 'global',
  css_content text not null default '',
  is_active boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_custom_css (id, css_content, is_active)
values ('global', E'/* Custom CSS — add your overrides here */\n', false)
on conflict (id) do nothing;

create table if not exists public.app_snapshots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  snapshot_data jsonb not null,
  version text not null default '1.0',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
alter table public.app_labels enable row level security;
alter table public.app_typography enable row level security;
alter table public.plan_config enable row level security;
alter table public.app_custom_css enable row level security;
alter table public.app_snapshots enable row level security;

create policy "Authenticated full access" on public.audit_log for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_labels for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_typography for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.plan_config for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_custom_css for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_snapshots for all using (auth.uid() is not null) with check (auth.uid() is not null);

create or replace function public.log_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_changes jsonb default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.audit_log(actor_id, action, entity_type, entity_id, changes, metadata)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, p_changes, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;


-- Chat + Internal Messaging

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open','assigned','resolved','closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_conversations_customer on public.chat_conversations(customer_id, created_at desc);
create index if not exists idx_chat_conversations_status on public.chat_conversations(status, last_message_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_type text not null default 'customer' check (sender_type in ('customer','admin','bot')),
  content text not null,
  is_read boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_conversation on public.chat_messages(conversation_id, created_at);

create table if not exists public.chatbot_faqs (
  id uuid primary key default gen_random_uuid(),
  keywords text[] not null,
  question text not null,
  answer text not null,
  category text default 'general',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.chatbot_faqs (keywords, question, answer, category, sort_order) values
  ('{طلب,حالة,وين,فين,متابعة}', 'فين طلبي؟', 'يمكنك متابعة حالة طلبك من صفحة "طلباتي". لو الطلب جديد، هيتجهز خلال ساعات. لو عايز تفاصيل أكتر، اكتب "دعم" وهوصلك بفريق الدعم.', 'orders', 1),
  ('{توصيل,وقت,كام,ساعة}', 'التوصيل بياخد كام؟', 'التوصيل عادة بياخد من 2-6 ساعات حسب منطقتك. لو الطلب مستعجل، تواصل مع الدعم.', 'delivery', 2),
  ('{دفع,فلوس,كاش,فيزا}', 'طرق الدفع إيه؟', 'حاليًا الدفع عند الاستلام (كاش). قريبًا هنضيف طرق دفع إلكترونية.', 'payment', 3),
  ('{مرتجع,رجوع,استبدال,غلط}', 'عايز أرجع منتج', 'لو عايز ترجع منتج، كلم فريق الدعم وهما يساعدوك. اكتب "دعم" عشان أوصلك.', 'returns', 4),
  ('{سعر,أسعار,غالي,خصم,عرض}', 'في عروض أو خصومات؟', 'تابع صفحة العروض عندنا لأحدث الخصومات. لو تاجر جملة، ممكن تتواصل للأسعار الخاصة.', 'pricing', 5),
  ('{دعم,مساعدة,مشكلة,شكوى}', 'عايز أتكلم مع الدعم', 'تمام! بوصلك بفريق الدعم دلوقتي. لو مفيش حد متاح، هيرد عليك في أقرب وقت.', 'support', 6),
  ('{شكرا,ممتاز,حلو,تمام}', 'شكرًا', 'العفو! لو محتاج أي حاجة تانية، أنا هنا 🙂', 'general', 7)
on conflict do nothing;

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_internal_messages_recipient on public.internal_messages(recipient_id, is_read, created_at desc);
create index if not exists idx_internal_messages_sender on public.internal_messages(sender_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chatbot_faqs enable row level security;
alter table public.internal_messages enable row level security;

create policy "Authenticated full access" on public.chat_conversations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.chat_messages for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.chatbot_faqs for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.internal_messages for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.internal_messages;


-- ============================================
-- Migration: 20260512211238_735cbfa8-061c-49da-85cf-9bb2081ee291.sql
-- ============================================

ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS can_chatbot boolean NOT NULL DEFAULT false;

-- ============================================
-- Migration: 20260513043255_7ef36e55-f933-453b-84d4-8b9ee126efbc.sql
-- ============================================

-- Deduplicate customers per user_id: keep latest row, repoint orders/welcome_messages
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
),
canonical AS (
  SELECT user_id, id AS keep_id FROM ranked WHERE rn = 1
),
to_remove AS (
  SELECT r.id AS dup_id, c.keep_id
  FROM ranked r JOIN canonical c USING (user_id)
  WHERE r.rn > 1
)
UPDATE public.orders o
SET customer_id = tr.keep_id
FROM to_remove tr
WHERE o.customer_id = tr.dup_id;

WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
),
canonical AS (
  SELECT user_id, id AS keep_id FROM ranked WHERE rn = 1
),
to_remove AS (
  SELECT r.id AS dup_id, c.keep_id
  FROM ranked r JOIN canonical c USING (user_id)
  WHERE r.rn > 1
)
UPDATE public.welcome_messages w
SET target_customer_id = tr.keep_id
FROM to_remove tr
WHERE w.target_customer_id = tr.dup_id;

-- Delete the duplicate customer rows
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
)
DELETE FROM public.customers WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Prevent duplicates going forward
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_unique
  ON public.customers (user_id) WHERE user_id IS NOT NULL;


-- ============================================
-- Migration: 20260513220536_550673d8-d3ad-48d3-818e-01e516cdc641.sql
-- ============================================

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


-- ============================================
-- Migration: 20260513221703_5cd92112-dffe-43d7-9c17-2fbff48ef656.sql
-- ============================================

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

