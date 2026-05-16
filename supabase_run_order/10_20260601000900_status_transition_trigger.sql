-- Migration: enforce the tenant status transition graph at the database
-- layer via a BEFORE UPDATE trigger on `public.tenants.status`.
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/requirements.md
--       Requirement 4.7: "THE System SHALL constrain `tenants.status`
--       transitions to the directed graph
--       `trialing → active → past_due → suspended → cancelled` and
--       SHALL reject any transition that is not an edge in that graph."
--       Requirement 4.9: `resumeTenant` may move `suspended → active`
--       (or `suspended → past_due` when the subscription is unpaid).
--       Requirement 7.7: a successful payment may move `past_due → active`
--       and `suspended → active`.
--   - src/lib/tenancy/status-transitions.ts
--       The TypeScript `assertTransition` function encodes the same
--       edge set; this trigger keeps the constraint authoritative even
--       for direct SQL writes that bypass the application layer.
--
-- Encoded edges (all other transitions are rejected):
--
--     trialing  -> { active, past_due, suspended, cancelled }
--     active    -> { past_due, suspended, cancelled }
--     past_due  -> { active, suspended, cancelled }
--     suspended -> { active, past_due, cancelled }
--     cancelled -> {}                                  -- terminal
--
-- Self-transitions (OLD.status = NEW.status) are allowed as a no-op so
-- that webhook handlers re-applying the current status do not raise.
-- The function and trigger are both created idempotently so the
-- migration can be re-run safely.

CREATE OR REPLACE FUNCTION public.tenants_assert_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;  -- idempotent self-update
  END IF;

  IF (OLD.status, NEW.status) NOT IN (
    ('trialing',  'active'),     ('trialing',  'past_due'),  ('trialing',  'suspended'), ('trialing',  'cancelled'),
    ('active',    'past_due'),   ('active',    'suspended'), ('active',    'cancelled'),
    ('past_due',  'active'),     ('past_due',  'suspended'), ('past_due',  'cancelled'),
    ('suspended', 'active'),     ('suspended', 'past_due'),  ('suspended', 'cancelled')
    -- 'cancelled' is terminal: no outgoing edges
  ) THEN
    RAISE EXCEPTION 'tenants: invalid status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tenants_assert_status_transition() IS
  'BEFORE UPDATE OF status trigger — rejects transitions that are not edges in the tenant status graph (Requirement 4.7).';

DROP TRIGGER IF EXISTS tenants_assert_status_transition ON public.tenants;
CREATE TRIGGER tenants_assert_status_transition
  BEFORE UPDATE OF status ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.tenants_assert_status_transition();
