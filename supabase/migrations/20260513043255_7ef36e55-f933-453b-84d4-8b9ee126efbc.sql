-- Deduplicate customers per user_id: keep latest row, repoint orders/welcome_messages
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
),
canonical AS (
  SELECT user_id, id AS keep_id FROM ranked WHERE rn = 1
),
to_remove AS (
  SELECT r.id AS dup_id, c.keep_id
  FROM ranked r JOIN canonical c USING (user_id)
  WHERE r.rn > 1
)
UPDATE public.orders o
SET customer_id = tr.keep_id
FROM to_remove tr
WHERE o.customer_id = tr.dup_id;

WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
),
canonical AS (
  SELECT user_id, id AS keep_id FROM ranked WHERE rn = 1
),
to_remove AS (
  SELECT r.id AS dup_id, c.keep_id
  FROM ranked r JOIN canonical c USING (user_id)
  WHERE r.rn > 1
)
UPDATE public.welcome_messages w
SET target_customer_id = tr.keep_id
FROM to_remove tr
WHERE w.target_customer_id = tr.dup_id;

-- Delete the duplicate customer rows
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
)
DELETE FROM public.customers WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Prevent duplicates going forward
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_unique
  ON public.customers (user_id) WHERE user_id IS NOT NULL;