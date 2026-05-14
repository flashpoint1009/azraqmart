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