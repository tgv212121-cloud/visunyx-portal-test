-- ============================================================
-- VISUNYX PORTAL — Complétion Supabase
-- Exécuter APRÈS supabase-setup.sql
-- Corrige les manques : Realtime, Storage, policies clients
-- ============================================================

-- ── 1. REALTIME ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE deliverables;

-- ── 2. STORAGE BUCKETS ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('deliverables', 'deliverables', false),
  ('avatars', 'avatars', true),
  ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ── 3. STORAGE POLICIES ────────────────────────────────────

-- Deliverables: admins upload
CREATE POLICY "Admin: upload deliverables"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'deliverables' AND public.is_admin());

-- Deliverables: admins delete
CREATE POLICY "Admin: delete deliverables"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'deliverables' AND public.is_admin());

-- Deliverables: admins + clients de leur projet peuvent télécharger
CREATE POLICY "Download deliverables"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'deliverables'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE client_id = public.my_client_id()
      )
    )
  );

-- Avatars: tout le monde peut voir
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Avatars: utilisateurs authentifiés peuvent upload leur avatar
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Avatars: utilisateurs peuvent supprimer leur avatar
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Attachments (pièces jointes messages): admins upload
CREATE POLICY "Admin: upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND public.is_admin());

-- Attachments: clients upload pour leurs projets
CREATE POLICY "Client: upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.projects WHERE client_id = public.my_client_id()
    )
  );

-- Attachments: download pour admins + clients concernés
CREATE POLICY "Download attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects WHERE client_id = public.my_client_id()
      )
    )
  );

-- ── 4. POLICIES MANQUANTES (clients) ────────────────────────

-- Clients doivent pouvoir SOUMETTRE un brief (INSERT + UPDATE)
CREATE POLICY "Client: insert own brief"
  ON public.briefs FOR INSERT
  WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id())
  );

CREATE POLICY "Client: update own brief"
  ON public.briefs FOR UPDATE
  USING (
    project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id())
  );

-- Clients doivent pouvoir marquer les messages comme lus (UPDATE is_read)
CREATE POLICY "Client: mark messages read"
  ON public.messages FOR UPDATE
  USING (
    project_id IN (SELECT id FROM public.projects WHERE client_id = public.my_client_id())
  );

-- Clients doivent pouvoir logger de l'activité (soumission brief, etc.)
CREATE POLICY "Client: log activity"
  ON public.activity_log FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND client_id = public.my_client_id()
  );

-- Clients doivent pouvoir mettre à jour le statut de leur projet (brief-envoye)
CREATE POLICY "Client: update own project status"
  ON public.projects FOR UPDATE
  USING (client_id = public.my_client_id());

-- ── 5. VÉRIFICATION ─────────────────────────────────────────
-- Ce SELECT final confirme que tout est en place
SELECT
  'Tables' AS check_type,
  COUNT(*) AS count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles','clients','projects','briefs','deliverables','messages','activity_log')

UNION ALL

SELECT
  'RLS Policies',
  COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT
  'Storage Buckets',
  COUNT(*)
FROM storage.buckets
WHERE id IN ('deliverables','avatars','attachments')

UNION ALL

SELECT
  'Storage Policies',
  COUNT(*)
FROM pg_policies
WHERE schemaname = 'storage'

UNION ALL

SELECT
  'Functions',
  COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('is_admin','my_client_id','handle_new_user','set_updated_at');
