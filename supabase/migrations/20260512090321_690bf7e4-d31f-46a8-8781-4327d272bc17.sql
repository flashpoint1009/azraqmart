
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
