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
  TextContainer
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { useState } from 'react';

type Log = {
  id: number;
  date: string;
  status: string;
  message: string;
  payload: any;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Logs() {
  const { data, error, mutate, isValidating } = useSWR('/api/logs', fetcher, {
    refreshInterval: 5000,
  });
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const logs: Log[] = data?.logs || [];

  const rows = logs.map((log) => {
    // Extract Order # and Amount safely
    // Prioritize data.order structure, fallback to root or test payload
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
      <Button key={`btn-${log.id}`} onClick={() => setSelectedLog(log)} size="slim">
        View Payload
      </Button>
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
            headings={['Date', 'Order #', 'Amount', 'Status', 'Message', 'Payload']}
            rows={rows}
            footerContent={`Showing ${logs.length} most recent logs`}
          />
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
                  <p><strong>Payload:</strong></p>
                  <div style={{ maxHeight: '400px', overflow: 'auto', background: '#f6f6f6', padding: '10px', borderRadius: '4px' }}>
                    <pre style={{ margin: 0 }}>
                        {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </div>
                </TextContainer>
              </Modal.Section>
            </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
