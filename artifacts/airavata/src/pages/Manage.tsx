import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key, Phone, MessageSquare, Settings, Layers, Users, Tag,
  Copy, Eye, EyeOff, RefreshCw, Loader2, CheckCircle2,
  Plus, Trash2, X, Search, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ApiKeyRecord { id: string; label: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string; }
interface GeneratedKey extends ApiKeyRecord { rawKey: string; }
interface PhoneNumber { id: string; number: string; verifiedName: string; quality: string; messagingTier: string; status: string; verified: boolean; }
interface Agent { id: string; name: string; email: string; role: string; permissions: Record<string, boolean>; status: string; createdAt: string; }
interface CannedMsg { id: string; name: string; message: string; type: string; }
interface DaySettings { enabled: boolean; open: string; close: string; }
interface LiveChatSettings { offHoursEnabled: boolean; offHoursMessage: string; timezone: string; workingHours: Record<string, DaySettings>; }
interface AttributeItem { id: string; name: string; }

// ── API Keys Tab ──────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const qc = useQueryClient();
  const [labelInput, setLabelInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<GeneratedKey | null>(null);
  const [revealed, setRevealed] = useState(false);

  const { data, isLoading } = useQuery<{ keys: ApiKeyRecord[] }>({ queryKey: ['apikeys'], queryFn: () => api.get('/apikeys') });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/apikeys/${id}`),
    onSuccess: () => { toast.success('API key revoked'); qc.invalidateQueries({ queryKey: ['apikeys'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.post<{ key: GeneratedKey }>('/apikeys', { label: labelInput.trim() || 'Default Key' });
      setNewKey(res.key); setRevealed(true); setLabelInput('');
      qc.invalidateQueries({ queryKey: ['apikeys'] });
      toast.success("New API key generated — save it now, it won't be shown again.");
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setGenerating(false); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  return (
    <div className="p-6 space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
        <p className="text-xs text-gray-500 mt-0.5">Keys are hashed and stored securely — the full key is shown only once.</p>
      </div>
      <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Generate New Key</h3>
        <div className="flex gap-2">
          <input value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="Key label (e.g. Production)"
            className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-60">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Generate
          </button>
        </div>
      </div>
      {newKey && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-800">⚠ Copy this key now — it will never be shown again</p>
            <button onClick={() => setNewKey(null)} className="text-xs text-amber-600 hover:underline">Dismiss</button>
          </div>
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-md px-3 py-2">
            <code className="flex-1 text-sm font-mono text-gray-800 break-all">{revealed ? newKey.rawKey : newKey.rawKey.replace(/./g, '•')}</code>
            <button onClick={() => setRevealed(v => !v)} className="p-1 text-gray-400 hover:text-gray-700">{revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            <button onClick={() => copy(newKey.rawKey)} className="p-1 text-gray-400 hover:text-gray-700"><Copy className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-amber-700">Label: <span className="font-medium">{newKey.label}</span></p>
        </div>
      )}
      {isLoading ? <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        : (data?.keys.length ?? 0) === 0 ? <div className="flex flex-col items-center py-12 text-gray-400 gap-2"><Key className="w-10 h-10 opacity-30" /><p className="text-sm">No API keys yet. Generate one above.</p></div>
        : <div className="space-y-3">{data!.keys.map(key => (
          <div key={key.id} className="border rounded-lg p-4 flex justify-between items-center gap-4">
            <div className="min-w-0">
              <h3 className="font-medium text-gray-900 mb-1">{key.label}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">{key.keyPrefix}••••••••••••••••••••••••••••••••</code>
                <button onClick={() => copy(key.keyPrefix)} className="p-1 hover:text-gray-900"><Copy className="w-3.5 h-3.5" /></button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Created {new Date(key.createdAt).toLocaleDateString()}{key.lastUsedAt && ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}</p>
            </div>
            <button onClick={() => { if (confirm(`Revoke key "${key.label}"?`)) revokeMutation.mutate(key.id); }}
              disabled={revokeMutation.isPending}
              className="shrink-0 text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded disabled:opacity-50">Revoke</button>
          </div>
        ))}</div>}
    </div>
  );
}

// ── Phone Numbers Tab ─────────────────────────────────────────────────────────
function PhoneNumbersTab() {
  const { data, isLoading } = useQuery<{ numbers: PhoneNumber[] }>({ queryKey: ['phonenumbers'], queryFn: () => api.get('/phonenumbers') });
  const numbers = data?.numbers ?? [];
  const qualityColor = (q: string) => q === 'GREEN' ? 'text-green-600' : q === 'YELLOW' ? 'text-yellow-600' : q === 'RED' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="p-6 space-y-6">
      <div className="border-b pb-4"><h2 className="text-lg font-semibold text-gray-900">Manage Phone Number</h2></div>
      {isLoading ? <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        : numbers.length === 0 ? <div className="flex flex-col items-center py-12 gap-2 text-gray-400"><Phone className="w-8 h-8 opacity-30" /><p className="text-sm">No phone numbers found in Meta WhatsApp Manager.</p></div>
        : <div className="space-y-4">{numbers.map(pn => (
          <div key={pn.id} className="border rounded-lg p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-gray-900 text-lg">{pn.number}</h3>
                {pn.verified && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </div>
              {pn.verifiedName && <p className="text-sm text-gray-700 font-medium mb-1">{pn.verifiedName}</p>}
              <div className="flex gap-3 text-sm text-gray-500">
                <span>Quality: <span className={`font-medium ${qualityColor(pn.quality)}`}>{pn.quality}</span></span>
                {pn.messagingTier && pn.messagingTier !== '—' && <><span>•</span><span>{pn.messagingTier}</span></>}
              </div>
            </div>
            <span className="px-3 py-1 bg-green-50 text-green-700 text-sm font-medium rounded-full border border-green-100">{pn.status}</span>
          </div>
        ))}</div>}
      <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">Ensure your Facebook Business Manager is verified to upgrade your messaging limits.</div>
    </div>
  );
}

// ── Agents Tab ────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = { agent: 'Agent', supervisor: 'Supervisor', admin: 'Admin' };

function AgentsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'agent', permissions: { liveChat: true, campaigns: false, contacts: true, templates: false } });

  const { data, isLoading } = useQuery<{ agents: Agent[] }>({ queryKey: ['agents'], queryFn: () => api.get('/agents') });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/agents', payload),
    onSuccess: () => { toast.success('Agent added'); qc.invalidateQueries({ queryKey: ['agents'] }); setShowForm(false); resetForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<typeof form> }) => api.put(`/agents/${id}`, payload),
    onSuccess: () => { toast.success('Agent updated'); qc.invalidateQueries({ queryKey: ['agents'] }); setEditAgent(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => { toast.success('Agent removed'); qc.invalidateQueries({ queryKey: ['agents'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetForm = () => setForm({ name: '', email: '', role: 'agent', permissions: { liveChat: true, campaigns: false, contacts: true, templates: false } });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.agents ?? []).filter(a => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [data?.agents, search]);

  const PERMISSIONS = [
    { key: 'liveChat', label: 'Live Chat' },
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'templates', label: 'Templates' },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header info */}
      <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
        <h2 className="text-base font-semibold text-gray-900">Managing Your Agents</h2>
        <p className="text-sm text-gray-500">Agents are users who can access your WhatsApp Verified account with localized workspace feature permissions.</p>
        <ul className="text-sm text-gray-500 list-disc list-inside space-y-0.5">
          <li>Create agents with specific permissions matching organizational duties.</li>
          <li>Each agent accesses workspace modules using unique isolated API keys.</li>
          <li>Instantly restrict, expand, or terminate access configurations when required.</li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents by account username..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={() => { setShowForm(true); setEditAgent(null); resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add Agent
        </button>
      </div>

      {/* Add/Edit form */}
      {(showForm || editAgent) && (
        <div className="border rounded-lg p-5 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{editAgent ? 'Edit Agent' : 'New Agent'}</h3>
            <button onClick={() => { setShowForm(false); setEditAgent(null); }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name *"
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address *"
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 font-medium shrink-0">Role:</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="agent">Agent</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">Permissions</p>
            <div className="flex flex-wrap gap-3">
              {PERMISSIONS.map(p => (
                <label key={p.key} className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.permissions[p.key as keyof typeof form.permissions]}
                    onChange={e => setForm(f => ({ ...f, permissions: { ...f.permissions, [p.key]: e.target.checked } }))}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm text-gray-700">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => editAgent ? updateMutation.mutate({ id: editAgent.id, payload: form }) : createMutation.mutate(form)}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editAgent ? 'Save Changes' : 'Add Agent'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        : filtered.length === 0 ? (
          <div className="border rounded-lg py-16 text-center text-gray-400 text-sm">
            No agent profiles registered on this corporate API workspace bind.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden divide-y">
            {filtered.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.name}</p>
                    <p className="text-xs text-gray-400">{a.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">{ROLE_LABELS[a.role] ?? a.role}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
                  <button onClick={() => { setEditAgent(a); setShowForm(false); setForm({ name: a.name, email: a.email, role: a.role, permissions: { liveChat: true, campaigns: false, contacts: true, templates: false, ...a.permissions } }); }}
                    className="p-1.5 text-gray-400 hover:text-gray-700"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => { if (confirm(`Remove agent "${a.name}"?`)) deleteMutation.mutate(a.id); }}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ── Canned Messages Tab ───────────────────────────────────────────────────────
function CannedMessagesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<CannedMsg | null>(null);
  const [form, setForm] = useState({ name: '', message: '', type: 'text' });

  const { data, isLoading } = useQuery<{ messages: CannedMsg[] }>({ queryKey: ['canned-messages'], queryFn: () => api.get('/canned-messages') });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/canned-messages', payload),
    onSuccess: () => { toast.success('Canned message created'); qc.invalidateQueries({ queryKey: ['canned-messages'] }); setShowForm(false); setForm({ name: '', message: '', type: 'text' }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof form }) => api.put(`/canned-messages/${id}`, payload),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['canned-messages'] }); setEditItem(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/canned-messages/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['canned-messages'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.messages ?? []).filter(m => m.name.toLowerCase().includes(q));
  }, [data?.messages, search]);

  return (
    <div className="p-6 space-y-5">
      <div className="border rounded-lg p-4 bg-gray-50 text-sm text-gray-600 leading-relaxed">
        Canned messages are a powerful tool for streamlining live chat support by providing quick, consistent responses to frequently asked questions.
        Agents can select the appropriate message during a conversation — clicking the speech bubble icon inserts it instantly.
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search canned message by name"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={() => { setShowForm(true); setEditItem(null); setForm({ name: '', message: '', type: 'text' }); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {(showForm || editItem) && (
        <div className="border rounded-lg p-5 bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{editItem ? 'Edit Canned Message' : 'New Canned Message'}</h3>
            <button onClick={() => { setShowForm(false); setEditItem(null); }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name / shortcut (e.g. welcome) *"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
          <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Message text *" rows={3}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white resize-y" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Type:</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="text">Text</option>
                <option value="media">Media</option>
                <option value="template">Template</option>
              </select>
            </div>
            <button
              onClick={() => editItem ? updateMutation.mutate({ id: editItem.id, payload: form }) : createMutation.mutate(form)}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        : filtered.length === 0 ? <p className="text-center text-sm text-gray-400 py-16">No canned messages found. Create your first message above.</p>
        : (
          <div className="border rounded-lg overflow-hidden divide-y">
            {filtered.map(m => (
              <div key={m.id} className="flex items-start justify-between px-4 py-3 bg-white hover:bg-gray-50 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{m.name}
                    <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{m.type}</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{m.message}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => { setEditItem(m); setShowForm(false); setForm({ name: m.name, message: m.message, type: m.type }); }}
                    className="p-1.5 text-gray-400 hover:text-gray-700"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => { if (confirm(`Delete "${m.name}"?`)) deleteMutation.mutate(m.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ── Live Chat Settings Tab ────────────────────────────────────────────────────
const TIMEZONES = [
  'Asia/Calcutta', 'Asia/Kolkata', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore',
  'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
];

function LiveChatSettingsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ settings: LiveChatSettings }>({ queryKey: ['livechat-settings'], queryFn: () => api.get('/livechat-settings') });

  const defaultDay: DaySettings = { enabled: false, open: '09:00', close: '17:00' };
  const [local, setLocal] = useState<LiveChatSettings | null>(null);
  const settings: LiveChatSettings = local ?? data?.settings ?? {
    offHoursEnabled: false,
    offHoursMessage: 'We are currently outside our working hours. We will get back to you soon!',
    timezone: 'Asia/Calcutta',
    workingHours: Object.fromEntries(DAYS.map(d => [d.key, { ...defaultDay }])),
  };

  const saveMutation = useMutation({
    mutationFn: (payload: LiveChatSettings) => api.put('/livechat-settings', payload),
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['livechat-settings'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = (patch: Partial<LiveChatSettings>) => setLocal(s => ({ ...settings, ...s, ...patch }));
  const updateDay = (day: string, patch: Partial<DaySettings>) =>
    setLocal(s => ({
      ...settings, ...s,
      workingHours: { ...settings.workingHours, ...s?.workingHours, [day]: { ...(settings.workingHours?.[day] ?? defaultDay), ...s?.workingHours?.[day], ...patch } },
    }));

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="bg-primary text-white px-5 py-3 rounded-lg -mx-0">
        <h2 className="font-semibold text-base">Live Chat Settings</h2>
      </div>

      {/* Off-Hours */}
      <div className="border rounded-lg p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Off-Hours Message</h3>
        <p className="text-sm text-gray-500">Configure automatic responses for inquiries received outside working hours</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Enable Off-Hours Message</span>
          <button
            onClick={() => update({ offHoursEnabled: !settings.offHoursEnabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.offHoursEnabled ? 'bg-primary' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.offHoursEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {settings.offHoursEnabled && (
          <textarea value={settings.offHoursMessage} onChange={e => update({ offHoursMessage: e.target.value })}
            rows={2} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            placeholder="Off-hours message..." />
        )}
      </div>

      {/* Working Hours */}
      <div className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900">Working Hours</h3>
          <span className="text-sm text-gray-400">Configure day-wise working hours for automated replies</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 shrink-0">Timezone</label>
          <select value={settings.timezone} onChange={e => update({ timezone: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')} (GMT {new Date().toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ')[2]})</option>)}
          </select>
        </div>
        <div className="space-y-3">
          {DAYS.map(({ key, label }) => {
            const day = settings.workingHours?.[key] ?? defaultDay;
            return (
              <div key={key} className="flex items-center gap-4">
                <span className="w-8 text-sm font-medium text-gray-700">{label}</span>
                <button onClick={() => updateDay(key, { enabled: !day.enabled })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${day.enabled ? 'bg-primary' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${day.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                {day.enabled ? (
                  <div className="flex items-center gap-2 text-sm">
                    <input type="time" value={day.open} onChange={e => updateDay(key, { open: e.target.value })}
                      className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <span className="text-gray-400">to</span>
                    <input type="time" value={day.close} onChange={e => updateDay(key, { close: e.target.value })}
                      className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">Closed</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => saveMutation.mutate(settings)} disabled={saveMutation.isPending}
            className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2">
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Attributes Tab ────────────────────────────────────────────────────────────
function AttributesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [attrs, setAttrs] = useState<AttributeItem[] | null>(null);

  const { data, isLoading } = useQuery<{ attributes: AttributeItem[] }>({ queryKey: ['attributes'], queryFn: () => api.get('/attributes') });

  const current = attrs ?? data?.attributes ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: { attributes: { name: string }[] }) => api.put('/attributes', payload),
    onSuccess: (res: { attributes: AttributeItem[] }) => {
      toast.success('Attributes saved');
      setAttrs(res.attributes);
      qc.invalidateQueries({ queryKey: ['attributes'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const add = () => setAttrs([...current, { id: `new-${Date.now()}`, name: '' }]);
  const remove = (id: string) => setAttrs(current.filter(a => a.id !== id));
  const rename = (id: string, name: string) => setAttrs(current.map(a => a.id === id ? { ...a, name } : a));

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return current.filter(a => a.name.toLowerCase().includes(q));
  }, [current, search]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by attribute name"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-50">
          <Plus className="w-4 h-4" /> Add attribute
        </button>
        <button onClick={() => saveMutation.mutate({ attributes: current.filter(a => a.name.trim()).map(a => ({ name: a.name })) })}
          disabled={saveMutation.isPending}
          className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 flex items-center gap-2">
          {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save Attributes
        </button>
      </div>

      {isLoading ? <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
        : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Name *</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-12 text-center text-gray-400">No attributes</td></tr>
                ) : filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input value={a.name} onChange={e => rename(a.id, e.target.value)}
                        className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm bg-transparent hover:bg-white"
                        placeholder="Attribute name" />
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => remove(a.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ── Tags Tab ──────────────────────────────────────────────────────────────────
const TAG_COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ef4444',
  '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#6366f1',
];

function TagsTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]!);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery<{ tags: { id: string; name: string; color: string }[] }>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => { toast.success('Tag deleted'); qc.invalidateQueries({ queryKey: ['tags'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) { toast.error('Tag name is required'); return; }
    setAdding(true);
    try {
      await api.post('/tags', { name: newName.trim(), color: newColor });
      toast.success('Tag created');
      qc.invalidateQueries({ queryKey: ['tags'] });
      setNewName(''); setShowForm(false);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setAdding(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-lg font-semibold text-gray-900">Custom Tags</h2>
        <button onClick={() => setShowForm(v => !v)}
          className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
          <Plus className="w-4 h-4" /> Create Tag
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-50 rounded-lg p-4 space-y-3 border">
          <div className="flex gap-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tag name, e.g. VIP" autoFocus
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
            <button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-200 rounded-lg">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Color:</span>
            {TAG_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
            <button type="submit" disabled={adding}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60">
              {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>
      ) : (data?.tags.length ?? 0) === 0 ? (
        <p className="text-sm text-gray-400">No tags yet. Create one above.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {data!.tags.map(tag => (
            <div key={tag.id} className="group border rounded-full px-3 py-1.5 flex items-center gap-2 text-sm"
              style={{ backgroundColor: tag.color + '18', borderColor: tag.color + '50' }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="font-medium" style={{ color: tag.color }}>{tag.name}</span>
              <button onClick={() => { if (confirm(`Delete tag "${tag.name}"?`)) deleteMutation.mutate(tag.id); }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity ml-0.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type TabId = 'api' | 'agents' | 'phone' | 'canned' | 'livechat' | 'attributes' | 'tags';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'api',        label: 'API key',           icon: Key },
  { id: 'agents',     label: 'Agents',             icon: Users },
  { id: 'phone',      label: 'Manage Phone Number',icon: Phone },
  { id: 'canned',     label: 'Canned Message',     icon: MessageSquare },
  { id: 'livechat',   label: 'Live Chat Settings', icon: Settings },
  { id: 'attributes', label: 'Attributes',         icon: Layers },
  { id: 'tags',       label: 'Tags',               icon: Tag },
];

export default function Manage() {
  const [activeTab, setActiveTab] = useState<TabId>('api');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Workspace</h1>
        <p className="text-sm text-gray-500">Configure your business settings and workspace resources</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full md:w-56 shrink-0 space-y-1">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                activeTab === tab.id ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <tab.icon className="w-4 h-4 shrink-0" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border shadow-sm min-h-[400px] overflow-hidden">
          {activeTab === 'api'        && <ApiKeysTab />}
          {activeTab === 'agents'     && <AgentsTab />}
          {activeTab === 'phone'      && <PhoneNumbersTab />}
          {activeTab === 'canned'     && <CannedMessagesTab />}
          {activeTab === 'livechat'   && <LiveChatSettingsTab />}
          {activeTab === 'attributes' && <AttributesTab />}
          {activeTab === 'tags'       && <TagsTab />}
        </div>
      </div>
    </div>
  );
}
