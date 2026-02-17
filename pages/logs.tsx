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
  Pagination,
  FormLayout,
  TextField,
  Select,
  Checkbox
} from '@shopify/polaris';
import { RefreshIcon, SettingsIcon, AlertCircleIcon } from '@shopify/polaris-icons';
import { useState, useEffect } from 'react';

type Log = {
  id: number;
  date: string;
  status: string;
  message: string;
  payload: any;
  flow_log?: any[];
  summary?: {
      tag?: { status: string; tagName?: string; error?: string };
      fulfillment?: { status: string; retries?: number; targetStatus?: string; error?: string };
  };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Logs() {
  const [page, setPage] = useState(1);
  const limit = 50;
  
  const { data, error, mutate, isValidating } = useSWR(`/api/logs?page=${page}&limit=${limit}`, fetcher, {
    refreshInterval: 5000,
  });

  const { data: settingsData, mutate: mutateSettings } = useSWR('/api/settings', fetcher);
  const systemEnabled = settingsData?.enabled ?? true;

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [selectedDebugLog, setSelectedDebugLog] = useState<Log | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [forceOrder, setForceOrder] = useState<{ id: string, name: string } | null>(null);
  const [selectedForceStatus, setSelectedForceStatus] = useState('out_for_delivery');
  const [isForcing, setIsForcing] = useState(false);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState({
      system_enabled: true,
      tagging_enabled: false,
      tag_name: '',
      fulfillment_update_enabled: false,
      fulfillment_status: 'in_transit',
      test_email: ''
  });

  useEffect(() => {
      if (settingsData) {
          setSettingsForm({
              system_enabled: settingsData.system_enabled ?? true,
              tagging_enabled: settingsData.tagging_enabled ?? false,
              tag_name: settingsData.tag_name ?? '',
              fulfillment_update_enabled: settingsData.fulfillment_update_enabled ?? false,
              fulfillment_status: settingsData.fulfillment_status ?? 'in_transit',
              test_email: settingsData.test_email ?? ''
          });
      }
  }, [settingsData]);

  const handleSaveSettings = async () => {
      setIsSavingSettings(true);
      try {
          await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settingsForm),
          });
          await mutateSettings();
          setIsSettingsOpen(false);
      } catch (e) {
          console.error('Error saving settings:', e);
      } finally {
          setIsSavingSettings(false);
      }
  };

  const handleToggleSystem = async () => {
    // Quick toggle for system enabled (legacy, keeping it synced)
    setIsToggling(true);
    try {
        const newState = !systemEnabled;
        const newSettings = { ...settingsForm, system_enabled: newState };
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings),
        });
        await mutateSettings();
    } catch (e) {
        console.error('Error toggling system:', e);
    } finally {
        setIsToggling(false);
    }
  };

  const handleForceStatus = async () => {
    if (!forceOrder) return;
    setIsForcing(true);
    try {
        const res = await fetch('/api/force-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId: forceOrder.id,
                status: selectedForceStatus
            })
        });
        const result = await res.json();
        if (res.ok) {
            alert('Status updated successfully');
            setForceOrder(null);
            mutate();
        } else {
            alert(result.message || 'Failed to update status');
        }
    } catch (e) {
        alert('Error updating status');
    } finally {
        setIsForcing(false);
    }
  };

  const logs: Log[] = data?.logs || [];
  const pagination = data?.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 };
  const hasNext = page < pagination.totalPages;
  const hasPrevious = page > 1;

  const rows = logs.map((log) => {
    // ... (same as before) ...
    // Extract Order # and Amount safely
    const order = log?.payload?.data?.order || log?.payload?.order || log?.payload?.data || log?.payload || {};
    const orderId = order.id || log.payload?.id || order.order_id;
    const orderName = order.name || order.order_number || (orderId ? `ID: ${orderId}` : '-');
    const amount = order.current_total_price || order.total_price || '-';

    // Tag Status Cell
    let tagStatus = <Text as="span" tone="subdued">-</Text>;
    if (log.summary?.tag) {
        const { status, tagName, error } = log.summary.tag;
        if (status === 'success') tagStatus = <Badge tone="success">{`Added: ${tagName || ''}`}</Badge>;
        else if (status === 'exists') tagStatus = <Badge tone="info">{`Exists: ${tagName || ''}`}</Badge>;
        else if (status === 'failed') tagStatus = <Badge tone="critical" progress="incomplete">Failed</Badge>;
        else if (status === 'skipped') tagStatus = <Text as="span" tone="subdued">Skipped</Text>;
    }

    // Fulfillment Status Cell
    let fulfillmentStatus = <Text as="span" tone="subdued">-</Text>;
    if (log.summary?.fulfillment) {
        const { status, retries, error, targetStatus } = log.summary.fulfillment;
        let tone: 'success' | 'critical' | 'warning' | undefined = undefined;
        let text = status;
        
        if (status === 'success') {
            tone = 'success';
            text = 'Updated';
        } else if (status === 'failed') {
            tone = 'critical';
        } else if (status === 'skipped') {
            text = 'Skipped';
        }

        fulfillmentStatus = (
            <BlockStack key={`fulfillment-${log.id}`}>
                 {status !== 'skipped' ? (
                     <Badge tone={tone}>{text}</Badge>
                 ) : (
                     <Text as="span" tone="subdued">Skipped</Text>
                 )}
                 {retries !== undefined && retries > 0 && (
                     <Text as="span" variant="bodyXs" tone="subdued">Retries: {retries}</Text>
                 )}
                 {error && (
                     <div title={error} style={{ color: 'red', cursor: 'help' }}>
                        <Text as="span" variant="bodyXs" tone="critical">Error details</Text>
                     </div>
                 )}
            </BlockStack>
        );
    }

    return [
      new Date(log.date).toLocaleString(),
      <Text as="span" variant="bodyMd" key={`order-${log.id}`}>{orderName}</Text>,
      tagStatus,
      fulfillmentStatus,
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
      <div key={`actions-${log.id}`} style={{ display: 'flex', gap: '8px' }}>
          <Button onClick={() => setSelectedLog(log)} size="slim">
            Payload
          </Button>
          <Button onClick={() => setSelectedDebugLog(log)} size="slim" disabled={!log.flow_log}>
            Debug Log
          </Button>
          <Button 
            onClick={() => {
                console.log('Force button clicked for order:', orderName, 'ID:', orderId);
                if (orderId) {
                    setForceOrder({ id: String(orderId), name: orderName });
                } else {
                    console.error('No order ID found for log', log.id);
                    alert('No order ID found in this log payload.');
                }
            }} 
            size="slim"
            tone="critical"
          >
            Force
          </Button>
      </div>
    ];
  });

  return (
    <Page
      title="Webhook Logs"
      subtitle="Real-time logs of shipping updates"
      fullWidth
      titleMetadata={<Badge tone={systemEnabled ? 'success' : 'critical'}>{systemEnabled ? 'System Enabled' : 'System Disabled'}</Badge>}
      primaryAction={
        <Button
          icon={RefreshIcon}
          onClick={() => mutate()}
          loading={isValidating}
        >
          Refresh
        </Button>
      }
      secondaryActions={[
          {
              content: 'Settings',
              icon: SettingsIcon,
              onAction: () => setIsSettingsOpen(true)
          },
          {
              content: systemEnabled ? 'Disable System' : 'Enable System',
              destructive: systemEnabled,
              onAction: handleToggleSystem,
              loading: isToggling,
              disabled: settingsData === undefined
          }
      ]}
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
            headings={['Date', 'Order #', 'Tag Status', 'Fulfillment', 'Webhook Status', 'Actions']}
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

        {forceOrder && (
            <Modal
                open={true}
                onClose={() => setForceOrder(null)}
                title={`Force Status Change - ${forceOrder.name}`}
                primaryAction={{
                    content: 'Force Update',
                    onAction: handleForceStatus,
                    loading: isForcing,
                    destructive: true
                }}
                secondaryActions={[
                    {
                        content: 'Cancel',
                        onAction: () => setForceOrder(null),
                    },
                ]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <Text as="p">
                            This will manually trigger a fulfillment update in Shopify for order <strong>{forceOrder.name}</strong>.
                            It will attempt to create a fulfillment if none exists, or update an existing one.
                        </Text>
                        <Select
                            label="Target Status"
                            options={[
                                { label: 'Prepare for Delivery (Blue Badge)', value: 'ready_for_delivery' },
                                { label: 'Out for Delivery (Blue Badge)', value: 'out_for_delivery' },
                                { label: 'In Transit (Blue Badge)', value: 'in_transit' },
                                { label: 'Delivered (Grey Badge)', value: 'delivered' },
                                { label: 'Fulfilled (Grey Badge)', value: 'fulfilled' }
                            ]}
                            onChange={(value) => setSelectedForceStatus(value)}
                            value={selectedForceStatus}
                        />
                    </BlockStack>
                </Modal.Section>
            </Modal>
        )}

        <Modal
            open={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            title="Configuration"
            primaryAction={{
                content: 'Save',
                onAction: handleSaveSettings,
                loading: isSavingSettings
            }}
            secondaryActions={[
                {
                    content: 'Cancel',
                    onAction: () => setIsSettingsOpen(false)
                }
            ]}
        >
            <Modal.Section>
                <FormLayout>
                    <Checkbox
                        label="Enable System"
                        checked={settingsForm.system_enabled}
                        onChange={(checked) => setSettingsForm(s => ({ ...s, system_enabled: checked }))}
                        helpText="Master switch for the entire webhook processing."
                    />
                    
                    <Text variant="headingMd" as="h3">Tagging</Text>
                    <Checkbox
                        label="Enable Order Tagging"
                        checked={settingsForm.tagging_enabled}
                        onChange={(checked) => setSettingsForm(s => ({ ...s, tagging_enabled: checked }))}
                    />
                    {settingsForm.tagging_enabled && (
                        <TextField
                            label="Tag Name"
                            value={settingsForm.tag_name}
                            onChange={(value) => setSettingsForm(s => ({ ...s, tag_name: value }))}
                            autoComplete="off"
                        />
                    )}

                    <Text variant="headingMd" as="h3">Fulfillment Status</Text>
                    <Checkbox
                        label="Update Fulfillment Status"
                        checked={settingsForm.fulfillment_update_enabled}
                        onChange={(checked) => setSettingsForm(s => ({ ...s, fulfillment_update_enabled: checked }))}
                        helpText="Updates the status of an EXISTING open fulfillment."
                    />
                    {settingsForm.fulfillment_update_enabled && (
                        <Select
                            label="Target Status"
                            options={[
                                { label: 'In Transit', value: 'in_transit' },
                                { label: 'Out for Delivery', value: 'out_for_delivery' },
                                { label: 'Delivered', value: 'delivered' },
                                { label: 'Failure', value: 'failure' },
                                { label: 'Attempted Delivery', value: 'attempted_delivery' },
                            ]}
                            value={settingsForm.fulfillment_status}
                            onChange={(value) => setSettingsForm(s => ({ ...s, fulfillment_status: value }))}
                        />
                    )}
                    <Text variant="headingMd" as="h3">Testing & Safety</Text>
                    <TextField
                        label="Test Email"
                        value={settingsForm.test_email}
                        onChange={(value) => setSettingsForm(s => ({ ...s, test_email: value }))}
                        autoComplete="off"
                        helpText="If set, the app will ONLY process orders from this customer email. Leave blank for all orders."
                        placeholder="e.g. test@example.com"
                    />
                </FormLayout>
            </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}
