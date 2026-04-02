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
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : 'https://visunyx-portal.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 5 requests per hour per IP
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRate(ip, 5, 3600000)) return res.status(429).json({ error: 'Too many requests' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const data = req.body;

  if (!data.full_name || !data.email || !data.company_name) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  // RGPD: consent is mandatory
  if (!data.consent_at) {
    return res.status(400).json({ error: 'Le consentement est obligatoire' });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  // Input length validation
  if (data.full_name?.length > 200 || data.email?.length > 254 || data.company_name?.length > 200) {
    return res.status(400).json({ error: 'Input too long' });
  }

  // Normalize: email always lowercase, company name lowercase for matching
  data.email = data.email.trim().toLowerCase();
  data.full_name = data.full_name.trim();
  data.company_name = data.company_name.trim();

  try {
    // 1. Find existing client by email AND company name in parallel
    const [{ data: byEmail }, { data: byCompany }] = await Promise.all([
      db.from('clients').select('id').ilike('contact_email', data.email).maybeSingle(),
      db.from('clients').select('id').ilike('company_name', data.company_name).maybeSingle()
    ]);
    const existingClient = byEmail || byCompany || null;

    let clientId;
    if (existingClient) {
      clientId = existingClient.id;
      // Update with latest info but keep email lowercase
      await db.from('clients').update({
        contact_name: data.full_name,
        contact_email: data.email,
        website: data.website || null,
        notes: `Pack: ${data.pack || '-'}\nPseudo: ${data.pseudo || '-'}`,
        token_created_at: new Date().toISOString(),
        consent_at: data.consent_at || null
      }).eq('id', clientId);
    } else {
      const { data: newClient, error: clientErr } = await db
        .from('clients')
        .insert({
          company_name: data.company_name,
          contact_name: data.full_name,
          contact_email: data.email,
          website: data.website || null,
          notes: `Pack: ${data.pack || '-'}\nPseudo: ${data.pseudo || '-'}`,
          token_created_at: new Date().toISOString(),
          consent_at: data.consent_at || null
        })
        .select()
        .single();
      if (clientErr) throw clientErr;
      clientId = newClient.id;
    }

    // 2. Determine project type from pack
    const packMap = {
      'Pack Essentiel (2 concepts de logo)': 'logo',
      'Pack Pro (3 concepts + brandboard)': 'branding',
      'Pack Signature (3 concepts + brandbook)': 'brandbook'
    };
    const projectType = packMap[data.pack] || 'branding';

    const revisionMap = {
      'Pack Essentiel (2 concepts de logo)': 2,
      'Pack Pro (3 concepts + brandboard)': 3,
      'Pack Signature (3 concepts + brandbook)': 5
    };
    const revTotal = revisionMap[data.pack] || 2;

    // 3. Create project + fetch access_token in parallel
    const [{ data: project, error: projErr }, { data: clientRow }] = await Promise.all([
      db.from('projects').insert({
        client_id: clientId,
        title: `${data.company_name} - ${data.pack || 'Logo'}`,
        project_type: projectType,
        priority: 'normale',
        status: 'brief-envoye',
        order_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        revisions_remaining: revTotal,
        revisions_total: revTotal
      }).select().single(),
      db.from('clients').select('access_token').eq('id', clientId).single()
    ]);
    if (projErr) throw projErr;

    // 4. Build brief content (sync, instant)
    const briefContent = {
      company_name: data.company_name, company_story: data.company_story,
      slogan: data.slogan, activity: data.activity, target: data.target,
      differentiator: data.differentiator, competitors: data.competitors,
      brand_words: data.brand_words, avoid_words: data.avoid_words,
      brand_personality: data.brand_personality?.replace(/\|\|/g, ', '),
      logo_supports: data.logo_supports?.replace(/\|\|/g, ', '),
      avoid_elements: data.avoid_elements, preferred_colors: data.preferred_colors,
      avoid_colors: data.avoid_colors, logo_style: data.logo_style?.replace(/\|\|/g, ', '),
      logo_references: data.logo_references, existing_logo: data.existing_logo,
      extra_notes: data.extra_notes
    };

    // 5. Run EVERYTHING in parallel: AI briefs + account/email + folder/logs
    const appUrl = process.env.APP_URL || 'https://visunyx-portal.vercel.app';
    let emailSent = false;
    let isReturningClient = false;

    // --- Task A: AI brief generation (slowest, ~5-10s) ---
    const aiBriefPromise = (async () => {
      let summary = generateSummary(data);
      let aiBrief = null, aiBriefDesigner = null;
      try {
        const [fullBrief, designerBrief] = await Promise.all([
          generateAIBrief(data, false),
          generateAIBrief(data, true)
        ]);
        aiBrief = fullBrief;
        aiBriefDesigner = designerBrief;
        if (aiBrief) summary = aiBrief;
      } catch(e) { console.log('AI brief skipped:', e.message); }
      // Save brief
      const briefBase = { project_id: project.id, content: briefContent, raw_form_data: data, summary, version: 1 };
      const attempts = [
        { ...briefBase, ai_brief: aiBrief, ai_brief_designer: aiBriefDesigner },
        { ...briefBase, ai_brief: aiBrief },
        briefBase
      ];
      for (const attempt of attempts) {
        const { error } = await db.from('briefs').insert(attempt);
        if (!error) break;
      }
    })();

    // --- Task B: Account creation + email (critical, ~2-3s) ---
    const accountEmailPromise = (async () => {
      try {
        const { data: { users } } = await db.auth.admin.listUsers({ filter: data.email });
        const existingUser = users?.find(u => u.email === data.email);
        let userId, tempPassword;

        if (existingUser) {
          isReturningClient = true;
          userId = existingUser.id;
          await Promise.all([
            db.from('profiles').upsert({ id: userId, role: 'client', full_name: data.full_name, email: data.email }),
            db.from('clients').update({ user_id: userId }).eq('id', clientId)
          ]);
        } else {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
          tempPassword = '';
          for (let i = 0; i < 24; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)];
          const { data: newUser, error: createErr } = await db.auth.admin.createUser({
            email: data.email, password: tempPassword, email_confirm: true,
            user_metadata: { full_name: data.full_name, role: 'client' }
          });
          if (!createErr && newUser?.user) {
            userId = newUser.user.id;
            await Promise.all([
              db.from('profiles').upsert({ id: userId, role: 'client', full_name: data.full_name, email: data.email }),
              db.from('clients').update({ user_id: userId }).eq('id', clientId)
            ]);
          }
        }

        const { data: freshClient } = await db.from('clients').select('access_token').eq('id', clientId).single();
        const magicUrl = `${appUrl}/client/index.html?token=${freshClient?.access_token}`;

        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Visunyx Studio <noreply@digitaltimes.fr>',
              to: [data.email],
              subject: 'Visunyx | Bonne réception de votre brief',
              html: `<div style="font-family:'Montserrat',sans-serif;color:#333;line-height:1.8;max-width:600px;margin:0 auto;padding:30px 20px;">
                <div style="text-align:center;margin-bottom:24px;">
                  <h2 style="color:#9332FF;margin:0;">Visunyx Studio</h2>
                </div>
                <p>Bonjour ${data.full_name || ''},</p>
                <p>Nous vous confirmons la bonne réception de votre brief de création d'identité visuelle.</p>
                <p>Merci d'avoir pris le temps de le compléter avec soin : c'est une étape essentielle pour garantir un résultat aligné avec vos attentes.</p>
                <h3 style="color:#9332FF;margin-top:28px;">Les prochaines étapes :</h3>
                <p>✅ <strong>Analyse de votre brief :</strong><br>
                Notre équipe va étudier vos réponses afin de comprendre en profondeur vos besoins et l'univers que vous souhaitez créer.</p>
                <p>✅ <strong>Création des concepts :</strong><br>
                Vous recevrez vos premiers concepts de logo sous 72h.</p>
                <p>✅ <strong>Révisions possibles :</strong><br>
                Selon votre formule, vous disposez de 2 à 5 révisions pour ajuster et affiner le logo choisi.</p>
                <p>✅ <strong>Livraison finale :</strong><br>
                Après validation du concept, vous recevrez tous les livrables inclus dans votre pack.</p>
                <h3 style="color:#9332FF;margin-top:28px;">Suivi de votre projet :</h3>
                <p>Dès que vos concepts seront prêts, ils seront disponibles sur votre interface client :</p>
                <a href="${magicUrl}" style="display:inline-block;padding:14px 32px;background:#9332FF;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">Accéder à mon espace client</a>
                <p style="margin-top:24px;">Pour toute question en attendant, n'hésitez pas à répondre directement à ce message.</p>
                <p style="margin-top:24px;">Merci encore pour votre confiance,</p>
                <p><strong>Visunyx Studio</strong><br>
                <em style="color:#888;">Chaque marque commence par une vision. La vôtre est unique.</em></p>
                <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
                <p style="font-size:11px;color:#999;text-align:center;">Ce lien est personnel, il vous connecte directement à votre espace.</p>
              </div>`
            })
          });
          emailSent = emailRes.ok;
          if (!emailRes.ok) console.log('Email send failed:', emailRes.status, await emailRes.text().catch(() => ''));
        }
      } catch(e) { console.log('Account/email error:', e.message); }
    })();

    // --- Task C: Folder + activity logs (fast, ~200ms) ---
    const miscPromise = Promise.all([
      db.from('deliverables').insert({
        project_id: project.id, file_name: '.folder', file_path: '',
        file_size: 0, file_type: 'folder', category: 'Brief', is_hidden: false
      }),
      db.from('activity_log').insert([
        { project_id: project.id, client_id: clientId, action: 'client_created', details: { company_name: data.company_name, source: 'public_form' } },
        { project_id: project.id, client_id: clientId, action: 'brief_updated', details: { source: 'public_form', pack: data.pack } }
      ])
    ]).catch(e => console.log('Misc tasks error:', e.message));

    // Wait for account/email + misc (NOT AI brief — that can finish later)
    await Promise.all([accountEmailPromise, miscPromise]);

    // Send response — don't wait for AI brief
    res.status(200).json({
      success: true,
      client_id: clientId,
      project_id: project.id,
      email_sent: emailSent,
      returning_client: isReturningClient
    });

    // Wait for AI brief to finish (Vercel keeps function alive until res is fully sent + pending promises)
    await aiBriefPromise.catch(e => console.log('AI brief error:', e.message));

  } catch (err) {
    console.error('Form submit error:', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};

function generateSummary(d) {
  const lines = [];

  lines.push(`BRIEF - ${d.company_name || ''}`.trim());
  lines.push(`Pack: ${d.pack || '-'}`);
  lines.push(`Contact: ${d.full_name} (${d.email})`);
  lines.push('');

  if (d.company_story) lines.push(`Histoire: ${d.company_story}`);
  if (d.slogan) lines.push(`Slogan: ${d.slogan}`);
  lines.push('');

  lines.push('--- ACTIVITE ---');
  if (d.activity) lines.push(`Activite: ${d.activity}`);
  if (d.target) lines.push(`Cible: ${d.target}`);
  if (d.differentiator) lines.push(`Differenciation: ${d.differentiator}`);
  if (d.competitors) lines.push(`Concurrents: ${d.competitors}`);
  lines.push('');

  lines.push('--- IMAGE DE MARQUE ---');
  if (d.brand_words) lines.push(`Mots-cles: ${d.brand_words}`);
  if (d.avoid_words) lines.push(`A eviter: ${d.avoid_words}`);
  if (d.brand_personality) lines.push(`Personnalite: ${d.brand_personality.replace(/\|\|/g, ', ')}`);
  if (d.logo_supports) lines.push(`Supports: ${d.logo_supports.replace(/\|\|/g, ', ')}`);
  lines.push('');

  lines.push('--- PREFERENCES GRAPHIQUES ---');
  if (d.avoid_elements) lines.push(`Elements a eviter: ${d.avoid_elements}`);
  if (d.preferred_colors) lines.push(`Couleurs souhaitees: ${d.preferred_colors}`);
  if (d.avoid_colors) lines.push(`Couleurs a eviter: ${d.avoid_colors}`);
  if (d.logo_style) lines.push(`Style: ${d.logo_style.replace(/\|\|/g, ', ')}`);
  if (d.logo_references) lines.push(`References: ${d.logo_references}`);
  if (d.existing_logo) lines.push(`Logo existant: ${d.existing_logo}`);
  if (d.extra_notes) lines.push(`Notes: ${d.extra_notes}`);

  return lines.filter(l => l !== undefined).join('\n');
}

async function generateAIBrief(data, anonymized = false) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  let rawAnswers;
  if (anonymized) {
    // Designer version: no personal info
    rawAnswers = `
Pack choisi: ${data.pack || ''}
Histoire du nom: ${data.company_story || ''}
Slogan: ${data.slogan || ''}
Activite: ${data.activity || ''}
Public cible: ${data.target || ''}
Differenciation: ${data.differentiator || ''}
Concurrents: ${data.competitors || ''}
Mots-cles image de marque: ${data.brand_words || ''}
Mots a eviter: ${data.avoid_words || ''}
Personnalite de marque: ${(data.brand_personality || '').replace(/\|\|/g, ', ')}
Supports logo: ${(data.logo_supports || '').replace(/\|\|/g, ', ')}
Elements graphiques a eviter: ${data.avoid_elements || ''}
Couleurs souhaitees: ${data.preferred_colors || ''}
Couleurs a eviter: ${data.avoid_colors || ''}
Style de logo: ${(data.logo_style || '').replace(/\|\|/g, ', ')}
References logos: ${data.logo_references || ''}
Logo existant (refonte): ${data.existing_logo || ''}
Autres informations: ${data.extra_notes || ''}
    `.trim();
  } else {
    // Admin version: full info
    rawAnswers = `
Nom et prenom: ${data.full_name || ''}
Email: ${data.email || ''}
Nom de l'entreprise: ${data.company_name || ''}
Site web: ${data.website || ''}
Pack choisi: ${data.pack || ''}
Histoire du nom: ${data.company_story || ''}
Slogan: ${data.slogan || ''}
Activite: ${data.activity || ''}
Public cible: ${data.target || ''}
Differenciation: ${data.differentiator || ''}
Concurrents: ${data.competitors || ''}
Mots-cles image de marque: ${data.brand_words || ''}
Mots a eviter: ${data.avoid_words || ''}
Personnalite de marque: ${(data.brand_personality || '').replace(/\|\|/g, ', ')}
Supports logo: ${(data.logo_supports || '').replace(/\|\|/g, ', ')}
Elements graphiques a eviter: ${data.avoid_elements || ''}
Couleurs souhaitees: ${data.preferred_colors || ''}
Couleurs a eviter: ${data.avoid_colors || ''}
Style de logo: ${(data.logo_style || '').replace(/\|\|/g, ', ')}
References logos: ${data.logo_references || ''}
Logo existant (refonte): ${data.existing_logo || ''}
Autres informations: ${data.extra_notes || ''}
    `.trim();
  }

  const outputRule = anonymized
    ? `📦 OUTPUT
- Write the entire brief IN ENGLISH ONLY.
- Do not include a French version.
- Do NOT include any client personal information: no name, no email, no phone, no address, no website, no company name.
- Focus only on the creative and branding requirements.`
    : `📦 OUTPUT
- Write the entire brief IN ENGLISH ONLY.
- Do not include a French version.
- Include all client information (company name, brand name, contact details) in the brief.`;

  const systemPrompt = `Tu es un assistant expert en branding et design.
Ta mission est de transformer les réponses d'un client à un questionnaire de brief en un document professionnel clair, structuré et complet à destination d'un designer chargé de créer un logo.

🎯 OBJECTIFS
- Structurer les informations en un brief de qualité professionnelle : clair, précis, sans jargon inutile, et fidèle aux propos du client.
- Ne rien oublier : chaque information donnée dans les réponses doit apparaître, même si elle semble répétitive ou confuse, tu peux clarifier légèrement, mais sans jamais omettre.
- Clarifier si nécessaire : reformule certaines parties ambiguës pour les rendre compréhensibles par un designer, sans déformer le sens.

📝 STRUCTURE DU BRIEF
Le brief doit être organisé selon les sections suivantes :
1. Nom du projet / de la marque
2. Description de l'entreprise / activité
3. Objectifs du logo
4. Cibles (audiences visées)
5. Ton / émotions à transmettre
6. Valeurs de la marque
7. Concurrents / références
8. Préférences graphiques (couleurs, styles, typographies, éléments graphiques, etc.)
9. Contraintes ou éléments à éviter
10. Livrables attendus
11. Autres remarques du client

🔁 COMPORTEMENT
- Tu ne prends aucune initiative créative personnelle.
- Tu ne donnes jamais ton avis sur les réponses.
- Tu es un filtre de clarté, pas un créatif.
- Tu ne laisses aucune réponse du client non traitée.
- JAMAIS de notes, commentaires, avertissements ou remarques à la fin du brief (pas de "Note:", "Warning:", "Remarque:", "The client should...", etc.).
- Si un champ est vide ou contient une réponse vague (comme "x", "xx", "-"), écris simplement "Not specified" dans la section correspondante et passe à la suite. Ne commente jamais la qualité des réponses.

${outputRule}`;

  const userMsg = anonymized
    ? `Here are the raw client responses to the branding questionnaire:\n\n${rawAnswers}\n\nGenerate a professional, structured brief in English only. Do NOT include any personal information (no name, email, phone, website, company name).`
    : `Here are the raw client responses to the branding questionnaire:\n\n${rawAnswers}\n\nGenerate a professional, structured brief in English only. Include all client information (company name, contact details, website).`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const result = await response.json();
  return result.content?.[0]?.text || null;
}
