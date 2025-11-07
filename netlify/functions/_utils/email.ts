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
    trackingSettings: {
      clickTracking: { enable: false },
      openTracking: { enable: false },
    },
    headers: { 'X-Entity-Ref-ID': params.decision + '-' + Date.now() },
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
            <td style="padding:40px 40px 30px;">
              ${copy(decision, escapedName)}
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
    return `<p style="margin:0 0 20px;font-size:16px;color:#333;">Hey ${name},<br><br>Congratulations! You've been accepted to participate in HackUMass.<br><br>The check-in and opening ceremony will begin at 6:30 PM at the Campus Center Auditorium (1 Campus Center Way, Amherst, MA 01002). The event is from November 7th to 9th, 2025 at the Integrative Learning Center (ILC).<br><br>In order to participate, make sure you join our Discord (<a href="https://discord.gg/bATf3zC2" style="color:#4CAF50;">https://discord.gg/bATf3zC2</a>)! There, you will find more information about the event. If you have any questions please visit our website at <a href="https://hackumass.com/" style="color:#4CAF50;">https://hackumass.com/</a>.<br><br>If you cannot find your answer on our website, then please feel free to shoot us an email at <a href="mailto:team@hackumass.com" style="color:#4CAF50;">team@hackumass.com</a><br><br>Thanks again for registering for our event, and we look forward to seeing you there!</p>`;
  }
  if (decision === 'waitlisted') {
    return `<p style="margin:0 0 20px;font-size:16px;color:#333;">Hi ${name},<br><br>Thank you for applying to HackUMass XIII. You have been placed on the waitlist. We will notify you if a spot opens.</p>`;
  }
  return `<p style="margin:0 0 20px;font-size:16px;color:#333;">Hi ${name},<br><br>Thanks for applying to HackUMass. Unfortunately we don't have enough room to accommodate everyone who wants to participate and we've had to reject your application. We hope that you'll continue your enthusiasm for hacking and apply to other awesome hackathons (you can find a list at <a href="https://mlh.io/seasons/2026/events" style="color:#4CAF50;">https://mlh.io/seasons/2026/events</a>).<br><br>Thanks again for applying to HackUMass, and we hope that you'll apply again next year.</p>`;
}

function renderText(params: { name: string; decision: Decision }): string {
  const { name, decision } = params;
  if (decision === 'accepted') {
    return `Hey ${name},

Congratulations! You've been accepted to participate in HackUMass.

The check-in and opening ceremony will begin at 6:30 PM at the Campus Center Auditorium (1 Campus Center Way, Amherst, MA 01002). The event is from November 7th to 9th, 2025 at the Integrative Learning Center (ILC).

In order to participate, make sure you join our Discord (https://discord.gg/YZshAc5GH9)! There, you will find more information about the event. If you have any questions please visit our website at https://hackumass.com/.

If you cannot find your answer on our website, then please feel free to shoot us an email at team@hackumass.com

Thanks again for registering for our event, and we look forward to seeing you there!

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

Thanks for applying to HackUMass. Unfortunately we don't have enough room to accommodate everyone who wants to participate and we've had to reject your application. We hope that you'll continue your enthusiasm for hacking and apply to other awesome hackathons (you can find a list at https://mlh.io/seasons/2026/events).

Thanks again for applying to HackUMass, and we hope that you'll apply again next year,

The HackUMass Team`;
  }
}

export async function sendDiscordUpdateEmail(params: {
  to: string;
  name: string;
}): Promise<void> {
  if (!sendgridApiKey) throw new Error('Missing SENDGRID_API_KEY');
  if (!emailFrom) throw new Error('Missing EMAIL_FROM environment variable');

  const escapedName = escapeHtml(params.name);

  const html = `
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
            <td style="padding:40px 40px 30px;">
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Dear ${escapedName},</p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Please make sure to join the discord to recieve the latest updates during the hackathon.</p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">If you are unable to access the Discord using the link provided to you in the previous link or if the Discord invite expired, please use the following link to join the HackUMass XIII Discord Server:</p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">
                <a href="https://discord.gg/YZshAc5GH9" style="color:#4CAF50;font-weight:600;text-decoration:none;">https://discord.gg/YZshAc5GH9</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:30px 40px;background-color:#f9f9f9;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;font-size:14px;color:#666;">Best regards,<br><strong style="color:#4CAF50;">The HackUMass Team</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `Dear ${params.name},

Please make sure to join the discord to recieve the latest updates during the hackathon.

If you are unable to access the Discord using the link provided to you in the previous link or if the Discord invite expired, please use the following link to join the HackUMass XIII Discord Server:

https://discord.gg/YZshAc5GH9

Best regards,
The HackUMass Team`;

  const msg: any = {
    from: emailFrom,
    to: params.to,
    bcc: adminEmail,
    replyTo: 'team@hackumass.com',
    subject: 'HackUMass XIII - Discord Server Update',
    html,
    text,
    trackingSettings: {
      clickTracking: { enable: false },
      openTracking: { enable: false },
    },
    headers: { 'X-Entity-Ref-ID': 'discord-update-' + Date.now() },
  };

  try {
    const [response] = await sgMail.send(msg);
    const statusCode = response?.statusCode || 0;

    if (statusCode >= 200 && statusCode < 300) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Discord update email sent to ${params.to} - Status: ${statusCode}`);
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

