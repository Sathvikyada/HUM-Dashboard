import QRCode from 'qrcode';

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
}

export function generateQrToken(): string {
  const random = crypto.getRandomValues(new Uint32Array(4));
  const hex = Array.from(random).map(n => n.toString(16).padStart(8, '0')).join('');
  // shorter token for readability, still sufficiently random (~64 bits)
  return hex.slice(0, 16);
}

