const { createClient } = require('@supabase/supabase-js');

// Rate limiting
const _rateLimit = new Map();
function checkRate(ip, max, windowMs) {
  const now = Date.now();
  const hits = (_rateLimit.get(ip) || []).filter(t => t > now - windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  _rateLimit.set(ip, hits);
  return true;
}

module.exports = async (req, res) => {
  // CORS restriction
  const allowedOrigins = ['https://visunyx-portal.vercel.app', 'https://www.visunyx.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://visunyx-portal.vercel.app');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 10 requests per hour per IP
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRate(ip, 10, 3600000)) return res.status(429).json({ error: 'Too many requests' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Find client by access_token
    const { data: client, error: findErr } = await db
      .from('clients')
      .select('id, contact_email, auth_secret, user_id, token_created_at')
      .eq('access_token', token)
      .single();

    if (findErr || !client) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    // Check token expiration (7 days)
    if (client.token_created_at) {
      const tokenAge = Date.now() - new Date(client.token_created_at).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (tokenAge > sevenDays) {
        return res.status(401).json({ error: 'Lien expiré' });
      }
    }

    if (!client.contact_email || !client.user_id) {
      return res.status(401).json({ error: 'Compte non configuré' });
    }

    // Generate a session directly via admin API (no password needed)
    const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({
      type: 'magiclink',
      email: client.contact_email
    });

    if (linkErr || !linkData) {
      // Fallback: create a temporary session by generating a new password and signing in
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
      let tempPwd = '';
      for (let i = 0; i < 32; i++) tempPwd += chars[Math.floor(Math.random() * chars.length)];
      await adminDb.auth.admin.updateUserById(client.user_id, { password: tempPwd });

      const anonDb = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY);
      const { data: signInData, error: signInErr } = await anonDb.auth.signInWithPassword({
        email: client.contact_email,
        password: tempPwd
      });

      if (signInErr || !signInData?.session) {
        return res.status(401).json({ error: 'Erreur de connexion' });
      }

      return res.status(200).json({
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token
        }
      });
    }

    // Use the generated link's token properties
    const hashed_token = linkData?.properties?.hashed_token;
    if (hashed_token) {
      // Verify the token to get a session
      const anonDb = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY);
      const { data: verifyData, error: verifyErr } = await anonDb.auth.verifyOtp({
        email: client.contact_email,
        token: hashed_token,
        type: 'magiclink'
      });

      if (!verifyErr && verifyData?.session) {
        return res.status(200).json({
          session: {
            access_token: verifyData.session.access_token,
            refresh_token: verifyData.session.refresh_token
          }
        });
      }
    }

    // Final fallback
    return res.status(401).json({ error: 'Erreur de connexion' });

  } catch (err) {
    console.error('Magic login error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
