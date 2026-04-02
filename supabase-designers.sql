-- ============================================================
-- VISUNYX PORTAL — Designers Feature
-- Execute dans Supabase > SQL Editor
-- ============================================================

-- 1. Update profiles role constraint to include 'designer'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'client', 'designer'));

-- 2. Designers table
CREATE TABLE IF NOT EXISTS public.designers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  specialty TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Project-Designer junction table (many-to-many)
CREATE TABLE IF NOT EXISTS public.project_designers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  designer_id UUID NOT NULL REFERENCES public.designers(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, designer_id)
);

-- 4. Trigger updated_at on designers
CREATE OR REPLACE TRIGGER trg_designers_updated_at
  BEFORE UPDATE ON public.designers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. RLS on designers table
ALTER TABLE public.designers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin: full access designers" ON public.designers
  FOR ALL USING (public.is_admin());

CREATE POLICY "Designer: read own" ON public.designers
  FOR SELECT USING (profile_id = auth.uid());

-- 6. RLS on project_designers table
ALTER TABLE public.project_designers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin: full access project_designers" ON public.project_designers
  FOR ALL USING (public.is_admin());

CREATE POLICY "Designer: read own assignments" ON public.project_designers
  FOR SELECT USING (
    designer_id IN (SELECT id FROM public.designers WHERE profile_id = auth.uid())
  );

-- 7. Helper function: check if user is a designer assigned to a project
CREATE OR REPLACE FUNCTION public.is_designer_on_project(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_designers pd
    JOIN public.designers d ON d.id = pd.designer_id
    WHERE pd.project_id = p_project_id
    AND d.profile_id = auth.uid()
    AND d.is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 8. Add designer access to existing tables (SELECT only for assigned projects)

-- Projects: designer can see assigned projects
CREATE POLICY "Designer: read assigned projects" ON public.projects
  FOR SELECT USING (public.is_designer_on_project(id));

-- Briefs: designer can see briefs of assigned projects
CREATE POLICY "Designer: read assigned briefs" ON public.briefs
  FOR SELECT USING (public.is_designer_on_project(project_id));

-- Deliverables: designer can read + insert on assigned projects
CREATE POLICY "Designer: read assigned deliverables" ON public.deliverables
  FOR SELECT USING (public.is_designer_on_project(project_id));

CREATE POLICY "Designer: upload to assigned projects" ON public.deliverables
  FOR INSERT WITH CHECK (public.is_designer_on_project(project_id));

-- Messages: designer can read + send on assigned projects
CREATE POLICY "Designer: read assigned messages" ON public.messages
  FOR SELECT USING (public.is_designer_on_project(project_id));

CREATE POLICY "Designer: send on assigned projects" ON public.messages
  FOR INSERT WITH CHECK (public.is_designer_on_project(project_id));

-- Activity log: designer can read + insert on assigned projects
CREATE POLICY "Designer: read assigned activity" ON public.activity_log
  FOR SELECT USING (public.is_designer_on_project(project_id));

CREATE POLICY "Designer: log on assigned projects" ON public.activity_log
  FOR INSERT WITH CHECK (public.is_designer_on_project(project_id));

-- 9. Realtime for project_designers
ALTER PUBLICATION supabase_realtime ADD TABLE project_designers;
