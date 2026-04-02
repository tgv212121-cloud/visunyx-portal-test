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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 5 requests per hour per IP
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRate(ip, 5, 3600000)) return res.status(429).json({ error: 'Too many requests' });

  // Auth: require API secret (admin only)
  const apiSecret = process.env.API_SECRET;
  if (!apiSecret || req.headers['x-api-secret'] !== apiSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  const full_name = req.body.full_name;
  const role = req.body.role === 'designer' ? 'designer' : 'client';

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email et mot de passe (6+ caracteres) requis' });
  }

  let userId = null;

  try {
    // Try to create the user
    const { data: newUser, error: createErr } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, role }
    });

    if (createErr && createErr.message?.includes('already been registered')) {
      // User exists — update password
      const { data: { users } } = await db.auth.admin.listUsers({ filter: email });
      const existingUser = users?.find(u => u.email === email);
      if (!existingUser) throw new Error('Utilisateur introuvable');

      await db.auth.admin.updateUserById(existingUser.id, { password, email_confirm: true });
      userId = existingUser.id;
    } else if (createErr) {
      throw createErr;
    } else {
      userId = newUser.user.id;
    }

    // Upsert profile
    await db.from('profiles').upsert({ id: userId, role, full_name: full_name || '', email });

    // Link to matching row
    if (role === 'client') {
      await db.from('clients').update({ user_id: userId }).eq('contact_email', email).is('user_id', null);
    } else if (role === 'designer') {
      await db.from('designers').update({ profile_id: userId }).eq('email', email).is('profile_id', null);
    }

    // Send welcome email (ALWAYS, for both new and existing users)
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      const appUrl = process.env.APP_URL || 'https://visunyx-portal.vercel.app';
      const loginUrl = `${appUrl}/login.html`;

      const templates = {
        designer: {
          subject: 'Visunyx | Bienvenue dans l\'équipe !',
          html: `<div style="font-family:'Montserrat',sans-serif;color:#333;line-height:1.8;max-width:600px;margin:0 auto;padding:30px 20px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h2 style="color:#9332FF;margin:0;">Visunyx Studio</h2>
            </div>
            <p>Bonjour ${full_name || ''},</p>
            <p>Vous avez été ajouté comme <strong>designer</strong> sur la plateforme Visunyx Studio.</p>
            <p>Votre adresse de connexion :</p>
            <div style="background:#f5f3ff;border:1px solid #ddd5ff;border-radius:12px;padding:20px;margin:20px 0;">
              <p style="margin:0;"><strong>Email :</strong> ${email}</p>
            </div>
            <p>Votre mot de passe temporaire vous sera communiqué séparément par votre administrateur.</p>
            <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:#9332FF;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">Accéder à mon espace</a>
            <p style="margin-top:20px;font-size:13px;color:#888;">Nous vous recommandons de changer votre mot de passe après votre première connexion.</p>
            <p style="margin-top:24px;"><strong>Visunyx Studio</strong><br>
            <em style="color:#888;">Chaque marque commence par une vision. La vôtre est unique.</em></p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
            <p style="font-size:11px;color:#999;text-align:center;">Cet email a été envoyé automatiquement par Visunyx Studio.</p>
          </div>`
        },
        client: {
          subject: 'Visunyx | Votre espace client est prêt',
          html: `<div style="font-family:'Montserrat',sans-serif;color:#333;line-height:1.8;max-width:600px;margin:0 auto;padding:30px 20px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h2 style="color:#9332FF;margin:0;">Visunyx Studio</h2>
            </div>
            <p>Bonjour ${full_name || ''},</p>
            <p>Votre espace client a été créé sur Visunyx Studio.</p>
            <p>Votre adresse de connexion :</p>
            <div style="background:#f5f3ff;border:1px solid #ddd5ff;border-radius:12px;padding:20px;margin:20px 0;">
              <p style="margin:0;"><strong>Email :</strong> ${email}</p>
            </div>
            <p>Vous recevrez un lien de connexion sécurisé par email à chaque accès.</p>
            <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:#9332FF;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">Accéder à mon espace</a>
            <p style="margin-top:24px;"><strong>Visunyx Studio</strong><br>
            <em style="color:#888;">Chaque marque commence par une vision. La vôtre est unique.</em></p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
            <p style="font-size:11px;color:#999;text-align:center;">Cet email a été envoyé automatiquement par Visunyx Studio.</p>
          </div>`
        }
      };

      const tpl = templates[role];
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Visunyx Studio <noreply@digitaltimes.fr>',
            to: [email],
            subject: tpl.subject,
            html: tpl.html
          })
        });
        const emailResult = await emailRes.json();
        console.log('Email sent:', emailResult);
      } catch(emailErr) {
        console.log('Email error:', emailErr.message);
      }
    }

    return res.status(200).json({ success: true, user_id: userId });

  } catch (err) {
    console.error('Create account error:', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};
