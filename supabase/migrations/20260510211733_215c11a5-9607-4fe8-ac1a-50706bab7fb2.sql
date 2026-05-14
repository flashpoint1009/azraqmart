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