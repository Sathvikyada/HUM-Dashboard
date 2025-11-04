import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Scanner } from './pages/Scanner';
import { EmailLogs } from './pages/EmailLogs';

// Wrapper component to pass mode to Scanner based on route
function ScannerWrapper() {
  const { mode } = useParams<{ mode: string }>();
  if (mode === 'checkin') {
    return <Scanner mode="checkin" />;
  }
  if (['sat_breakfast', 'sat_lunch', 'sat_dinner', 'sun_breakfast', 'sun_lunch'].includes(mode || '')) {
    return <Scanner mode={mode as any} />;
  }
  return <Scanner mode="checkin" />;
}

function AppShell() {
  const [showScanners, setShowScanners] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowScanners(false);
      }
    }
    if (showScanners) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showScanners]);

  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>HackUMass Admin</h1>
          <nav style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/">Dashboard</Link>
            <Link to="/email-logs">Email Logs</Link>
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button 
                onClick={() => setShowScanners(!showScanners)}
                style={{ 
                  background: 'none', 
                  border: '1px solid #ddd', 
                  padding: '8px 12px', 
                  cursor: 'pointer',
                  borderRadius: 4
                }}
              >
                Scanners {showScanners ? '▼' : '▶'}
              </button>
              {showScanners && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  background: 'white',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  marginTop: 4,
                  zIndex: 1000,
                  minWidth: 180
                }}>
                  <Link to="/scanner/checkin" onClick={() => setShowScanners(false)} style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: '#333', borderBottom: '1px solid #eee' }}>Check-In</Link>
                  <Link to="/scanner/sat_breakfast" onClick={() => setShowScanners(false)} style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: '#333', borderBottom: '1px solid #eee' }}>Sat Breakfast</Link>
                  <Link to="/scanner/sat_lunch" onClick={() => setShowScanners(false)} style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: '#333', borderBottom: '1px solid #eee' }}>Sat Lunch</Link>
                  <Link to="/scanner/sat_dinner" onClick={() => setShowScanners(false)} style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: '#333', borderBottom: '1px solid #eee' }}>Sat Dinner</Link>
                  <Link to="/scanner/sun_breakfast" onClick={() => setShowScanners(false)} style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: '#333', borderBottom: '1px solid #eee' }}>Sun Breakfast</Link>
                  <Link to="/scanner/sun_lunch" onClick={() => setShowScanners(false)} style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: '#333' }}>Sun Lunch</Link>
                </div>
              )}
            </div>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/email-logs" element={<EmailLogs />} />
          <Route path="/scanner/:mode" element={<ScannerWrapper />} />
          <Route path="/scanner" element={<Navigate to="/scanner/checkin" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<AppShell />);

