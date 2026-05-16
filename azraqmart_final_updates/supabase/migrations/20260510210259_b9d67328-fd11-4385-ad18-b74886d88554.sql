
-- Create users with phone-based fake emails and password '0000'
DO $$
DECLARE
  admin_id uuid;
  wh_id uuid;
  dev_id uuid;
BEGIN
  -- Admin
  SELECT id INTO admin_id FROM auth.users WHERE email = '01000000001@phone.azraq.local';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      '01000000001@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المدير','phone','01000000001','shop_name','الإدارة'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', '01000000001@phone.azraq.local'),
      'email', admin_id::text, now(), now(), now());
  END IF;
  DELETE FROM public.user_roles WHERE user_id = admin_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin');

  -- Warehouse
  SELECT id INTO wh_id FROM auth.users WHERE email = '01000000002@phone.azraq.local';
  IF wh_id IS NULL THEN
    wh_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', wh_id, 'authenticated', 'authenticated',
      '01000000002@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','أمين المخزن','phone','01000000002','shop_name','المخزن'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), wh_id,
      jsonb_build_object('sub', wh_id::text, 'email', '01000000002@phone.azraq.local'),
      'email', wh_id::text, now(), now(), now());
  END IF;
  DELETE FROM public.user_roles WHERE user_id = wh_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (wh_id, 'warehouse');

  -- Developer
  SELECT id INTO dev_id FROM auth.users WHERE email = '01153338337@phone.azraq.local';
  IF dev_id IS NULL THEN
    dev_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', dev_id, 'authenticated', 'authenticated',
      '01153338337@phone.azraq.local', crypt('0000', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','المطور','phone','01153338337','shop_name','التطوير'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), dev_id,
      jsonb_build_object('sub', dev_id::text, 'email', '01153338337@phone.azraq.local'),
      'email', dev_id::text, now(), now(), now());
  END IF;
  DELETE FROM public.user_roles WHERE user_id = dev_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (dev_id, 'developer');
END $$;
