import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type NotificationType = 'ALL' | 'MESSAGE' | 'DELIVERY' | 'CAMPAIGN' | 'TEMPLATE' | 'SYSTEM';
type ReadFilter = 'ALL' | 'UNREAD' | 'READ';
type SortOrder = 'NEWEST' | 'OLDEST';

interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: Exclude<NotificationType, 'ALL'>;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

interface NotificationResponse {
  notifications: NotificationRecord[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

const typeLabels: Record<NotificationType, string> = {
  ALL: 'All types',
  MESSAGE: 'Messages',
  DELIVERY: 'Delivery',
  CAMPAIGN: 'Campaigns',
  TEMPLATE: 'Templates',
  SYSTEM: 'System',
};

function timeLabel(date: string) {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function severityClass(severity: NotificationRecord['severity']) {
  if (severity === 'ERROR') return 'bg-red-50 text-red-700';
  if (severity === 'WARNING') return 'bg-amber-50 text-amber-700';
  if (severity === 'SUCCESS') return 'bg-emerald-50 text-emerald-700';
  return 'bg-blue-50 text-blue-700';
}

export default function Notifications() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<NotificationType>('ALL');
  const [read, setRead] = useState<ReadFilter>('ALL');
  const [sort, setSort] = useState<SortOrder>('NEWEST');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const queryString = useMemo(() => new URLSearchParams({
    search,
    type,
    read,
    sort,
    page: String(page),
    limit: '20',
  }).toString(), [search, type, read, sort, page]);

  const { data, isLoading, isFetching, isError } = useQuery<NotificationResponse>({
    queryKey: ['notifications', queryString],
    queryFn: () => api.get(`/notifications?${queryString}`),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: (_result, id) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-preview'] });
      toast.success('Notification marked as read');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to mark notification as read'),
  });

  const markSelectedMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/notifications/read-selected', { ids }),
    onSuccess: (result: { updated?: number }) => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-preview'] });
      toast.success(`${result.updated ?? 0} notification${result.updated === 1 ? '' : 's'} marked as read`);
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to mark selected notifications as read'),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-preview'] });
      toast.success('All notifications marked as read');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to update notifications'),
  });

  const visibleIds = data?.notifications.map((notification) => notification.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    setSelectedIds((current) => {
      const visible = new Set(visibleIds);
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [data?.notifications]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setType('ALL');
    setRead('ALL');
    setSort('NEWEST');
    setPage(1);
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Bell className="h-6 w-6" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Workspace activity</p>
                <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-500">Real updates from your WhatsApp workspace, templates, campaigns, and deliveries.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                disabled={markSelectedMutation.isPending || markAllMutation.isPending}
                onClick={() => markSelectedMutation.mutate([...selectedIds])}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Mark selected ({selectedIds.size})
              </button>
            )}
            <button
              type="button"
              disabled={!data?.unreadCount || markAllMutation.isPending || markSelectedMutation.isPending}
              onClick={() => markAllMutation.mutate()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_150px_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Search notifications..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <select value={type} onChange={(event) => { setType(event.target.value as NotificationType); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500">
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={read} onChange={(event) => { setRead(event.target.value as ReadFilter); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500">
              <option value="ALL">All status</option>
              <option value="UNREAD">Unread only</option>
              <option value="READ">Read only</option>
            </select>
            <select value={sort} onChange={(event) => { setSort(event.target.value as SortOrder); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500">
              <option value="NEWEST">Newest first</option>
              <option value="OLDEST">Oldest first</option>
            </select>
            <button type="button" onClick={clearFilters} className="h-10 rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">Clear</button>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{data?.total ?? 0} notification{data?.total === 1 ? '' : 's'} · {data?.unreadCount ?? 0} unread</span>
            {isFetching && <span>Refreshing…</span>}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {isLoading && <div className="p-12 text-center text-sm text-slate-500">Loading your notifications…</div>}
          {isError && <div className="p-12 text-center text-sm text-red-600">Unable to load notifications. Please try again.</div>}
          {!isLoading && !isError && !data?.notifications.length && (
            <div className="p-16 text-center">
              <Inbox className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-3 text-base font-semibold text-slate-700">No notifications found</h2>
              <p className="mt-1 text-sm text-slate-400">New workspace activity will appear here.</p>
            </div>
          )}
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
            <input
              type="checkbox"
              aria-label="Select all notifications on this page"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={!visibleIds.length}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600 disabled:opacity-40"
            />
            <span className="text-xs font-semibold text-slate-500">
              {selectedIds.size ? `${selectedIds.size} selected` : 'Select notifications to mark them in bulk'}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {data?.notifications.map((notification) => (
              <article key={notification.id} className={`flex gap-4 p-5 transition ${notification.read ? 'bg-white' : 'bg-emerald-50/40'}`}>
                <input
                  type="checkbox"
                  aria-label={`Select ${notification.title}`}
                  checked={selectedIds.has(notification.id)}
                  onChange={() => toggleSelected(notification.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
                />
                <div className={`mt-0.5 h-10 w-10 shrink-0 rounded-full text-center text-[10px] font-bold leading-10 ${severityClass(notification.severity)}`}>
                  {notification.type.slice(0, 3)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col justify-between gap-1 sm:flex-row">
                    <div className="flex items-center gap-2">
                      {!notification.read && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                      <h2 className="font-semibold text-slate-900">{notification.title}</h2>
                    </div>
                    <time className="text-xs text-slate-400">{timeLabel(notification.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{notification.message}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${severityClass(notification.severity)}`}>{typeLabels[notification.type]}</span>
                    {!notification.read && (
                       <button
                         type="button"
                         disabled={markReadMutation.isPending}
                         onClick={() => markReadMutation.mutate(notification.id)}
                         className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                       >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {(data?.totalPages ?? 1) > 1 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="text-sm text-slate-500">Page {data?.page} of {data?.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}