export async function sendTravelStipendEmail(params: {
  to: string;
  name: string;
  stipendAmount: string | number;
  qrBuffer?: Buffer;
}): Promise<void> {
  if (!sendgridApiKey) throw new Error('Missing SENDGRID_API_KEY');
  if (!emailFrom) throw new Error('Missing EMAIL_FROM environment variable');

  const escapedName = escapeHtml(params.name);
  const stipendAmount = typeof params.stipendAmount === 'number' 
    ? params.stipendAmount.toString() 
    : params.stipendAmount;

  const html = `
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
            <td style="padding:40px 40px 30px;">
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Dear ${escapedName},</p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">We're excited to confirm that we've received your RSVP for HackUMass XIII. Welcome aboard!</p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Here's the event details and next steps:</p>
              
              <h3 style="margin:20px 0 10px;font-size:18px;color:#333;">Event Details:</h3>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">
                Location: Integrated Learning Center (ILC), 650 N Pleasant St, Amherst, MA 01003<br>
                Dates: November 7-9, 2025<br>
                Check-in Time: Please arrive by 6:30 PM on November 7th. If you anticipate arriving later, kindly let us know in advance.
              </p>
              
              <h3 style="margin:20px 0 10px;font-size:18px;color:#333;">Travel Stipend:</h3>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">
                You have been awarded a $${stipendAmount} travel stipend, which will be provided during the hackathon as a Visa gift card for ease of use and transparency.
              </p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Please remember to bring your travel receipts to remain eligible.</p>
              
              <h3 style="margin:20px 0 10px;font-size:18px;color:#333;">What to Bring:</h3>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Don't forget to bring a valid form of ID with you to the event.</p>
              
              <h3 style="margin:20px 0 10px;font-size:18px;color:#333;">Join Our Discord:</h3>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">
                In order to participate, make sure you join our Discord (<a href="https://discord.gg/YZshAc5GH9" style="color:#4CAF50;">https://discord.gg/YZshAc5GH9</a>)! There, you will find more information about the event.
              </p>
              
              <p style="margin:0 0 20px;font-size:16px;color:#333;">
                If you have any questions please visit our website at <a href="https://hackumass.com/" style="color:#4CAF50;">https://hackumass.com/</a>.
              </p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">
                If you cannot find your answer on our website, then please feel free to shoot us an email at <a href="mailto:team@hackumass.com" style="color:#4CAF50;">team@hackumass.com</a>
              </p>
              <p style="margin:0 0 20px;font-size:16px;color:#333;">Thanks again for registering for our event, and we look forward to seeing you there!</p>
            </td>
          </tr>

          <!-- QR Code -->
          ${
            params.qrBuffer
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
              <p style="margin:0;font-size:14px;color:#666;">Best regards,<br><strong style="color:#4CAF50;">The HackUMass Team</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `Dear ${params.name},

We're excited to confirm that we've received your RSVP for HackUMass XIII. Welcome aboard!

Here's the event details and next steps:

Event Details:
Location: Integrated Learning Center (ILC), 650 N Pleasant St, Amherst, MA 01003
Dates: November 7-9, 2025
Check-in Time: Please arrive by 6:30 PM on November 7th. If you anticipate arriving later, kindly let us know in advance.

Travel Stipend:
You have been awarded a $${stipendAmount} travel stipend, which will be provided during the hackathon as a Visa gift card for ease of use and transparency.

Please remember to bring your travel receipts to remain eligible.

What to Bring:
Don't forget to bring a valid form of ID with you to the event.

Join Our Discord:
In order to participate, make sure you join our Discord (https://discord.gg/YZshAc5GH9)! There, you will find more information about the event.

If you have any questions please visit our website at https://hackumass.com/. 

If you cannot find your answer on our website, then please feel free to shoot us an email at team@hackumass.com

Thanks again for registering for our event, and we look forward to seeing you there!

Best regards,
The HackUMass Team`;

  const msg: any = {
    from: emailFrom,
    to: params.to,
    bcc: adminEmail,
    replyTo: 'team@hackumass.com',
    subject: 'HackUMass XIII - RSVP Confirmation & Travel Stipend',
    html,
    text,
    trackingSettings: {
      clickTracking: { enable: false },
      openTracking: { enable: false },
    },
    headers: { 'X-Entity-Ref-ID': 'travel-stipend-' + Date.now() },
  };

  if (params.qrBuffer) {
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
        console.log(`✅ Travel stipend email sent to ${params.to} - Status: ${statusCode}`);
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
