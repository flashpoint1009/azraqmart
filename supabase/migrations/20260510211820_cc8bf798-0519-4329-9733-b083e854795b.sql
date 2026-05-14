DROP POLICY IF EXISTS "Public read app assets" ON storage.objects;
CREATE POLICY "Public read direct app assets"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'app-assets'
  AND (
    name = 'logo.png'
    OR name LIKE 'branding/%'
    OR name LIKE 'logos/%'
  )
);

DROP POLICY IF EXISTS "Developer upload app assets" ON storage.objects;
CREATE POLICY "Developer upload app assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Developer update app assets" ON storage.objects;
CREATE POLICY "Developer update app assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
)
WITH CHECK (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Developer delete app assets" ON storage.objects;
CREATE POLICY "Developer delete app assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'app-assets'
  AND private.has_role(auth.uid(), 'developer'::public.app_role)
);