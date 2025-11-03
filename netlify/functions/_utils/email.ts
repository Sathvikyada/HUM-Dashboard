import sgMail from '@sendgrid/mail';

const sendgridApiKey = process.env.SG_API_KEY as string;
const emailFrom = process.env.EMAIL_FROM as string;
const emailLogoUrl = process.env.EMAIL_LOGO_URL as string;
const adminEmail = process.env.ADMIN_EMAIL || 'hackumass-logs@hackumass.com';

if (!sendgridApiKey || !emailFrom) {
  console.warn('⚠️ SendGrid not fully configured; emails may fail.');
}

if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

type Decision = 'accepted' | 'waitlisted' | 'denied';

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m)
  );
}

export async function sendDecisionEmail(params: {
  to: string;
  name: string;
  decision: Decision;
  qrBuffer?: Buffer;
}): Promise<void> {
  const subjectMap = {
    accepted: 'You are accepted to HackUMass! 🎉',
    waitlisted: 'HackUMass Application Update – Waitlist',
    denied: 'HackUMass Application Update',
  } as const;

  if (!sendgridApiKey) throw new Error('Missing SENDGRID_API_KEY');
  if (!emailFrom) throw new Error('Missing EMAIL_FROM environment variable');

  const html = renderTemplate({
    name: params.name,
    decision: params.decision,
    hasQR: !!params.qrBuffer,
  });

  const text = renderText(params);

  const msg: any = {
    from: emailFrom,
    to: params.to,
    bcc: adminEmail,
    replyTo: 'team@hackumass.com',
    subject: subjectMap[params.decision],
    html,
    text,
    mailSettings: { sandbox_mode: { enable: false } },
    trackingSettings: {
      clickTracking: { enable: false },
      openTracking: { enable: false },
    },
    headers: { 'X-Entity-Ref-ID': params.decision + '-' + Date.now() },
    // customArgs: [
    //   { custom_arg_1: params.to },
    //   { custom_arg_2: params.decision },
    //   { custom_arg_3: 'XIII' },
    // ],
  };

  if (params.qrBuffer && params.decision === 'accepted') {
    msg.attachments = [
      {
        content: params.qrBuffer.toString('base64'),
        filename: 'checkin-qr.png',
        type: 'image/png',
        disposition: 'inline',
        content_id: 'qr-code',
      },
    ];
  }

  try {
    const [response] = await sgMail.send(msg);
    const statusCode = response?.statusCode || 0;
    
    if (statusCode >= 200 && statusCode < 300) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Email sent to ${params.to} (${params.decision}) - Status: ${statusCode}`);
      }
    } else {
      console.error(`⚠️ Unexpected status code: ${statusCode}`);
      throw new Error(`SendGrid returned status ${statusCode}`);
    }
  } catch (error: any) {
    console.error('❌ SendGrid error:', error.response?.body || error.message);
    throw error;
  }
}

function renderTemplate({
  name,
  decision,
  hasQR,
}: {
  name: string;
  decision: Decision;
  hasQR: boolean;
}): string {
  const escapedName = escapeHtml(name);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background-color:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    img { border:none; display:block; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding:40px;background-color:#000;">
              ${
                emailLogoUrl
                  ? `<img src="${emailLogoUrl}" alt="HackUMass Logo" style="max-width:200px;height:auto;margin:0 auto;">`
                  : `<h1 style="color:#4CAF50;font-size:40px;">HackUMass</h1>`
              }
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:0 40px 30px;">
              ${copy(decision, escapedName)}
              <p style="margin:20px 0 0;font-size:14px;color:#666;">
                For any questions, contact <a href="mailto:team@hackumass.com" style="color:#4CAF50;">team@hackumass.com</a>.
              </p>
            </td>
          </tr>

          <!-- QR Code -->
          ${
            decision === 'accepted' && hasQR
              ? `
          <tr>
            <td align="center" style="padding:0 40px 30px;">
              <p style="margin:0 0 15px;font-size:14px;color:#666;">Here is your check-in QR:</p>
              <img src="cid:qr-code" alt="Check-in QR Code" style="width:200px;height:200px;border:2px solid #4CAF50;border-radius:8px;padding:10px;background-color:#fff;"/>
              <p style="margin:15px 0 0;font-size:12px;color:#999;">If the QR code doesn't display, email <a href="mailto:team@hackumass.com" style="color:#4CAF50;">team@hackumass.com</a> for assistance.</p>
            </td>
          </tr>`
              : ''
          }

          <!-- Footer -->
          <tr>
            <td style="padding:30px 40px;background-color:#f9f9f9;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;font-size:14px;color:#666;">Welcome!<br><strong style="color:#4CAF50;">HackUMass Team</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function copy(decision: Decision, name: string): string {
  if (decision === 'accepted') {
    return `<p style="margin:0 0 20px;font-size:16px;color:#333;">Hi ${name},<br><br>Congratulations! You’ve been <strong>accepted</strong> to participate in HackUMass XIII 🎉</p>`;
  }
  if (decision === 'waitlisted') {
    return `<p style="margin:0 0 20px;font-size:16px;color:#333;">Hi ${name},<br><br>Thank you for applying to HackUMass XIII. You have been placed on the waitlist. We will notify you if a spot opens.</p>`;
  }
  return `<p style="margin:0 0 20px;font-size:16px;color:#333;">Hi ${name},<br><br>Thank you for applying. Unfortunately, we are not able to offer you a spot this time.</p>`;
}

function renderText(params: { name: string; decision: Decision }): string {
  const { name, decision } = params;
  if (decision === 'accepted') {
    return `Hi ${name},

Congratulations! You've been accepted to participate in HackUMass XIII.

Your check-in QR code is attached to this email.

If the QR code doesn't display, email team@hackumass.com for assistance.

- HackUMass Team
team@hackumass.com`;
  } else if (decision === 'waitlisted') {
    return `Hi ${name},

Thank you for applying to HackUMass XIII. You are on our waitlist. We'll contact you if a spot becomes available.

- HackUMass Team
team@hackumass.com`;
  } else {
    return `Hi ${name},

Thank you for applying to HackUMass XIII. Unfortunately, we cannot offer you a spot this time.

- HackUMass Team
team@hackumass.com`;
  }
}
