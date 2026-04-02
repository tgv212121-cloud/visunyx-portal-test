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

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'No RESEND_API_KEY' });

  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" field' });

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Visunyx Studio <noreply@digitaltimes.fr>',
        to: [to],
        subject: 'Test Visunyx Email',
        html: '<p>Ceci est un test.</p>'
      })
    });

    const body = await emailRes.json();
    return res.status(200).json({
      status: emailRes.status,
      ok: emailRes.ok,
      resend_response: body
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
