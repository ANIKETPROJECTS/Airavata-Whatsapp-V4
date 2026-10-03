import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MessageCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  useSearchChatbotFlowExecutions,
  type ChatbotExecutionQuery,
  type ChatbotExecutionStatus,
} from '@workspace/api-client-react';
import type { ChatbotFlowSummary } from '../components/chatbot/ChatbotFlowLibrary';

type StatusFilter = 'ALL' | ChatbotExecutionStatus;
type TriggerFilter = 'ALL' | 'KEYWORD' | 'DEFAULT' | 'TEMPLATE_LINK' | 'LEGACY_SESSION';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All activity' },
  { value: 'ACTIVE', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'INTERRUPTED', label: 'Interrupted' },
  { value: 'STOPPED', label: 'Stopped' },
  { value: 'FAILED', label: 'Failed' },
];

const TRIGGER_FILTERS: Array<{ value: TriggerFilter; label: string }> = [
  { value: 'ALL', label: 'All triggers' },
  { value: 'KEYWORD', label: 'Keyword' },
  { value: 'DEFAULT', label: 'Default' },
  { value: 'TEMPLATE_LINK', label: 'Template link' },
  { value: 'LEGACY_SESSION', label: 'Legacy session' },
];

function localDayBoundary(value: string, offsetDays = 0) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

