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
  const [showBorder, setShowBorder] = React.useState<boolean>(false);
  const [borderColor, setBorderColor] = React.useState<string>('#4CAF50'); // green by default
  const [tShirtSize, setTShirtSize] = React.useState<string | null>(null);
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
      
      const data = await res.json().catch(() => ({}));
      const returnedTShirtSize = data.tShirtSize || null;
      
      // Debug logging
      console.log('Check-in response:', { status: res.status, data, returnedTShirtSize, tShirtSizeState: tShirtSize });
      
      if (res.status === 200) {
        setStatus(`✅ Checked in for ${actionLabel}!`);
        // Only set t-shirt size for regular check-in, not meal check-ins
        if (mode === 'checkin') {
          setTShirtSize(returnedTShirtSize);
        } else {
          setTShirtSize(null);
        }
        setBorderColor('#4CAF50'); // Green for success
        setShowBorder(true);
        setTimeout(() => {
          setShowBorder(false);
        }, 3000);
      } else if (res.status === 409) {
        setStatus(`Already checked in for ${actionLabel}`);
        // Only set t-shirt size for regular check-in, not meal check-ins
        if (mode === 'checkin') {
          setTShirtSize(returnedTShirtSize);
        } else {
          setTShirtSize(null);
        }
        setBorderColor('#f44336'); // Red for already checked in
        setShowBorder(true);
        setTimeout(() => {
          setShowBorder(false);
        }, 3000);
      } else if (res.status === 404) {
        setStatus('Not found');
        setTShirtSize(null);
        setBorderColor('#ff9800'); // Orange for not found
        setShowBorder(true);
        setTimeout(() => {
          setShowBorder(false);
        }, 3000);
      } else {
        setStatus('Error');
        setTShirtSize(null);
        setBorderColor('#f44336'); // Red for error
        setShowBorder(true);
        setTimeout(() => {
          setShowBorder(false);
        }, 3000);
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
      setStatus('Error');
      setBorderColor('#f44336'); // Red for error
      setShowBorder(true);
      setTimeout(() => setShowBorder(false), 3000);
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <h2 style={{ marginBottom: 16, textAlign: 'center' }}>{title} Scanner</h2>
        <p style={{ textAlign: 'center', marginBottom: 20 }}>
          Point camera at QR. Multiple organizers can use this page concurrently.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <video 
            ref={videoRef} 
            style={{ 
              width: '100%', 
              maxWidth: 480, 
              background: '#000',
              transform: 'scaleX(-1)', // Mirror the camera
              borderRadius: 8
            }} 
          />
        </div>
        <div style={{ 
          marginTop: 12,
          textAlign: 'center',
          padding: (status !== 'Idle' && !status.includes('Checking in')) ? '20px 30px' : '12px 20px',
          borderRadius: 8,
          border: showBorder ? `3px solid ${borderColor}` : 'none',
          backgroundColor: (status !== 'Idle' && !status.includes('Checking in'))
            ? (borderColor === '#4CAF50' ? '#f0f8f0' : borderColor === '#f44336' ? '#ffebee' : borderColor === '#ff9800' ? '#fff3e0' : 'transparent')
            : 'transparent',
          transition: 'all 0.3s ease',
          minHeight: '60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ fontSize: (status !== 'Idle' && !status.includes('Checking in')) ? '24px' : '16px', fontWeight: 600, marginBottom: (tShirtSize && mode === 'checkin') ? '8px' : '0' }}>
            {status}
          </div>
          {tShirtSize && mode === 'checkin' && (
            <div style={{ fontSize: '18px', color: '#666', marginTop: '8px' }}>
              T-Shirt Size: <strong style={{ color: '#333' }}>{tShirtSize}</strong>
            </div>
          )}
          {/* Debug: Show even if empty to verify state - only for regular check-in */}
          {!tShirtSize && mode === 'checkin' && status !== 'Idle' && !status.includes('Checking in') && (
            <div style={{ fontSize: '14px', color: '#999', marginTop: '8px', fontStyle: 'italic' }}>
              (No t-shirt size found)
            </div>
          )}
          {error && <div style={{ color: 'crimson', marginTop: 8, fontSize: '16px' }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}


