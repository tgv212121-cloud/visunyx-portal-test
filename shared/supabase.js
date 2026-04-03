// ============================================================
// VISUNYX PORTAL — Supabase Client & Auth Helpers
// ============================================================
// Remplacer VOTRE_SUPABASE_URL et VOTRE_ANON_KEY
// par les valeurs trouvées dans Settings > API de votre projet Supabase
// ============================================================

const SUPABASE_URL  = 'https://nokrexfszurxxuspvbjd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5va3JleGZzenVyeHh1c3B2YmpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzczNjEsImV4cCI6MjA5MDcxMzM2MX0.8yvbsHLRvGRvNGxFOXiAbGKuegm_e78RXXyZAWtPr10';
const API_SECRET = 'vx-sec-8f3k2m9p4w7q1r6t5y0u';

// ── Init ────────────────────────────────────────────────────
const { createClient } = supabase;

const _isConfigured = SUPABASE_URL !== 'VOTRE_SUPABASE_URL' && SUPABASE_ANON !== 'VOTRE_ANON_KEY';

let db;
try {
  db = createClient(
    _isConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
    _isConfigured ? SUPABASE_ANON : 'placeholder-anon-key',
    { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } }
  );
} catch(e) {
  console.warn('[Visunyx] Supabase non configuré — remplacez VOTRE_SUPABASE_URL et VOTRE_ANON_KEY dans shared/supabase.js');
  db = null;
}

// ── Auth helpers ─────────────────────────────────────────────

// Caches for same-page-load performance
let _userCache = null;
let _userCachePromise = null;
const _profileCache = {};

// ── SessionStorage auth cache (cross-page, same tab) ────────
const _AUTH_CACHE_KEY = 'vx_auth_cache';
const _AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function _getSessionAuthCache() {
  try {
    const raw = sessionStorage.getItem(_AUTH_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached._authTimestamp > _AUTH_CACHE_TTL) {
      sessionStorage.removeItem(_AUTH_CACHE_KEY);
      return null;
    }
    return cached;
  } catch(e) { return null; }
}

function _setSessionAuthCache(user, profile) {
  try {
    sessionStorage.setItem(_AUTH_CACHE_KEY, JSON.stringify({
      user, profile, _authTimestamp: Date.now()
    }));
  } catch(e) { /* quota exceeded or private mode — ignore */ }
}

function _clearSessionAuthCache() {
  try { sessionStorage.removeItem(_AUTH_CACHE_KEY); } catch(e) {}
}

function clearProfileCache(userId) {
  if (userId) { delete _profileCache[userId]; }
  else { for (const k in _profileCache) delete _profileCache[k]; }
}

function clearAuthCache() {
  _userCache = null;
  _userCachePromise = null;
  _clearSessionAuthCache();
}

async function getUser() {
  if (!db || !_isConfigured) return null;
  if (_userCache) return _userCache;

  // Try sessionStorage cache first for instant cross-page loads
  const cached = _getSessionAuthCache();
  if (cached?.user) {
    _userCache = cached.user;
    if (cached.profile) _profileCache[cached.user.id] = cached.profile;
    // Background refresh: update cache silently without blocking
    _refreshUserInBackground();
    return cached.user;
  }

  if (_userCachePromise) return _userCachePromise;
  _userCachePromise = (async () => {
    try {
      const { data: { user } } = await db.auth.getUser();
      _userCache = user;
      return user;
    } catch(e) { return null; }
    finally { _userCachePromise = null; }
  })();
  return _userCachePromise;
}

/** Silently refresh auth data in background and update caches */
function _refreshUserInBackground() {
  if (!db || !_isConfigured) return;
  db.auth.getUser().then(({ data: { user } }) => {
    if (user) {
      _userCache = user;
      // Also refresh profile in background
      db.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          _profileCache[user.id] = data;
          _setSessionAuthCache(user, data);
        }
      });
    } else {
      // Session expired — clear everything
      clearAuthCache();
    }
  }).catch(() => {});
}

