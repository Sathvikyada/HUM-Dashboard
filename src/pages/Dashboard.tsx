import React from 'react';

type Applicant = {
  id: string;
  email: string;
  full_name: string;
  university?: string;
  graduation_year?: string;
  status: 'pending' | 'accepted' | 'waitlisted' | 'denied';
  created_at: string;
  checked_in_at?: string | null;
};

const API_BASE = import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE || '/api';

export function Dashboard() {
  const [items, setItems] = React.useState<Applicant[]>([]);
  const [total, setTotal] = React.useState(0);
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [adminToken, setAdminToken] = React.useState(localStorage.getItem('adminToken') || '');

  React.useEffect(() => {
    if (adminToken) localStorage.setItem('adminToken', adminToken);
  }, [adminToken]);

  async function load() {
    setLoading(true);
    try {
      const url = new URL(`${API_BASE}/list-applicants`, window.location.origin);
      if (q) url.searchParams.set('q', q);
      const res = await fetch(url.toString().replace(window.location.origin, ''), {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (adminToken) void load();
  }, []);

  async function decide(applicantId: string, decision: 'accepted' | 'waitlisted' | 'denied') {
    const note = prompt(`Optional note for ${decision}?`) || undefined;
    const res = await fetch(`${API_BASE}/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ applicantId, decision, note }),
    });
    if (!res.ok) {
      alert('Failed to update status');
      return;
    }
    await load();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="password"
          placeholder="Admin API Token"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          style={{ width: 260 }}
        />
        <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={load} disabled={!adminToken || loading}>{loading ? 'Loading…' : 'Search'}</button>
        <span style={{ marginLeft: 'auto' }}>Total: {total}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>University</th>
              <th style={th}>Grad</th>
              <th style={th}>Status</th>
              <th style={th}>Check-in</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id}>
                <td style={td}>{a.full_name}</td>
                <td style={td}>{a.email}</td>
                <td style={td}>{a.university || '-'}</td>
                <td style={td}>{a.graduation_year || '-'}</td>
                <td style={td}><StatusBadge status={a.status} /></td>
                <td style={td}>{a.checked_in_at ? new Date(a.checked_in_at).toLocaleString() : '-'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => decide(a.id, 'accepted')}>Accept</button>
                    <button onClick={() => decide(a.id, 'waitlisted')}>Waitlist</button>
                    <button onClick={() => decide(a.id, 'denied')}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Applicant['status'] }) {
  const color = status === 'accepted' ? '#0a7' : status === 'waitlisted' ? '#f90' : status === 'denied' ? '#d33' : '#777';
  return <span style={{ color, fontWeight: 600 }}>{status}</span>;
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 };
const td: React.CSSProperties = { borderBottom: '1px solid #eee', padding: 8, fontSize: 14 };


