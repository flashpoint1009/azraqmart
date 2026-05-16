
-- Welcome / floating messages
CREATE TABLE public.welcome_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  bg_color text DEFAULT 'oklch(0.55 0.22 260)',
  text_color text DEFAULT '#ffffff',
  pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  target_customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.welcome_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage messages"
ON public.welcome_messages FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'developer'))
WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'developer'));

CREATE POLICY "Customers read targeted or global messages"
ON public.welcome_messages FOR SELECT TO authenticated
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (
    target_customer_id IS NULL
    OR target_customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  )
);

CREATE TRIGGER welcome_messages_updated_at
BEFORE UPDATE ON public.welcome_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track per-user dismissals so non-pinned messages disappear after first close
CREATE TABLE public.welcome_dismissals (
  user_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.welcome_messages(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

ALTER TABLE public.welcome_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dismissals"
ON public.welcome_dismissals FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
