
-- Add per-screen permissions and active flag
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_debts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_accounting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_warehouse boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_messages boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_login_banner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_developer boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
