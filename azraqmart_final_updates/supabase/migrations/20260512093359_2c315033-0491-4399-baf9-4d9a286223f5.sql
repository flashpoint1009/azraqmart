-- Add username to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- Update handle_new_user to also save username from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone, shop_name, username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'shop_name',
    NULLIF(NEW.raw_user_meta_data ->> 'username', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'merchant');
  RETURN NEW;
END;
$function$;

-- Resolve a login identifier (username OR phone) to a phone string.
-- Returns NULL if not found. SECURITY DEFINER bypasses RLS so login works pre-auth.
CREATE OR REPLACE FUNCTION public.resolve_login_phone(_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _trim text := btrim(coalesce(_identifier,''));
  _digits text;
  _phone text;
BEGIN
  IF _trim = '' THEN RETURN NULL; END IF;
  _digits := regexp_replace(_trim, '\D', '', 'g');
  -- if mostly digits and looks like a phone, return digits
  IF length(_digits) >= 10 AND length(_digits) >= length(_trim) - 2 THEN
    RETURN _digits;
  END IF;
  SELECT phone INTO _phone FROM public.profiles
   WHERE lower(username) = lower(_trim) AND phone IS NOT NULL
   LIMIT 1;
  RETURN _phone;
END;
$$;

-- Check if a username is available (case-insensitive)
CREATE OR REPLACE FUNCTION public.is_username_available(_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(btrim(_username))
  );
$$;

-- Allow current user to set their own username (validates uniqueness + format)
CREATE OR REPLACE FUNCTION public.set_my_username(_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _u text := btrim(coalesce(_username,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _u !~ '^[A-Za-z][A-Za-z0-9_.]{2,29}$' THEN
    RAISE EXCEPTION 'invalid username format';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_u) AND user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'username already taken';
  END IF;
  UPDATE public.profiles SET username = _u, updated_at = now() WHERE user_id = auth.uid();
  RETURN _u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_username(text) TO authenticated;