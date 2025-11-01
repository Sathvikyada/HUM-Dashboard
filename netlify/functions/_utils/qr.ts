import QRCode from 'qrcode';
import crypto from 'crypto';

// Generate QR code as PNG buffer (for attachment)
export async function generateQrBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 5,
    type: 'png',
  });
}

// Optional Data URL generator (for testing/debug)
export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 5,
    });
  } catch (err) {
    console.error('QR toDataURL failed, using buffer fallback:', err);
    const qrBuffer = await generateQrBuffer(text);
    return `data:image/png;base64,${qrBuffer.toString('base64')}`;
  }
}

// Generate short random token (16 hex chars = 64 bits entropy)
export function generateQrToken(): string {
  return crypto.randomBytes(8).toString('hex');
}