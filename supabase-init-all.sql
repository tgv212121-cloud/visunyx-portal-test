-- ============================================================
-- VISUNYX PORTAL TEST — SQL complet (tout en un)
-- Exécuter dans Supabase > SQL Editor en UNE SEULE FOIS
-- ============================================================

-- ── 1. TABLES ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client', 'designer')),
  full_name   TEXT,
  email       TEXT,
  company_name TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT NOT NULL,
  contact_name    TEXT,
  contact_email   TEXT,
  phone           TEXT,
  website         TEXT,
  industry        TEXT,
  notes           TEXT,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  access_token    UUID DEFAULT gen_random_uuid(),
  auth_secret     TEXT,
  token_created_at TIMESTAMPTZ,
  consent_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  project_type TEXT DEFAULT 'branding',
  status       TEXT NOT NULL DEFAULT 'nouveau' CHECK (
    status IN ('nouveau', 'brief-envoye', 'en-cours', 'revision', 'concept-livre', 'termine')
  ),
  priority     TEXT NOT NULL DEFAULT 'normale' CHECK (
    priority IN ('basse', 'normale', 'haute', 'urgente')
  ),
  content      JSONB DEFAULT '{}',
  order_date   DATE DEFAULT CURRENT_DATE,
  due_date     DATE,
  delivered_at TIMESTAMPTZ,
  total_price  NUMERIC(10,2),
  revisions_remaining INT DEFAULT 2,
  revisions_total     INT DEFAULT 2,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.briefs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content       JSONB DEFAULT '{}',
  summary       TEXT,
  ai_brief      TEXT,
  ai_brief_designer TEXT,
  raw_form_data JSONB DEFAULT '{}',
  version       INT DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.deliverables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL DEFAULT '',
  file_size   BIGINT,
  file_type   TEXT,
  category    TEXT DEFAULT 'final',
  is_hidden   BOOLEAN DEFAULT false,
  version     INT DEFAULT 1,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  attachment_path TEXT,
  is_read         BOOLEAN DEFAULT FALSE,
  is_internal     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  details    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.project_designers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  designer_id UUID NOT NULL REFERENCES public.designers(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, designer_id)
);

