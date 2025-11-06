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
  const [sendingTravelStipend, setSendingTravelStipend] = React.useState(false);
  const [testingTravelStipendEmail, setTestingTravelStipendEmail] = React.useState(false);
  const [sendingDiscordUpdate, setSendingDiscordUpdate] = React.useState(false);
  const [discordUpdateStatus, setDiscordUpdateStatus] = React.useState<{
    currentPage: number;
    totalPages: number;
    totalEmails: number;
    sent: number;
    failed: number;
    errors: Array<{ email: string; error: string }>;
    sentDetails: Array<{ email: string; name: string }>;
  } | null>(null);
  const [travelStipendStatus, setTravelStipendStatus] = React.useState<{
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    sentDetails: Array<{ email: string; name: string; stipendAmount: string }>;
    errors: Array<{ email: string; error: string }>;
  } | null>(null);
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

  async function testTravelStipendEmail() {
    if (!adminToken) {
      alert('Please enter your admin token first');
      return;
    }

    const testEmail = prompt('Enter email address of applicant in database to send test travel stipend email:');
    if (!testEmail) {
      return;
    }

    setTestingTravelStipendEmail(true);
    try {
      const res = await fetch(`${API_BASE}/test-travel-stipend-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ 
          email: testEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || 'Failed to send test email'}\n\n${data.hint || ''}`);
        return;
      }

      const applicant = data.applicant || {};
      alert(`✅ Test travel stipend email sent successfully!\n\n` +
        `Sent to: ${applicant.email || testEmail}\n` +
        `Name: ${applicant.name || 'N/A'}\n` +
        `Stipend Amount: $${applicant.stipendAmount || 'N/A'}\n\n` +
        `Check your inbox for the email.`);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to send test email'}`);
    } finally {
      setTestingTravelStipendEmail(false);
    }
  }

  async function sendDiscordUpdatePage() {
    if (!adminToken) {
      alert('Please enter your admin token first');
      return;
    }

    // Get emails from current page applicants
    const currentPageEmails = items.map(item => item.email.toLowerCase());
    
    if (currentPageEmails.length === 0) {
      alert('No applicants on this page to send emails to');
      return;
    }

    setSendingDiscordUpdate(true);
    
    try {
      const res = await fetch(`${API_BASE}/send-discord-update-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ emails: currentPageEmails }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || 'Failed to send Discord update emails'}`);
        return;
      }

      // Update status
      setDiscordUpdateStatus({
        currentPage: 1,
        totalPages: 1,
        totalEmails: data.totalOnPage || 0,
        sent: data.sent || 0,
        failed: data.failed || 0,
        errors: data.errors || [],
        sentDetails: data.sentDetails || [],
      });

      const message = `Discord update emails sent!\n\n` +
        `Applicants on this page: ${data.totalOnPage || 0}\n` +
        `In email list: ${data.inList || 0}\n` +
        `Successfully sent: ${data.sent}\n` +
        `Skipped (not in list): ${data.skipped || 0}\n` +
        `Failed: ${data.failed}`;

      if (data.errors && data.errors.length > 0) {
        alert(message + `\n\nErrors:\n${data.errors.slice(0, 5).map((e: any) => `- ${e.email}: ${e.error}`).join('\n')}`);
      } else {
        alert(message);
      }

      // Start polling for email delivery status
      if (data.sentDetails && data.sentDetails.length > 0) {
        const sentEmails = data.sentDetails.map((d: any) => d.email);
        
        // Clear any existing polling interval
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        const duration = 180000; // 3 minutes
        const interval = 3000; // Check every 3 seconds

        // Initial check
        await checkEmailDelivery(sentEmails);

        // Poll every 3 seconds for 3 minutes
        let pollCount = 0;
        const maxPolls = duration / interval; // 60 polls over 3 minutes
        
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
          
          checkEmailDelivery(sentEmails).catch(console.error);
        }, interval);
      }

    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to send Discord update emails'}`);
    } finally {
      setSendingDiscordUpdate(false);
    }
  }

  async function sendTravelStipendEmails() {
    if (!adminToken) {
      alert('Please enter your admin token first');
      return;
    }

    const confirmMsg = `Send travel stipend confirmation emails to all applicants in Travel Stipend Final List.xlsx?\n\n` +
      `This will:\n` +
      `- Send RSVP confirmation emails with travel stipend information\n` +
      `- Mark applicants as ACCEPTED\n` +
      `- Generate and attach QR codes\n` +
      `- Update the database\n\n` +
      `Continue?`;
    
    if (!confirm(confirmMsg)) {
      return;
    }

    setSendingTravelStipend(true);
    setTravelStipendStatus(null);
    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setDeliveryStatus(null);
    
    try {
      const res = await fetch(`${API_BASE}/send-travel-stipend-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ organizerName }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || 'Failed to send travel stipend emails'}`);
        return;
      }

      // Update status panel
      setTravelStipendStatus({
        total: data.total || 0,
        sent: data.sent || 0,
        failed: data.failed || 0,
        skipped: data.skipped || 0,
        sentDetails: data.sentDetails || [],
        errors: data.errors || [],
      });

      const message = `Travel stipend emails sent!\n\n` +
        `Total in list: ${data.total}\n` +
        `Successfully sent: ${data.sent}\n` +
        `Failed: ${data.failed}\n` +
        `Skipped: ${data.skipped}\n\n` +
        `All sent applicants have been marked as ACCEPTED and QR codes have been generated.`;

      if (data.errors && data.errors.length > 0) {
        alert(message + `\n\nErrors:\n${data.errors.slice(0, 5).map((e: any) => `- ${e.email}: ${e.error}`).join('\n')}`);
      } else {
        alert(message);
      }

      // Start polling for email delivery status
      if (data.sentEmails && data.sentEmails.length > 0) {
        // Clear any existing polling interval
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        const duration = 180000; // 3 minutes
        const interval = 3000; // Check every 3 seconds

        // Initial check
        await checkEmailDelivery(data.sentEmails);

        // Poll every 3 seconds for 3 minutes
        let pollCount = 0;
        const maxPolls = duration / interval; // 60 polls over 3 minutes
        
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
      alert(`Error: ${err.message || 'Failed to send travel stipend emails'}`);
    } finally {
      setSendingTravelStipend(false);
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
          onClick={testTravelStipendEmail} 
          disabled={!adminToken || loading || testingTravelStipendEmail}
          style={{
            backgroundColor: '#99AAB5',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 4,
            cursor: testingTravelStipendEmail || loading || !adminToken ? 'not-allowed' : 'pointer',
            opacity: testingTravelStipendEmail || loading || !adminToken ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {testingTravelStipendEmail ? 'Sending…' : 'Test Travel Stipend Email'}
        </button>
        <button 
          onClick={sendTravelStipendEmails} 
          disabled={!adminToken || loading || sendingTravelStipend}
          style={{
            backgroundColor: '#FF6B35',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 4,
            cursor: sendingTravelStipend || loading || !adminToken ? 'not-allowed' : 'pointer',
            opacity: sendingTravelStipend || loading || !adminToken ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {sendingTravelStipend ? 'Sending…' : 'Send Travel Stipend Emails'}
        </button>
        <button 
          onClick={sendDiscordUpdatePage} 
          disabled={!adminToken || loading || sendingDiscordUpdate || items.length === 0}
          style={{
            backgroundColor: '#5865F2',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 4,
            cursor: sendingDiscordUpdate || loading || !adminToken || items.length === 0 ? 'not-allowed' : 'pointer',
            opacity: sendingDiscordUpdate || loading || !adminToken || items.length === 0 ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {sendingDiscordUpdate ? 'Sending…' : 'Send Discord Update (This Page)'}
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


      {discordUpdateStatus && (
        <div style={{
          marginTop: 24,
          padding: 16,
          backgroundColor: '#e8f4f8',
          borderRadius: 8,
          border: '1px solid #5865F2'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, color: '#5865F2' }}>💬 Discord Update Email Status</h3>
            <div style={{ fontSize: 14, color: '#666' }}>
              ✅ {discordUpdateStatus.sent} sent | ❌ {discordUpdateStatus.failed} failed
            </div>
          </div>

          {discordUpdateStatus.sentDetails.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#333' }}>
                ✅ Sent Emails ({discordUpdateStatus.sentDetails.length}):
              </div>
              <div style={{ 
                maxHeight: 300, 
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
                backgroundColor: '#ffffff',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ddd'
              }}>
                {discordUpdateStatus.sentDetails.map((detail, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: '6px 8px',
                      marginBottom: 4,
                      backgroundColor: '#e8f5e9',
                      borderRadius: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ color: '#2e7d32', fontWeight: 600 }}>{detail.name}</span>
                    <span style={{ color: '#666', marginLeft: 8 }}>{detail.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {discordUpdateStatus.errors.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#d32f2f' }}>
                ❌ Errors ({discordUpdateStatus.errors.length}):
              </div>
              <div style={{ 
                maxHeight: 200, 
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
                backgroundColor: '#ffffff',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ddd'
              }}>
                {discordUpdateStatus.errors.map((error, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: '6px 8px',
                      marginBottom: 4,
                      backgroundColor: '#ffebee',
                      borderRadius: 4,
                      borderLeft: '3px solid #d32f2f'
                    }}
                  >
                    <div style={{ color: '#d32f2f', fontWeight: 600 }}>{error.email}</div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{error.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid #ddd' }}>
            <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
              <strong>Note:</strong> Emails are only sent to applicants on this page that are also in the generated email list (delivered acceptance emails, excluding denied).
            </div>
          </div>
        </div>
      )}

      {travelStipendStatus && (
        <div style={{
          marginTop: 24,
          padding: 16,
          backgroundColor: '#fff3e0',
          borderRadius: 8,
          border: '1px solid #FF6B35'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, color: '#FF6B35' }}>📧 Travel Stipend Email Status</h3>
            <div style={{ fontSize: 14, color: '#666' }}>
              ✅ {travelStipendStatus.sent} sent | ❌ {travelStipendStatus.failed} failed | ⏭️ {travelStipendStatus.skipped} skipped
            </div>
          </div>
          
          {travelStipendStatus.sentDetails.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#333' }}>
                ✅ Sent Emails ({travelStipendStatus.sentDetails.length}):
              </div>
              <div style={{ 
                maxHeight: 300, 
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
                backgroundColor: '#ffffff',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ddd'
              }}>
                {travelStipendStatus.sentDetails.map((detail, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: '6px 8px',
                      marginBottom: 4,
                      backgroundColor: '#e8f5e9',
                      borderRadius: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <span style={{ color: '#2e7d32', fontWeight: 600 }}>{detail.name}</span>
                      <span style={{ color: '#666', marginLeft: 8 }}>{detail.email}</span>
                    </div>
                    <span style={{ color: '#FF6B35', fontWeight: 600 }}>${detail.stipendAmount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {travelStipendStatus.errors.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#d32f2f' }}>
                ❌ Errors ({travelStipendStatus.errors.length}):
              </div>
              <div style={{ 
                maxHeight: 200, 
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
                backgroundColor: '#ffffff',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ddd'
              }}>
                {travelStipendStatus.errors.map((error, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: '6px 8px',
                      marginBottom: 4,
                      backgroundColor: '#ffebee',
                      borderRadius: 4,
                      borderLeft: '3px solid #d32f2f'
                    }}
                  >
                    <div style={{ color: '#d32f2f', fontWeight: 600 }}>{error.email}</div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{error.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid #ddd' }}>
            <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
              <strong>Summary:</strong> All successfully sent applicants have been marked as <strong>ACCEPTED</strong> in the database and their QR codes have been generated and attached to the emails.
            </div>
          </div>
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
            <h3 style={{ margin: 0, fontSize: 18 }}>📬 Email Delivery Status {deliveryStatus.polling && '⏳ Polling...'}</h3>
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
              Polling stopped after 3 minutes. Check Email Logs page for final delivery status.
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
