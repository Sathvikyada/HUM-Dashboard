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
  const [batchAdmitting, setBatchAdmitting] = React.useState(false);
  const [sendingDiscordUpdate, setSendingDiscordUpdate] = React.useState(false);
  const [testingDiscordEmail, setTestingDiscordEmail] = React.useState(false);
  const [deliveryStatus, setDeliveryStatus] = React.useState<{
    emails: string[];
    status: Record<string, { delivered: boolean; deliveredAt?: string }>;
    delivered: number;
    pending: number;
    polling: boolean;
  } | null>(null);
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const pageSize = 50;

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

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

  async function testDiscordEmail() {
    if (!adminToken) {
      alert('Please enter your admin token first');
      return;
    }

    const testEmail = prompt('Enter email address to test:');
    if (!testEmail) {
      return;
    }

    const testName = prompt('Enter name (optional, press Enter to use email):') || testEmail;

    setTestingDiscordEmail(true);
    try {
      const res = await fetch(`${API_BASE}/test-discord-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ email: testEmail, name: testName }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || 'Failed to send test email'}`);
        return;
      }

      alert(`✅ Test email sent successfully to ${testEmail}!\n\nCheck your inbox for the Discord update email.`);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to send test email'}`);
    } finally {
      setTestingDiscordEmail(false);
    }
  }

  async function sendDiscordUpdate() {
    if (!adminToken) {
      alert('Please enter your admin token first');
      return;
    }

    const confirmMsg = `Send Discord link update email to all delivered emails?\n\n` +
      `This will send the updated Discord link to all applicants who received the acceptance email.\n\n` +
      `Note: This may take a few minutes to complete.`;
    
    if (!confirm(confirmMsg)) {
      return;
    }

    setSendingDiscordUpdate(true);
    try {
      const res = await fetch(`${API_BASE}/send-discord-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || 'Failed to send Discord update emails'}`);
        return;
      }

      const message = `Discord update email sent!\n\n` +
        `Total delivered emails (from acceptance): ${data.originalDeliveredCount || data.total}\n` +
        `Successfully sent: ${data.sent}\n` +
        `Failed: ${data.failed}\n` +
        `Verified delivered (Discord update): ${data.verifiedDelivered || data.discordDeliveredCount || 0}\n` +
        `Coverage: ${data.coverage || 0}%\n` +
        `Missing deliveries: ${data.missingDeliveries || 0}`;

      if (data.errors && data.errors.length > 0) {
        alert(message + `\n\nErrors:\n${data.errors.map((e: any) => `- ${e.email}: ${e.error}`).join('\n')}`);
      } else if (data.missingEmails && data.missingEmails.length > 0) {
        alert(message + `\n\n⚠️ Missing deliveries:\n${data.missingEmails.slice(0, 10).join('\n')}${data.missingEmails.length > 10 ? `\n... and ${data.missingEmails.length - 10} more` : ''}`);
      } else {
        alert(message);
      }

      // Refresh to show updated status
      await load();
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to send Discord update emails'}`);
    } finally {
      setSendingDiscordUpdate(false);
    }
  }

  async function checkEmailDelivery(emails: string[]): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/check-email-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ emails }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setDeliveryStatus({
          emails,
          status: data.status,
          delivered: data.delivered,
          pending: data.pending,
          polling: true,
        });
      }
    } catch (err: any) {
      console.error('Error checking email delivery:', err);
    }
  }

  async function batchAdmitPage() {
    if (!adminToken) {
      alert('Please enter your admin token first');
      return;
    }

    const eligibleCount = items.filter(a => a.status === 'pending').length;
    if (eligibleCount === 0) {
      alert('No pending applicants on this page to admit');
      return;
    }

    const confirmMsg = `Admit all pending applicants on this page?\n\n` +
      `Total on page: ${items.length}\n` +
      `Pending (will be admitted): ${eligibleCount}\n` +
      `Already decided (will be skipped): ${items.length - eligibleCount}\n\n` +
      `Note: Applicants on the exclusion list will be skipped automatically.`;
    
    if (!confirm(confirmMsg)) {
      return;
    }

    setBatchAdmitting(true);
    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setDeliveryStatus(null);
    
    try {
      const applicantIds = items.map(a => a.id);
      const res = await fetch(`${API_BASE}/batch-admit-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ applicantIds, organizerName }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || 'Failed to batch admit'}`);
        return;
      }

      const message = `Batch admission complete!\n\n` +
        `Total on page: ${data.total}\n` +
        `Eligible: ${data.eligible}\n` +
        `Skipped: ${data.skipped}\n` +
        `Admitted: ${data.admitted}\n` +
        `Failed: ${data.failed}`;

      if (data.errors && data.errors.length > 0) {
        alert(message + `\n\nErrors:\n${data.errors.map((e: any) => `- ${e.email}: ${e.error}`).join('\n')}`);
      }

      // Start polling for email delivery status
      if (data.sentEmails && data.sentEmails.length > 0) {
        // Clear any existing polling interval
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        const duration = 60000; // 1 minute
        const interval = 3000; // Check every 3 seconds

        // Initial check
        await checkEmailDelivery(data.sentEmails);

        // Poll every 3 seconds for 1 minute
        let pollCount = 0;
        const maxPolls = duration / interval; // 20 polls over 1 minute
        
        pollIntervalRef.current = setInterval(() => {
          pollCount++;
          
          if (pollCount >= maxPolls) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setDeliveryStatus(prev => prev ? { ...prev, polling: false } : null);
            return;
          }
          
          checkEmailDelivery(data.sentEmails).catch(console.error);
        }, interval);
      }

      // Refresh the page
      await load();
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to batch admit'}`);
    } finally {
      setBatchAdmitting(false);
    }
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
        <button 
          onClick={batchAdmitPage} 
          disabled={!adminToken || loading || batchAdmitting}
          style={{
            backgroundColor: '#0a7',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 4,
            cursor: batchAdmitting || loading || !adminToken ? 'not-allowed' : 'pointer',
            opacity: batchAdmitting || loading || !adminToken ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {batchAdmitting ? 'Admitting…' : 'Admit All on Page'}
        </button>
        <button 
          onClick={testDiscordEmail} 
          disabled={!adminToken || loading || testingDiscordEmail}
          style={{
            backgroundColor: '#99AAB5',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 4,
            cursor: testingDiscordEmail || loading || !adminToken ? 'not-allowed' : 'pointer',
            opacity: testingDiscordEmail || loading || !adminToken ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {testingDiscordEmail ? 'Sending…' : 'Test Discord Email'}
        </button>
        <button 
          onClick={sendDiscordUpdate} 
          disabled={!adminToken || loading || sendingDiscordUpdate}
          style={{
            backgroundColor: '#5865F2',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 4,
            cursor: sendingDiscordUpdate || loading || !adminToken ? 'not-allowed' : 'pointer',
            opacity: sendingDiscordUpdate || loading || !adminToken ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {sendingDiscordUpdate ? 'Sending…' : 'Send Discord Update'}
        </button>
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

      {deliveryStatus && deliveryStatus.emails.length > 0 && (
        <div style={{
          marginTop: 24,
          padding: 16,
          backgroundColor: '#f9f9f9',
          borderRadius: 8,
          border: '1px solid #ddd'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Email Delivery Status {deliveryStatus.polling && '⏳ Polling...'}</h3>
            <div style={{ fontSize: 14, color: '#666' }}>
              ✅ {deliveryStatus.delivered} delivered | ⏳ {deliveryStatus.pending} pending
            </div>
          </div>
          <div style={{ 
            maxHeight: 200, 
            overflowY: 'auto',
            fontSize: 12,
            fontFamily: 'monospace'
          }}>
            {deliveryStatus.emails.map(email => {
              const status = deliveryStatus.status[email];
              const isDelivered = status?.delivered || false;
              return (
                <div 
                  key={email} 
                  style={{ 
                    padding: '4px 8px',
                    marginBottom: 2,
                    backgroundColor: isDelivered ? '#e8f5e9' : '#fff3e0',
                    borderRadius: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ color: isDelivered ? '#2e7d32' : '#f57c00' }}>
                    {isDelivered ? '✅' : '⏳'} {email}
                  </span>
                  {status?.deliveredAt && (
                    <span style={{ fontSize: 11, color: '#666' }}>
                      {new Date(status.deliveredAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {!deliveryStatus.polling && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#666', fontStyle: 'italic' }}>
              Polling stopped after 1 minute. Check Email Logs page for final delivery status.
            </div>
          )}
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
