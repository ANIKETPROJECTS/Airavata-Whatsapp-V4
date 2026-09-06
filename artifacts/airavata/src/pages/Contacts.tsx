import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Upload, Loader2, Users, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { ContactGroupsManager, ContactTagsManager } from './ContactManagers';
import contactViewIcon from '@assets/eye_1788722260035.png';
import contactEditIcon from '@assets/pencil_1788722262751.png';
import contactDeleteIcon from '@assets/bin_1788722265074.png';
import importContactsIcon from '@assets/import_1788724282150.png';
import exportContactsIcon from '@assets/export_1788724297530.png';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TagObj   { id: string; name: string; color: string }
interface GroupObj { id: string; name: string }
interface Contact {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  status: 'active' | 'blocked' | 'unsubscribed';
  chatState?: 'DOR' | 'REQ' | 'CLOSED' | 'ACTIVE';
  hasConversation?: boolean;
  unreadMessages?: number;
  tags: TagObj[];
  group: GroupObj | null;
  lastContactedAt?: string | null;
  createdAt: string;
}

const CHAT_STATES = [
  { value: 'NO_CHAT', label: 'No conversation' },
  { value: 'NEEDS_REPLY', label: 'Needs reply' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

const COUNTRIES = [
  { code: '1', label: 'United States / Canada (+1)' },
  { code: '7', label: 'Russia / Kazakhstan (+7)' },
  { code: '20', label: 'Egypt (+20)' },
  { code: '27', label: 'South Africa (+27)' },
  { code: '31', label: 'Netherlands (+31)' },
  { code: '33', label: 'France (+33)' },
  { code: '34', label: 'Spain (+34)' },
  { code: '39', label: 'Italy (+39)' },
  { code: '41', label: 'Switzerland (+41)' },
  { code: '44', label: 'United Kingdom (+44)' },
  { code: '49', label: 'Germany (+49)' },
  { code: '52', label: 'Mexico (+52)' },
  { code: '55', label: 'Brazil (+55)' },
  { code: '60', label: 'Malaysia (+60)' },
  { code: '61', label: 'Australia (+61)' },
  { code: '64', label: 'New Zealand (+64)' },
  { code: '65', label: 'Singapore (+65)' },
  { code: '81', label: 'Japan (+81)' },
  { code: 'ೂರ', label: 'South Korea (+82)' },
  { code: '86', label: 'China (+86)' },
  { code: '90', label: 'Turkey (+90)' },
  { code: '91', label: 'India (+91)' },
  { code: '92', label: 'Pakistan (+92)' },
  { code: '94', label: 'Sri Lanka (+94)' },
  { code: 'ою', label: 'Bangladesh (+880)' },
  { code: '977', label: 'Nepal (+977)' },
  { code: '966', label: 'Saudi Arabia (+966)' },
  { code: '971', label: 'United Arab Emirates (+971)' },
  { code: '974', label: 'Qatar (+974)' },
  { code: 'UNKNOWN', label: 'Other / Unknown' },
] as const;
type CountryCount = { code: string; count: number };

function isPlaceholderName(name: string | null | undefined, phone: string) {
  const normalizedName = name?.trim();
  return !normalizedName || normalizedName === phone.trim() ||
    normalizedName.replace(/\D/g, '') === phone.replace(/\D/g, '');
}

function contactDisplayName(contact: Pick<Contact, 'name' | 'phone'>) {
  return isPlaceholderName(contact.name, contact.phone) ? 'NA' : contact.name!.trim();
}

function contactStatusLabel(status: Contact['status']) {
  if (status === 'blocked') return 'Blocked';
  if (status === 'unsubscribed') return 'Unsubscribed';
  return 'Active';
}

function ContactStatusBadge({ status }: { status: Contact['status'] }) {
  const colors = {
    active: 'text-green-700 bg-green-50 border-green-200',
    blocked: 'text-red-700 bg-red-50 border-red-200',
    unsubscribed: 'text-orange-700 bg-orange-50 border-orange-200',
  };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${colors[status]}`}>
      {contactStatusLabel(status)}
    </span>
  );
}

function chatStateFormValue(state?: Contact['chatState']) {
  if (state === 'CLOSED') return 'CLOSED';
  if (state === 'ACTIVE') return 'OPEN';
  if (state === 'REQ') return 'NEEDS_REPLY';
  return 'NO_CHAT';
}

function chatStateStorageValue(state: string) {
  if (state === 'CLOSED') return 'CLOSED';
  if (state === 'OPEN') return 'ACTIVE';
  if (state === 'NEEDS_REPLY') return 'REQ';
  return 'DOR';
}

function ContactDetailsModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contact details</p>
            <h2 className="mt-1 text-lg font-bold text-gray-900">{contactDisplayName(contact)}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close contact details">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Phone number</p><p className="mt-1 font-mono text-sm text-gray-800">{contact.phone}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</p><p className="mt-1 text-sm text-gray-800">{contact.email || 'No email'}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Group</p><p className="mt-1 text-sm text-gray-800">{contact.group?.name || 'No group'}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Chat state</p><p className="mt-1"><ChatStateBadge state={contact.chatState} hasConversation={contact.hasConversation} unreadMessages={contact.unreadMessages} /></p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p><p className="mt-1 text-sm capitalize text-gray-800">{contact.status}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Created</p><p className="mt-1 text-sm text-gray-800">{new Date(contact.createdAt).toLocaleDateString()}</p></div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tags</p>
            {contact.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {contact.tags.map(tag => (
                  <span key={tag.id} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: `${tag.color}22`, color: tag.color }}>{tag.name}</span>
                ))}
              </div>
            ) : <p className="mt-1 text-sm text-gray-500">No tags</p>}
          </div>
        </div>
        <div className="flex justify-end border-t px-6 py-4">
          <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────
function EditModal({
  contact, groups, tags, onClose, onSaved,
}: {
  contact: Contact;
  groups: GroupObj[];
  tags: TagObj[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]           = useState(isPlaceholderName(contact.name, contact.phone) ? '' : contact.name ?? '');
  const [status, setStatus]       = useState<Contact['status']>(contact.status);
  const [chatState, setChatState] = useState<string>(chatStateFormValue(contact.chatState));
  const [groupId, setGroupId]     = useState(contact.group?.id ?? '');
  const [tagIds, setTagIds]       = useState<string[]>(contact.tags.map(tag => tag.id));
  const [saving, setSaving]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/contacts/${contact.id}`, {
        name: name.trim(),
        status,
        chatState: chatStateStorageValue(chatState),
        groupId: groupId || null,
        tags: tagIds,
      });
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

            {/* Contact Status */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">Contact Status:</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as Contact['status'])}
                  className="appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="active">Active</option>
                  <option value="blocked">Blocked</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
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
                  {CHAT_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">Group:</label>
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">No group</option>
                {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">Tags:</label>
              <div className="max-h-28 overflow-y-auto rounded-lg border p-2 space-y-1">
                {tags.length === 0 ? (
                  <p className="text-xs text-gray-400">Create tags from Manage Tags first.</p>
                ) : tags.map(tag => (
                  <label key={tag.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={tagIds.includes(tag.id)}
                      onChange={() => setTagIds(current => current.includes(tag.id)
                        ? current.filter(id => id !== tag.id)
                        : [...current, tag.id])}
                      className="accent-primary"
                    />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </label>
                ))}
              </div>
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
          <p className="text-sm text-gray-600">Upload a CSV with <code className="bg-gray-100 px-1 rounded">phone</code>, optional <code className="bg-gray-100 px-1 rounded">name</code> and <code className="bg-gray-100 px-1 rounded">email</code>. Missing names display as <strong>NA</strong>.</p>
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
function ChatStateBadge({
  state,
  hasConversation = false,
  unreadMessages = 0,
}: {
  state?: string;
  hasConversation?: boolean;
  unreadMessages?: number;
}) {
  const s = unreadMessages > 0 || state === 'REQ'
    ? 'NEEDS_REPLY'
    : state === 'CLOSED'
      ? 'CLOSED'
      : hasConversation || state === 'ACTIVE'
        ? 'OPEN'
        : 'NO_CHAT';
  const colors: Record<string, string> = {
    NO_CHAT: 'text-gray-600 bg-gray-50 border-gray-200',
    NEEDS_REPLY: 'text-blue-600 bg-blue-50 border-blue-200',
    OPEN:    'text-green-600 bg-green-50 border-green-200',
    CLOSED: 'text-gray-600 bg-gray-50 border-gray-200',
  };
  const labels: Record<string, string> = {
    NO_CHAT: 'No conversation',
    NEEDS_REPLY: 'Needs reply',
    OPEN: 'Open',
    CLOSED: 'Closed',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${colors[s] ?? colors.NO_CHAT}`}>
      {labels[s] ?? labels.NO_CHAT}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Contacts() {
  const { confirm, confirmDialog } = useConfirmDialog();
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState<'contacts' | 'groups' | 'tags'>('contacts');
  const [search, setSearch]       = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [chatStateFilter, setChatStateFilter] = useState('');
  const [page, setPage]           = useState(1);
  const perPage = 30;
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [showImport, setShowImport]   = useState(false);

  const params = new URLSearchParams({
    search, page: String(page), limit: String(perPage),
    ...(groupFilter ? { groupId: groupFilter } : {}),
    ...(tagFilter ? { tagId: tagFilter } : {}),
    ...(countryFilter ? { country: countryFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(chatStateFilter ? { chatState: chatStateFilter } : {}),
  });

  const { data, isLoading } = useQuery<{ contacts: Contact[]; total: number; pages: number }>({
    queryKey: ['contacts', search, groupFilter, tagFilter, countryFilter, statusFilter, chatStateFilter, page, perPage],
    queryFn: () => api.get(`/contacts?${params}`),
    placeholderData: prev => prev,
    refetchInterval: 10000,
  });

  const { data: groupsData } = useQuery<{ groups: GroupObj[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups'),
  });
  const { data: tagsData } = useQuery<{ tags: TagObj[] }>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags'),
  });
  const { data: countriesData } = useQuery<{ countries: CountryCount[] }>({
    queryKey: ['contact-countries'],
    queryFn: () => api.get('/contacts/countries'),
    staleTime: 300000,
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
      setSelectionMode(false);
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const contacts = data?.contacts ?? [];
  const groups   = groupsData?.groups ?? [];
  const tags     = tagsData?.tags ?? [];
  const countryCounts = new Map((countriesData?.countries ?? []).map(country => [country.code, country.count]));
  const availableCountries = COUNTRIES.filter(country => (countryCounts.get(country.code) ?? 0) > 0);

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleAll = () => setSelected(
    selected.size === contacts.length && contacts.length > 0
      ? new Set()
      : new Set(contacts.map(c => c.id)),
  );

  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelected(new Set(contacts.map(c => c.id)));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['contacts'] });
  const refreshContactManagement = () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-countries'] });
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['tags'] });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {confirmDialog}
      {viewContact && (
        <ContactDetailsModal contact={viewContact} onClose={() => setViewContact(null)} />
      )}
      {editContact && (
        <EditModal
          contact={editContact}
          groups={groups}
          tags={tags}
          onClose={() => setEditContact(null)}
          onSaved={() => {
            invalidate();
            qc.invalidateQueries({ queryKey: ['groups'] });
          }}
        />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={invalidate} />
      )}

      {/* Tab bar */}
      <div className="bg-primary flex items-center justify-between px-0 shrink-0">
        <div className="flex">
          {[
            { label: 'Contacts', section: 'contacts' as const },
            { label: 'Manage Groups', section: 'groups' as const },
            { label: 'Manage Tags', section: 'tags' as const },
          ].map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveSection(tab.section)}
              className={`px-6 py-3.5 text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeSection === tab.section
                  ? 'bg-white text-primary'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              {i === 0 && <Users className="w-4 h-4" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeSection === 'groups' ? (
        <ContactGroupsManager onChanged={refreshContactManagement} />
      ) : activeSection === 'tags' ? (
        <ContactTagsManager onChanged={refreshContactManagement} />
      ) : (
      <>
      {/* Toolbar */}
      <div className="overflow-x-auto border-b">
        <div className="flex min-w-max items-center gap-2 px-6 py-3">
        <div className="relative shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
           className="pl-9 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none w-48"
          />
        </div>

        <select
          value={groupFilter}
          onChange={e => { setGroupFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by group"
        >
          <option value="">All Groups</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        <select
          value={tagFilter}
          onChange={e => { setTagFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by tag"
        >
          <option value="">All Tags</option>
          {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>

        <select
          value={countryFilter}
          onChange={e => { setCountryFilter(e.target.value); setPage(1); setSelected(new Set()); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by country"
        >
          <option value="">All Countries</option>
          {availableCountries.map(country => (
            <option key={country.code} value={country.code}>
              {country.label} · {countryCounts.get(country.code)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>

        <select
          value={chatStateFilter}
          onChange={e => { setChatStateFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by chat state"
        >
          <option value="">All Chat States</option>
          {CHAT_STATES.map(state => <option key={state.value} value={state.value}>{state.label}</option>)}
        </select>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={async () => {
                if (!await confirm({
                  title: 'Delete selected contacts?',
                  description: `Delete ${selected.size} selected contact${selected.size === 1 ? '' : 's'}? This cannot be undone.`,
                  confirmLabel: 'Delete contacts',
                })) return;
                bulkDeleteMutation.mutate([...selected]);
              }}
              className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
            >
              Delete {selected.size}
            </button>
          )}

          {selectionMode ? (
            <>
              <button
                onClick={toggleAll}
                className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {selected.size === contacts.length && contacts.length > 0 ? 'Clear all' : 'Select all'}
              </button>
              <button
                onClick={exitSelectionMode}
                className="rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Done
              </button>
            </>
          ) : (
            <button
              onClick={enterSelectionMode}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Select all
            </button>
          )}

          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border p-2 text-gray-600 hover:bg-gray-50"
            title="Import contacts"
            aria-label="Import contacts"
          >
            <img src={importContactsIcon} alt="" className="h-5 w-5 object-contain" />
          </button>

          <div className="relative">
            <button
              onClick={() => window.open('/api/contacts/export', '_blank')}
              className="rounded-lg border border-primary/30 p-2 text-primary hover:bg-primary/5"
              title="Export contacts"
              aria-label="Export contacts"
            >
              <img src={exportContactsIcon} alt="" className="h-5 w-5 object-contain" />
            </button>
          </div>
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
                {selectionMode && (
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" className="rounded border-gray-300 accent-primary"
                      checked={selected.size === contacts.length && contacts.length > 0}
                      onChange={toggleAll} />
                  </th>
                )}
                <th className="px-4 py-3 font-semibold">Phone Number</th>
                <th className="px-4 py-3 font-semibold">Name ↑</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Chat Status</th>
                <th className="px-4 py-3 font-semibold">Campaigns</th>
                <th className="px-4 py-3 font-semibold">Group</th>
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
                  {selectionMode && (
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded border-gray-300 accent-primary"
                        checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)} />
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-gray-700">{contact.phone}</td>
                  <td className="px-4 py-3 font-medium">{contactDisplayName(contact)}</td>
                  <td className="px-4 py-3">
                    <ContactStatusBadge status={contact.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ChatStateBadge
                      state={contact.chatState}
                      hasConversation={contact.hasConversation}
                      unreadMessages={contact.unreadMessages}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">No campaigns</td>
                  <td className="px-4 py-3">
                    {contact.group?.name ? (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{contact.group.name}</span>
                    ) : (
                      <span className="text-xs text-gray-400">No group</span>
                    )}
                  </td>
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
                        onClick={() => setViewContact(contact)}
                        className="rounded-lg border border-gray-200 p-2 hover:border-primary hover:bg-primary/5"
                        title="View contact"
                        aria-label={`View ${contactDisplayName(contact)}`}
                      >
                        <img src={contactViewIcon} alt="" className="h-4 w-4 object-contain" />
                      </button>
                      <button
                        onClick={() => setEditContact(contact)}
                        className="rounded-lg border border-primary/30 p-2 hover:bg-primary/5"
                        title="Edit contact"
                        aria-label={`Edit ${contactDisplayName(contact)}`}
                      >
                        <img src={contactEditIcon} alt="" className="h-4 w-4 object-contain" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirm({
                            title: 'Delete this contact?',
                            description: `Delete ${contactDisplayName(contact)}? This cannot be undone.`,
                            confirmLabel: 'Delete contact',
                          })) deleteMutation.mutate(contact.id);
                        }}
                        className="rounded-lg border border-red-200 p-2 hover:bg-red-50"
                        title="Delete contact"
                        aria-label={`Delete ${contactDisplayName(contact)}`}
                      >
                        <img src={contactDeleteIcon} alt="" className="h-4 w-4 object-contain" />
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
      </>
      )}
    </div>
  );
}
