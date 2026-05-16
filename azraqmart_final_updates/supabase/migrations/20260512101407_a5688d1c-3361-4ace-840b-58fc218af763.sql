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