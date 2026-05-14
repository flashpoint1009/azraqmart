
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
