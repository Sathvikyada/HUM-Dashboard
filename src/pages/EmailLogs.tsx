import React from 'react';

type EmailLog = {
  id: string;
  event_type: string;
  applicant_email: string;
  subject?: string;
  reason?: string;
  created_at: string;
};

const API_BASE = import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE || '/api';

export function EmailLogs() {
  const [logs, setLogs] = React.useState<EmailLog[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState<string>('all');
  const [adminToken] = React.useState(localStorage.getItem('adminToken') || '');

  React.useEffect(() => {
    if (adminToken) void loadLogs();
  }, [adminToken]);

  async function loadLogs() {
    setLoading(true);
    try {
      const url = new URL(`${API_BASE}/email-logs`, window.location.origin);
      if (filter !== 'all') url.searchParams.set('event_type', filter);
      const res = await fetch(url.toString().replace(window.location.origin, ''), {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      setLogs(data.logs || []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (adminToken) void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function getEventColor(eventType: string): string {
    const colorMap: Record<string, string> = {
      delivered: '#0a7',
      processed: '#4CAF50',
      dropped: '#d33',
      bounce: '#f90',
      deferred: '#ff9800',
      spam_report: '#9c27b0',
      unsubscribe: '#e91e63',
      open: '#2196F3',
      click: '#00BCD4',
    };
    return colorMap[eventType] || '#666';
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Email Delivery Logs</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginLeft: 'auto', padding: '8px' }}>
          <option value="all">All Events</option>
          <option value="delivered">✅ Delivered</option>
          <option value="dropped">❌ Dropped</option>
          <option value="bounce">⚠️ Bounced</option>
          <option value="deferred">⏳ Deferred</option>
          <option value="spam_report">🚫 Marked as Spam</option>
          <option value="unsubscribe">🔕 Unsubscribed</option>
          <option value="open">👁️ Opened</option>
          <option value="click">🖱️ Clicked</option>
        </select>
        <button onClick={loadLogs} disabled={!adminToken || loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={th}>Event</th>
              <th style={th}>Email</th>
              <th style={th}>Subject</th>
              <th style={th}>Reason</th>
              <th style={th}>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: '#666' }}>
                  {loading ? 'Loading...' : 'No email logs found'}
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id}>
                  <td style={td}>
                    <span style={{ color: getEventColor(log.event_type), fontWeight: 600 }}>
                      {log.event_type.toUpperCase()}
                    </span>
                  </td>
                  <td style={td}>{log.applicant_email}</td>
                  <td style={td}>{log.subject || '-'}</td>
                  <td style={td}>{log.reason || '-'}</td>
                  <td style={td}>{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8, fontSize: 13 }}>
        <strong>Legend:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li><span style={{ color: '#0a7' }}>✅ Delivered</span> - Email successfully delivered</li>
          <li><span style={{ color: '#4CAF50' }}>✅ Processed</span> - Email received by SendGrid</li>
          <li><span style={{ color: '#d33' }}>❌ Dropped</span> - Email was dropped (invalid, blacklisted, etc.)</li>
          <li><span style={{ color: '#f90' }}>⚠️ Bounced</span> - Email bounced (invalid address)</li>
          <li><span style={{ color: '#ff9800' }}>⏳ Deferred</span> - Delivery temporarily delayed</li>
          <li><span style={{ color: '#9c27b0' }}>🚫 Spam Report</span> - Recipient marked as spam</li>
          <li><span style={{ color: '#2196F3' }}>👁️ Opened</span> - Email was opened by recipient</li>
          <li><span style={{ color: '#00BCD4' }}>🖱️ Clicked</span> - Link was clicked</li>
        </ul>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8, backgroundColor: '#f9f9f9' };
const td: React.CSSProperties = { borderBottom: '1px solid #eee', padding: 8 };

