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