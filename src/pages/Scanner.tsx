import React from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const API_BASE = import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE || '/api';

export function Scanner() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = React.useState<string>('Idle');
  const [error, setError] = React.useState<string>('');
  const readerRef = React.useRef<BrowserMultiFormatReader | null>(null);

  const handleCheckIn = React.useCallback(async (token: string) => {
    setStatus('Checking in…');
    setError('');
    try {
      const res = await fetch(`${API_BASE}/check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (res.status === 200) {
        setStatus('Checked in!');
      } else if (res.status === 409) {
        setStatus('Already checked in');
      } else if (res.status === 404) {
        setStatus('Not found');
      } else {
        setStatus('Error');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
      setStatus('Error');
    }
  }, []);

  React.useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let stopped = false;
    let controls: any = null;
    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const deviceId = devices[0]?.deviceId;
        controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, async (result, err) => {
          if (stopped) return;
          if (result) {
            stopped = true; // pause on result
            const text = result.getText();
            try {
              const payload = JSON.parse(text);
              const token = payload.t || payload.token || text;
              await handleCheckIn(token);
            } catch {
              await handleCheckIn(text);
            }
            setTimeout(() => { stopped = false; }, 1200);
          }
        });
      } catch (e: any) {
        setError(e?.message || 'Camera error');
      }
    })();
    return () => { 
      if (controls) controls.stop();
      if (reader) {
        try { (reader as any).stopAsyncDecode?.(); } catch {}
      }
    };
  }, [handleCheckIn]);

  return (
    <div>
      <p>Point camera at QR. Multiple organizers can use this page concurrently.</p>
      <video ref={videoRef} style={{ width: '100%', maxWidth: 480, background: '#000' }} />
      <div style={{ marginTop: 12 }}>
        <strong>Status:</strong> {status}
        {error && <div style={{ color: 'crimson' }}>{error}</div>}
      </div>
    </div>
  );
}


