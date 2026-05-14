
UPDATE auth.users
SET encrypted_password = crypt('383100', gen_salt('bf')),
    updated_at = now()
WHERE email IN (
  '01000000001@phone.azraq.local',
  '01000000002@phone.azraq.local',
  '01153338337@phone.azraq.local'
);
