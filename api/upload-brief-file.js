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

  // Rate limit: 20 requests per hour per IP
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRate(ip, 20, 3600000)) return res.status(429).json({ error: 'Too many requests' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { project_id, folder, file_name, file_size, file_type, file_path } = req.body;

    if (!project_id || !file_name || !file_path) {
      return res.status(400).json({ error: 'Missing project_id, file_name or file_path' });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'application/zip', 'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
      'text/plain', 'text/csv'
    ];
    const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|doc|docx|xls|xlsx|ppt|pptx|txt|csv|ai|eps|psd)$/i;

    if (file_type && !allowedTypes.includes(file_type) && !allowedExtensions.test(file_name)) {
      return res.status(400).json({ error: 'Type de fichier non autorisé' });
    }

    // Validate file size (max 50MB)
    if (file_size && file_size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'Fichier trop volumineux (max 50 Mo)' });
    }

    // Create deliverable entry (file already uploaded to Storage from client)
    await db.from('deliverables').insert({
      project_id,
      file_name,
      file_path,
      file_size: file_size || 0,
      file_type: file_type || 'application/octet-stream',
      category: folder || 'Brief',
      is_hidden: false
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Register brief file error:', err);
    return res.status(500).json({ error: err.message || 'Failed' });
  }
};
// force rebuild 1774909002
