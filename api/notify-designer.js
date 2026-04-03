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

  // Rate limit: 20 requests per hour per IP
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRate(ip, 20, 3600000)) return res.status(429).json({ error: 'Too many requests' });

  // Auth: require API secret (admin only)
  const apiSecret = process.env.API_SECRET;
  if (!apiSecret || req.headers['x-api-secret'] !== apiSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { project_id, designer_id } = req.body;

  if (!project_id || !designer_id) {
    return res.status(400).json({ error: 'project_id and designer_id required' });
  }

  try {
    // Get project info
    const { data: project } = await db.from('projects')
      .select('title, project_type, due_date')
      .eq('id', project_id)
      .single();

    // Get designer info
    const { data: designer } = await db.from('profiles')
      .select('full_name, email')
      .eq('id', designer_id)
      .single();

    if (!project || !designer?.email) {
      return res.status(200).json({ skipped: true, reason: 'Missing project or designer data' });
    }

    const appUrl = process.env.APP_URL || 'https://visunyx-portal.vercel.app';
    const projectLink = `${appUrl}/designer/project.html?id=${project_id}`;
    const dueDate = project.due_date
      ? new Date(project.due_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Non définie';

    let emailSent = false;

    if (RESEND_API_KEY) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Visunyx Studio <noreply@digitaltimes.fr>',
            to: [designer.email],
            subject: `Visunyx | Nouveau projet assigné : ${project.title}`,
            html: `<div style="font-family:'Inter',sans-serif;color:#333;line-height:1.8;max-width:600px;margin:0 auto;padding:30px 20px;">
              <div style="text-align:center;margin-bottom:24px;">
                <h2 style="color:#6366F1;margin:0;">Visunyx Studio</h2>
              </div>

              <p>Bonjour ${designer.full_name || ''},</p>

              <p>Un nouveau projet vous a été assigné ! Voici les détails :</p>

              <div style="background:#f5f3ff;border:1px solid #ddd5ff;border-radius:12px;padding:20px;margin:20px 0;">
                <p style="margin:0 0 8px;"><strong>Projet :</strong> ${project.title}</p>
                <p style="margin:0 0 8px;"><strong>Type :</strong> ${project.project_type || 'Logo'}</p>
                <p style="margin:0;"><strong>Échéance :</strong> ${dueDate}</p>
              </div>

              <p>Vous pouvez accéder au brief et aux fichiers du projet depuis votre espace :</p>

              <a href="${projectLink}" style="display:inline-block;padding:14px 32px;background:#6366F1;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">Accéder au projet</a>

              <p style="margin-top:24px;">Bonne création !</p>

              <p><strong>Visunyx Studio</strong><br>
              <em style="color:#888;">Chaque marque commence par une vision. La vôtre est unique.</em></p>

              <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
              <p style="font-size:11px;color:#999;text-align:center;">Cet email a été envoyé automatiquement par Visunyx Studio.</p>
            </div>`
          })
        });
        if (emailRes.ok) emailSent = true;
      } catch(emailErr) {
        console.log('Designer email error:', emailErr.message);
      }
    }

    return res.status(200).json({ success: true, email_sent: emailSent });

  } catch (err) {
    console.error('Notify designer error:', err);
    return res.status(500).json({ error: err.message });
  }
};
