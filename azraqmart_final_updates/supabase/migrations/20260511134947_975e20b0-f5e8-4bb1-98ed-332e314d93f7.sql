DO $$
DECLARE
  d1 uuid;
  d2 uuid;
BEGIN
  -- Delivery user 1
  SELECT id INTO d1 FROM auth.users WHERE email = '010000000003@phone.azraq.local';
  IF d1 IS NULL THEN
    d1 := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', d1, 'authenticated', 'authenticated',
      '010000000003@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المندوب 1','phone','010000000003','shop_name','التوصيل'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), d1,
      jsonb_build_object('sub', d1::text, 'email', '010000000003@phone.azraq.local'),
      'email', d1::text, now(), now(), now());
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('0000', gen_salt('bf')), updated_at = now() WHERE id = d1;
  END IF;
  INSERT INTO public.profiles (user_id, full_name, phone, shop_name)
    VALUES (d1, 'المندوب 1', '010000000003', 'التوصيل')
    ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET full_name='المندوب 1', phone='010000000003', is_active=true WHERE user_id = d1;
  DELETE FROM public.user_roles WHERE user_id = d1;
  INSERT INTO public.user_roles (user_id, role) VALUES (d1, 'delivery');

  -- Delivery user 2
  SELECT id INTO d2 FROM auth.users WHERE email = '010000000004@phone.azraq.local';
  IF d2 IS NULL THEN
    d2 := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', d2, 'authenticated', 'authenticated',
      '010000000004@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المندوب 2','phone','010000000004','shop_name','التوصيل'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), d2,
      jsonb_build_object('sub', d2::text, 'email', '010000000004@phone.azraq.local'),
      'email', d2::text, now(), now(), now());
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('0000', gen_salt('bf')), updated_at = now() WHERE id = d2;
  END IF;
  INSERT INTO public.profiles (user_id, full_name, phone, shop_name)
    VALUES (d2, 'المندوب 2', '010000000004', 'التوصيل')
    ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET full_name='المندوب 2', phone='010000000004', is_active=true WHERE user_id = d2;
  DELETE FROM public.user_roles WHERE user_id = d2;
  INSERT INTO public.user_roles (user_id, role) VALUES (d2, 'delivery');
END $$;