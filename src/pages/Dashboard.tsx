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
  decided_by?: string | null;
  responses?: Record<string, any>;
  decision_note?: string;
};


const API_BASE = import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE || '/api';

export function Dashboard() {
  const [items, setItems] = React.useState<Applicant[]>([]);
  const [total, setTotal] = React.useState(0);
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [adminToken, setAdminToken] = React.useState(localStorage.getItem('adminToken') || '');
  const [organizerName, setOrganizerName] = React.useState(localStorage.getItem('organizerName') || '');
  const [selectedApplicant, setSelectedApplicant] = React.useState<Applicant | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 50;

  React.useEffect(() => {
    if (adminToken) localStorage.setItem('adminToken', adminToken);
  }, [adminToken]);

  React.useEffect(() => {
    if (organizerName) localStorage.setItem('organizerName', organizerName);
  }, [organizerName]);

  async function load(pageNum?: number) {
    const page = pageNum !== undefined ? pageNum : currentPage;
    setLoading(true);
    try {
      const url = new URL(`${API_BASE}/list-applicants`, window.location.origin);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('pageSize', pageSize.toString());
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
    if (adminToken) void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (adminToken && q) {
      setCurrentPage(1);
      void load(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function decide(applicantId: string, decision: 'accepted' | 'waitlisted' | 'denied') {
    const res = await fetch(`${API_BASE}/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ applicantId, decision, note: undefined, organizerName }),
    });
    if (!res.ok) {
      if (res.status === 409) {
        const data = await res.json();
        alert(data.message || 'Already decided by another organizer');
      } else {
        alert('Failed to update status');
      }
      await load(); // Refresh to show current state
      return;
    }
    await load();
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="password"
          placeholder="Admin API Token"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          style={{ width: 200 }}
        />
        <input
          placeholder="Your Name"
          value={organizerName}
          onChange={(e) => setOrganizerName(e.target.value)}
          style={{ width: 150 }}
        />
        <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => load(currentPage)} disabled={!adminToken || loading}>{loading ? 'Loading…' : 'Search'}</button>
        <span style={{ marginLeft: 'auto' }}>
          Page {currentPage} of {totalPages} | Total: {total}
        </span>
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
              <th style={th}>Decided By</th>
              <th style={th}>Check-in</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr 
                key={a.id}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedApplicant(a)}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}
              >
                <td style={td}>{a.full_name}</td>
                <td style={td}>{a.email}</td>
                <td style={td}>{a.university || '-'}</td>
                <td style={td}>{a.graduation_year || '-'}</td>
                <td style={td}><StatusBadge status={a.status} /></td>
                <td style={td}>{a.decided_by || '-'}</td>
                <td style={td}>{a.checked_in_at ? new Date(a.checked_in_at).toLocaleString() : '-'}</td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
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

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button 
            onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); load(Math.max(1, currentPage - 1)); }}
            disabled={currentPage === 1 || loading}
          >
            Previous
          </button>
          <span style={{ padding: '8px 16px' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button 
            onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); load(Math.min(totalPages, currentPage + 1)); }}
            disabled={currentPage === totalPages || loading}
          >
            Next
          </button>
        </div>
      )}

      {selectedApplicant && (
        <ApplicantModal 
          applicant={selectedApplicant} 
          onClose={() => setSelectedApplicant(null)}
          onDecide={(decision) => {
            decide(selectedApplicant.id, decision);
            setSelectedApplicant(null);
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Applicant['status'] }) {
  const color = status === 'accepted' ? '#0a7' : status === 'waitlisted' ? '#f90' : status === 'denied' ? '#d33' : '#777';
  return <span style={{ color, fontWeight: 600 }}>{status}</span>;
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 };
const td: React.CSSProperties = { borderBottom: '1px solid #eee', padding: 8, fontSize: 14 };

function ApplicantModal({ 
  applicant, 
  onClose, 
  onDecide 
}: { 
  applicant: Applicant; 
  onClose: () => void; 
  onDecide: (decision: 'accepted' | 'waitlisted' | 'denied') => void;
}) {
  const responses = applicant.responses || {};
  
  // Filter out empty values and format keys
  const formattedResponses = Object.entries(responses)
    .filter(([_, value]) => value && String(value).trim() !== '')
    .map(([key, value]) => ({
      key: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: String(value)
    }));

  const isLink = (str: string) => str.startsWith('http://') || str.startsWith('https://');

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 24,
          maxWidth: 800,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>{applicant.full_name}</h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: 24 }}>
          <StatusBadge status={applicant.status} />
          {applicant.decided_by && (
            <span style={{ marginLeft: 16, color: '#666' }}>
              Decided by: {applicant.decided_by}
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <strong style={{ color: '#666', fontSize: 12 }}>Email</strong>
            <div>{applicant.email}</div>
          </div>
          {applicant.university && (
            <div>
              <strong style={{ color: '#666', fontSize: 12 }}>University</strong>
              <div>{applicant.university}</div>
            </div>
          )}
          {applicant.graduation_year && (
            <div>
              <strong style={{ color: '#666', fontSize: 12 }}>Graduation Year</strong>
              <div>{applicant.graduation_year}</div>
            </div>
          )}
          {applicant.checked_in_at && (
            <div>
              <strong style={{ color: '#666', fontSize: 12 }}>Checked In</strong>
              <div>{new Date(applicant.checked_in_at).toLocaleString()}</div>
            </div>
          )}
        </div>

        {formattedResponses.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, marginBottom: 16, borderBottom: '2px solid #eee', paddingBottom: 8 }}>
              Application Responses
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {formattedResponses.map(({ key, value }, idx) => (
                <div key={idx} style={{ padding: 12, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
                  <strong style={{ display: 'block', marginBottom: 4, color: '#333' }}>{key}</strong>
                  {isLink(value) ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', wordBreak: 'break-all' }}>
                      {value}
                    </a>
                  ) : (
                    <div style={{ color: '#666' }}>{value}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: 16 }}>
          <button onClick={() => onDecide('accepted')} style={{ padding: '8px 16px', backgroundColor: '#0a7', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Accept
          </button>
          <button onClick={() => onDecide('waitlisted')} style={{ padding: '8px 16px', backgroundColor: '#f90', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Waitlist
          </button>
          <button onClick={() => onDecide('denied')} style={{ padding: '8px 16px', backgroundColor: '#d33', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Deny
          </button>
          <button onClick={onClose} style={{ padding: '8px 16px', backgroundColor: '#999', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
