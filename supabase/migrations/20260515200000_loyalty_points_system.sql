-- Loyalty Points System
-- Points are awarded automatically when an order is delivered
-- Rate: 1 point per 10 EGP spent

-- Points history table
CREATE TABLE IF NOT EXISTS public.points_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points integer NOT NULL,
  type text NOT NULL CHECK (type IN ('earned', 'redeemed', 'bonus', 'expired')),
  description text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_points_history_customer ON public.points_history(customer_id, created_at DESC);

ALTER TABLE public.points_history ENABLE ROW LEVEL SECURITY;

-- Customer can view own points history
CREATE POLICY "Customer view own points" ON public.points_history
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Staff can view all points
CREATE POLICY "Staff view all points" ON public.points_history
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
    OR private.has_role(auth.uid(), 'accountant'::app_role)
  );

-- Staff can manage points
CREATE POLICY "Staff manage points" ON public.points_history
  FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'developer'::app_role)
  );

-- Points settings in app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS points_per_amount integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS points_amount_unit numeric(10,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS points_redemption_rate numeric(10,2) NOT NULL DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS points_enabled boolean NOT NULL DEFAULT true;

-- Function to award points on delivery
CREATE OR REPLACE FUNCTION public.award_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _customer_id uuid;
  _points_to_add integer;
  _points_per_amount integer;
  _points_amount_unit numeric;
  _points_enabled boolean;
BEGIN
  -- Only trigger when status changes to 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    _customer_id := NEW.customer_id;
    
    IF _customer_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Get points settings
    SELECT points_per_amount, points_amount_unit, points_enabled
    INTO _points_per_amount, _points_amount_unit, _points_enabled
    FROM public.app_settings
    LIMIT 1;

    IF NOT COALESCE(_points_enabled, true) THEN
      RETURN NEW;
    END IF;

    -- Calculate points: floor(total / amount_unit) * points_per_amount
    _points_to_add := FLOOR(NEW.total / COALESCE(_points_amount_unit, 10)) * COALESCE(_points_per_amount, 1);

    IF _points_to_add > 0 THEN
      -- Add points to customer
      UPDATE public.customers
      SET points = COALESCE(points, 0) + _points_to_add
      WHERE id = _customer_id;

      -- Record in history
      INSERT INTO public.points_history (customer_id, points, type, description, reference_type, reference_id)
      VALUES (
        _customer_id,
        _points_to_add,
        'earned',
        'نقاط طلب #' || NEW.order_number,
        'order',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on orders
DROP TRIGGER IF EXISTS trg_award_loyalty_points ON public.orders;
CREATE TRIGGER trg_award_loyalty_points
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.award_loyalty_points();

-- Also award on insert if status is already delivered (edge case)
DROP TRIGGER IF EXISTS trg_award_loyalty_points_insert ON public.orders;
CREATE TRIGGER trg_award_loyalty_points_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'delivered')
  EXECUTE FUNCTION public.award_loyalty_points();

-- Function to redeem points
CREATE OR REPLACE FUNCTION public.redeem_points(
  _customer_id uuid,
  _points integer,
  _description text DEFAULT 'استبدال نقاط'
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_points integer;
  _redemption_rate numeric;
  _discount numeric;
BEGIN
  -- Get current points
  SELECT points INTO _current_points FROM public.customers WHERE id = _customer_id;
  
  IF _current_points IS NULL OR _current_points < _points THEN
    RAISE EXCEPTION 'نقاط غير كافية';
  END IF;

  -- Get redemption rate
  SELECT points_redemption_rate INTO _redemption_rate FROM public.app_settings LIMIT 1;
  _discount := _points * COALESCE(_redemption_rate, 0.1);

  -- Deduct points
  UPDATE public.customers SET points = points - _points WHERE id = _customer_id;

  -- Record in history
  INSERT INTO public.points_history (customer_id, points, type, description)
  VALUES (_customer_id, -_points, 'redeemed', _description);

  RETURN _discount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_points(uuid, integer, text) TO authenticated;
