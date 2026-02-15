import { useEffect, useState } from 'react';

type Log = {
  id: number;
  date: string;
  status: string;
  message: string;
  payload: any;
};

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Webhook Logs</h1>
      <button 
        onClick={fetchLogs}
        style={{ padding: '8px 16px', marginBottom: '20px', cursor: 'pointer' }}
      >
        Refresh
      </button>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f4f4f4', textAlign: 'left' }}>
              <th style={{ padding: '10px', border: '1px solid #ddd' }}>Date</th>
              <th style={{ padding: '10px', border: '1px solid #ddd' }}>Status</th>
              <th style={{ padding: '10px', border: '1px solid #ddd' }}>Message</th>
              <th style={{ padding: '10px', border: '1px solid #ddd' }}>Payload</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                  {new Date(log.date).toLocaleString()}
                </td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '4px',
                    background: log.status === 'SUCCESS' ? '#d4edda' : log.status === 'ERROR' ? '#f8d7da' : '#e2e3e5',
                    color: log.status === 'SUCCESS' ? '#155724' : log.status === 'ERROR' ? '#721c24' : '#383d41'
                  }}>
                    {log.status}
                  </span>
                </td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>{log.message}</td>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                  <details>
                    <summary>View Payload</summary>
                    <pre style={{ fontSize: '10px', maxHeight: '100px', overflow: 'auto' }}>
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
