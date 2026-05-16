
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
