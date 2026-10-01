import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Workflow, ArrowLeft, Send, Download, Search,
  ChevronRight, PlusCircle, X, Check, Inbox
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { DevicePreviewSelector, type PreviewDevice } from '../components/DevicePreview';
import PhonePreview from '../components/flow/PhonePreview';
import ComponentEditor from '../components/flow/ComponentEditor';
import type { Flow, FlowScreen, FlowComponent, ComponentPaletteItem } from '../types/flow';
import settingsActionIcon from '../assets/flow-actions/settings.png';
import responsesActionIcon from '../assets/flow-actions/responses.png';
import editActionIcon from '../assets/flow-actions/edit.png';
import sendActionIcon from '../assets/flow-actions/send.png';
import deleteActionIcon from '../assets/flow-actions/delete.png';
import {
  FLOW_CATEGORIES, COMPONENT_CATEGORIES,
  makeDefaultComponent, makeNewScreen
} from '../types/flow';

const MAX_SCREEN_COMPONENTS = 50;
const MAX_FLOW_INLINE_IMAGE_BYTES = 3_000_000;

function inlineImageBytes(src?: string) {
  const match = src?.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return 0;
  const data = match[1];
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(data.length * 3 / 4) - padding);
}

// ── API calls ─────────────────────────────────────────────────────────────────

