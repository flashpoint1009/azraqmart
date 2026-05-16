-- =============================================================================
-- White-Label SaaS — Single-owner DB constraint and ownership transfer
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/design.md §"User-Tenant Roles"
--     ("Exactly one role='owner' per tenant at any time."
--      "WHEN ownership is transferred, the System SHALL atomically
--       demote the previous owner to admin and promote the new owner so
--       that the 'exactly one owner' invariant holds at every observable
--       moment.")
--   - Requirements 6.5 (single-owner invariant) and 6.7 (atomic transfer)
--
-- This migration installs:
--   1. A partial unique index on `user_tenant_roles (tenant_id) WHERE role = 'owner'`
--      so the database itself enforces "at most one owner per tenant".
--      The composite PK (user_id, tenant_id) already prevents duplicate
--      role rows for the same user; combined with this partial index the
--      invariant is "exactly one owner per provisioned tenant" — owners
--      are seeded by the provisioning flow (task 12.1).
--   2. `transfer_ownership(p_tenant_id, p_from_user, p_to_user)` — a
--      SECURITY DEFINER function that flips both rows in a single UPDATE
--      statement. Postgres evaluates unique indexes once at the end of a
--      statement (not per-row), so the partial unique index is satisfied
--      throughout the transaction even though two rows transiently
--      exchange the 'owner' role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Partial unique index — at most one owner per tenant.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_tenant_roles_owner
  ON public.user_tenant_roles (tenant_id)
  WHERE role = 'owner';

COMMENT ON INDEX public.uniq_user_tenant_roles_owner IS
  'Partial unique index — exactly one owner per tenant at any committed moment.';

-- -----------------------------------------------------------------------------
-- 2. transfer_ownership(tenant_id, from_user, to_user)
--
-- Atomically demote the current owner to 'admin' and promote the new
-- user to 'owner'. Both updates happen in a single UPDATE statement so
-- the partial unique index is checked only once, after both rows have
-- swapped roles, and the "exactly one owner per tenant" invariant holds
-- at every observable (committed) moment.
--
-- Preconditions:
--   * `p_from_user` is the current owner of `p_tenant_id`.
--   * `p_to_user`   already has a `user_tenant_roles` row for that tenant
--     (i.e. is a member). Promotion never inserts; ownership transfer is
--     between existing members only.
--
-- Postconditions:
--   * `p_from_user` has role='admin' for `p_tenant_id`.
--   * `p_to_user`   has role='owner' for `p_tenant_id`.
--   * No other rows are touched.
--
-- Errors:
--   * P0001 if `p_from_user` is not the current owner.
--   * P0001 if `p_to_user` is not a member of the tenant.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_ownership(
  p_tenant_id uuid,
  p_from_user uuid,
  p_to_user   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preconditions ------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_tenant_roles
     WHERE tenant_id = p_tenant_id
       AND user_id   = p_from_user
       AND role      = 'owner'
  ) THEN
    RAISE EXCEPTION 'transfer_ownership: % is not the current owner of %',
      p_from_user, p_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_tenant_roles
     WHERE tenant_id = p_tenant_id
       AND user_id   = p_to_user
  ) THEN
    RAISE EXCEPTION 'transfer_ownership: % is not a member of %',
      p_to_user, p_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Atomic swap --------------------------------------------------------------
  -- Single UPDATE: Postgres evaluates unique indexes once at statement
  -- end, so the partial unique index does not fire during the
  -- intermediate state where both rows could momentarily look like
  -- 'owner'. After the statement, exactly one row has role='owner'.
  UPDATE public.user_tenant_roles
     SET role = CASE
                  WHEN user_id = p_from_user THEN 'admin'
                  WHEN user_id = p_to_user   THEN 'owner'
                  ELSE role
                END
   WHERE tenant_id = p_tenant_id
     AND user_id IN (p_from_user, p_to_user);
END;
$$;

COMMENT ON FUNCTION public.transfer_ownership(uuid, uuid, uuid) IS
  'Atomically demote current owner to admin and promote new user to owner. Single UPDATE statement keeps the partial unique index satisfied.';
