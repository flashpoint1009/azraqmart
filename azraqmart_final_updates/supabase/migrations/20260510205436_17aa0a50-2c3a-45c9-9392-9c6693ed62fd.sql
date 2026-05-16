
DROP POLICY IF EXISTS "Staff manage items" ON public.order_items;
CREATE POLICY "Staff manage items" ON public.order_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'developer'));
