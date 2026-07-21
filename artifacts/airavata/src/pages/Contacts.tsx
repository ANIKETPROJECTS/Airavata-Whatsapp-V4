import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Upload, Loader2, Users, X, ChevronDown, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { api } from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TagObj   { id: string; name: string; color: string }
interface GroupObj { id: string; name: string }
interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: 'active' | 'blocked' | 'unsubscribed';
  chatState?: 'DOR' | 'REQ' | 'CLOSED' | 'ACTIVE';
  tags: TagObj[];
  group: GroupObj | null;
  lastContactedAt?: string | null;
  createdAt: string;
}

const CHAT_STATES = ['DOR', 'REQ', 'CLOSED', 'ACTIVE'] as const;

// ── Edit Modal ─────────────────────────────────────────────────────────────────
function EditModal({
  contact, onClose, onSaved,
}: { contact: Contact; onClose: () => void; onSaved: () => void }) {
  const [name, setName]           = useState(contact.name);
  const [chatState, setChatState] = useState<string>(contact.chatState ?? 'DOR');
  const [saving, setSaving]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/contacts/${contact.id}`, { name: name.trim(), chatState });
      toast.success('Contact updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">Edit Contact: {contact.phone}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="flex gap-4 flex-wrap">
            {/* Name */}
            <div className="flex-1 min-w-[140px] space-y-1">
              <label className="text-sm font-medium text-gray-600">Name:</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Chat State */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">Chat State:</label>
              <div className="relative">
                <select
                  value={chatState}
                  onChange={e => setChatState(e.target.value)}
                  className="appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {CHAT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Phone (read-only) */}
            <div className="flex-1 min-w-[140px] space-y-1">
              <label className="text-sm font-medium text-gray-600">Phone Number:</label>
              <input
                value={contact.phone}
                readOnly
                className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none"
              />
              <p className="text-xs text-gray-400">Phone number cannot be edited</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button type="button" onClick={onClose}
              className="px-5 py-2 text-sm font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Import CSV Modal ───────────────────────────────────────────────────────────
function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const csv = await file.text();
      const res = await api.post<{ imported: number; total: number }>('/contacts/import', { csv });
      toast.success(`Imported ${res.imported} of ${res.total} contacts`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Import Contacts</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Upload a CSV with <code className="bg-gray-100 px-1 rounded">name</code>, <code className="bg-gray-100 px-1 rounded">phone</code>, optional <code className="bg-gray-100 px-1 rounded">email</code>.</p>
          <label className={`block w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            {importing ? (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="text-sm">Importing…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Upload className="w-8 h-8 opacity-40" /><span className="text-sm font-medium">Click to upload CSV</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Chat state badge ───────────────────────────────────────────────────────────
function ChatStateBadge({ state }: { state?: string }) {
  const s = state ?? 'DOR';
  const colors: Record<string, string> = {
    DOR:    'text-orange-600 bg-orange-50 border-orange-200',
    REQ:    'text-blue-600 bg-blue-50 border-blue-200',
    CLOSED: 'text-gray-600 bg-gray-50 border-gray-200',
    ACTIVE: 'text-green-600 bg-green-50 border-green-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${colors[s] ?? colors['DOR']}`}>
      {s}
    </span>
  );
}

// ── Interaction circles ────────────────────────────────────────────────────────
function InteractionBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${color}`}>
        {count}
      </div>
      <span className="text-[9px] text-gray-400 font-medium tracking-wide">{label}</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Contacts() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch]       = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [page, setPage]           = useState(1);
  const [perPage, setPerPage]     = useState(25);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [showImport, setShowImport]   = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams({
    search, page: String(page), limit: String(perPage),
    ...(groupFilter ? { groupId: groupFilter } : {}),
  });

  const { data, isLoading } = useQuery<{ contacts: Contact[]; total: number; pages: number }>({
    queryKey: ['contacts', search, groupFilter, page, perPage],
    queryFn: () => api.get(`/contacts?${params}`),
    placeholderData: prev => prev,
  });

  const { data: groupsData } = useQuery<{ groups: GroupObj[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => { toast.success('Contact deleted'); qc.invalidateQueries({ queryKey: ['contacts'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/contacts/bulk-delete', { ids }),
    onSuccess: (res: { deleted: number }) => {
      toast.success(`${res.deleted} contacts deleted`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const contacts = data?.contacts ?? [];
  const groups   = groupsData?.groups ?? [];

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleAll = () => setSelected(
    selected.size === contacts.length && contacts.length > 0
      ? new Set()
      : new Set(contacts.map(c => c.id)),
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ['contacts'] });

  return (
    <div className="h-full flex flex-col bg-white">
      {editContact && (
        <EditModal contact={editContact} onClose={() => setEditContact(null)} onSaved={invalidate} />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={invalidate} />
      )}

      {/* Tab bar */}
      <div className="bg-primary flex items-center justify-between px-0 shrink-0">
        <div className="flex">
          {[
            { label: 'Contacts',      action: () => {} },
            { label: 'Manage Groups', action: () => navigate('/group') },
            { label: 'Manage Tags',   action: () => navigate('/manage') },
          ].map((tab, i) => (
            <button
              key={tab.label}
              onClick={tab.action}
              className={`px-6 py-3.5 text-sm font-semibold transition-colors flex items-center gap-2 ${
                i === 0
                  ? 'bg-white text-primary'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              {i === 0 && <Users className="w-4 h-4" />}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="px-6 text-white text-sm font-semibold">
          Tier 1 (1K/24 Hours)
        </div>
      </div>

      {/* Description */}
      <div className="px-6 py-3 bg-gray-50 border-b text-xs text-gray-500 leading-relaxed">
        The Contacts section displays a detailed list of individual contacts managed through the platform. Each row shows the contact's phone number, name, chat state (e.g., REQ for request or DOR for dormant), and their current interaction status (active or closed). The campaigns column shows how many campaigns each contact is associated with, allowing you to track engagement levels. The tags column helps you categorize contacts for better segmentation. Finally, the Actions column allows you to either edit or delete contact information.
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 border-b flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none w-56"
          />
        </div>

        <button
          onClick={() => setShowFilters(f => !f)}
          className="px-3 py-2 text-sm border rounded-lg text-primary border-primary hover:bg-primary/5 font-medium transition-colors"
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>

        {showFilters && (
          <select
            value={groupFilter}
            onChange={e => { setGroupFilter(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All Groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={() => {
                if (!confirm(`Delete ${selected.size} contacts?`)) return;
                bulkDeleteMutation.mutate([...selected]);
              }}
              className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
            >
              Delete {selected.size}
            </button>
          )}

          <button
            onClick={() => setShowImport(true)}
            className="px-3 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> Import
          </button>

          <div className="relative">
            <button
              onClick={() => window.open('/api/contacts/export', '_blank')}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-2">
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="text-sm bg-transparent outline-none appearance-none"
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Users className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">{search ? 'No contacts match your search' : 'No contacts yet'}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" className="rounded border-gray-300 accent-primary"
                    checked={selected.size === contacts.length && contacts.length > 0}
                    onChange={toggleAll} />
                </th>
                <th className="px-4 py-3 font-semibold">Phone Number</th>
                <th className="px-4 py-3 font-semibold">Name ↑</th>
                <th className="px-4 py-3 font-semibold">Chat State</th>
                <th className="px-4 py-3 font-semibold">Interactions</th>
                <th className="px-4 py-3 font-semibold">Campaigns</th>
                <th className="px-4 py-3 font-semibold">Tags</th>
                <th className="px-4 py-3 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-800">
              {contacts.map(contact => (
                <tr
                  key={contact.id}
                  className={`hover:bg-gray-50 transition-colors ${selected.has(contact.id) ? 'bg-primary/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input type="checkbox" className="rounded border-gray-300 accent-primary"
                      checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)} />
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{contact.phone}</td>
                  <td className="px-4 py-3 font-medium">{contact.name}</td>
                  <td className="px-4 py-3">
                    <ChatStateBadge state={contact.chatState} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-end gap-2">
                      <InteractionBadge count={0} label="ACTIVE" color="bg-green-500" />
                      <InteractionBadge count={0} label="CLOSED" color="bg-gray-400" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">No campaigns</td>
                  <td className="px-4 py-3">
                    {contact.tags.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags.map(t => (
                          <span key={t.id}
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: t.color + '22', color: t.color }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">No tags</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setEditContact(contact)}
                        className="px-3 py-1 text-xs font-bold border border-primary text-primary rounded hover:bg-primary/5 transition-colors"
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${contact.name}?`)) deleteMutation.mutate(contact.id);
                        }}
                        className="px-3 py-1 text-xs font-bold bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      >
                        DELETE
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(data?.pages ?? 0) > 1 && (
        <div className="px-6 py-4 border-t flex items-center justify-between bg-white text-sm text-gray-500 shrink-0">
          <div>Showing page {page} of {data?.pages} ({data?.total} total)</div>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Prev</button>
            <button onClick={() => setPage(p => Math.min(data?.pages ?? 1, p + 1))} disabled={page === (data?.pages ?? 1)}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
