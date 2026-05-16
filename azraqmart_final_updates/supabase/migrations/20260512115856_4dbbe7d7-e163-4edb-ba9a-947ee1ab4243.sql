
-- 1) Add internal_secret column to push_config
ALTER TABLE public.push_config
  ADD COLUMN IF NOT EXISTS internal_secret text;

-- 2) Generate and store a random secret if not set
UPDATE public.push_config
   SET internal_secret = encode(gen_random_bytes(24), 'hex')
 WHERE id = 1 AND (internal_secret IS NULL OR internal_secret = '');

-- 3) Update the trigger to include the secret as a header
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text;
  _enabled boolean;
  _secret text;
BEGIN
  SELECT endpoint_url, is_enabled, internal_secret
    INTO _url, _enabled, _secret
    FROM public.push_config WHERE id = 1;

  IF _enabled IS NOT TRUE OR _url IS NULL OR _url = '' THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', COALESCE(_secret, '')
    ),
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
$function$;
