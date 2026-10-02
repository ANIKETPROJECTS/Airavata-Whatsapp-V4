import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Check, Copy, Link as LinkIcon, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';
import IntegrationApiKeys from './integrations/IntegrationApiKeys';
import IntegrationApiDocs from './integrations/IntegrationApiDocs';
import AutomationGuides from './integrations/AutomationGuides';

const WEBHOOK_EVENTS = [
  { value: 'contact_created', label: 'New contact created' },
  { value: 'message_received', label: 'Message received' },
  { value: 'message_delivered', label: 'Message delivered' },
  { value: 'message_read', label: 'Message read' },
  { value: 'message_failed', label: 'Message failed' },
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

  const webhooksQuery = useQuery<{ webhooks: ClientWebhook[] }>({
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
    <main className="integration-page mx-auto w-full max-w-6xl space-y-8 px-4 py-5 sm:px-6 sm:py-8">
      <header className="relative overflow-hidden rounded-2xl border border-emerald-900/10 bg-[#eaf4ee] px-5 py-6 sm:px-8 sm:py-8" data-testid="integration-page-header">
        <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full border-[32px] border-emerald-900/[0.04]" />
        <div className="relative z-10 max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900">
            <Activity className="h-3.5 w-3.5" /> Developer connections
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#153b2c] sm:text-4xl">Connect your systems to WhatsApp</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#496457] sm:text-base">
            Bring customer conversations into your CRM, ERP, website, or automation tool with server-side API access and signed event delivery.
          </p>
          <nav aria-label="Integration setup sections" className="mt-6 flex flex-wrap gap-2">
            <a href="#developer-access" className="rounded-lg bg-[#176b46] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[#105839]" data-testid="link-integration-api-keys">API access</a>
            <a href="#api-quick-start" className="rounded-lg border border-emerald-900/15 bg-white/70 px-3.5 py-2 text-sm font-medium text-[#285541] transition hover:bg-white" data-testid="link-integration-api-docs">API examples</a>
            <a href="#automation-guides" className="rounded-lg border border-emerald-900/15 bg-white/70 px-3.5 py-2 text-sm font-medium text-[#285541] transition hover:bg-white" data-testid="link-integration-guides">HTTP guides</a>
            <a href="#webhooks" className="rounded-lg border border-emerald-900/15 bg-white/70 px-3.5 py-2 text-sm font-medium text-[#285541] transition hover:bg-white" data-testid="link-integration-webhooks">Webhooks</a>
          </nav>
        </div>
        <div className="relative z-10 mt-6 grid max-w-3xl grid-cols-2 gap-3 border-t border-emerald-900/10 pt-5 sm:grid-cols-3">
          <div><p className="text-xs font-medium uppercase tracking-wide text-[#647a6c]">Authentication</p><p className="mt-1 text-sm font-semibold text-[#214b36]">Bearer API key</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-[#647a6c]">Event delivery</p><p className="mt-1 text-sm font-semibold text-[#214b36]">Signed webhooks</p></div>
          <div className="col-span-2 sm:col-span-1"><p className="text-xs font-medium uppercase tracking-wide text-[#647a6c]">Connection type</p><p className="mt-1 text-sm font-semibold text-[#214b36]">Server to server</p></div>
        </div>
      </header>

      <section id="developer-access" className="scroll-mt-6">
        <IntegrationApiKeys />
      </section>
      <IntegrationApiDocs />
      <div id="automation-guides" className="scroll-mt-6"><AutomationGuides /></div>

      <section id="webhooks" className="space-y-5 border-t border-[#dce6de] pt-7 scroll-mt-6" data-testid="section-webhooks">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e3f1e8] text-[#176b46]"><LinkIcon className="h-4 w-4" /></div>
              <h2 className="text-xl font-semibold tracking-tight text-[#193c2d]">Webhooks</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#63736a]">
              Receive signed HTTP requests for contact, inbound-message, and delivery-status events.
            </p>
          </div>
          <button
            onClick={() => setShowWebhookForm(true)}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#176b46] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#105839] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b46] focus-visible:ring-offset-2"
            data-testid="button-add-webhook"
          >
            <Plus className="w-4 h-4" /> Add Webhook
          </button>
        </div>

        {webhooksQuery.isLoading ? (
          <div className="space-y-3" aria-label="Loading webhooks" aria-busy="true" data-testid="status-webhooks-loading">
            {[1, 2].map((item) => <div key={item} className="animate-pulse rounded-xl border border-[#e0e8e1] bg-white p-5"><div className="h-4 w-1/3 rounded bg-[#e9efea]" /><div className="mt-4 h-3 w-2/3 rounded bg-[#f0f3f0]" /></div>)}
          </div>
        ) : webhooksQuery.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid="status-webhooks-load-error">
            <div><p className="text-sm font-semibold text-rose-900">Webhooks could not be loaded</p><p className="mt-1 text-sm text-rose-800">Check your connection, then try again.</p></div>
            <button type="button" onClick={() => webhooksQuery.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100" data-testid="button-retry-webhooks"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        ) : webhooksQuery.data?.webhooks.length ? (
          <div className="space-y-3">
            {webhooksQuery.data.webhooks.map((webhook) => (
              <div key={webhook.id} className="flex flex-col gap-4 rounded-xl border border-[#e0e8e1] bg-white p-4 shadow-[0_2px_8px_rgba(29,63,43,0.03)] transition hover:border-[#c6d9cb] sm:flex-row sm:items-center" data-testid={`row-webhook-${webhook.id}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf4ee] text-[#176b46]">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-medium text-[#203e2e]" data-testid={`text-webhook-url-${webhook.id}`}>{webhook.url}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {webhook.events.map((event) => (
                      <span key={event} className="rounded-md bg-[#f2f5f2] px-2.5 py-1 text-xs text-[#5b6d61]">
                        {WEBHOOK_EVENTS.find((option) => option.value === event)?.label ?? event}
                      </span>
                    ))}
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${webhook.isActive ? 'bg-[#e7f4eb] text-[#176b46]' : 'bg-[#f0f1ef] text-[#667168]'}`} data-testid={`status-webhook-${webhook.id}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${webhook.isActive ? 'bg-[#25865a]' : 'bg-[#929a93]'}`} />
                      {webhook.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(webhook)}
                  disabled={deleteWebhook.isPending}
                  className="self-end rounded-lg p-2.5 text-[#849087] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 sm:self-center"
                  aria-label={`Delete webhook ${webhook.url}`}
                  data-testid={`button-delete-webhook-${webhook.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#cddbd0] bg-[#f8faf8] px-5 py-10 text-center" data-testid="empty-webhooks">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf4ee] text-[#176b46]"><LinkIcon className="h-5 w-5" /></span>
            <div><p className="text-sm font-semibold text-[#294635]">No webhooks configured</p><p className="mt-1 text-sm text-[#6b7c70]">Add a webhook URL to receive real-time event notifications.</p></div>
            <button type="button" onClick={() => setShowWebhookForm(true)} className="mt-1 rounded-lg border border-[#bfd2c3] bg-white px-3.5 py-2 text-sm font-semibold text-[#176b46] transition hover:bg-[#eef6f0]" data-testid="button-add-first-webhook">Add your first webhook</button>
          </div>
        )}
      </section>

      {showWebhookForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12251b]/45 p-4 backdrop-blur-[2px]" onClick={() => setShowWebhookForm(false)} data-testid="dialog-backdrop-webhook">
          <form
            onSubmit={handleCreate}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-5 rounded-2xl border border-[#dce7de] bg-[#fbfcfb] p-5 shadow-[0_24px_80px_rgba(15,43,27,0.2)] sm:p-6"
            data-testid="form-create-webhook"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-webhook-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="create-webhook-title" className="text-lg font-semibold text-[#193c2d]">Add webhook</h3>
                <p className="mt-1 text-sm leading-5 text-[#65766a]">Airavata will sign each JSON request with a generated secret.</p>
              </div>
              <button type="button" onClick={() => setShowWebhookForm(false)} className="rounded-lg p-1.5 text-[#7c8c80] transition hover:bg-[#edf3ee] hover:text-[#233e2d]" aria-label="Close webhook form" data-testid="button-close-webhook-form">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[#314a39]">Webhook URL</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/airavata-webhook"
                required
                className="w-full rounded-lg border border-[#d6e1d8] bg-white px-3 py-2.5 text-sm text-[#213c2b] outline-none transition placeholder:text-[#9aa79c] focus:border-[#4b936b] focus:ring-4 focus:ring-[#2d8754]/10"
                data-testid="input-webhook-url"
              />
            </label>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium text-[#314a39]">Events</legend>
              {WEBHOOK_EVENTS.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#e0e8e1] bg-white px-3 py-2.5 transition hover:border-[#bfd4c4] hover:bg-[#f7faf7]">
                  <input
                    type="checkbox"
                    checked={events.includes(option.value)}
                    onChange={() => toggleEvent(option.value)}
                    className="h-4 w-4 rounded border-[#bdc9bf] accent-[#176b46] focus:ring-[#176b46]"
                    data-testid={`input-webhook-event-${option.value}`}
                  />
                  <span className="text-sm text-[#3c5142]">{option.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowWebhookForm(false)} className="rounded-lg border border-[#d8e2da] bg-white px-4 py-2 text-sm font-medium text-[#526457] transition hover:bg-[#f2f6f2]" data-testid="button-cancel-webhook">
                Cancel
              </button>
              <button type="submit" disabled={createWebhook.isPending} className="flex items-center gap-2 rounded-lg bg-[#176b46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#105839] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-submit-webhook">
                {createWebhook.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create webhook
              </button>
            </div>
          </form>
        </div>
      )}

      {createdSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12251b]/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg space-y-5 rounded-2xl border border-[#dce7de] bg-[#fbfcfb] p-5 shadow-[0_24px_80px_rgba(15,43,27,0.2)] sm:p-6" role="dialog" aria-modal="true" aria-labelledby="webhook-created-title" data-testid="dialog-created-webhook-secret">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4f2e8] text-[#176b46]">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 id="webhook-created-title" className="text-lg font-semibold text-[#193c2d]">Webhook created</h3>
                <p className="mt-1 text-sm text-[#65766a]">Copy this signing secret now. It will not be shown again.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-[#dce5dd] bg-[#f3f6f3] px-3 py-2 text-xs text-[#354b3b]" data-testid="text-created-webhook-secret">{createdSecret}</code>
              <button type="button" onClick={copySecret} className="rounded-lg border border-[#d8e2da] bg-white p-2 text-[#526457] transition hover:bg-[#f2f6f2]" aria-label="Copy signing secret" data-testid="button-copy-webhook-secret">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setCreatedSecret(null)} className="rounded-lg bg-[#176b46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#105839]" data-testid="button-close-created-webhook-secret">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
    </main>
  );
}