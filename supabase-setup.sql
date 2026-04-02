-- ============================================================
-- VISUNYX PORTAL — Supabase Setup SQL
-- Coller et exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- ── 1. PROFILES (étend auth.users) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  full_name   TEXT,
  email       TEXT,
  company_name TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. CLIENTS ───────────────────────────────────────────────
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
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. PROJECTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  project_type TEXT DEFAULT 'branding',
  status       TEXT NOT NULL DEFAULT 'nouveau' CHECK (
    status IN ('nouveau', 'brief-envoye', 'en-cours', 'revision', 'livre', 'termine')
  ),
  priority     TEXT NOT NULL DEFAULT 'normale' CHECK (
    priority IN ('basse', 'normale', 'haute', 'urgente')
  ),
  order_date   DATE DEFAULT CURRENT_DATE,
  due_date     DATE,
  delivered_at TIMESTAMPTZ,
  total_price  NUMERIC(10,2),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. BRIEFS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.briefs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content       JSONB DEFAULT '{}',
  summary       TEXT,
  raw_form_data JSONB DEFAULT '{}',
  version       INT DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. DELIVERABLES (fichiers) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.deliverables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   BIGINT,
  file_type   TEXT,
  category    TEXT DEFAULT 'final' CHECK (
    category IN ('logo', 'mockup', 'final', 'source', 'autre')
  ),
  version     INT DEFAULT 1,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. MESSAGES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  attachment_path TEXT,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. ACTIVITY LOG ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  details    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_user_id      ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id   ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_messages_project_id  ON public.messages(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON public.deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_briefs_project_id    ON public.briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_project     ON public.activity_log(project_id);

-- ── TRIGGER: auto-create profile on signup ───────────────────
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── TRIGGER: updated_at auto-update ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated_at   BEFORE UPDATE ON public.profiles   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clients_updated_at    BEFORE UPDATE ON public.clients     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_projects_updated_at   BEFORE UPDATE ON public.projects    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_briefs_updated_at     BEFORE UPDATE ON public.briefs      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper: get client_id linked to current user
CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.clients WHERE user_id = auth.uid() LIMIT 1;
$$;

-- PROFILES policies
CREATE POLICY "Admin: full access on profiles"   ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY "User: see own profile"            ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "User: update own profile"         ON public.profiles FOR UPDATE USING (id = auth.uid());

-- CLIENTS policies
CREATE POLICY "Admin: full access on clients"    ON public.clients FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own client row"       ON public.clients FOR SELECT USING (user_id = auth.uid());

-- PROJECTS policies
CREATE POLICY "Admin: full access on projects"   ON public.projects FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own projects"         ON public.projects FOR SELECT
  USING (client_id = public.my_client_id());

-- BRIEFS policies
CREATE POLICY "Admin: full access on briefs"     ON public.briefs FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own briefs"           ON public.briefs FOR SELECT
  USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));

-- DELIVERABLES policies
CREATE POLICY "Admin: full access on deliverables" ON public.deliverables FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own deliverables"     ON public.deliverables FOR SELECT
  USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));

-- MESSAGES policies
CREATE POLICY "Admin: full access on messages"   ON public.messages FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own messages"         ON public.messages FOR SELECT
  USING (project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id()));
CREATE POLICY "Client: send messages"            ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id())
  );

-- ACTIVITY LOG policies
CREATE POLICY "Admin: full access on activity"   ON public.activity_log FOR ALL USING (public.is_admin());
CREATE POLICY "Client: see own activity"         ON public.activity_log FOR SELECT
  USING (client_id = public.my_client_id());

-- ── REALTIME ─────────────────────────────────────────────────
-- Activer Realtime dans Dashboard > Database > Replication
-- pour les tables: messages, projects, deliverables

-- ── STORAGE BUCKETS ──────────────────────────────────────────
-- Créer manuellement dans Storage :
-- 1. "deliverables" (private)
-- 2. "avatars" (public)
-- 3. "attachments" (private)
--
-- Puis ajouter ces policies sur le bucket "deliverables":
-- INSERT: is_admin() = true
-- SELECT: is_admin() OR (project_id folder matches client's projects)

-- ── ADMIN USER ───────────────────────────────────────────────
-- Après avoir créé un compte via login.html, mettre à jour son role :
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'ton@email.com';
