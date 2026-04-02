// ============================================================
// VISUNYX PORTAL — n8n Webhook Handler (Vercel Serverless)
// ============================================================
// POST /api/webhook
// Headers: x-webhook-secret: <WEBHOOK_SECRET>
// Body (JSON):
//   {
//     "company_name": "Acme Corp",
//     "contact_name": "Jean Dupont",
//     "contact_email": "jean@acme.com",
//     "phone": "+33600000000",       // optional
//     "website": "https://acme.com", // optional
//     "industry": "E-commerce",      // optional
//     "project_title": "Identité visuelle",
//     "project_type": "branding",    // optional
//     "brief": { ... }               // optional JSONB object
//   }
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service role key
const WEBHOOK_SECRET      = process.env.WEBHOOK_SECRET;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const secret = req.headers['x-webhook-secret'];
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body;
  if (!body || !body.company_name || !body.contact_email) {
    return res.status(400).json({ error: 'Missing required fields: company_name, contact_email' });
  }

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Upsert client ──────────────────────────────────────
    let clientId;
    const { data: existingClients } = await db
      .from('clients')
      .select('id')
      .eq('contact_email', body.contact_email)
      .limit(1);

    if (existingClients && existingClients.length > 0) {
      clientId = existingClients[0].id;
      await db.from('clients').update({
        company_name:  body.company_name,
        contact_name:  body.contact_name  || null,
        phone:         body.phone         || null,
        website:       body.website       || null,
        industry:      body.industry      || null,
      }).eq('id', clientId);
    } else {
      const { data: newClient, error: clientErr } = await db.from('clients').insert({
        company_name:  body.company_name,
        contact_name:  body.contact_name  || null,
        contact_email: body.contact_email,
        phone:         body.phone         || null,
        website:       body.website       || null,
        industry:      body.industry      || null,
      }).select('id').single();
      if (clientErr) throw clientErr;
      clientId = newClient.id;
    }

    // ── 2. Create project ─────────────────────────────────────
    const { data: project, error: projErr } = await db.from('projects').insert({
      client_id:    clientId,
      title:        body.project_title || `Projet ${body.company_name}`,
      project_type: body.project_type  || 'branding',
      status:       'nouveau',
      priority:     body.priority      || 'normale',
      order_date:   new Date().toISOString().split('T')[0],
      due_date:     body.due_date      || null,
      total_price:  body.total_price   || null,
    }).select('id').single();
    if (projErr) throw projErr;

    // ── 3. Create brief (if provided) ─────────────────────────
    if (body.brief && Object.keys(body.brief).length > 0) {
      await db.from('briefs').insert({
        project_id:    project.id,
        content:       body.brief,
        raw_form_data: body.brief,
        summary:       null,
        version:       1,
      });
      await db.from('projects')
        .update({ status: 'brief-envoye' })
        .eq('id', project.id);
    }

    // ── 4. Activity log ───────────────────────────────────────
    await db.from('activity_log').insert({
      project_id: project.id,
      client_id:  clientId,
      action:     'project_created',
      details:    { title: body.project_title || `Projet ${body.company_name}`, source: 'n8n_webhook' },
    });

    // ── 5. Optional: send magic link to client ────────────────
    if (body.send_invite) {
      await db.auth.admin.generateLink({
        type: 'magiclink',
        email: body.contact_email,
        options: { redirectTo: `${process.env.APP_URL || 'https://visunyx-portal.vercel.app'}/client/index.html` }
      });
    }

    return res.status(200).json({
      success: true,
      client_id:  clientId,
      project_id: project.id,
    });

  } catch (err) {
    console.error('[webhook] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