const fetchFlows = () => api.get<{ flows: Flow[] }>('/flows').then(r => r.flows ?? []);
const createFlow = (body: Partial<Flow>) => api.post<{ flow: Flow }>('/flows', body).then(r => r.flow);
const updateFlow = (id: string, body: Partial<Flow>) => api.put<{ flow: Flow }>(`/flows/${id}`, body).then(r => r.flow);
const deleteFlow = (id: string) => api.delete(`/flows/${id}`);
const publishFlow = (id: string) => api.post<{ flow: Flow }>(`/flows/${id}/publish`).then(r => r.flow);
const unpublishFlow = (id: string) => api.post<{ flow: Flow }>(`/flows/${id}/unpublish`).then(r => r.flow);
const sendFlow = (id: string, body: object) => api.post(`/flows/${id}/send`, body);

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Flow['status'] }) {
  const map = {
    DRAFT: 'bg-yellow-100 text-yellow-700',
    PUBLISHED: 'bg-green-100 text-green-700',
    DEPRECATED: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-none ${map[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ── New flow drawer ───────────────────────────────────────────────────────────

function NewFlowDrawer({ onClose, onSave }: {
  onClose: () => void;
  onSave: (data: { name: string; categories: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('OTHER');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave({ name: trimmedName, categories: [category] });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close new flow panel"
        onClick={onClose}
        className="flow-drawer-backdrop absolute inset-0 cursor-default bg-black/35"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-flow-title"
        aria-describedby="create-flow-description"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
        }}
        className="flow-drawer-panel relative z-10 flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl"
      >
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">WhatsApp Flows</p>
              <h2 id="create-flow-title" className="mt-1 text-xl font-semibold text-gray-900">Create a New Flow</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close new flow panel"
              className="p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <p id="create-flow-description" className="mb-7 text-sm text-gray-500">
              Give your flow a name and choose what it is for. You can build its screens next.
            </p>

            <div className="space-y-7">
              <div>
                <label htmlFor="new-flow-name" className="mb-2 block text-sm font-medium text-gray-800">
                  Flow name
                </label>
                <input
                  id="new-flow-name"
                  autoFocus
                  type="text"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  maxLength={200}
                  placeholder="e.g. Appointment booking"
                  className="w-full rounded-none border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-gray-800">What is this flow for?</legend>
                <div className="flex flex-wrap gap-2">
                  {FLOW_CATEGORIES.map(item => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={category === item.value}
                      onClick={() => setCategory(item.value)}
                      className={`rounded-none border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        category === item.value
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-primary/50 hover:text-gray-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-gray-200 bg-gray-50/70 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-11 w-full border border-primary bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Flow
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

// ── Edit flow details modal ───────────────────────────────────────────────────

function FlowModal({ flow, onClose, onSave }: {
  flow: Flow;
  onClose: () => void;
  onSave: (data: { name: string; categories: string[] }) => void;
}) {
  const [name, setName] = useState(flow.name);
  const [categories, setCategories] = useState<string[]>(flow.categories ?? ['OTHER']);

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) onSave({ name: trimmedName, categories });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close edit flow details"
        onClick={onClose}
        className="flow-drawer-backdrop absolute inset-0 cursor-default bg-black/35"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-flow-title"
        aria-describedby="edit-flow-description"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
        }}
        className="flow-drawer-panel relative z-10 flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl"
      >
        <form onSubmit={handleSave} className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">WhatsApp Flows</p>
              <h2 id="edit-flow-title" className="mt-1 text-xl font-semibold text-gray-900">Edit flow details</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit flow details"
              className="p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <p id="edit-flow-description" className="mb-7 text-sm text-gray-500">
              Update the name and category for this WhatsApp Flow.
            </p>
            <div className="space-y-7">
              <div>
                <label htmlFor="edit-flow-name" className="mb-2 block text-sm font-medium text-gray-800">Flow name</label>
                <input
                  id="edit-flow-name"
                  autoFocus
                  type="text"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/10"
                  maxLength={200}
                />
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-gray-800">Category</legend>
                <div className="flex flex-wrap gap-2">
                  {FLOW_CATEGORIES.map(item => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={categories.includes(item.value)}
                      onClick={() => setCategories([item.value])}
                      className={`border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        categories.includes(item.value)
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-primary/50 hover:text-gray-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-gray-200 bg-gray-50/70 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-11 w-full border border-primary bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save changes
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

// ── Send Flow modal ───────────────────────────────────────────────────────────

function SendModal({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [headerText, setHeaderText] = useState(flow.name);
  const [bodyText, setBodyText] = useState('Please complete the form below.');
  const [ctaLabel, setCtaLabel] = useState('Open Form');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!phone.trim()) { toast.error('Phone number is required'); return; }
    setSending(true);
    try {
      await sendFlow(flow.id, { phone: phone.trim(), headerText, bodyText, ctaLabel });
      toast.success('Flow sent successfully!');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send flow');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close send flow panel"
        onClick={onClose}
        className="flow-drawer-backdrop absolute inset-0 cursor-default bg-black/35"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-flow-title"
        aria-describedby="send-flow-description"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
        }}
        className="flow-drawer-panel relative z-10 flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl"
      >
        <form
          onSubmit={event => {
            event.preventDefault();
            void handleSend();
          }}
          className="flex h-full min-h-0 flex-col"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">WhatsApp Flows</p>
              <h2 id="send-flow-title" className="mt-1 text-xl font-semibold text-gray-900">Send Flow</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close send flow panel"
              className="p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <p id="send-flow-description" className="mb-7 text-sm text-gray-500">
              Choose a recipient and customize the message that opens this flow.
            </p>
            <div className="space-y-6">
              <div>
                <label htmlFor="send-flow-phone" className="mb-2 block text-sm font-medium text-gray-800">Recipient phone</label>
                <input
                  id="send-flow-phone"
                  autoFocus
                  type="tel"
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  placeholder="+919876543210 (with country code)"
                  autoComplete="tel"
                  className="w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div>
                <label htmlFor="send-flow-header" className="mb-2 block text-sm font-medium text-gray-800">Message header</label>
                <input
                  id="send-flow-header"
                  type="text"
                  value={headerText}
                  onChange={event => setHeaderText(event.target.value)}
                  className="w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div>
                <label htmlFor="send-flow-body" className="mb-2 block text-sm font-medium text-gray-800">Message body</label>
                <textarea
                  id="send-flow-body"
                  rows={3}
                  value={bodyText}
                  onChange={event => setBodyText(event.target.value)}
                  className="w-full resize-y border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div>
                <label htmlFor="send-flow-cta" className="mb-2 block text-sm font-medium text-gray-800">Button label</label>
                <input
                  id="send-flow-cta"
                  type="text"
                  value={ctaLabel}
                  onChange={event => setCtaLabel(event.target.value)}
                  className="w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </div>
          </div>

          <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-gray-200 bg-gray-50/70 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 border border-primary bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending…' : 'Send Flow'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

// ── Full-page flow responses ──────────────────────────────────────────────────

interface FlowResponse {
  id: string;
  contactName: string;
  contactPhone: string;
  flowData: Record<string, unknown>;
  submittedAt: string;
}

const SKIP_KEYS = new Set(['flow_token', 'version', 'source']);

function FlowResponsesPage({ flow, onBack }: { flow: Flow; onBack: () => void }) {
  const [contactFilter, setContactFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [answerFilter, setAnswerFilter] = useState('');
  const { data, isLoading, isError, error } = useQuery<{ responses: FlowResponse[]; total: number }>({
    queryKey: ['flow-responses', flow.id],
    queryFn: () => api.get<{ responses: FlowResponse[]; total: number }>(`/flows/${flow.id}/responses`),
  });

  const responses = data?.responses ?? [];
  const allKeys = Array.from(
    new Set(responses.flatMap(r => Object.keys(r.flowData).filter(k => !SKIP_KEYS.has(k))))
  );

  const filteredResponses = responses.filter(response => {
    const contactNeedle = contactFilter.trim().toLowerCase();
    const answerNeedle = answerFilter.trim().toLowerCase();
    const contactText = `${response.contactName} ${response.contactPhone}`.toLowerCase();
    if (contactNeedle && !contactText.includes(contactNeedle)) return false;

    const submittedAt = new Date(response.submittedAt).getTime();
    if (dateFrom) {
      const fromTime = new Date(`${dateFrom}T00:00:00`).getTime();
      if (!Number.isNaN(submittedAt) && submittedAt < fromTime) return false;
    }
    if (dateTo) {
      const toTime = new Date(`${dateTo}T23:59:59.999`).getTime();
      if (!Number.isNaN(submittedAt) && submittedAt > toTime) return false;
    }

    if (answerNeedle) {
      const values = answerKey
        ? [formatResponseValue(response.flowData[answerKey])]
        : allKeys.map(key => formatResponseValue(response.flowData[key]));
      if (!values.join(' ').toLowerCase().includes(answerNeedle)) return false;
    }
    return true;
  });

  const hasFilters = Boolean(contactFilter || dateFrom || dateTo || answerKey || answerFilter);

  function clearFilters() {
    setContactFilter('');
    setDateFrom('');
    setDateTo('');
    setAnswerKey('');
    setAnswerFilter('');
  }

  function downloadCsv() {
    if (filteredResponses.length === 0) {
      toast.info('There are no matching responses to download.');
      return;
    }
    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = ['Contact', 'Phone number', ...allKeys.map(formatResponseKey), 'Submitted at'];
    const rows = filteredResponses.map(response => [
      response.contactName,
      response.contactPhone,
      ...allKeys.map(key => formatResponseValue(response.flowData[key]) === '—' ? '' : formatResponseValue(response.flowData[key])),
      formatResponseDate(response.submittedAt, true),
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeFlowName = flow.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'whatsapp-flow';
    link.href = url;
    link.download = `${safeFlowName}-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filteredResponses.length} response${filteredResponses.length === 1 ? '' : 's'}.`);
  }

  return (
    <div className="flow-list-page flex h-[calc(100vh-3.5rem)] min-h-0 flex-col bg-white">
      <header className="flex shrink-0 flex-col justify-between gap-4 border-b bg-white px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to flows
          </button>
          <span aria-hidden="true" className="h-8 w-px shrink-0 bg-gray-200" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 shrink-0 text-primary" />
              <h1 className="truncate text-lg font-semibold text-gray-900">{flow.name} — Responses</h1>
            </div>
            <p className="ml-7 mt-0.5 text-sm text-gray-500" aria-live="polite">
              {isLoading ? 'Loading submissions…' : `${filteredResponses.length} of ${data?.total ?? responses.length} submissions`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={isLoading || filteredResponses.length === 0}
          title="Downloads the matching submissions as a CSV file"
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </header>

      <section className="shrink-0 border-b bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-600">Contact name or phone</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={contactFilter}
                onChange={event => setContactFilter(event.target.value)}
                placeholder="Search contacts"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </span>
          </label>
          <label className="w-[150px]">
            <span className="mb-1 block text-xs font-medium text-gray-600">From date</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={event => setDateFrom(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="w-[150px]">
            <span className="mb-1 block text-xs font-medium text-gray-600">To date</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={event => setDateTo(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-600">Answer field</span>
            <select
              value={answerKey}
              onChange={event => setAnswerKey(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              <option value="">All answer fields</option>
              {allKeys.map(key => <option key={key} value={key}>{formatResponseKey(key)}</option>)}
            </select>
          </label>
          <label className="min-w-[200px] flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-600">Answer contains</span>
            <input
              type="search"
              value={answerFilter}
              onChange={event => setAnswerFilter(event.target.value)}
              placeholder="Search answers"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-4 w-4" /> Clear filters
          </button>
        </div>
      </section>

      <main className="min-h-0 flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500">Loading submissions…</div>
        ) : isError ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-red-600">
            <p>Could not load responses.</p>
            {error instanceof Error && <p className="text-xs text-gray-500">{error.message}</p>}
          </div>
        ) : responses.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-500">
            <Inbox className="h-9 w-9 text-gray-300" />
            <p className="text-base font-medium">No responses yet</p>
            <p className="text-sm">Submissions will appear here when customers complete this flow.</p>
          </div>
        ) : filteredResponses.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-gray-500">
            <p className="text-base font-medium">No submissions match these filters.</p>
            <button type="button" onClick={clearFilters} className="text-sm font-medium text-primary hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="whitespace-nowrap px-5 py-3 text-sm font-semibold text-gray-600">Contact</th>
                  <th className="whitespace-nowrap px-5 py-3 text-sm font-semibold text-gray-600">Phone number</th>
                  {allKeys.map(key => (
                    <th key={key} className="whitespace-nowrap px-5 py-3 text-sm font-semibold text-gray-600">
                      {formatResponseKey(key)}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-5 py-3 text-sm font-semibold text-gray-600">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filteredResponses.map(response => (
                  <tr key={response.id} className="border-b border-gray-100 align-top transition-colors hover:bg-gray-50/70">
                    <td className="max-w-[220px] break-words px-5 py-4 font-medium text-gray-800">{response.contactName}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-600">{response.contactPhone || '—'}</td>
                    {allKeys.map(key => (
                      <td key={key} className="max-w-[280px] whitespace-normal break-words px-5 py-4 text-gray-700">
                        {formatResponseValue(response.flowData[key])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-5 py-4 text-gray-500">{formatResponseDate(response.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function formatResponseKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function formatResponseValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatResponseDate(value: string, iso = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return iso ? date.toISOString() : date.toLocaleString();
}

// ── Flow List ─────────────────────────────────────────────────────────────────

function FlowList({
  flows, totalFlowCount, onClearFilters, onEdit, onEditMeta, onDelete, onTogglePublish, onSend, onViewResponses, isStatusUpdating
}: {
  flows: Flow[];
  totalFlowCount: number;
  onClearFilters: () => void;
  onEdit: (f: Flow) => void;
  onEditMeta: (f: Flow) => void;
  onDelete: (id: string) => void;
  onTogglePublish: (f: Flow) => void;
  onSend: (f: Flow) => void;
  onViewResponses: (f: Flow) => void;
  isStatusUpdating: boolean;
}) {
  if (flows.length === 0) {
    if (totalFlowCount > 0) {
      return (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center text-gray-500">
          <Search className="h-9 w-9 text-gray-300" />
          <div>
            <p className="text-base font-semibold text-gray-700">No flows match these filters</p>
            <p className="mt-1 text-sm">Try another search or clear the selected filters.</p>
          </div>
          <button
            type="button"
            onClick={onClearFilters}
            className="border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Clear filters
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-gray-200 flex items-center justify-center shadow-sm">
          <Workflow className="w-7 h-7 opacity-30" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">No flows yet</p>
          <p className="text-xs mt-1">Click <span className="font-semibold">Create a New Flow</span> to build your first WhatsApp Flow.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-6 md:py-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200">
              <th scope="col" className="min-w-[360px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 md:px-5">
                Flow Name
              </th>
              <th scope="col" className="w-24 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Settings
              </th>
              <th scope="col" className="w-24 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Responses
              </th>
              <th scope="col" className="w-28 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Edit Screens
              </th>
              <th scope="col" className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Publish
              </th>
              <th scope="col" className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Send
              </th>
              <th scope="col" className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Delete
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {flows.map(flow => (
              <tr key={flow.id} className="transition-colors hover:bg-gray-50/70">
                <td className="px-4 py-4 md:px-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="break-words text-lg font-semibold leading-7 text-gray-900">{flow.name}</h3>
                    <StatusBadge status={flow.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
                    <span>
                      <span className="font-medium text-gray-500">Category:</span>{' '}
                      {flow.categories.map(c => FLOW_CATEGORIES.find(x => x.value === c)?.label ?? c).join(', ')}
                    </span>
                    <span>
                      <span className="font-medium text-gray-500">Screens:</span>{' '}
                      {flow.screens.length}
                    </span>
                    {flow.metaFlowId && (
                      <span className="font-medium text-green-700">
                        Synced with Meta
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-4 text-center">
                  <button
                    type="button"
                    onClick={() => onEditMeta(flow)}
                    aria-label={`Open settings for ${flow.name}`}
                    title="Settings"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <img src={settingsActionIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
                  </button>
                </td>
                <td className="px-2 py-4 text-center">
                  <button
                    type="button"
                    onClick={() => flow.status === 'PUBLISHED' && onViewResponses(flow)}
                    disabled={flow.status !== 'PUBLISHED'}
                    aria-label={flow.status === 'PUBLISHED' ? `View responses for ${flow.name}` : `Responses available after publishing ${flow.name}`}
                    title={flow.status === 'PUBLISHED' ? 'View responses' : 'Available after publishing'}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30"
                  >
                    <img src={responsesActionIcon} alt="" aria-hidden="true" className="h-9 w-9 object-contain" />
                  </button>
                </td>
                <td className="px-2 py-4 text-center">
                  <button
                    type="button"
                    onClick={() => onEdit(flow)}
                    aria-label={`Edit screens for ${flow.name}`}
                    title="Edit screens"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <img src={editActionIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
                  </button>
                </td>
                <td className="px-2 py-4 text-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flow.status === 'PUBLISHED'}
                    aria-label={flow.status === 'PUBLISHED' ? `Unpublish ${flow.name}` : `Publish ${flow.name}`}
                    title={flow.status === 'DEPRECATED' ? 'Deprecated flows cannot be published again' : flow.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                    disabled={isStatusUpdating || flow.status === 'DEPRECATED'}
                    onClick={() => onTogglePublish(flow)}
                    className="inline-flex h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        flow.status === 'PUBLISHED' ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          flow.status === 'PUBLISHED' ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                  </button>
                </td>
                <td className="px-2 py-4 text-center">
                  {flow.status === 'PUBLISHED' ? (
                    <button
                      type="button"
                      onClick={() => onSend(flow)}
                      aria-label={`Send ${flow.name}`}
                      title="Send"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <img src={sendActionIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
                    </button>
                  ) : (
                    <span aria-hidden="true" className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-2 py-4 text-center">
                  <button
                    type="button"
                    onClick={() => onDelete(flow.id)}
                    aria-label={`Delete ${flow.name}`}
                    title="Delete"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                  >
                    <img src={deleteActionIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Flow Editor ───────────────────────────────────────────────────────────────

function FlowEditorView({
  flow,
  onBack,
  onSave,
}: {
  flow: Flow;
  onBack: () => void;
  onSave: (updated: Partial<Flow>) => Promise<void>;
}) {
  const [screens, setScreens] = useState<FlowScreen[]>(
    flow.screens.length > 0 ? flow.screens : [makeNewScreen(1)]
  );
  const [activeScreenIdx, setActiveScreenIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('ios');

  const activeScreen = screens[activeScreenIdx] ?? null;
  const activeScreenIsTerminal = Boolean(activeScreen?.isTerminal) ||
    (!screens.some(screen => screen.isTerminal) && activeScreenIdx === screens.length - 1);

  function updateScreen(idx: number, patch: Partial<FlowScreen>) {
    setScreens(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function addScreen() {
    const newScreen = { ...makeNewScreen(screens.length + 1), isTerminal: true };
    // Auto-link previous last screen to new one, clearing its terminal flag
    setScreens(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, isTerminal: false, nextScreenId: newScreen.id };
      }
      return [...updated, newScreen];
    });
    setActiveScreenIdx(screens.length);
  }

  function removeScreen(idx: number) {
    if (screens.length === 1) { toast.error('A flow must have at least one screen'); return; }
    setScreens(prev => prev.filter((_, i) => i !== idx));
    setActiveScreenIdx(Math.min(idx, screens.length - 2));
  }

  function componentLimitReason(item: ComponentPaletteItem) {
    const components = activeScreen?.components ?? [];
    if (!activeScreen) return 'Choose a screen first.';
    if (components.length >= MAX_SCREEN_COMPONENTS) return `A screen can have up to ${MAX_SCREEN_COMPONENTS} components.`;
    if (
      (item.type === 'PhotoPicker' || item.type === 'DocumentPicker') &&
      components.some(comp => comp.type === 'PhotoPicker' || comp.type === 'DocumentPicker')
    ) return 'WhatsApp allows only one photo or document upload on each screen.';
    if (item.type === 'OptIn' && components.filter(comp => comp.type === 'OptIn').length >= 5) {
      return 'A screen can have up to five consent checkboxes.';
    }
    if (item.type === 'EmbeddedLink' && components.filter(comp => comp.type === 'EmbeddedLink').length >= 2) {
      return 'A screen can have up to two embedded links.';
    }
    return null;
  }

  function addComponent(item: ComponentPaletteItem) {
    const reason = componentLimitReason(item);
    if (reason) {
      toast.error(reason);
      return;
    }
    const comp = makeDefaultComponent(item.type, item.inputType);
    if (comp.name) {
      const usedNames = new Set(screens.flatMap(screen => screen.components.map(existing => existing.name).filter(Boolean)));
      const baseName = comp.name;
      let candidate = baseName;
      let suffix = 2;
      while (usedNames.has(candidate)) candidate = `${baseName}_${suffix++}`;
      comp.name = candidate;
    }
    updateScreen(activeScreenIdx, {
      components: [...(activeScreen?.components ?? []), comp],
    });
  }

  function updateComponent(compIdx: number, updated: FlowComponent) {
    const comps = (activeScreen?.components ?? []).map((c, i) => i === compIdx ? updated : c);
    updateScreen(activeScreenIdx, { components: comps });
  }

  function removeComponent(compIdx: number) {
    const comps = (activeScreen?.components ?? []).filter((_, i) => i !== compIdx);
    updateScreen(activeScreenIdx, { components: comps });
  }

  function moveComponent(compIdx: number, dir: 'up' | 'down') {
    const comps = [...(activeScreen?.components ?? [])];
    const targetIdx = dir === 'up' ? compIdx - 1 : compIdx + 1;
    if (targetIdx < 0 || targetIdx >= comps.length) return;
    [comps[compIdx], comps[targetIdx]] = [comps[targetIdx], comps[compIdx]];
    updateScreen(activeScreenIdx, { components: comps });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ screens });
      toast.success('Flow saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-14 bg-white border-b px-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <span className="font-semibold text-gray-900 text-sm">{flow.name}</span>
          <StatusBadge status={flow.status} />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 shadow-sm"
        >
          <Check className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save Flow'}
        </button>
      </div>

      {/* Shared header grid mirrors the screen, palette, editor, and preview columns below. */}
      <div className="shrink-0 border-b bg-white">
        <div className="grid grid-cols-[13rem_15rem_minmax(0,1fr)] xl:grid-cols-[13rem_15rem_minmax(0,1fr)_360px] 2xl:grid-cols-[13rem_15rem_minmax(0,1fr)_400px]">
          <div className="flex min-w-0 items-center justify-between border-r px-3 py-1.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">Screens</h2>
            <button
              type="button"
              onClick={addScreen}
              aria-label="Add screen"
              title="Add screen"
              className="rounded p-1 hover:bg-gray-100"
            >
              <PlusCircle className="h-4 w-4 text-primary" />
            </button>
          </div>
          <div className="flex min-w-0 items-center border-r px-3 py-1.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">Add a component</h2>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
            {activeScreen ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs font-medium text-gray-500">Title</span>
                  <input
                    type="text"
                    value={activeScreen.title}
                    onChange={e => updateScreen(activeScreenIdx, { title: e.target.value })}
                    className="w-[150px] max-w-full rounded-lg border border-gray-200 px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-medium text-gray-500">Next screen</span>
                  {activeScreen.isTerminal ? (
                    <span className="text-xs font-medium text-green-600">Submit (final)</span>
                  ) : (
                    <select
                      value={activeScreen.nextScreenId ?? ''}
                      onChange={e => updateScreen(activeScreenIdx, { nextScreenId: e.target.value })}
                      className="max-w-[130px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Select screen...</option>
                      {screens.filter((_, i) => i !== activeScreenIdx).map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  )}
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <div
                    onClick={() => updateScreen(activeScreenIdx, { isTerminal: !activeScreen.isTerminal, nextScreenId: undefined })}
                    className={`relative h-4 w-8 rounded-full transition-colors ${activeScreen.isTerminal ? 'bg-green-500' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${activeScreen.isTerminal ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="whitespace-nowrap text-xs text-gray-600">Final screen</span>
                </label>
              </>
            ) : (
              <span className="text-xs text-gray-400">Select a screen to edit</span>
            )}
          </div>
          <div className="hidden min-w-0 items-center justify-between gap-1 border-l px-3 py-1.5 xl:flex">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">Preview</h2>
            <DevicePreviewSelector device={previewDevice} onChange={setPreviewDevice} />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Left: Screen list */}
        <div className="w-52 bg-white border-r flex flex-col shrink-0">
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {screens.map((screen, idx) => (
              <div
                key={screen.id}
                onClick={() => setActiveScreenIdx(idx)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                  activeScreenIdx === idx ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                  activeScreenIdx === idx ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {idx + 1}
                </div>
                <span className="text-xs font-medium flex-1 truncate">{screen.title}</span>
                {screen.isTerminal && <span className="text-[10px] text-green-600 font-semibold">END</span>}
                <button
                  onClick={e => { e.stopPropagation(); removeScreen(idx); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="p-2 border-t">
            <button
              onClick={addScreen}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-primary font-medium border border-dashed border-primary/40 rounded-xl hover:bg-primary/5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Screen
            </button>
          </div>
        </div>

        {/* Center: Screen editor */}
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden bg-gray-50">
          {activeScreen ? (
            <>
              <div className="flex min-w-0 flex-1 overflow-hidden">
                {/* Component palette */}
                <div className="w-60 bg-white border-r flex flex-col shrink-0">
                  <div className="flex-1 overflow-y-auto p-2">
                    {COMPONENT_CATEGORIES.map(category => (
                      <section key={category.id} className="mb-4 last:mb-1">
                        <div className="px-2 pb-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <span aria-hidden="true" className="mr-1.5">{category.emoji}</span>{category.title}
                          </p>
                          <p className="mt-0.5 text-[9px] leading-snug text-gray-400">{category.description}</p>
                        </div>
                        <div className="space-y-0.5">
                          {category.items.map(item => {
                            const disabledReason = componentLimitReason(item);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => addComponent(item)}
                                disabled={Boolean(disabledReason)}
                                title={disabledReason ?? item.description}
                                className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <span aria-hidden="true" className="mt-0.5 w-5 shrink-0 text-center text-sm">{item.emoji}</span>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold leading-tight text-gray-700 group-hover:text-primary">{item.label}</p>
                                  <p className="mt-0.5 text-[9px] leading-tight text-gray-400">{item.description}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>

                {/* Components list */}
                <div className="min-w-0 flex-1 overflow-y-auto p-4 space-y-2">
                  {activeScreen.components.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-300 gap-2">
                      <PlusCircle className="w-8 h-8" />
                      <p className="text-xs text-center text-gray-400">Click a component on the left to add it to this screen</p>
                    </div>
                  ) : (
                    activeScreen.components.map((comp, compIdx) => (
                      <ComponentEditor
                        key={compIdx}
                        comp={comp}
                        index={compIdx}
                        total={activeScreen.components.length}
                        screenIsTerminal={activeScreenIsTerminal}
                        maxImageBytes={Math.max(0, MAX_FLOW_INLINE_IMAGE_BYTES - screens.reduce((totalBytes, screen, screenIdx) => (
                          totalBytes + screen.components.reduce((screenBytes, other, otherIdx) => (
                            screenBytes + (screenIdx === activeScreenIdx && otherIdx === compIdx ? 0 : inlineImageBytes(other.src))
                          ), 0)
                        ), 0))}
                        onChange={updated => updateComponent(compIdx, updated)}
                        onRemove={() => removeComponent(compIdx)}
                        onMoveUp={() => moveComponent(compIdx, 'up')}
                        onMoveDown={() => moveComponent(compIdx, 'down')}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Select a screen to edit
            </div>
          )}
        </div>

        {/* Right: Phone preview */}
        <div className="hidden shrink-0 flex-col border-l bg-gray-50 xl:flex xl:w-[360px] 2xl:w-[400px]">
          <PhonePreview screen={activeScreen} flowName={flow.name} device={previewDevice} />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FlowBuilder() {
  const { confirm, confirmDialog } = useConfirmDialog();
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMeta, setEditingMeta] = useState<Flow | null>(null);
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null);
  const [sendingFlow, setSendingFlow] = useState<Flow | null>(null);
  const [viewingResponses, setViewingResponses] = useState<Flow | null>(null);
  const [flowSearch, setFlowSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | Flow['status']>('');

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: fetchFlows,
  });

  const searchTerm = flowSearch.trim().toLowerCase();
  const filteredFlows = flows.filter(flow => {
    const categoryLabels = flow.categories.map(category =>
      FLOW_CATEGORIES.find(item => item.value === category)?.label ?? category
    );
    const searchContent = `${flow.name} ${categoryLabels.join(' ')} ${flow.status}`.toLowerCase();

    return (
      (!searchTerm || searchContent.includes(searchTerm)) &&
      (!categoryFilter || flow.categories.includes(categoryFilter)) &&
      (!statusFilter || flow.status === statusFilter)
    );
  });

  function clearFlowFilters() {
    setFlowSearch('');
    setCategoryFilter('');
    setStatusFilter('');
  }

  const createMutation = useMutation({
    mutationFn: (data: Partial<Flow>) => createFlow(data),
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      setShowCreateModal(false);
      toast.success('Flow created!');
      setEditingFlow(flow);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Flow> }) => updateFlow(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      setEditingMeta(null);
      toast.success('Flow updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFlow,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows'] }); toast.success('Flow deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishStatusMutation = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      publish ? publishFlow(id) : unpublishFlow(id),
    onSuccess: (_updatedFlow, { publish }) => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      toast.success(publish ? 'Flow published to Meta!' : 'Flow unpublished and returned to draft.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSaveScreens(flowId: string, data: Partial<Flow>) {
    const updated = await updateFlow(flowId, data);
    qc.invalidateQueries({ queryKey: ['flows'] });
    // Refresh the editing flow with latest data
    setEditingFlow(updated);
  }

  // ── Editor view ──
  if (viewingResponses) {
    return (
      <FlowResponsesPage
        flow={viewingResponses}
        onBack={() => setViewingResponses(null)}
      />
    );
  }

  if (editingFlow) {
    return (
      <FlowEditorView
        flow={editingFlow}
        onBack={() => { setEditingFlow(null); qc.invalidateQueries({ queryKey: ['flows'] }); }}
        onSave={(data) => handleSaveScreens(editingFlow.id, data)}
      />
    );
  }

  // ── List view ──
  return (
    <div className="flow-list-page h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden bg-white">
      {confirmDialog}
      {/* Toolbar */}
      <div className="z-10 shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="relative flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="whitespace-nowrap text-lg font-semibold text-gray-900">WhatsApp Flows</h1>
          </div>

          <div className="order-3 flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 lg:absolute lg:left-1/2 lg:top-1/2 lg:order-none lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:flex-nowrap">
            <label className="relative min-w-[168px] w-full sm:w-[190px] lg:w-[190px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={flowSearch}
                onChange={event => setFlowSearch(event.target.value)}
                aria-label="Search flows by name or category"
                placeholder="Search flows"
                className="h-10 w-full border border-gray-300 bg-white pl-9 pr-3 text-[14px] text-gray-800 outline-none transition-colors placeholder:text-gray-500 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>

            <Select
              value={categoryFilter || '__all__'}
              onValueChange={value => setCategoryFilter(value === '__all__' ? '' : value)}
            >
              <SelectTrigger
                aria-label="Filter flows by category"
                className="h-10 w-[142px] rounded-none border-gray-300 bg-white px-2 text-sm font-medium text-gray-800 shadow-none transition-colors hover:border-primary/60 focus:ring-2 focus:ring-primary/15 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-gray-500 [&>svg]:opacity-100"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                align="start"
                sideOffset={4}
                className="min-w-[190px] rounded-none border-gray-200 bg-white p-1 shadow-lg"
              >
                <SelectItem value="__all__" className="rounded-none py-2 text-sm text-gray-700 focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary">All categories</SelectItem>
                {FLOW_CATEGORIES.map(category => (
                  <SelectItem key={category.value} value={category.value} className="rounded-none py-2 text-sm text-gray-700 focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary">
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter || '__all__'}
              onValueChange={value => setStatusFilter(value === '__all__' ? '' : value as Flow['status'])}
            >
              <SelectTrigger
                aria-label="Filter flows by status"
                className="h-10 w-[118px] rounded-none border-gray-300 bg-white px-2 text-sm font-medium text-gray-800 shadow-none transition-colors hover:border-primary/60 focus:ring-2 focus:ring-primary/15 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-gray-500 [&>svg]:opacity-100"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                align="start"
                sideOffset={4}
                className="min-w-[160px] rounded-none border-gray-200 bg-white p-1 shadow-lg"
              >
                <SelectItem value="__all__" className="rounded-none py-2 text-sm text-gray-700 focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary">All statuses</SelectItem>
                <SelectItem value="DRAFT" className="rounded-none py-2 text-sm text-gray-700 focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary">Draft</SelectItem>
                <SelectItem value="PUBLISHED" className="rounded-none py-2 text-sm text-gray-700 focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary">Published</SelectItem>
                <SelectItem value="DEPRECATED" className="rounded-none py-2 text-sm text-gray-700 focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary">Deprecated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="order-2 ml-auto inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border border-primary bg-primary px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 lg:order-none"
          >
            <Plus className="h-4 w-4" /> Create a New Flow
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading flows…</div>
        ) : (
          <FlowList
            flows={filteredFlows}
            totalFlowCount={flows.length}
            onClearFilters={clearFlowFilters}
            onEdit={setEditingFlow}
            onEditMeta={setEditingMeta}
            onDelete={async (id) => {
              if (await confirm({
                title: 'Delete this flow?',
                description: 'This flow and its configuration will be permanently removed.',
                confirmLabel: 'Delete flow',
              })) deleteMutation.mutate(id);
            }}
            onTogglePublish={(flow) =>
              publishStatusMutation.mutate({ id: flow.id, publish: flow.status !== 'PUBLISHED' })
            }
            onSend={setSendingFlow}
            onViewResponses={setViewingResponses}
            isStatusUpdating={publishStatusMutation.isPending}
          />
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <NewFlowDrawer
          onClose={() => setShowCreateModal(false)}
          onSave={(data) => createMutation.mutate(data)}
        />
      )}
      {editingMeta && (
        <FlowModal
          flow={editingMeta}
          onClose={() => setEditingMeta(null)}
          onSave={(data) => updateMutation.mutate({ id: editingMeta.id, data })}
        />
      )}
      {sendingFlow && (
        <SendModal flow={sendingFlow} onClose={() => setSendingFlow(null)} />
      )}
    </div>
  );
}
