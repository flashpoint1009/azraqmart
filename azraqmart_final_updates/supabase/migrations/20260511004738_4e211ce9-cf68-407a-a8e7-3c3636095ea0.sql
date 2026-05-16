CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','adjust','return')),
  qty integer NOT NULL,
  qty_before integer,
  qty_after integer,
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Staff insert stock movements"
  ON public.stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  );

-- Allow warehouse to also fully manage products (currently warehouse can only UPDATE stock)
-- Make sure accountant can update — already covered by existing "Accountant/Dev manage products" policy.

-- RPC: adjust stock and record movement atomically
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id uuid,
  _delta integer,
  _movement_type text,
  _reason text DEFAULT NULL
)
RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _before integer;
  _after integer;
  _row public.stock_movements;
BEGIN
  IF NOT (
    private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _movement_type NOT IN ('in','out','adjust','return') THEN
    RAISE EXCEPTION 'invalid movement_type';
  END IF;

  SELECT stock_qty INTO _before FROM public.products WHERE id = _product_id FOR UPDATE;
  IF _before IS NULL THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  _after := _before + _delta;
  IF _after < 0 THEN
    RAISE EXCEPTION 'insufficient stock';
  END IF;

  UPDATE public.products SET stock_qty = _after, updated_at = now() WHERE id = _product_id;

  INSERT INTO public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, created_by)
  VALUES (_product_id, _movement_type, _delta, _before, _after, _reason, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;