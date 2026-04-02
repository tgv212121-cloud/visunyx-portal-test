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

  // Verify caller is admin
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorise' });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: caller } } = await db.auth.getUser(token);
  if (!caller) return res.status(401).json({ error: 'Session invalide' });
  const { data: profile } = await db.from('profiles').select('role').eq('id', caller.id).single();
  if (profile?.role !== 'admin' && profile?.role !== 'developer') return res.status(403).json({ error: 'Admin only' });

  try {
    // Remove the CHECK constraint on category to allow custom folder names
    const { error } = await db.rpc('exec_sql', {
      query: "ALTER TABLE public.deliverables DROP CONSTRAINT IF EXISTS deliverables_category_check;"
    });

    // If rpc doesn't work, try direct SQL via REST
    if (error) {
      // Fallback: use the Supabase Management API or just report
      return res.status(200).json({
        success: false,
        message: 'Auto-migration failed. Please run this SQL manually in Supabase SQL Editor:',
        sql: 'ALTER TABLE public.deliverables DROP CONSTRAINT IF EXISTS deliverables_category_check;'
      });
    }

    return res.status(200).json({ success: true, message: 'Category constraint removed' });
  } catch (err) {
    return res.status(200).json({
      success: false,
      message: 'Run this SQL in Supabase SQL Editor:',
      sql: 'ALTER TABLE public.deliverables DROP CONSTRAINT IF EXISTS deliverables_category_check;'
    });
  }
};
