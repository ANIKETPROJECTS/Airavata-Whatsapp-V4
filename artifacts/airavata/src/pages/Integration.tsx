import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Blocks, Check, Copy, Link as LinkIcon, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';

const AVAILABLE_INTEGRATIONS = [
  { id: 'i1', name: 'Shopify', description: 'Sync products and order status updates.', icon: 'S' },
  { id: 'i2', name: 'WooCommerce', description: 'Send abandoned cart reminders.', icon: 'W' },
  { id: 'i3', name: 'Zapier', description: 'Connect with 3000+ apps.', icon: 'Z' },
  { id: 'i4', name: 'Google Sheets', description: 'Export contacts automatically.', icon: 'G' },
  { id: 'i5', name: 'HubSpot', description: 'Sync leads to your CRM.', icon: 'H' },
  { id: 'i6', name: 'Salesforce', description: 'Enterprise CRM integration.', icon: 'Sf' },
];

const WEBHOOK_EVENTS = [
  { value: 'contact_created', label: 'New contact created' },
  { value: 'message_received', label: 'Message received' },
] as const;

interface ClientWebhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreatedWebhook extends ClientWebhook {
  secret: string;
}

export default function Integration() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['contact_created', 'message_received']);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ webhooks: ClientWebhook[] }>({
    queryKey: ['client-webhooks'],
    queryFn: () => api.get('/webhooks'),
    refetchOnMount: 'always',
  });

  const createWebhook = useMutation({
    mutationFn: (payload: { url: string; events: string[] }) =>
      api.post<{ webhook: CreatedWebhook }>('/webhooks', payload),
    onSuccess: ({ webhook }) => {
      queryClient.invalidateQueries({ queryKey: ['client-webhooks'] });
      setShowWebhookForm(false);
      setUrl('');
      setEvents(['contact_created', 'message_received']);
      setCreatedSecret(webhook.secret);
      toast.success('Webhook created');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to create webhook'),
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-webhooks'] });
      toast.success('Webhook deleted');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to delete webhook'),
  });

  const toggleEvent = (event: string) => {
    setEvents((current) =>
      current.includes(event)
        ? current.filter((value) => value !== event)
        : [...current, event],
    );
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) {
      toast.error('Enter a webhook URL');
      return;
    }
    if (events.length === 0) {
      toast.error('Select at least one event');
      return;
    }
    createWebhook.mutate({ url: url.trim(), events });
  };

  const handleDelete = async (webhook: ClientWebhook) => {
    const confirmed = await confirm({
      title: 'Delete webhook?',
      description: `Stop sending events to ${webhook.url}?`,
      confirmLabel: 'Delete webhook',
    });
    if (confirmed) deleteWebhook.mutate(webhook.id);
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      toast.success('Signing secret copied');
    } catch {
      toast.error('Unable to copy the signing secret');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500">Connect Airavata to your favorite tools and platforms</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {AVAILABLE_INTEGRATIONS.map((integration) => (
          <div key={integration.id} className="bg-white rounded-xl border p-5 flex flex-col h-full hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center border text-gray-500 font-bold text-lg">
                {integration.icon}
              </div>
            </div>
            <h3 className="font-semibold text-gray-900 text-lg mb-1">{integration.name}</h3>
            <p className="text-sm text-gray-500 flex-1 mb-6">{integration.description}</p>
            <button
              onClick={() => toast(`${integration.name} integration coming soon`)}
              className="w-full py-2 rounded-lg font-medium text-sm transition-colors bg-primary text-white hover:bg-primary/90 shadow-sm"
            >
              Connect
            </button>
          </div>
        ))}
      </div>

      <div className="border-t pt-8">
        <div className="flex justify-between items-end mb-6 gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Webhooks</h2>
            <p className="text-sm text-gray-500">Receive signed HTTP requests for events in this workspace</p>
          </div>
          <button
            onClick={() => setShowWebhookForm(true)}
            className="px-4 py-2 border bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Webhook
          </button>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl border flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : data?.webhooks.length ? (
          <div className="space-y-3">
            {data.webhooks.map((webhook) => (
              <div key={webhook.id} className="bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{webhook.url}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {webhook.events.map((event) => (
                      <span key={event} className="text-xs rounded-full bg-gray-100 text-gray-600 px-2.5 py-1">
                        {WEBHOOK_EVENTS.find((option) => option.value === event)?.label ?? event}
                      </span>
                    ))}
                    <span className={`text-xs rounded-full px-2.5 py-1 ${webhook.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {webhook.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(webhook)}
                  disabled={deleteWebhook.isPending}
                  className="self-end sm:self-center p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                  aria-label={`Delete webhook ${webhook.url}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
            <LinkIcon className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium text-gray-500">No webhooks configured</p>
            <p className="text-xs text-gray-400">Add a webhook URL to receive real-time event notifications.</p>
          </div>
        )}
      </div>

      {showWebhookForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowWebhookForm(false)}>
          <form
            onSubmit={handleCreate}
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Add webhook</h3>
                <p className="text-sm text-gray-500 mt-1">Airavata will sign each JSON request with a generated secret.</p>
              </div>
              <button type="button" onClick={() => setShowWebhookForm(false)} className="text-gray-400 hover:text-gray-700" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-gray-700">Webhook URL</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/airavata-webhook"
                required
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-gray-700">Events</legend>
              {WEBHOOK_EVENTS.map((option) => (
                <label key={option.value} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={events.includes(option.value)}
                    onChange={() => toggleEvent(option.value)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-700">{option.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowWebhookForm(false)} className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={createWebhook.isPending} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {createWebhook.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create webhook
              </button>
            </div>
          </form>
        </div>
      )}

      {createdSecret && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Webhook created</h3>
                <p className="text-sm text-gray-500 mt-1">Copy this signing secret now. It will not be shown again.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 break-all rounded-lg bg-gray-50 border px-3 py-2 text-xs text-gray-700">{createdSecret}</code>
              <button onClick={copySecret} className="p-2 rounded-lg border text-gray-600 hover:bg-gray-50" aria-label="Copy signing secret">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setCreatedSecret(null)} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}