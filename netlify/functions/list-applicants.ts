import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    const { page = '1', pageSize = '50', q = '' } = event.queryStringParameters || {};
    const p = Math.max(parseInt(page), 1);
    const ps = Math.min(Math.max(parseInt(pageSize), 1), 200);
    const from = (p - 1) * ps;
    const to = from + ps - 1;

    let query = supabaseAdmin.from('applicants').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
    if (q) {
      query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%` as any);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    return {
      statusCode: 200,
      body: JSON.stringify({ items: data, total: count }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err: any) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};

