import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UsersRound, Plus, Users, Loader2, Trash2, X, Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

interface Group {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
}

// ── Contact multi-picker ──────────────────────────────────────────────────────

function ContactPicker({
  contacts,
  selected,
  onToggle,
}: {
  contacts: Contact[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(
      c => c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [contacts, search]);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
        />
        {search && (
          <button onClick={() => setSearch('')}>
            <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-48 overflow-y-auto divide-y">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No contacts found</p>
        ) : (
          filtered.map(c => (
            <label
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => onToggle(c.id)}
                className="accent-primary w-4 h-4 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 font-mono">{c.phone}</p>
              </div>
            </label>
          ))
        )}
      </div>

      {/* Footer count */}
      {selected.size > 0 && (
        <div className="border-t px-3 py-1.5 bg-primary/5 text-xs font-medium text-primary">
          {selected.size} contact{selected.size !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Group() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery<{ groups: Group[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups'),
  });

  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts'),
    enabled: showCreate,
  });
  const contacts = contactsData?.contacts ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/groups/${id}`),
    onSuccess: () => {
      toast.success('Group deleted');
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleContact(id: string) {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function resetForm() {
    setNewName('');
    setNewDesc('');
    setSelectedContactIds(new Set());
    setShowCreate(false);
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) { toast.error('Group name is required'); return; }
    setCreating(true);
    try {
      await api.post('/groups', {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        contactIds: [...selectedContactIds],
      });
      toast.success('Group created!');
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const groups = data?.groups ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contact Groups</h1>
          <p className="text-sm text-gray-500">Organize your audience for targeted campaigns</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" /> Create Group
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Create New Group</h2>
              <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. VIP Customers"
                  autoFocus
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Description (optional)</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Group description"
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              {/* Contact picker */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-gray-400" />
                  Add Contacts
                  {contacts.length === 0 && (
                    <span className="text-xs font-normal text-gray-400 ml-1">(loading…)</span>
                  )}
                </label>
                {contacts.length > 0 ? (
                  <ContactPicker
                    contacts={contacts}
                    selected={selectedContactIds}
                    onToggle={toggleContact}
                  />
                ) : (
                  <div className="border rounded-lg px-3 py-4 flex items-center justify-center text-gray-400 text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading contacts…
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Groups grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading groups…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <UsersRound className="w-12 h-12 opacity-30" />
          <p className="text-sm font-medium">No groups yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90"
          >
            Create your first group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                  <UsersRound className="w-6 h-6" />
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Delete group "${g.name}"? Contacts in this group will be unassigned.`)) {
                      deleteMutation.mutate(g.id);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h3 className="font-bold text-gray-900 text-lg mb-1">{g.name}</h3>
              {g.description && <p className="text-sm text-gray-500 mb-2">{g.description}</p>}

              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Users className="w-4 h-4" />
                {g.memberCount.toLocaleString()} member{g.memberCount !== 1 ? 's' : ''}
              </div>

              <div className="border-t pt-4 text-sm text-gray-400">
                Created {new Date(g.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
