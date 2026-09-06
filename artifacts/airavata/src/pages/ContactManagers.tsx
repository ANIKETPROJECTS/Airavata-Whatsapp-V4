import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, Loader2, Pencil, Plus, Search, Tag as TagIcon, Trash2, UsersRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';

export interface ContactManagerGroup {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  createdAt: string;
}

export interface ContactManagerTag {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  contactCount: number;
  createdAt: string;
}

interface ManagerContact {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  createdAt?: string;
  tags?: Array<{ name: string; color: string }>;
  group?: { name: string } | null;
}

const TAG_COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ef4444',
  '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#6366f1',
];

function displayContactName(contact: ManagerContact) {
  const name = contact.name?.trim();
  return !name || name === contact.phone || name.replace(/\D/g, '') === contact.phone.replace(/\D/g, '')
    ? 'NA'
    : name;
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function ContactDetailsPage({
  filterType,
  filterId,
  title,
  description,
  contactCount,
  createdAt,
  color,
  onBack,
}: {
  filterType: 'group' | 'tag';
  filterId: string;
  title: string;
  description?: string | null;
  contactCount: number;
  createdAt: string;
  color?: string;
  onBack: () => void;
}) {
  const endpoint = filterType === 'group'
    ? `/contacts?groupId=${encodeURIComponent(filterId)}&limit=500`
    : `/contacts?tagId=${encodeURIComponent(filterId)}&limit=500`;
  const { data, isLoading, isError } = useQuery<{ contacts: ManagerContact[] }>({
    queryKey: [`${filterType}-contacts`, filterId],
    queryFn: () => api.get(endpoint),
  });
  const contacts = data?.contacts ?? [];

  return (
    <div className="space-y-5 p-6">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to {filterType === 'group' ? 'Groups' : 'Tags'}
      </button>

      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: color ? `${color}22` : undefined, color: color ?? undefined }}
            >
              {filterType === 'group' ? <UsersRound className="h-5 w-5 text-primary" /> : <TagIcon className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{filterType} details</p>
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
              <p className="mt-1 text-sm text-gray-500">{description || 'No description added.'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div><p className="text-xs text-gray-400">Contacts</p><p className="mt-1 font-bold text-gray-900">{contactCount.toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-400">Created</p><p className="mt-1 font-bold text-gray-900">{formatDate(createdAt)}</p></div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h3 className="font-semibold text-gray-900">Contacts in {title}</h3>
          <p className="mt-1 text-sm text-gray-500">Contact information is displayed below in text format.</p>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 px-5 py-12 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading contacts…</div>
        ) : isError ? (
          <p className="px-5 py-12 text-sm text-red-500">Unable to load contacts for this {filterType}.</p>
        ) : contacts.length === 0 ? (
          <p className="px-5 py-12 text-sm text-gray-500">No contacts are assigned to this {filterType}.</p>
        ) : (
          <div className="divide-y">
            {contacts.map(contact => (
              <div key={contact.id} className="flex flex-col gap-2 px-5 py-4 text-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{displayContactName(contact)}</p>
                  <p className="mt-1 font-mono text-xs text-gray-500">{contact.phone}</p>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                  <span>{contact.email || 'No email'}</span>
                  {filterType === 'tag' && <span>Group: {contact.group?.name || 'No group'}</span>}
                  <span>Tags: {contact.tags && contact.tags.length > 0 ? contact.tags.map(tag => tag.name).join(', ') : 'No tags'}</span>
                  <span>Created: {contact.createdAt ? formatDate(contact.createdAt) : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactPicker({
  contacts,
  selected,
  onToggle,
}: {
  contacts: ManagerContact[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const filtered = contacts.filter(contact =>
    !query ||
    contact.phone.toLowerCase().includes(query) ||
    displayContactName(contact).toLowerCase().includes(query),
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2">
        <Search className="h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search contacts"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div className="max-h-40 divide-y overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-gray-400">No contacts found</p>
        ) : filtered.map(contact => (
          <label key={contact.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selected.has(contact.id)}
              onChange={() => onToggle(contact.id)}
              className="accent-primary"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-gray-800">{displayContactName(contact)}</span>
              <span className="block font-mono text-xs text-gray-400">{contact.phone}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ManagerTabsHeader({
  title,
  description,
  onCreate,
}: {
  title: string;
  description: string;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <button
        onClick={onCreate}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" /> Create
      </button>
    </div>
  );
}

export function ContactGroupsManager({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactManagerGroup | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedGroup, setSelectedGroup] = useState<ContactManagerGroup | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery<{ groups: ContactManagerGroup[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups'),
  });
  const { data: contactsData, isLoading: contactsLoading } = useQuery<{ contacts: ManagerContact[] }>({
    queryKey: ['contacts', 'group-manager-picker'],
    queryFn: () => api.get('/contacts?limit=100'),
    enabled: showForm && !editing,
  });

  const groups = data?.groups ?? [];
  const contacts = contactsData?.contacts ?? [];

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setName('');
    setDescription('');
    setSelectedContactIds(new Set());
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setSelectedContactIds(new Set());
    setShowForm(true);
  };

  const openEdit = (group: ContactManagerGroup) => {
    setEditing(group);
    setName(group.name);
    setDescription(group.description ?? '');
    setSelectedContactIds(new Set());
    setShowForm(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/groups/${editing.id}`, { name: name.trim(), description: description.trim() });
        toast.success('Group updated');
      } else {
        await api.post('/groups', {
          name: name.trim(),
          description: description.trim() || undefined,
          contactIds: [...selectedContactIds],
        });
        toast.success('Group created');
      }
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onChanged();
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save group');
    } finally {
      setSaving(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/groups/${id}`),
    onSuccess: () => {
      toast.success('Group deleted');
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (selectedGroup) {
    return (
      <div>
        {confirmDialog}
        <ContactDetailsPage
          filterType="group"
          filterId={selectedGroup.id}
          title={selectedGroup.name}
          description={selectedGroup.description}
          contactCount={selectedGroup.memberCount}
          createdAt={selectedGroup.createdAt}
          onBack={() => setSelectedGroup(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      {confirmDialog}
      <ManagerTabsHeader
        title="Manage Groups"
        description="Create and manage contact groups from the Contacts section."
        onCreate={openCreate}
      />

      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{editing ? 'Edit group' : 'Create group'}</h3>
            <button onClick={resetForm} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-[1fr_1fr_1.3fr_auto] lg:items-end">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-600">Group name</span>
              <input value={name} onChange={event => setName(event.target.value)} autoFocus className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary" placeholder="VIP customers" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-600">Description</span>
              <input value={description} onChange={event => setDescription(event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Optional description" />
            </label>
            {!editing && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-gray-600">Add contacts</span>
                {contactsLoading ? (
                  <div className="flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-xs text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading contacts</div>
                ) : <ContactPicker
                  contacts={contacts}
                  selected={selectedContactIds}
                  onToggle={id => setSelectedContactIds(current => {
                    const next = new Set(current);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  })}
                />}
              </div>
            )}
            <div className="flex gap-2 lg:justify-end">
              <button type="button" onClick={resetForm} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading groups…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-gray-400">No groups yet. Create your first group above.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map(group => (
                <Fragment key={group.id}>
                  <tr
                    onClick={() => setSelectedGroup(group)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><UsersRound className="h-4 w-4" /></span>
                        <span className="font-semibold text-gray-900">{group.name}</span>
                      </div>
                    </td>
                    <td className="max-w-[280px] px-4 py-4 text-gray-500">{group.description || '—'}</td>
                    <td className="px-4 py-4 font-semibold text-gray-800">{group.memberCount.toLocaleString()}</td>
                    <td className="px-4 py-4 text-gray-500">{formatDate(group.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={event => { event.stopPropagation(); setSelectedGroup(group); }}
                          className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:border-primary hover:bg-primary/5 hover:text-primary"
                          title="View contacts"
                          aria-label={`View contacts in ${group.name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={event => { event.stopPropagation(); openEdit(group); }}
                          className="rounded-lg border border-primary/30 p-2 text-primary hover:bg-primary/5"
                          title="Edit group"
                          aria-label={`Edit ${group.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async event => {
                            event.stopPropagation();
                            if (await confirm({ title: 'Delete group?', description: `Contacts will be unassigned from "${group.name}".`, confirmLabel: 'Delete group' })) deleteMutation.mutate(group.id);
                          }}
                          className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50"
                          title="Delete group"
                          aria-label={`Delete ${group.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ContactTagsManager({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactManagerTag | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]!);
  const [selectedTag, setSelectedTag] = useState<ContactManagerTag | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery<{ tags: ContactManagerTag[] }>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags'),
  });
  const tags = data?.tags ?? [];

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setName('');
    setDescription('');
    setColor(TAG_COLORS[0]!);
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setColor(TAG_COLORS[0]!);
    setShowForm(true);
  };

  const openEdit = (tag: ContactManagerTag) => {
    setEditing(tag);
    setName(tag.name);
    setDescription(tag.description ?? '');
    setColor(tag.color);
    setShowForm(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error('Tag name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim(), color };
      if (editing) {
        await api.put(`/tags/${editing.id}`, payload);
        toast.success('Tag updated');
      } else {
        await api.post('/tags', payload);
        toast.success('Tag created');
      }
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onChanged();
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save tag');
    } finally {
      setSaving(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => {
      toast.success('Tag deleted');
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (selectedTag) {
    return (
      <div>
        {confirmDialog}
        <ContactDetailsPage
          filterType="tag"
          filterId={selectedTag.id}
          title={selectedTag.name}
          description={selectedTag.description}
          contactCount={selectedTag.contactCount}
          createdAt={selectedTag.createdAt}
          color={selectedTag.color}
          onBack={() => setSelectedTag(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      {confirmDialog}
      <ManagerTabsHeader
        title="Manage Tags"
        description="Create and manage contact tags from the Contacts section."
        onCreate={openCreate}
      />

      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{editing ? 'Edit tag' : 'Create tag'}</h3>
            <button onClick={resetForm} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_1fr_auto] lg:items-end">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-600">Tag name</span>
              <input value={name} onChange={event => setName(event.target.value)} autoFocus className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary" placeholder="VIP" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-600">Description</span>
              <input value={description} onChange={event => setDescription(event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Optional description" />
            </label>
            <div className="space-y-1">
              <span className="block text-xs font-semibold text-gray-600">Color</span>
              <div className="flex gap-1.5 rounded-lg border bg-white px-2 py-2">
                {TAG_COLORS.map(tagColor => (
                  <button key={tagColor} type="button" onClick={() => setColor(tagColor)} className={`h-5 w-5 rounded-full border-2 ${color === tagColor ? 'scale-110 border-gray-800' : 'border-transparent'}`} style={{ backgroundColor: tagColor }} aria-label={`Use ${tagColor}`} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500"><span className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} /> {name || 'Tag preview'}</div>
            <div className="flex gap-2 lg:justify-end">
              <button type="button" onClick={resetForm} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading tags…</div>
      ) : tags.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-gray-400">No tags yet. Create your first tag above.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tags.map(tag => (
                <Fragment key={tag.id}>
                  <tr
                    onClick={() => setSelectedTag(tag)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${tag.color}22`, color: tag.color }}><TagIcon className="h-4 w-4" /></span>
                        <span className="font-semibold" style={{ color: tag.color }}>{tag.name}</span>
                      </div>
                    </td>
                    <td className="max-w-[280px] px-4 py-4 text-gray-500">{tag.description || '—'}</td>
                    <td className="px-4 py-4 font-semibold text-gray-800">{tag.contactCount.toLocaleString()}</td>
                    <td className="px-4 py-4 text-gray-500">{formatDate(tag.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={event => { event.stopPropagation(); setSelectedTag(tag); }}
                          className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:border-primary hover:bg-primary/5 hover:text-primary"
                          title="View contacts"
                          aria-label={`View contacts with ${tag.name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={event => { event.stopPropagation(); openEdit(tag); }}
                          className="rounded-lg border border-primary/30 p-2 text-primary hover:bg-primary/5"
                          title="Edit tag"
                          aria-label={`Edit ${tag.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async event => {
                            event.stopPropagation();
                            if (await confirm({ title: 'Delete tag?', description: `The tag "${tag.name}" will be removed from contacts.`, confirmLabel: 'Delete tag' })) deleteMutation.mutate(tag.id);
                          }}
                          className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50"
                          title="Delete tag"
                          aria-label={`Delete ${tag.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}