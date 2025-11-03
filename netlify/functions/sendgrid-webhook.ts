import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const events = JSON.parse(event.body || '[]');
    
    if (!Array.isArray(events)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid payload format' }) };
    }

    console.log(`📧 Received ${events.length} webhook events from SendGrid`);

    const processedEvents = [];

    for (const webhookEvent of events) {
      try {
        // Extract event data
        const {
          event: eventType,
          email,
          sg_message_id,
          sg_event_id,
          reason,
          timestamp,
          asm_group_id,
          ...rest
        } = webhookEvent;

        // Find applicant by email
        const { data: applicants, error: findError } = await supabaseAdmin
          .from('applicants')
          .select('id')
          .eq('email', email)
          .limit(1);

        let applicantId = null;
        if (!findError && applicants && applicants.length > 0) {
          applicantId = applicants[0].id;
        }

        // Insert log
        const { error: insertError } = await supabaseAdmin
          .from('email_logs')
          .insert({
            event_type: eventType,
            applicant_id: applicantId,
            applicant_email: email,
            subject: webhookEvent.subject || null,
            sg_message_id: sg_message_id || null,
            sg_event_id: sg_event_id || null,
            reason: reason || null,
            raw_event: webhookEvent,
          });

        if (insertError) {
          console.error(`❌ Error logging event ${sg_event_id}:`, insertError.message);
        } else {
          processedEvents.push({ event: eventType, email, sg_event_id });
        }
      } catch (err: any) {
        console.error('❌ Error processing webhook event:', err.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Webhook processed',
        processed: processedEvents.length,
        total: events.length 
      }),
    };
  } catch (err: any) {
    console.error('❌ Webhook error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