-- ── 2. INDEXES ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clients_user_id      ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id   ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_messages_project_id  ON public.messages(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON public.deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_briefs_project_id    ON public.briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_project     ON public.activity_log(project_id);

-- ── 3. FUNCTIONS ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.clients WHERE user_id = auth.uid() LIMIT 1;
$$;

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

-- ── 4. TRIGGERS ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE TRIGGER trg_profiles_updated_at   BEFORE UPDATE ON public.profiles   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_clients_updated_at    BEFORE UPDATE ON public.clients     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_projects_updated_at   BEFORE UPDATE ON public.projects    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_briefs_updated_at     BEFORE UPDATE ON public.briefs      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_designers_updated_at  BEFORE UPDATE ON public.designers   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. ROW LEVEL SECURITY ───────────────────────────────────

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_designers ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Admin: full access on profiles"   ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY "User: see own profile"            ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "User: update own profile"         ON public.profiles FOR UPDATE USING (id = auth.uid());

-- Clients
CREATE POLICY "Admin: full access on clients"    ON public.clients FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own client row"       ON public.clients FOR SELECT USING (user_id = auth.uid());

-- Projects
CREATE POLICY "Admin: full access on projects"   ON public.projects FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own projects"         ON public.projects FOR SELECT USING (client_id = public.my_client_id());
CREATE POLICY "Client: update own project status" ON public.projects FOR UPDATE USING (client_id = public.my_client_id());
CREATE POLICY "Designer: read assigned projects" ON public.projects FOR SELECT USING (public.is_designer_on_project(id));

-- Briefs
CREATE POLICY "Admin: full access on briefs"     ON public.briefs FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own briefs"           ON public.briefs FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Client: insert own brief"         ON public.briefs FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Client: update own brief"         ON public.briefs FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Designer: read assigned briefs"   ON public.briefs FOR SELECT USING (public.is_designer_on_project(project_id));

-- Deliverables
CREATE POLICY "Admin: full access on deliverables" ON public.deliverables FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own deliverables"     ON public.deliverables FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Designer: read assigned deliverables" ON public.deliverables FOR SELECT USING (public.is_designer_on_project(project_id));
CREATE POLICY "Designer: upload to assigned projects" ON public.deliverables FOR INSERT WITH CHECK (public.is_designer_on_project(project_id));

-- Messages
CREATE POLICY "Admin: full access on messages"   ON public.messages FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own messages"         ON public.messages FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Client: send messages"            ON public.messages FOR INSERT WITH CHECK (sender_id = auth.uid() AND project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Client: mark messages read"       ON public.messages FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Designer: read assigned messages" ON public.messages FOR SELECT USING (public.is_designer_on_project(project_id));
CREATE POLICY "Designer: send on assigned projects" ON public.messages FOR INSERT WITH CHECK (public.is_designer_on_project(project_id));

-- Activity Log
CREATE POLICY "Admin: full access on activity"   ON public.activity_log FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own activity"         ON public.activity_log FOR SELECT USING (client_id = public.my_client_id());
CREATE POLICY "Client: log activity"             ON public.activity_log FOR INSERT WITH CHECK (user_id = auth.uid() AND client_id = public.my_client_id());
CREATE POLICY "Designer: read assigned activity" ON public.activity_log FOR SELECT USING (public.is_designer_on_project(project_id));
CREATE POLICY "Designer: log on assigned projects" ON public.activity_log FOR INSERT WITH CHECK (public.is_designer_on_project(project_id));

-- Designers
CREATE POLICY "Admin: full access designers"     ON public.designers FOR ALL USING (public.is_admin());
CREATE POLICY "Designer: read own"               ON public.designers FOR SELECT USING (profile_id = auth.uid());

-- Project Designers
CREATE POLICY "Admin: full access project_designers" ON public.project_designers FOR ALL USING (public.is_admin());
CREATE POLICY "Designer: read own assignments"   ON public.project_designers FOR SELECT USING (designer_id IN (SELECT id FROM public.designers WHERE profile_id = auth.uid()));

-- ── 6. REALTIME ─────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE deliverables;
ALTER PUBLICATION supabase_realtime ADD TABLE project_designers;

-- Set REPLICA IDENTITY FULL for realtime with RLS
ALTER TABLE messages SET REPLICA IDENTITY FULL;
ALTER TABLE projects SET REPLICA IDENTITY FULL;
ALTER TABLE deliverables SET REPLICA IDENTITY FULL;

-- ── 7. STORAGE BUCKETS ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('deliverables', 'deliverables', false),
  ('avatars', 'avatars', true),
  ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Admin: upload deliverables"   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'deliverables' AND public.is_admin());
CREATE POLICY "Admin: delete deliverables"   ON storage.objects FOR DELETE USING (bucket_id = 'deliverables' AND public.is_admin());
CREATE POLICY "Download deliverables"        ON storage.objects FOR SELECT USING (bucket_id = 'deliverables' AND (public.is_admin() OR (storage.foldername(name))[1] IN (SELECT id::text FROM public.projects WHERE client_id = public.my_client_id())));
CREATE POLICY "Anon: upload deliverables"    ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'deliverables');
CREATE POLICY "Public read avatars"          ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar"      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users delete own avatar"      ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
CREATE POLICY "Admin: upload attachments"    ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments' AND public.is_admin());
CREATE POLICY "Client: upload attachments"   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.uid() IS NOT NULL AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Download attachments"         ON storage.objects FOR SELECT USING (bucket_id = 'attachments' AND (public.is_admin() OR (storage.foldername(name))[1] IN (SELECT id::text FROM public.projects WHERE client_id = public.my_client_id())));

-- ── DONE ────────────────────────────────────────────────────
SELECT 'Setup complete!' AS status;
