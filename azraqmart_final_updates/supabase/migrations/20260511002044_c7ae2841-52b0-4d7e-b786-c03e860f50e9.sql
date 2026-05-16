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