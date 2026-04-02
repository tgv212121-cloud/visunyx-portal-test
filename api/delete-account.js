const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const allowedOrigins = ['https://visunyx-portal.vercel.app', 'https://www.visunyx.com'];
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : 'https://visunyx-portal.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verify caller is admin via their JWT
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorise' });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: caller }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !caller) return res.status(401).json({ error: 'Session invalide' });

  const { data: callerProfile } = await db.from('profiles').select('role').eq('id', caller.id).single();
  if (callerProfile?.role !== 'admin' && callerProfile?.role !== 'developer') {
    return res.status(403).json({ error: 'Acces reserve aux administrateurs' });
  }

  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id requis' });

  // Prevent self-deletion
  if (user_id === caller.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }

  try {
    // Get profile to know the role
    const { data: profile } = await db.from('profiles').select('role, email').eq('id', user_id).single();
    if (!profile) return res.status(404).json({ error: 'Utilisateur introuvable' });

    // Delete role-specific data
    if (profile.role === 'client') {
      // Find client row linked to this user
      const { data: client } = await db.from('clients').select('id').eq('user_id', user_id).single();
      if (client) {
        // Delete all projects + related data
        const { data: projects } = await db.from('projects').select('id').eq('client_id', client.id);
        for (const p of (projects || [])) {
          await db.from('briefs').delete().eq('project_id', p.id);
          await db.from('deliverables').delete().eq('project_id', p.id);
          await db.from('messages').delete().eq('project_id', p.id);
          await db.from('activity_log').delete().eq('project_id', p.id);
          await db.from('project_designers').delete().eq('project_id', p.id);
          await db.from('projects').delete().eq('id', p.id);
        }
        await db.from('activity_log').delete().eq('client_id', client.id);
        await db.from('clients').delete().eq('id', client.id);
      }
    } else if (profile.role === 'designer') {
      // Find designer row linked to this user
      const { data: designer } = await db.from('designers').select('id').eq('profile_id', user_id).single();
      if (designer) {
        await db.from('project_designers').delete().eq('designer_id', designer.id);
        await db.from('designers').delete().eq('id', designer.id);
      }
    }

    // Delete messages sent by this user
    await db.from('messages').delete().eq('sender_id', user_id);
    // Delete activity logged by this user
    await db.from('activity_log').delete().eq('user_id', user_id);
    // Delete profile
    await db.from('profiles').delete().eq('id', user_id);
    // Delete auth user (frees up the email)
    const { error: delErr } = await db.auth.admin.deleteUser(user_id);
    if (delErr) throw delErr;

    return res.status(200).json({ success: true, deleted_email: profile.email });

  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};
