import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    
    const { event_type } = event.queryStringParameters || {};
    const limit = 1000; // Max logs to return
    
    let query = supabaseAdmin
      .from('email_logs')
      .select('id, event_type, applicant_email, subject, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (event_type && event_type !== 'all') {
      query = query.eq('event_type', event_type);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ logs: data || [] }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err: any) {
    return { 
      statusCode: err.statusCode || 500, 
      body: JSON.stringify({ error: err.message || 'Server error' }) 
    };
  }
};

