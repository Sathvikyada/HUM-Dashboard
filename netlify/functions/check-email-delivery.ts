import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { emails } = body as {
      emails: string[];
    };

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid emails array' }) };
    }

    // Check email_logs for "delivered" events in the last 2 minutes
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('email_logs')
      .select('applicant_email, event_type, created_at')
      .in('applicant_email', emails)
      .eq('event_type', 'delivered')
      .gte('created_at', new Date(Date.now() - 120000).toISOString()); // Last 2 minutes

    if (logsError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to check email logs' }),
      };
    }

    const deliveredEmails = new Set((logs || []).map(log => log.applicant_email.toLowerCase()));
    
    const status: Record<string, { delivered: boolean; deliveredAt?: string }> = {};
    
    for (const email of emails) {
      const emailLower = email.toLowerCase();
      const isDelivered = deliveredEmails.has(emailLower);
      status[email] = {
        delivered: isDelivered,
        deliveredAt: isDelivered 
          ? logs?.find(log => log.applicant_email.toLowerCase() === emailLower)?.created_at 
          : undefined,
      };
    }

    const deliveredCount = Object.values(status).filter(s => s.delivered).length;
    const pendingCount = emails.length - deliveredCount;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        status,
        delivered: deliveredCount,
        pending: pendingCount,
        total: emails.length,
      }),
    };
  } catch (err: any) {
    console.error('❌ Check email delivery error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};
