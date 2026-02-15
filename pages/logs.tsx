import useSWR from 'swr';
import {
  Page,
  LegacyCard,
  DataTable,
  Badge,
  Text,
  Button,
  BlockStack,
  Banner,
  Modal,
  TextContainer,
  Pagination
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { useState } from 'react';

type Log = {
  id: number;
  date: string;
  status: string;
  message: string;
  payload: any;
  flow_log?: any[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Logs() {
  const [page, setPage] = useState(1);
  const limit = 50;
  
  const { data, error, mutate, isValidating } = useSWR(`/api/logs?page=${page}&limit=${limit}`, fetcher, {
    refreshInterval: 5000,
  });
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [selectedDebugLog, setSelectedDebugLog] = useState<Log | null>(null);

  const logs: Log[] = data?.logs || [];
  const pagination = data?.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 };
  const hasNext = page < pagination.totalPages;
  const hasPrevious = page > 1;

  const rows = logs.map((log) => {
    // ... (same as before) ...
    // Extract Order # and Amount safely
    const order = log?.payload?.data?.order || log?.payload?.order || {};
    const orderName = order.name || order.order_number || (log.payload?.id ? `ID: ${log.payload.id}` : '-');
    const amount = order.current_total_price || order.total_price || '-';

    return [
      new Date(log.date).toLocaleString(),
      <Text as="span" variant="bodyMd" key={`order-${log.id}`}>{orderName}</Text>,
      <Text as="span" variant="bodyMd" key={`amount-${log.id}`}>{amount !== '-' ? `${order.currency || 'INR'} ${amount}` : '-'}</Text>,
      <Badge
        key={`status-${log.id}`}
        tone={
          log.status === 'SUCCESS'
            ? 'success'
            : log.status === 'ERROR'
            ? 'critical'
            : log.status === 'WARNING'
            ? 'warning'
            : undefined
        }
      >
        {log.status}
      </Badge>,
      <Text as="span" variant="bodyMd" key={`msg-${log.id}`}>
        {log.message}
      </Text>,
      <div key={`actions-${log.id}`} style={{ display: 'flex', gap: '8px' }}>
          <Button onClick={() => setSelectedLog(log)} size="slim">
            Payload
          </Button>
          <Button onClick={() => setSelectedDebugLog(log)} size="slim" disabled={!log.flow_log}>
            Debug Log
          </Button>
      </div>
    ];
  });

  return (
    <Page
      title="Webhook Logs"
      subtitle="Real-time logs of shipping updates"
      fullWidth
      primaryAction={
        <Button
          icon={RefreshIcon}
          onClick={() => mutate()}
          loading={isValidating}
        >
          Refresh
        </Button>
      }
    >
      <BlockStack gap="400">
        {error && (
            <Banner tone="critical" title="Error loading logs">
                <p>Failed to connect to the database.</p>
            </Banner>
        )}
        
        <LegacyCard>
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
            headings={['Date', 'Order #', 'Amount', 'Status', 'Message', 'Actions']}
            rows={rows}
            footerContent={`Showing ${logs.length} logs (Page ${page} of ${pagination.totalPages || 1})`}
          />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <Pagination
              hasPrevious={hasPrevious}
              onPrevious={() => setPage(page - 1)}
              hasNext={hasNext}
              onNext={() => setPage(page + 1)}
            />
          </div>
        </LegacyCard>

        {selectedLog && (
            <Modal
              open={true}
              onClose={() => setSelectedLog(null)}
              title={`Payload for Log #${selectedLog.id}`}
              primaryAction={{
                content: 'Close',
                onAction: () => setSelectedLog(null),
              }}
            >
              <Modal.Section>
                <TextContainer>
                  <p><strong>Status:</strong> {selectedLog.status}</p>
                  <p><strong>Message:</strong> {selectedLog.message}</p>
                  <div style={{ maxHeight: '400px', overflow: 'auto', background: '#f6f6f6', padding: '10px', borderRadius: '4px' }}>
                    <pre style={{ margin: 0 }}>
                        {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </div>
                </TextContainer>
              </Modal.Section>
            </Modal>
        )}

        {selectedDebugLog && (
            <Modal
              open={true}
              onClose={() => setSelectedDebugLog(null)}
              title={`Debug Flow for Log #${selectedDebugLog.id}`}
              primaryAction={{
                content: 'Close',
                onAction: () => setSelectedDebugLog(null),
              }}
              size="large"
            >
              <Modal.Section>
                <TextContainer>
                   <DataTable
                        columnContentTypes={['text', 'text', 'text']}
                        headings={['Timestamp', 'Step', 'Detail']}
                        rows={
                            (selectedDebugLog.flow_log || []).map((step: any) => [
                                new Date(step.timestamp).toLocaleTimeString(),
                                step.step,
                                <div key={step.timestamp} style={{ maxWidth: '300px', overflow: 'auto' }}>
                                    <pre style={{ margin: 0, fontSize: '11px' }}>{JSON.stringify(step.detail, null, 2)}</pre>
                                </div>
                            ])
                        }
                   />
                </TextContainer>
              </Modal.Section>
            </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