function digitsOnly(value: string | null | undefined) {
  return value?.replace(/\D/g, '') ?? '';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function triggerLabel(value: string) {
  switch (value) {
    case 'KEYWORD': return 'Keyword';
    case 'DEFAULT': return 'Default';
    case 'TEMPLATE_LINK': return 'Template link';
    case 'LEGACY_SESSION': return 'Legacy session';
    default: return value;
  }
}

function statusStyle(status: ChatbotExecutionStatus) {
  switch (status) {
    case 'COMPLETED': return 'bg-emerald-50 text-emerald-800';
    case 'ACTIVE': return 'bg-sky-50 text-sky-800';
    case 'INTERRUPTED': return 'bg-amber-50 text-amber-900';
    case 'STOPPED': return 'bg-slate-100 text-slate-700';
    case 'FAILED': return 'bg-rose-50 text-rose-800';
  }
}

function statusLabel(status: ChatbotExecutionStatus) {
  return status === 'ACTIVE' ? 'In progress' : status.charAt(0) + status.slice(1).toLowerCase();
}

function StatCell({ label, value, tone }: { label: string; value: number | undefined; tone?: string }) {
  return (
    <div className="border-b border-r border-gray-200 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone ?? 'text-gray-900'}`}>
        {value === undefined ? '—' : value.toLocaleString()}
      </p>
    </div>
  );
}

function contactDisplayName(name: string | null, phone: string | null) {
  const cleanName = name?.trim() ?? '';
  const cleanPhone = phone?.trim() ?? '';
  const nameDigits = digitsOnly(cleanName);
  const phoneDigits = digitsOnly(cleanPhone);
  return !cleanName || cleanName === cleanPhone || (phoneDigits && nameDigits === phoneDigits)
    ? 'NA'
    : cleanName;
}

function ContactName({ name, phone }: { name: string | null; phone: string | null }) {
  return (
    <div className="mx-auto min-w-0 max-w-[240px] text-center">
      <p className="truncate text-sm font-medium text-gray-900">{contactDisplayName(name, phone)}</p>
      <p className="mt-0.5 truncate text-xs text-gray-500">{phone?.trim() || 'NA'}</p>
    </div>
  );
}

function TranscriptLink({
  contactId,
  executionId,
}: {
  contactId: string | null;
  executionId: string;
}) {
  if (!contactId) {
    return (
      <span
        title="No contact is linked to this run"
        aria-label="Open chat unavailable"
        data-testid={`link-chatbot-execution-chat-${executionId}`}
        className="inline-flex h-9 items-center justify-center gap-1.5 px-1 text-sm font-medium text-primary/45"
      >
        <MessageCircle className="h-4 w-4" />
        Open chat
      </span>
    );
  }

  return contactId ? (
    <Link
      href={`/live-chat?conversationId=${encodeURIComponent(contactId)}`}
      title="Open the contact’s full Live Chat transcript"
      data-testid={`link-chatbot-execution-chat-${executionId}`}
      className="inline-flex h-9 items-center justify-center gap-1.5 px-1 text-sm font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <MessageCircle className="h-4 w-4" />
      Open chat
    </Link>
  ) : null;
}

export default function ChatbotActivity({
  flow,
  onBack,
}: {
  flow: ChatbotFlowSummary;
  onBack: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [triggerTypeFilter, setTriggerTypeFilter] = useState<TriggerFilter>('ALL');
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startedAtFromDate, setStartedAtFromDate] = useState('');
  const [startedAtToDate, setStartedAtToDate] = useState('');
  const cursor = cursors[cursors.length - 1];
  const query = useMemo<ChatbotExecutionQuery>(() => ({
    limit: 25,
    ...(cursor ? { cursor } : {}),
    ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
    ...(triggerTypeFilter === 'ALL' ? {} : { triggerType: triggerTypeFilter }),
    ...(searchTerm ? { search: searchTerm } : {}),
    ...(startedAtFromDate ? { startedAtFrom: localDayBoundary(startedAtFromDate) } : {}),
    ...(startedAtToDate ? { startedAtBefore: localDayBoundary(startedAtToDate, 1) } : {}),
  }), [cursor, searchTerm, startedAtFromDate, startedAtToDate, statusFilter, triggerTypeFilter]);
  const executionsQuery = useSearchChatbotFlowExecutions();
  const { mutate, reset } = executionsQuery;

  useEffect(() => {
    const normalizedSearch = searchInput.trim();
    if (normalizedSearch === searchTerm) return;
    const timeout = window.setTimeout(() => {
      reset();
      setCursors([undefined]);
      setSearchTerm(normalizedSearch);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [reset, searchInput, searchTerm]);

  useEffect(() => {
    mutate({ id: flow.id, data: query });
  }, [flow.id, mutate, query]);

  const isLoading = (
    executionsQuery.isPending ||
    executionsQuery.isIdle ||
    searchInput.trim() !== searchTerm
  );
  const isError = executionsQuery.isError;
  const data = executionsQuery.data;
  const error = executionsQuery.error;
  const executions = data?.executions ?? [];
  const hasActiveListFilters =
    statusFilter !== 'ALL' ||
    triggerTypeFilter !== 'ALL' ||
    Boolean(searchTerm || searchInput.trim() || startedAtFromDate || startedAtToDate);
  const hasLegacyOnlyHistory =
    statusFilter === 'ALL' &&
    triggerTypeFilter === 'ALL' &&
    cursors.length === 1 &&
    !searchTerm &&
    !startedAtFromDate &&
    !startedAtToDate &&
    executions.length === 0 &&
    (data?.stats.triggered ?? 0) > 0;

  const changeFilter = (value: StatusFilter) => {
    reset();
    setStatusFilter(value);
    setCursors([undefined]);
  };

  const changeTriggerFilter = (value: TriggerFilter) => {
    reset();
    setTriggerTypeFilter(value);
    setCursors([undefined]);
  };

  const changeDateFilter = (which: 'from' | 'to', value: string) => {
    reset();
    setCursors([undefined]);
    if (which === 'from') setStartedAtFromDate(value);
    else setStartedAtToDate(value);
  };

  const clearFilters = () => {
    reset();
    setStatusFilter('ALL');
    setTriggerTypeFilter('ALL');
    setCursors([undefined]);
    setSearchInput('');
    setSearchTerm('');
    setStartedAtFromDate('');
    setStartedAtToDate('');
  };

  const retry = () => mutate({ id: flow.id, data: query });

  return (
    <div className="chatbot-page flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <header className="flex min-h-[68px] shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onBack}
          data-testid="button-back-to-chatbot-list"
          className="inline-flex h-10 shrink-0 items-center gap-2 border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">All chatbots</span>
        </button>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Chatbot activity</p>
          <h1 className="truncate text-base font-semibold text-gray-900" data-testid="text-activity-chatbot-name">{flow.name}</h1>
        </div>
        <span className={`ml-auto inline-flex shrink-0 px-2 py-1 text-xs font-semibold ${
          flow.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
        }`} data-testid="status-activity-chatbot">
          {flow.status === 'PUBLISHED' ? 'Published' : 'Draft'}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 md:py-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Triggered conversations</h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-600">
                Runs for this chatbot. Open a contact to continue in its existing Live Chat transcript.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex shrink-0 flex-col gap-1 text-xs font-medium text-gray-600">
                Filter activity
                <select
                  value={statusFilter}
                  onChange={event => changeFilter(event.target.value as StatusFilter)}
                  aria-label="Filter chatbot activity by status"
                  data-testid="select-chatbot-activity-status"
                  className="h-10 min-w-[180px] border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  {STATUS_FILTERS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex shrink-0 flex-col gap-1 text-xs font-medium text-gray-600">
                Triggered by
                <select
                  value={triggerTypeFilter}
                  onChange={event => changeTriggerFilter(event.target.value as TriggerFilter)}
                  aria-label="Filter chatbot activity by trigger source"
                  data-testid="select-chatbot-activity-trigger"
                  className="h-10 min-w-[180px] border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  {TRIGGER_FILTERS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <section aria-label="Chatbot activity totals" className="grid grid-cols-2 border-l border-t border-gray-200 md:grid-cols-6">
            <StatCell label="Triggered" value={data?.stats.triggered} />
            <StatCell label="Completed" value={data?.stats.completed} tone="text-emerald-700" />
            <StatCell label="In progress" value={data?.stats.active} tone="text-sky-700" />
            <StatCell label="Interrupted" value={data?.stats.interrupted} tone="text-amber-800" />
            <StatCell label="Stopped" value={data?.stats.stopped} />
            <StatCell label="Failed" value={data?.stats.failed} tone="text-rose-700" />
          </section>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs font-medium text-gray-600">
              Search contacts
              <span className="relative mt-1 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchInput}
                  maxLength={100}
                  onChange={event => setSearchInput(event.target.value)}
                  placeholder="Name or contact number"
                  aria-label="Search activity by contact name or number"
                  data-testid="input-chatbot-activity-search"
                  className="h-10 w-full border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Started from
              <input
                type="date"
                value={startedAtFromDate}
                max={startedAtToDate || undefined}
                onChange={event => changeDateFilter('from', event.target.value)}
                aria-label="Filter chatbot activity started from date"
                data-testid="input-chatbot-activity-date-from"
                className="h-10 border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Started to
              <input
                type="date"
                value={startedAtToDate}
                min={startedAtFromDate || undefined}
                onChange={event => changeDateFilter('to', event.target.value)}
                aria-label="Filter chatbot activity started to date"
                data-testid="input-chatbot-activity-date-to"
                className="h-10 border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            {hasActiveListFilters && (
              <button
                type="button"
                onClick={clearFilters}
                data-testid="button-clear-chatbot-activity-filters"
                className="h-10 px-3 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Contact</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Triggered by</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Started</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Last activity</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Ended</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Transcript</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading && Array.from({ length: 4 }, (_, index) => (
                  <tr key={index} aria-label="Loading activity">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-7 animate-pulse bg-slate-100" />
                    </td>
                  </tr>
                ))}
                {isError && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <CircleAlert className="mx-auto mb-2 h-5 w-5 text-rose-600" />
                      <p className="text-sm font-medium text-gray-800">Could not load chatbot activity</p>
                      <p className="mt-1 text-sm text-gray-500">{error instanceof Error ? error.message : 'Please try again.'}</p>
                      <button type="button" onClick={retry} data-testid="button-retry-chatbot-activity" className="mt-3 inline-flex h-9 items-center gap-2 border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        <RefreshCw className="h-4 w-4" /> Retry
                      </button>
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && executions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <BarChart2 className="mx-auto mb-2 h-7 w-7 text-gray-300" />
                      <p className="text-sm font-semibold text-gray-700">
                        {hasLegacyOnlyHistory
                          ? 'Detailed run history starts with new activity'
                          : hasActiveListFilters
                            ? 'No conversations match these filters'
                            : 'No triggered conversations yet'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {hasLegacyOnlyHistory
                          ? 'This chatbot has earlier lifetime totals, but individual runs were not recorded. New runs will appear here.'
                          : hasActiveListFilters
                            ? 'Try changing or clearing the search, date, status, or trigger filters.'
                            : 'New runs will appear here when this chatbot is triggered.'}
                      </p>
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && executions.map(run => (
                  <tr key={run.id} className="transition-colors hover:bg-gray-50/70" data-testid={`row-chatbot-execution-${run.id}`}>
                    <td className="px-4 py-3.5 text-center">
                      <ContactName name={run.contactName} phone={run.contactPhone} />
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm text-gray-700">{triggerLabel(run.triggerType)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-center text-sm text-gray-700">{formatDateTime(run.startedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-center text-sm text-gray-700">{formatDateTime(run.lastActivityAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-center text-sm text-gray-700">{formatDateTime(run.endedAt)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold ${statusStyle(run.status)}`} data-testid={`status-chatbot-execution-${run.id}`}>
                        {statusLabel(run.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <TranscriptLink contactId={run.contactId} executionId={run.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 py-4">
            <p className="text-sm text-gray-500" data-testid="text-chatbot-activity-page">Page {cursors.length}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { reset(); setCursors(current => current.length > 1 ? current.slice(0, -1) : current); }}
                disabled={cursors.length <= 1 || isLoading}
                data-testid="button-chatbot-activity-previous"
                className="inline-flex h-9 items-center gap-1 border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                type="button"
                onClick={() => {
                  if (data?.nextCursor) {
                    reset();
                    setCursors(current => [...current, data.nextCursor ?? undefined]);
                  }
                }}
                disabled={!data?.nextCursor || isLoading}
                data-testid="button-chatbot-activity-next"
                className="inline-flex h-9 items-center gap-1 border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}