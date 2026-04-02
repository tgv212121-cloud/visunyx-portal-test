-- ============================================================
-- MIGRATION: Add 'developer' role
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Remove old CHECK constraint on profiles.role and add new one with 'developer'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('developer', 'admin', 'client', 'designer'));

-- 2. Update is_admin() to also recognize 'developer' role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'developer')
  );
$$;

-- 3. Set your account as developer (replace with your email)
-- UPDATE public.profiles SET role = 'developer' WHERE email = 'visunyx@gmail.com';
