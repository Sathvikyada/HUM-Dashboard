import type { Handler } from '@netlify/functions';
import { requireAdmin } from './_utils/auth';
import { sendDiscordLinkUpdate } from './_utils/email';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { email, name } = body as {
      email: string;
      name?: string;
    };

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing email address' }),
      };
    }

    // Send test email
    await sendDiscordLinkUpdate({
      to: email,
      name: name || email,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: `Discord update email sent to ${email}`,
      }),
    };
  } catch (err: any) {
    console.error('❌ Test Discord email error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};

