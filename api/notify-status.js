const { createClient } = require('@supabase/supabase-js');

const STATUS_EMAILS = {
  'en-cours': {
    subject: 'Visunyx | Votre projet est en cours de création',
    html: 'en-cours'
  },
  'revision': {
    subject: 'Visunyx | Votre demande de révision est prise en compte',
    html: 'revision'
  },
  'concept-livre': {
    subject: 'Visunyx | Vos concepts de logo sont prêts !',
    html: 'concept-livre'
  },
  'termine': {
    subject: 'Visunyx | Projet finalisé',
    html: 'termine'
  }
};

function buildStatusHtml(status, { clientName, projectTitle, projectLink, revisionLink, revisionsLeft }) {
  const header = `<div style="font-family:'Montserrat',sans-serif;color:#333;line-height:1.8;max-width:600px;margin:0 auto;padding:30px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="color:#9332FF;margin:0;">Visunyx Studio</h2>
    </div>`;

  const footer = `<p style="margin-top:24px;"><strong>Visunyx Studio</strong><br>
    <em style="color:#888;">Chaque marque commence par une vision. La vôtre est unique.</em></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:11px;color:#999;text-align:center;">Cet email a été envoyé automatiquement par Visunyx Studio.</p>
  </div>`;

  const btn = (text, href) => `<a href="${href}" style="display:inline-block;padding:14px 32px;background:#9332FF;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">${text}</a>`;
  const btnOutline = (text, href) => `<a href="${href}" style="display:inline-block;padding:12px 28px;background:rgba(147,50,255,0.1);color:#9332FF;text-decoration:none;border-radius:8px;font-weight:bold;border:2px solid #9332FF;margin:12px 0;">${text}</a>`;

  if (status === 'en-cours') {
    return `${header}
      <p>Bonjour ${clientName},</p>
      <p>Bonne nouvelle ! Nous avons bien pris en compte votre brief pour le projet <strong>"${projectTitle}"</strong> et nous démarrons la création.</p>
      <p>Vous pouvez suivre l'avancement en temps réel depuis votre espace client :</p>
      ${btn('Voir mon projet', projectLink)}
      <p>N'hésitez pas à nous envoyer un message si vous avez des questions.</p>
      <p style="margin-top:24px;">Créativement,</p>
    ${footer}`;
  }

  if (status === 'revision') {
    return `${header}
      <p>Bonjour ${clientName},</p>
      <p>Nous avons bien pris en compte vos retours sur le projet <strong>"${projectTitle}"</strong>.</p>
      <p>Notre designer travaille sur les ajustements demandés. Vous recevrez une notification dès que la nouvelle version sera prête.</p>
      <p>Vous pouvez suivre l'avancement depuis votre espace :</p>
      ${btn('Voir mon projet', projectLink)}
      <p style="margin-top:24px;">Merci pour vos retours précieux,</p>
    ${footer}`;
  }

  if (status === 'concept-livre') {
    return `${header}
      <p>Bonjour ${clientName},</p>
      <p>Nous avons le plaisir de vous envoyer les premiers concepts créés à partir de votre brief.</p>
      <p>Chaque proposition a été pensée pour refléter votre univers, vos valeurs et l'ambition de votre marque.</p>

      <h3 style="color:#9332FF;margin-top:28px;">Voici vos propositions de logo :</h3>
      ${btn('➡️ Accéder à vos concepts', projectLink)}

      <h3 style="color:#9332FF;margin-top:28px;">🔍 Et maintenant ?</h3>
      <p>Prenez le temps de les analyser : quelles propositions vous parlent le plus ? Pourquoi ?</p>

      ${revisionsLeft > 0 ? `
      <p><strong>Envie de modifier quelque chose ?</strong><br>
      👉 Il vous suffit de remplir ce formulaire de révision :</p>
      ${btnOutline('🔁 Demander une révision', revisionLink)}

      <p style="background:#f5f3ff;border:1px solid #ddd5ff;border-radius:8px;padding:14px;margin:20px 0;">
        📌 Vous disposez encore de <strong>${revisionsLeft} révision${revisionsLeft > 1 ? 's' : ''}</strong>.
      </p>
      ` : `
      <p style="background:#fff3f3;border:1px solid #ffd5d5;border-radius:8px;padding:14px;margin:20px 0;">
        📌 Vous avez utilisé toutes vos révisions incluses dans votre pack. Pour des révisions supplémentaires, contactez-nous par email ou via la messagerie.
      </p>
      `}

      <p><strong>Vous validez l'un des concepts ?</strong><br>
      Confirmez-le par email ou par la messagerie, et nous lancerons la création de vos livrables finaux.</p>

      <p>Nous sommes à votre écoute pour affiner le rendu jusqu'à obtenir un résultat parfaitement aligné avec votre vision.</p>
      <p style="margin-top:24px;">Merci pour votre confiance,</p>
    ${footer}`;
  }

  if (status === 'termine') {
    return `${header}
      <p>Bonjour ${clientName},</p>
      <p>Le projet <strong>"${projectTitle}"</strong> est officiellement finalisé. 🎉</p>
      <p>Tous vos livrables sont disponibles dans votre espace client :</p>
      ${btn('Télécharger mes livrables', projectLink)}
      <p>Nous espérons que le résultat vous plaît ! Si vous avez besoin d'un nouveau projet, n'hésitez pas à nous contacter.</p>
      <p style="margin-top:24px;">À bientôt,</p>
    ${footer}`;
  }

  return '';
}

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
  const { project_id, new_status } = req.body;

  if (!project_id || !new_status) {
    return res.status(400).json({ error: 'project_id and new_status required' });
  }

  const template = STATUS_EMAILS[new_status];
  if (!template) {
    return res.status(200).json({ skipped: true, reason: 'No email template for this status' });
  }

  try {
    const { data: project } = await db.from('projects')
      .select('title, client_id, clients(contact_name, contact_email)')
      .eq('id', project_id)
      .single();

    if (!project || !project.clients?.contact_email) {
      return res.status(200).json({ skipped: true, reason: 'No client email found' });
    }

    const clientEmail = project.clients.contact_email;
    const clientName = project.clients.contact_name || 'Client';
    const appUrl = process.env.APP_URL || 'https://visunyx-portal.vercel.app';

    // Get client access_token for magic link
    const { data: clientRow } = await db.from('clients')
      .select('access_token')
      .eq('id', project.client_id)
      .single();
    const magicToken = clientRow?.access_token || '';
    const projectLink = `${appUrl}/client/project.html?id=${project_id}&token=${magicToken}`;
    const revisionLink = `${appUrl}/client/revision.html?id=${project_id}&token=${magicToken}`;

    const subject = template.subject.replace('{project}', project.title);

    // Get revisions remaining for concept-livre
    let revisionsLeft = 0;
    if (new_status === 'concept-livre') {
      const { data: projData } = await db.from('projects')
        .select('revisions_remaining')
        .eq('id', project_id)
        .single();
      revisionsLeft = projData?.revisions_remaining || 0;
    }

    const emailHtml = buildStatusHtml(new_status, {
      clientName, projectTitle: project.title,
      projectLink, revisionLink, revisionsLeft
    });

    // Send email via Resend API
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
            to: [clientEmail],
            subject: subject,
            html: emailHtml
          })
        });

        if (emailRes.ok) {
          emailSent = true;
        } else {
          const errBody = await emailRes.text();
          console.log('Resend error:', emailRes.status, errBody);
        }
      } catch(emailErr) {
        console.log('Email send error:', emailErr.message);
      }
    }

    await db.from('activity_log').insert({
      project_id: project_id,
      client_id: project.client_id,
      action: 'status_changed',
      details: {
        to: new_status,
        email_sent: emailSent,
        email_to: clientEmail,
        email_subject: subject
      }
    });

    return res.status(200).json({
      success: true,
      email_sent: emailSent,
      email_to: clientEmail,
      subject: subject
    });

  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ error: err.message });
  }
};
