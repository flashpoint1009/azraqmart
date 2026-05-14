REVOKE ALL ON FUNCTION public.assign_order_to_delivery(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_delivery_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_delivery_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_to_delivery(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(uuid, text, text) TO authenticated;