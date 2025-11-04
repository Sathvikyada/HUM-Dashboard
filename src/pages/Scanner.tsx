import React from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const API_BASE = import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE || '/api';

type MealType = 'sat_breakfast' | 'sat_lunch' | 'sat_dinner' | 'sun_breakfast' | 'sun_lunch';

const MEAL_LABELS: Record<MealType, string> = {
  sat_breakfast: 'Saturday Breakfast',
  sat_lunch: 'Saturday Lunch',
  sat_dinner: 'Saturday Dinner',
  sun_breakfast: 'Sunday Breakfast',
  sun_lunch: 'Sunday Lunch',
};

type ScannerProps = {
  mode?: 'checkin' | MealType;
};

export function Scanner({ mode = 'checkin' }: ScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = React.useState<string>('Idle');
  const [error, setError] = React.useState<string>('');
  const readerRef = React.useRef<BrowserMultiFormatReader | null>(null);

  const handleCheckIn = React.useCallback(async (token: string) => {
    const mealType = mode !== 'checkin' ? mode : undefined;
    const actionLabel = mealType ? MEAL_LABELS[mealType] : 'check-in';
    
    setStatus(`Checking in for ${actionLabel}…`);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/check-in`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ token, mealType }) 
      });
      if (res.status === 200) {
        setStatus(`✅ Checked in for ${actionLabel}!`);
      } else if (res.status === 409) {
        setStatus(`Already checked in for ${actionLabel}`);
      } else if (res.status === 404) {
        setStatus('Not found');
      } else {
        setStatus('Error');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
      setStatus('Error');
    }
  }, [mode]);

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

  const title = mode !== 'checkin' ? MEAL_LABELS[mode] : 'Check-In';
  
  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{title} Scanner</h2>
      <p>Point camera at QR. Multiple organizers can use this page concurrently.</p>
      <video ref={videoRef} style={{ width: '100%', maxWidth: 480, background: '#000' }} />
      <div style={{ marginTop: 12 }}>
        <strong>Status:</strong> {status}
        {error && <div style={{ color: 'crimson' }}>{error}</div>}
      </div>
    </div>
  );
}


