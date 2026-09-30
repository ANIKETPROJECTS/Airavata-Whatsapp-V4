import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Workflow, ArrowLeft, Send, Globe, Trash2,
  Pencil, ChevronRight, LayoutList, PlusCircle, X, Check, Inbox, CalendarDays
} from 'lucide-react';
import { api } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { DevicePreviewSelector, type PreviewDevice } from '../components/DevicePreview';
import PhonePreview from '../components/flow/PhonePreview';
import ComponentEditor from '../components/flow/ComponentEditor';
import type { Flow, FlowScreen, FlowComponent, ComponentPaletteItem } from '../types/flow';
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
const sendFlow = (id: string, body: object) => api.post(`/flows/${id}/send`, body);

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Flow['status'] }) {
  const map = {
    DRAFT: 'bg-yellow-100 text-yellow-700',
    PUBLISHED: 'bg-green-100 text-green-700',
    DEPRECATED: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ── Create / Edit Flow modal ──────────────────────────────────────────────────

function FlowModal({ flow, onClose, onSave }: {
  flow?: Flow | null;
  onClose: () => void;
  onSave: (data: { name: string; categories: string[]; endpointUri?: string; screens?: FlowScreen[] }) => void;
}) {
  const [name, setName] = useState(flow?.name ?? '');
  const [categories, setCategories] = useState<string[]>(flow?.categories ?? ['OTHER']);
  const [endpointUri, setEndpointUri] = useState(flow?.endpointUri ?? '');
  const [isDynamic, setIsDynamic] = useState(!!flow?.endpointUri);
  const [useAppointmentTemplate, setUseAppointmentTemplate] = useState(false);

  function toggleCategory(val: string) {
    setCategories(prev =>
      prev.includes(val) ? prev.filter(c => c !== val) : [val]
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{flow ? 'Edit Flow' : 'Create New Flow'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Flow Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Appointment Booking"
              maxLength={200}
            />
            <p className="text-[11px] text-gray-400 mt-1">{name.length}/200</p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {FLOW_CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => toggleCategory(c.value)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    categories.includes(c.value)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic toggle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setIsDynamic(!isDynamic)}
                className={`w-10 h-5 rounded-full transition-colors ${isDynamic ? 'bg-primary' : 'bg-gray-200'} relative`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isDynamic ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">Dynamic Flow (with endpoint)</p>
                <p className="text-[11px] text-gray-400">Your server is called at each screen transition</p>
              </div>
            </label>
            {isDynamic && (
              <input
                type="url"
                value={endpointUri}
                onChange={e => setEndpointUri(e.target.value)}
                className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                placeholder="https://your-server.com/api/flows/endpoint"
              />
            )}
          </div>

          {!flow && (
            <button
              type="button"
              onClick={() => setUseAppointmentTemplate(value => !value)}
              className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 transition-colors ${
                useAppointmentTemplate
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-primary/40'
              }`}
            >
              <div className={`mt-0.5 rounded-lg p-1.5 ${useAppointmentTemplate ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Start with an appointment form</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Name, mobile, vehicle, date, time, and optional notes on one screen.</p>
              </div>
            </button>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button
            onClick={() => name.trim() && onSave({
              name: name.trim(),
              categories,
              endpointUri: isDynamic ? endpointUri : undefined,
              screens: useAppointmentTemplate ? [makeAppointmentScreen()] : undefined,
            })}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50"
          >
            {flow ? 'Save Changes' : 'Create Flow'}
          </button>
        </div>
      </div>
    </div>
  );
}

function makeAppointmentScreen(): FlowScreen {
  return {
    id: 'SCREEN_APPOINTMENT',
    title: 'Book Appointment',
    isTerminal: true,
    components: [
      { type: 'TextHeading', text: 'Appointment details' },
      { type: 'TextBody', text: 'Please fill in the details below and submit once.' },
      { type: 'TextInput', name: 'full_name', label: 'Full name', required: true, inputType: 'text' },
      { type: 'TextInput', name: 'phone', label: 'Mobile number', required: true, inputType: 'phone' },
      { type: 'TextInput', name: 'vehicle_model', label: 'Vehicle model', required: true, inputType: 'text' },
      { type: 'DatePicker', name: 'appointment_date', label: 'Preferred date', required: true },
      {
        type: 'Dropdown',
        name: 'appointment_time',
        label: 'Preferred time',
        required: true,
        options: [
          { id: '09_00', title: '09:00 AM' },
          { id: '12_00', title: '12:00 PM' },
          { id: '03_00', title: '03:00 PM' },
          { id: '06_00', title: '06:00 PM' },
        ],
      },
      { type: 'TextArea', name: 'notes', label: 'Additional notes (optional)', required: false },
    ],
  };
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Send Flow</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Recipient Phone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="+919876543210 (with country code)" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Message Header</label>
            <input type="text" value={headerText} onChange={e => setHeaderText(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Message Body</label>
            <textarea rows={2} value={bodyText} onChange={e => setBodyText(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Button Label</label>
            <input type="text" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button onClick={handleSend} disabled={sending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Sending...' : 'Send Flow'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Responses modal ───────────────────────────────────────────────────────────

interface FlowResponse {
  id: string;
  contactName: string;
  contactPhone: string;
  flowData: Record<string, unknown>;
  submittedAt: string;
}

const SKIP_KEYS = new Set(['flow_token', 'version', 'source']);

function ResponsesModal({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ responses: FlowResponse[]; total: number }>({
    queryKey: ['flow-responses', flow.id],
    queryFn: () => api.get(`/flows/${flow.id}/responses`),
  });

  const responses = data?.responses ?? [];

  // Collect all unique field keys across responses (excluding internal Meta keys)
  const allKeys = Array.from(
    new Set(responses.flatMap(r => Object.keys(r.flowData).filter(k => !SKIP_KEYS.has(k))))
  );

  function formatKey(k: string) {
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function formatVal(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function formatDate(s: string) {
    return new Date(s).toLocaleString();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Inbox className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-semibold text-gray-900">{flow.name} — Responses</h2>
              {!isLoading && (
                <p className="text-xs text-gray-400">{data?.total ?? 0} submission{data?.total !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
          ) : responses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
              <Inbox className="w-10 h-10 opacity-30" />
              <p className="text-sm">No responses yet</p>
              <p className="text-xs">Responses will appear here once users submit the form.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">Contact</th>
                    {allKeys.map(k => (
                      <th key={k} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                        {formatKey(k)}
                      </th>
                    ))}
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r, i) => (
                    <tr key={r.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-primary/5 transition-colors`}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-800 text-xs">{r.contactName}</p>
                        <p className="text-gray-400 text-[11px]">{r.contactPhone}</p>
                      </td>
                      {allKeys.map(k => (
                        <td key={k} className="px-3 py-3 text-gray-700 text-xs max-w-[200px] truncate">
                          {formatVal(r.flowData[k])}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-gray-400 text-[11px] whitespace-nowrap">{formatDate(r.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Flow List ─────────────────────────────────────────────────────────────────

function FlowList({
  flows, onEdit, onEditMeta, onDelete, onPublish, onSend, onViewResponses
}: {
  flows: Flow[];
  onEdit: (f: Flow) => void;
  onEditMeta: (f: Flow) => void;
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
  onSend: (f: Flow) => void;
  onViewResponses: (f: Flow) => void;
}) {
  if (flows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-gray-200 flex items-center justify-center shadow-sm">
          <Workflow className="w-7 h-7 opacity-30" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">No flows yet</p>
          <p className="text-xs mt-1">Click <span className="font-semibold">New Flow</span> to build your first WhatsApp Flow.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {flows.map(flow => (
        <div key={flow.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm truncate">{flow.name}</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {flow.categories.map(c => FLOW_CATEGORIES.find(x => x.value === c)?.label ?? c).join(', ')}
              </p>
            </div>
            <StatusBadge status={flow.status} />
          </div>

          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><LayoutList className="w-3 h-3" />{flow.screens.length} screen{flow.screens.length !== 1 ? 's' : ''}</span>
            {flow.metaFlowId && <span className="text-green-600">• Synced with Meta</span>}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1 border-t border-gray-50">
            <button
              onClick={() => onEdit(flow)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium"
            >
              <Pencil className="w-3 h-3" /> Edit Screens
            </button>
            <button
              onClick={() => onEditMeta(flow)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium"
            >
              <Pencil className="w-3 h-3" /> Settings
            </button>
            {flow.status === 'DRAFT' && (
              <button
                onClick={() => onPublish(flow.id)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 font-medium"
              >
                <Globe className="w-3 h-3" /> Publish
              </button>
            )}
            {flow.status === 'PUBLISHED' && (
              <>
                <button
                  onClick={() => onViewResponses(flow)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium"
                >
                  <Inbox className="w-3 h-3" /> Responses
                </button>
                <button
                  onClick={() => onSend(flow)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium"
                >
                  <Send className="w-3 h-3" /> Send
                </button>
              </>
            )}
            <button
              onClick={() => onDelete(flow.id)}
              className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
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

      {/* Screen settings span the editor so the panels below share one aligned top edge. */}
      <div className="shrink-0 border-b bg-white px-4 py-2.5">
        {activeScreen ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex min-w-[220px] flex-1 items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-gray-500">Title</span>
              <input
                type="text"
                value={activeScreen.title}
                onChange={e => updateScreen(activeScreenIdx, { title: e.target.value })}
                className="w-full max-w-[260px] min-w-0 rounded-lg border border-gray-200 px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Next screen</span>
              {activeScreen.isTerminal ? (
                <span className="text-xs font-medium text-green-600">Submit (final)</span>
              ) : (
                <select
                  value={activeScreen.nextScreenId ?? ''}
                  onChange={e => updateScreen(activeScreenIdx, { nextScreenId: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
              <span className="text-xs text-gray-600">Final screen</span>
            </label>
          </div>
        ) : (
          <div className="h-7" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Left: Screen list */}
        <div className="w-52 bg-white border-r flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Screens</span>
            <button onClick={addScreen} className="p-1 rounded hover:bg-gray-100">
              <PlusCircle className="w-4 h-4 text-primary" />
            </button>
          </div>
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
                  <div className="p-3 border-b">
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Add a component</span>
                  </div>
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
          <div className="px-3 py-2 border-b bg-white flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Preview</span>
            <DevicePreviewSelector device={previewDevice} onChange={setPreviewDevice} />
          </div>
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

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: fetchFlows,
  });

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

  const publishMutation = useMutation({
    mutationFn: publishFlow,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows'] }); toast.success('Flow published to Meta!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSaveScreens(flowId: string, data: Partial<Flow>) {
    const updated = await updateFlow(flowId, data);
    qc.invalidateQueries({ queryKey: ['flows'] });
    // Refresh the editing flow with latest data
    setEditingFlow(updated);
  }

  // ── Editor view ──
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
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-gray-50 overflow-hidden">
      {confirmDialog}
      {/* Toolbar */}
      <div className="h-14 bg-white border-b px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Workflow className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-gray-900">WhatsApp Flows</h1>
          {flows.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{flows.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-1.5 font-medium text-sm text-white bg-primary rounded-xl hover:bg-primary/90 flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Flow
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading flows…</div>
        ) : (
          <FlowList
            flows={flows}
            onEdit={setEditingFlow}
            onEditMeta={setEditingMeta}
            onDelete={async (id) => {
              if (await confirm({
                title: 'Delete this flow?',
                description: 'This flow and its configuration will be permanently removed.',
                confirmLabel: 'Delete flow',
              })) deleteMutation.mutate(id);
            }}
            onPublish={(id) => publishMutation.mutate(id)}
            onSend={setSendingFlow}
            onViewResponses={setViewingResponses}
          />
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <FlowModal
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
      {viewingResponses && (
        <ResponsesModal flow={viewingResponses} onClose={() => setViewingResponses(null)} />
      )}
    </div>
  );
}
