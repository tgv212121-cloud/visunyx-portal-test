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
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Rate limit: 3 requests per hour per IP
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRate(ip, 3, 3600000)) return res.status(429).json({ error: 'Too many requests' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Get all projects with em dash in title
    const { data: projects } = await db.from('projects')
      .select('id, title')
      .like('title', '%—%');

    if (!projects || projects.length === 0) {
      return res.status(200).json({ message: 'No titles to fix', fixed: 0 });
    }

    let fixed = 0;
    for (const p of projects) {
      const newTitle = p.title.replace(/—/g, '-');
      await db.from('projects').update({ title: newTitle }).eq('id', p.id);
      fixed++;
    }

    // Also fix client notes
    const { data: clients } = await db.from('clients')
      .select('id, notes')
      .like('notes', '%—%');

    let fixedNotes = 0;
    if (clients && clients.length > 0) {
      for (const c of clients) {
        const newNotes = c.notes.replace(/—/g, '-');
        await db.from('clients').update({ notes: newNotes }).eq('id', c.id);
        fixedNotes++;
      }
    }

    return res.status(200).json({ success: true, fixed_titles: fixed, fixed_notes: fixedNotes });
  } catch (err) {
    console.error('Fix dashes error:', err);
    return res.status(500).json({ error: err.message });
  }
};
