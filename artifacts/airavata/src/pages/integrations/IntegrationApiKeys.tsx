import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Check, Copy, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

interface ApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiKeyResponse {
  keys: ApiKey[];
  whatsapp: {
    connected: boolean;
    wabaId: string | null;
    phoneNumberId: string | null;
    accessTokenAvailable: boolean;
  };
}

interface GeneratedApiKey extends ApiKey {
  rawKey: string;
}

export default function IntegrationApiKeys() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();
  const apiKeyForm = useForm<{ label: string }>({
    defaultValues: { label: '' },
  });
  const [createdKey, setCreatedKey] = useState<GeneratedApiKey | null>(null);

  const keysQuery = useQuery<ApiKeyResponse>({
    queryKey: ['apikeys'],
    queryFn: () => api.get('/apikeys'),
    refetchOnMount: 'always',
  });

  const createKey = useMutation({
    mutationFn: (keyLabel: string) =>
      api.post<{ key: GeneratedApiKey }>('/apikeys', { label: keyLabel }),
    onSuccess: ({ key }) => {
      queryClient.invalidateQueries({ queryKey: ['apikeys'] });
      apiKeyForm.reset();
      setCreatedKey(key);
      toast.success('API key created');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to create API key'),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => api.delete(`/apikeys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apikeys'] });
      toast.success('API key revoked');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to revoke API key'),
  });

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error('Unable to copy to clipboard');
    }
  };

  const handleRevoke = async (key: ApiKey) => {
    const confirmed = await confirm({
      title: 'Revoke API key?',
      description: `"${key.label}" will stop working immediately.`,
      confirmLabel: 'Revoke key',
    });
    if (confirmed) revokeKey.mutate(key.id);
  };

  const whatsapp = keysQuery.data?.whatsapp;

  return (
    <section className="space-y-5 rounded-2xl border border-[#dfe8e0] bg-white p-5 shadow-[0_4px_18px_rgba(29,63,43,0.035)] sm:p-6" data-testid="section-developer-api-keys">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#176b46]" />
            <h2 className="text-lg font-semibold tracking-tight text-[#193c2d]">Developer API access</h2>
          </div>
          <p className="mt-1 text-sm leading-5 text-[#68786c]">
            Create separate keys for your CRM, ERP, website, or automation workflows.
          </p>
        </div>
        <span
          data-testid="status-whatsapp-api-connection"
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium w-fit ${
            keysQuery.isLoading
              ? 'bg-[#f3f5f2] text-[#68766b]'
              : whatsapp?.connected
                ? 'bg-[#e7f4eb] text-[#176b46]'
                : 'bg-amber-50 text-amber-800'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${keysQuery.isLoading ? 'bg-[#a9b3aa]' : whatsapp?.connected ? 'bg-[#25865a]' : 'bg-amber-500'}`} />
          {keysQuery.isLoading ? 'Checking WhatsApp' : whatsapp?.connected ? 'WhatsApp connected' : 'WhatsApp not connected'}
        </span>
      </div>

      <div className="flex gap-3 rounded-xl border border-[#d4e4d9] bg-[#f0f7f2] p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#28734d]" />
        <div className="text-sm text-[#244632]">
          <p className="font-semibold">Keep API keys on your server</p>
          <p className="mt-1 leading-5 text-[#526e5b]">
            Never put a key in browser code or share your Meta access token. Airavata sends through the connected WhatsApp account without returning that token.
          </p>
        </div>
      </div>

      {whatsapp?.phoneNumberId && (
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#e0e8e1] bg-[#f7f9f7] px-4 py-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[#718076]">WhatsApp phone number ID</p>
            <code className="break-all font-mono text-sm text-[#253e2f]" data-testid="text-phone-number-id">{whatsapp.phoneNumberId}</code>
          </div>
          <button
            type="button"
            onClick={() => copy(whatsapp.phoneNumberId!, 'Phone number ID copied')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d8e2da] bg-white px-3 py-2 text-sm font-medium text-[#526457] transition hover:bg-[#edf4ef]"
            data-testid="button-copy-phone-number-id"
          >
            <Copy className="w-4 h-4" /> Copy ID
          </button>
        </div>
      )}

      <Form {...apiKeyForm}>
        <form
          onSubmit={apiKeyForm.handleSubmit(({ label }) => createKey.mutate(label.trim() || 'Custom integration'))}
          className="flex flex-col gap-2 sm:flex-row"
          data-testid="form-create-api-key"
        >
          <FormField
            control={apiKeyForm.control}
            name="label"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 space-y-0">
                <FormLabel className="sr-only">API key label</FormLabel>
                <FormControl>
                  <input
                    {...field}
                    placeholder="Key label, e.g. Shopify order updates"
                    maxLength={80}
                    className="min-w-0 w-full rounded-lg border border-[#d8e2da] bg-white px-3 py-2.5 text-sm text-[#253e2f] outline-none transition placeholder:text-[#9aa79c] focus:border-[#4b936b] focus:ring-4 focus:ring-[#2d8754]/10"
                    data-testid="input-api-key-label"
                  />
                </FormControl>
                <FormDescription className="sr-only">Name the system that will use this API key.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <button
            type="submit"
            disabled={createKey.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#176b46] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#105839] disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="button-create-api-key"
          >
            {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create API key
          </button>
        </form>
      </Form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[#314a39]">Active keys</h3>
        {keysQuery.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading API keys" data-testid="status-api-keys-loading">
            {[1, 2].map((item) => <div key={item} className="animate-pulse rounded-xl border border-[#e0e8e1] p-4"><div className="h-4 w-1/3 rounded bg-[#e9efea]" /><div className="mt-3 h-3 w-2/3 rounded bg-[#f0f3f0]" /></div>)}
          </div>
        ) : keysQuery.isError ? (
          <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid="status-api-key-load-error">
            <p className="text-sm text-rose-800">Unable to load API keys. Try again when your connection is restored.</p>
            <button type="button" onClick={() => keysQuery.refetch()} className="inline-flex items-center gap-2 self-start rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 sm:self-auto" data-testid="button-retry-api-keys"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        ) : keysQuery.data?.keys.length ? (
          <div className="divide-y divide-[#e6ece7] overflow-hidden rounded-xl border border-[#dfe8e0]">
            {keysQuery.data.keys.map((key) => (
              <div key={key.id} className="flex flex-col gap-3 bg-white px-4 py-3.5 transition hover:bg-[#fbfcfb] sm:flex-row sm:items-center" data-testid={`row-api-key-${key.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#253e2f]">{key.label}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#78867b]">
                    <code className="rounded bg-[#f1f5f1] px-1.5 py-0.5 font-mono text-[#546a59]">{key.keyPrefix}••••••••</code>
                    <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                    <span>{key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Not used yet'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(key)}
                  disabled={revokeKey.isPending}
                  className="inline-flex self-start items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#78867b] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 sm:self-center"
                  aria-label={`Revoke API key ${key.label}`}
                  data-testid={`button-revoke-api-key-${key.id}`}
                >
                  <Trash2 className="w-4 h-4" /> Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#cddbd0] bg-[#f8faf8] px-4 py-6 text-center text-sm text-[#66776b]" data-testid="text-no-api-keys">
            No API keys yet. Create one for each system you connect.
          </div>
        )}
      </div>

      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12251b]/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="created-api-key-title" data-testid="dialog-created-api-key">
          <div className="w-full max-w-lg space-y-5 rounded-2xl border border-[#dce7de] bg-[#fbfcfb] p-5 shadow-[0_24px_80px_rgba(15,43,27,0.2)] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4f2e8] text-[#176b46]">
                <Check className="w-5 h-5" />
              </span>
              <div>
                <h3 id="created-api-key-title" className="text-lg font-semibold text-[#193c2d]">Copy your API key</h3>
                <p className="mt-1 text-sm text-[#65766a]">This full key is shown once. Store it in your server's secret manager.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-[#dce5dd] bg-[#f3f6f3] p-3 font-mono text-xs text-[#354b3b]" data-testid="text-created-api-key">{createdKey.rawKey}</code>
              <button
                type="button"
                onClick={() => copy(createdKey.rawKey, 'API key copied')}
                className="rounded-lg border border-[#d8e2da] bg-white p-2 text-[#526457] transition hover:bg-[#f2f6f2]"
                aria-label="Copy new API key"
                data-testid="button-copy-created-api-key"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCreatedKey(null)}
                className="rounded-lg bg-[#176b46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#105839]"
                data-testid="button-close-created-api-key"
              >
                I saved it
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
    </section>
  );
}