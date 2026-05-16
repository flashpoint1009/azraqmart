REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, integer, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, integer, text, text) TO authenticated;