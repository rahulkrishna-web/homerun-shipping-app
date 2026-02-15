import useSWR from 'swr';
import {
  Page,
  LegacyCard,
  DataTable,
  Badge,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Banner
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
    refreshInterval: 5000, // Auto-refresh every 5 seconds
  });

  const logs: Log[] = data?.logs || [];

  const rows = logs.map((log) => [
    new Date(log.date).toLocaleString(),
    <Badge
      key={log.id}
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
    <div style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} key={`payload-${log.id}`}>
       <Text as="span" variant="bodySm" tone="subdued">
         {JSON.stringify(log.payload)}
       </Text>
    </div>
  ]);

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
            columnContentTypes={['text', 'text', 'text', 'text']}
            headings={['Date', 'Status', 'Message', 'Payload']}
            rows={rows}
            footerContent={`Showing ${logs.length} most recent logs`}
          />
        </LegacyCard>
      </BlockStack>
    </Page>
  );
}