async function getProfile(userId) {
  if (_profileCache[userId]) return _profileCache[userId];
  const { data } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (data) {
    _profileCache[userId] = data;
    // Update sessionStorage cache with profile
    const cached = _getSessionAuthCache();
    if (cached?.user?.id === userId) {
      _setSessionAuthCache(cached.user, data);
    }
  }
  return data;
}

async function updateProfile(userId, payload) {
  const { data, error } = await db.from('profiles').update(payload).eq('id', userId).select().single();
  if (error) throw error;
  return data;
}

async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${userId}/avatar.${ext}`;
  const { error: upErr } = await db.storage.from('avatars').upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = db.storage.from('avatars').getPublicUrl(path);
  const url = data.publicUrl + '?t=' + Date.now();
  await updateProfile(userId, { avatar_url: url });
  return url;
}

/**
 * Vérifie la session + le rôle. Redirige vers /login si non autorisé.
 * @param {string[]} allowedRoles - ex: ['admin'] ou ['client'] ou ['admin','client']
 * @returns {{ user, profile }} si autorisé
 */
async function requireAuth(allowedRoles = ['developer', 'admin', 'client', 'designer']) {
  // Magic link: auto-login via ?token= parameter
  const urlToken = new URLSearchParams(window.location.search).get('token');
  if (urlToken) {
    const existingUser = await getUser();
    if (!existingUser) {
      try {
        const res = await fetch(rootPath() + 'api/magic-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: urlToken })
        });
        const result = await res.json();
        if (result.session) {
          await db.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token
          });
        }
      } catch (e) { console.log('Magic login failed:', e); }
    }
    // Clean up URL
    const url = new URL(window.location);
    url.searchParams.delete('token');
    history.replaceState(null, '', url);
  }

  const user = await getUser();
  if (!user) {
    window.location.href = rootPath() + 'login.html';
    return null;
  }
  const profile = await getProfile(user.id);
  if (!profile || !allowedRoles.includes(profile.role)) {
    if (profile?.role === 'developer' || profile?.role === 'admin') {
      window.location.href = rootPath() + 'admin/index.html';
    } else if (profile?.role === 'designer') {
      window.location.href = rootPath() + 'designer/index.html';
    } else {
      window.location.href = rootPath() + 'client/index.html';
    }
    return null;
  }
  // Cache auth data in sessionStorage for faster subsequent page loads
  _setSessionAuthCache(user, profile);

  return { user, profile };
}

/** Verifie si le role a des droits admin (developer ou admin) */
function isAdminRole(role) {
  return role === 'developer' || role === 'admin';
}

/**
 * Change le role d'un utilisateur. Respect de la hierarchie :
 * - developer peut assigner: admin, designer, client
 * - admin peut assigner: designer, client (pas developer, pas modifier un developer)
 */
async function changeUserRole(targetUserId, newRole, callerRole) {
  // Hierarchie
  if (callerRole === 'admin') {
    if (newRole === 'developer') throw new Error('Un admin ne peut pas attribuer le role developpeur');
    // Verifier que la cible n'est pas developer
    const target = await getProfile(targetUserId);
    if (target?.role === 'developer') throw new Error('Un admin ne peut pas modifier un developpeur');
  }
  const { data, error } = await db.from('profiles').update({ role: newRole }).eq('id', targetUserId).select().single();
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signInMagicLink(email) {
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + '/client/index.html' }
  });
  if (error) throw error;
}

async function signInWithGoogle() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/login.html' }
  });
  if (error) throw error;
}

async function signOut() {
  clearAuthCache();
  await db.auth.signOut();
  window.location.href = rootPath() + 'login.html';
}

// ── DEV BANNER ──────────────────────────────────────────────
// Bandeau visible uniquement sur les preview deployments Vercel
(function() {
  const host = window.location.hostname;
  const isVercelPreview = host.includes('vercel.app') && host !== 'visunyx-portal.vercel.app';
  if (!isVercelPreview) return;
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.id = 'dev-banner';
    banner.innerHTML = '\u26A0\uFE0F ENVIRONNEMENT DEV \u2014 Preview deployment';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(90deg,#F59E0B,#EF4444);color:#fff;text-align:center;font-size:11px;font-weight:700;letter-spacing:0.05em;padding:5px 0;font-family:Plus Jakarta Sans,-apple-system,BlinkMacSystemFont,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,0.3);';
    document.body.prepend(banner);
  });
})();

// ── Helpers ──────────────────────────────────────────────────

/** Retourne le chemin racine relatif depuis la page courante */
function rootPath() {
  const depth = window.location.pathname.split('/').filter(Boolean).length;
  if (depth <= 1) return './';
  return '../';
}

/** Formate une date selon la langue */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const locale = getLang() === 'en' ? 'en-US' : 'fr-FR';
  return new Date(dateStr).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

/** Formate une date+heure selon la langue */
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const locale = getLang() === 'en' ? 'en-US' : 'fr-FR';
  return new Date(dateStr).toLocaleString(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

/** Formate un prix */
function formatPrice(amount) {
  if (!amount) return '-';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR'
  }).format(amount);
}

/** Formate la taille d'un fichier */
function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / 1048576).toFixed(1) + ' Mo';
}

/** Retourne les initiales d'un nom */
function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/** Retourne le label traduit d'un statut */
function getStatusLabels() {
  return {
    'nouveau':      tStatus('nouveau'),
    'brief-envoye': tStatus('brief-envoye'),
    'en-cours':     tStatus('en-cours'),
    'revision':     tStatus('revision'),
    'livre':        tStatus('livre'),
    'termine':      tStatus('termine')
  };
}
// Keep backward compat — some code references STATUS_LABELS directly
const STATUS_LABELS = {
  'nouveau': 'Nouveau', 'brief-envoye': 'Formulaire envoyé',
  'en-cours': 'En cours', 'revision': 'Révision', 'livre': 'Livré', 'termine': 'Terminé'
};

function getPriorityLabels() {
  return {
    'basse': tPriority('basse'), 'normale': tPriority('normale'),
    'haute': tPriority('haute'), 'urgente': tPriority('urgente')
  };
}
const PRIORITY_LABELS = {
  'basse': 'Basse', 'normale': 'Normale', 'haute': 'Haute', 'urgente': 'Urgente'
};

/** Récupère une URL signée depuis Supabase Storage */
async function getFileUrl(bucket, path, expiresIn = 3600) {
  const { data } = await db.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  return data?.signedUrl || null;
}

/** Nettoie un nom de fichier pour le stockage (retire accents, espaces, caracteres speciaux) */
function sanitizeFileName(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/['']/g, '')                              // remove apostrophes
    .replace(/\s+/g, '_')                              // spaces to underscores
    .replace(/[^a-zA-Z0-9_.\-]/g, '')                  // keep only safe chars
    .replace(/__+/g, '_');                              // collapse multiple underscores
}

/** Upload un fichier vers Supabase Storage */
async function uploadFile(bucket, path, file, onProgress) {
  const { data, error } = await db.storage
    .from(bucket)
    .upload(path, file, { upsert: true });
  if (error) throw error;
  return data;
}

/** Lecture des paramètres URL */
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

/** Navigation programmatique */
function navigate(path) {
  window.location.href = rootPath() + path;
}

// ── DB Queries ───────────────────────────────────────────────

const API = {

  // Clients
  async getClients() {
    const { data, error } = await db.from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getClient(id) {
    const { data, error } = await db.from('clients').select('*, projects(*)').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async createClient(payload) {
    const { data, error } = await db.from('clients').insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async updateClient(id, payload) {
    const { data, error } = await db.from('clients').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // Projects
  async getProjects(filters = {}) {
    let q = db.from('projects')
      .select('*, clients(company_name, contact_name, contact_email)')
      .order('created_at', { ascending: false });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.client_id) q = q.eq('client_id', filters.client_id);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async getProject(id) {
    const { data, error } = await db
      .from('projects')
      .select('*, clients(company_name, contact_name, contact_email, phone, website)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createProject(payload) {
    const { data, error } = await db.from('projects').insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async updateProject(id, payload) {
    const { data, error } = await db.from('projects').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteProject(id) {
    // Delete related data first (briefs, deliverables, messages, activity, designer assignments)
    await db.from('briefs').delete().eq('project_id', id);
    await db.from('deliverables').delete().eq('project_id', id);
    await db.from('messages').delete().eq('project_id', id);
    await db.from('activity_log').delete().eq('project_id', id);
    await db.from('project_designers').delete().eq('project_id', id);
    const { error } = await db.from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteClient(id) {
    // Get all projects for this client, then delete them
    const { data: projects } = await db.from('projects').select('id').eq('client_id', id);
    for (const p of (projects || [])) {
      await API.deleteProject(p.id);
    }
    await db.from('activity_log').delete().eq('client_id', id);
    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) throw error;
  },

  // Briefs
  async getBrief(projectId) {
    const { data } = await db.from('briefs').select('*').eq('project_id', projectId).order('version', { ascending: false }).limit(1).single();
    return data;
  },

  async saveBrief(projectId, payload) {
    const existing = await API.getBrief(projectId);
    if (existing) {
      const { data, error } = await db.from('briefs').update(payload).eq('id', existing.id).select().single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await db.from('briefs').insert({ project_id: projectId, ...payload }).select().single();
      if (error) throw error;
      return data;
    }
  },

  // Deliverables
  async getDeliverables(projectId) {
    const { data, error } = await db.from('deliverables').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createDeliverable(payload) {
    const { data, error } = await db.from('deliverables').insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async deleteDeliverable(id, filePath) {
    if (filePath) await db.storage.from('deliverables').remove([filePath]);
    const { error } = await db.from('deliverables').delete().eq('id', id);
    if (error) throw error;
  },

  // Messages
  async getMessages(projectId) {
    const { data, error } = await db
      .from('messages')
      .select('*, profiles(full_name, role, avatar_url)')
      .eq('project_id', projectId)
      .or('is_internal.is.null,is_internal.eq.false')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async sendMessage(payload) {
    const { data, error } = await db.from('messages').insert(payload).select('*, profiles(full_name, role, avatar_url)').single();
    if (error) throw error;
    return data;
  },

  async markMessagesRead(projectId, userId) {
    await db.from('messages')
      .update({ is_read: true })
      .eq('project_id', projectId)
      .neq('sender_id', userId);
  },

  async getUnreadCount(userId) {
    const profile = await getProfile(userId);
    if (profile?.role === 'admin') {
      const { count } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('is_read', false);
      return count || 0;
    }
    return 0;
  },

  // Activity log
  async getActivity(filters = {}) {
    let q = db.from('activity_log')
      .select('*, profiles(full_name, role)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (filters.project_id) q = q.eq('project_id', filters.project_id);
    if (filters.client_id)  q = q.eq('client_id', filters.client_id);
    const { data } = await q;
    return data || [];
  },

  async logActivity(payload) {
    await db.from('activity_log').insert(payload);
  },

  // Stats (admin)
  async getStats() {
    const user = await getUser();
    const [
      { count: totalClients },
      { count: activeProjects },
      { count: deliveredProjects },
      { count: unreadMessages }
    ] = await Promise.all([
      db.from('clients').select('*', { count: 'exact', head: true }),
      db.from('projects').select('*', { count: 'exact', head: true }).in('status', ['en-cours', 'revision', 'brief-envoye']),
      db.from('projects').select('*', { count: 'exact', head: true }).in('status', ['livre', 'termine']),
      db.from('messages').select('*', { count: 'exact', head: true }).eq('is_read', false).neq('sender_id', user?.id || '')
    ]);

    return { totalClients, activeProjects, deliveredProjects, unreadMessages };
  },

  // Invite client to portal (magic link via OTP — works with anon key)
  async inviteClient(email, fullName, companyName) {
    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + '/client/index.html',
        data: { full_name: fullName, company_name: companyName }
      }
    });
    if (error) throw error;
  },

  // ── Designers ────────────────────────────────────────────
  async getDesigners() {
    const { data, error } = await db.from('designers').select('*, profiles(full_name, avatar_url)').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getDesigner(id) {
    const { data, error } = await db.from('designers').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async createDesigner(payload) {
    const { data, error } = await db.from('designers').insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async updateDesigner(id, payload) {
    const { data, error } = await db.from('designers').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteDesigner(id) {
    const { error } = await db.from('designers').delete().eq('id', id);
    if (error) throw error;
  },

  // Project-Designer assignments
  async getProjectDesigners(projectId) {
    const { data, error } = await db.from('project_designers')
      .select('*, designers(id, full_name, email, specialty, is_active)')
      .eq('project_id', projectId);
    if (error) throw error;
    return data;
  },

  async assignDesigner(projectId, designerId) {
    const { data, error } = await db.from('project_designers')
      .insert({ project_id: projectId, designer_id: designerId })
      .select('*, designers(full_name, email)')
      .single();
    if (error) throw error;
    return data;
  },

  async removeDesignerFromProject(projectId, designerId) {
    const { error } = await db.from('project_designers')
      .delete()
      .eq('project_id', projectId)
      .eq('designer_id', designerId);
    if (error) throw error;
  },

  // Get projects assigned to current designer
  async getMyDesignerProjects(userId) {
    const { data: designer } = await db.from('designers').select('id').eq('profile_id', userId).single();
    if (!designer) return [];
    const { data, error } = await db.from('project_designers')
      .select('project_id, assigned_at, projects(*, clients(company_name, contact_name))')
      .eq('designer_id', designer.id);
    if (error) throw error;
    return (data || []).map(d => ({ ...d.projects, assigned_at: d.assigned_at }));
  },

  // ── Delete Account (admin only, via serverless) ─────────
  async deleteAccount(userId) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('Non connecte');
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ user_id: userId })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur suppression');
    return result;
  },

  // ── Typing Presence ──────────────────────────────────────
  /**
   * Initialise le canal Presence pour le typing indicator sur un projet.
   * @param {string} projectId
   * @param {string} userId
   * @param {string} userName
   * @param {function} onTypingChange - callback({typingUsers: [{id, name}]})
   * @returns {{ sendTyping, destroy }} - fonctions pour signaler une frappe et détruire le canal
   */
  initTypingPresence(projectId, userId, userName, onTypingChange) {
    const channelName = `typing-${projectId}`;
    const channel = db.channel(channelName, { config: { presence: { key: userId } } });

    let _typingTimeout = null;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typingUsers = [];
        for (const [key, presences] of Object.entries(state)) {
          for (const p of presences) {
            if (p.is_typing && key !== userId) {
              typingUsers.push({ id: key, name: p.name || 'Quelqu\'un' });
            }
          }
        }
        onTypingChange({ typingUsers });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ is_typing: false, name: userName });
        }
      });

    return {
      /** Appeler quand l'utilisateur tape. Auto-reset après 2s d'inactivité. */
      async sendTyping() {
        try {
          await channel.track({ is_typing: true, name: userName });
          clearTimeout(_typingTimeout);
          _typingTimeout = setTimeout(async () => {
            try { await channel.track({ is_typing: false, name: userName }); } catch(e) {}
          }, 2000);
        } catch(e) {}
      },
      /** Détruire le canal (cleanup) */
      destroy() {
        clearTimeout(_typingTimeout);
        db.removeChannel(channel);
      }
    };
  },

  // Invite designer to portal
  async inviteDesigner(email, fullName) {
    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + '/designer/index.html',
        data: { full_name: fullName, role: 'designer' }
      }
    });
    if (error) throw error;
  }
};
