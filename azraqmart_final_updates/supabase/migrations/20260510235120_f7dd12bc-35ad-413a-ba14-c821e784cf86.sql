
-- Allow anonymous (storefront) visitors to read active categories & products
DROP POLICY IF EXISTS "Anyone read categories" ON public.categories;
CREATE POLICY "Public read active categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated read products" ON public.products;
CREATE POLICY "Public read active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Seed demo products across the 5 main categories
WITH cats AS (
  SELECT id, name FROM public.categories WHERE parent_id IS NULL
)
INSERT INTO public.products (name, brand, category_id, unit_price, carton_price, stock_qty, image_url, is_active)
SELECT * FROM (VALUES
  ('أرز مصري فاخر 1كجم', 'الدوحة', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 38, 900, 120, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400', true),
  ('سكر أبيض ناعم 1كجم', 'السكر المصري', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 32, 760, 200, 'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=400', true),
  ('زيت عباد الشمس 1.5لتر', 'كريستال', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 95, 1100, 80, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400', true),
  ('مكرونة سباجيتي 400جم', 'الملكة', (SELECT id FROM cats WHERE name='بقالة وأطعمة'), 18, 425, 150, 'https://images.unsplash.com/photo-1551462147-37885acc36f1?w=400', true),
  ('شاي العروسة 250جم', 'العروسة', (SELECT id FROM cats WHERE name='مشروبات'), 65, 770, 90, 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=400', true),
  ('قهوة سريعة الذوبان 200جم', 'نسكافيه', (SELECT id FROM cats WHERE name='مشروبات'), 185, 2200, 60, 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400', true),
  ('عصير مانجو 1لتر', 'جهينة', (SELECT id FROM cats WHERE name='مشروبات'), 28, 660, 110, 'https://images.unsplash.com/photo-1546173159-315724a31696?w=400', true),
  ('بيبسي 1لتر', 'بيبسي', (SELECT id FROM cats WHERE name='مشروبات'), 22, 520, 180, 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400', true),
  ('مسحوق غسيل أوتوماتيك 3كجم', 'بيرسيل', (SELECT id FROM cats WHERE name='منظفات وأدوات منزلية'), 220, 1300, 45, 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=400', true),
  ('سائل تنظيف الأطباق 750مل', 'فيري', (SELECT id FROM cats WHERE name='منظفات وأدوات منزلية'), 45, 530, 100, 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400', true),
  ('مطهر أرضيات 1لتر', 'ديتول', (SELECT id FROM cats WHERE name='منظفات وأدوات منزلية'), 70, 825, 75, 'https://images.unsplash.com/photo-1585672840563-f2af2d50a1ad?w=400', true),
  ('شامبو 400مل', 'هيد آند شولدرز', (SELECT id FROM cats WHERE name='عناية شخصية'), 110, 1300, 65, 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400', true),
  ('معجون أسنان 100مل', 'سيجنال', (SELECT id FROM cats WHERE name='عناية شخصية'), 38, 450, 140, 'https://images.unsplash.com/photo-1559591935-c6c92c6cd3f9?w=400', true),
  ('صابون استحمام 175جم', 'لوكس', (SELECT id FROM cats WHERE name='عناية شخصية'), 22, 260, 200, 'https://images.unsplash.com/photo-1607006333439-505849ef4f76?w=400', true),
  ('مزيل عرق 150مل', 'نيفيا', (SELECT id FROM cats WHERE name='عناية شخصية'), 75, 880, 85, 'https://images.unsplash.com/photo-1585104370307-5d8f15b3e8e4?w=400', true),
  ('حليب طويل الأجل 1لتر', 'المراعي', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 42, 990, 95, 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400', true),
  ('جبن أبيض 500جم', 'دومتي', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 78, 920, 50, 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400', true),
  ('زبادي طبيعي 170جم', 'جهينة', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 12, 280, 220, 'https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=400', true),
  ('بيض بلدي 30 بيضة', 'مزرعة الفجر', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 165, 1900, 40, 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400', true),
  ('زبدة طبيعية 200جم', 'لورباك', (SELECT id FROM cats WHERE name='ألبان ومجمدات'), 95, 1120, 55, 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400', true)
) AS v(name, brand, category_id, unit_price, carton_price, stock_qty, image_url, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.products LIMIT 1);
