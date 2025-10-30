import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY as string;
const emailFrom = process.env.EMAIL_FROM as string;

if (!resendApiKey || !emailFrom) {
  console.warn('Resend not fully configured; emails will fail.');
}

const resend = new Resend(resendApiKey || '');

type Decision = 'accepted' | 'waitlisted' | 'denied';

export async function sendDecisionEmail(params: {
  to: string;
  name: string;
  decision: Decision;
  qrImageDataUrl?: string;
}): Promise<void> {
  const subjectMap = {
    accepted: 'You are accepted to HackUMass! 🎉',
    waitlisted: 'HackUMass Application Update – Waitlist',
    denied: 'HackUMass Application Update',
  } as const;

  const body = renderTemplate(params);

  await resend.emails.send({
    from: emailFrom,
    to: params.to,
    subject: subjectMap[params.decision],
    html: body,
  });
}

function renderTemplate({ name, decision, qrImageDataUrl }: { name: string; decision: Decision; qrImageDataUrl?: string; }): string {
  const base = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5;">
      <p>Hi ${escapeHtml(name)},</p>
      ${copy(decision)}
      <p style="margin-top:24px;">Best,<br/>HackUMass Team</p>
    </div>
  `;
  if (decision === 'accepted' && qrImageDataUrl) {
    return base.replace('</div>', `<p>Your check-in QR code is below. Please bring this email to check-in.</p><img alt="QR code" src="${qrImageDataUrl}" style="width:200px;height:200px;image-rendering:pixelated;"/></div>`);
  }
  return base;
}

function copy(decision: Decision): string {
  if (decision === 'accepted') {
    return '<p>Congratulations! You have been <strong>accepted</strong> to HackUMass. We look forward to seeing you at check-in.</p>';
  }
  if (decision === 'waitlisted') {
    return '<p>Thank you for applying. You have been placed on the <strong>waitlist</strong>. We will notify you if a spot opens.</p>';
  }
  return '<p>Thank you for applying. Unfortunately, we are not able to offer you a spot this time.</p>';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"] /g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', ' ': ' ' }[c] as string));
}

