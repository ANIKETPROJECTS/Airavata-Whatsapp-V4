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
} from 'lucide-react';
import {
  useSearchChatbotFlowExecutions,
  type ChatbotExecutionQuery,
  type ChatbotExecutionStatus,
} from '@workspace/api-client-react';
import type { ChatbotFlowSummary } from '../components/chatbot/ChatbotFlowLibrary';

type StatusFilter = 'ALL' | ChatbotExecutionStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All activity' },
  { value: 'ACTIVE', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'INTERRUPTED', label: 'Interrupted' },
  { value: 'STOPPED', label: 'Stopped' },
  { value: 'FAILED', label: 'Failed' },
];

const previewMinutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const PREVIEW_ACTIVITY_DATA: NonNullable<ReturnType<typeof useSearchChatbotFlowExecutions>['data']> = {
  executions: [
    {
      id: 'preview-run-001',
      contactId: 'preview-contact-001',
      contactName: 'Preview Contact 01',
      contactPhone: '+91 00000 00101',
      triggerType: 'KEYWORD',
      status: 'ACTIVE',
      startedAt: previewMinutesAgo(14),
      lastActivityAt: previewMinutesAgo(2),
      endedAt: null,
    },
    {
      id: 'preview-run-002',
      contactId: 'preview-contact-002',
      contactName: 'Preview Contact 02',
      contactPhone: '+91 00000 00102',
      triggerType: 'DEFAULT',
      status: 'COMPLETED',
      startedAt: previewMinutesAgo(92),
      lastActivityAt: previewMinutesAgo(87),
      endedAt: previewMinutesAgo(86),
    },
    {
      id: 'preview-run-003',
      contactId: 'preview-contact-003',
      contactName: 'Preview Contact 03',
      contactPhone: '+91 00000 00103',
      triggerType: 'TEMPLATE_LINK',
      status: 'COMPLETED',
      startedAt: previewMinutesAgo(1_440),
      lastActivityAt: previewMinutesAgo(1_420),
      endedAt: previewMinutesAgo(1_418),
    },
    {
      id: 'preview-run-004',
      contactId: 'preview-contact-004',
      contactName: 'Preview Contact 04',
      contactPhone: '+91 00000 00104',
      triggerType: 'KEYWORD',
      status: 'INTERRUPTED',
      startedAt: previewMinutesAgo(2_880),
      lastActivityAt: previewMinutesAgo(2_870),
      endedAt: previewMinutesAgo(2_868),
    },
    {
      id: 'preview-run-005',
      contactId: 'preview-contact-005',
      contactName: 'Preview Contact 05',
      contactPhone: '+91 00000 00105',
      triggerType: 'LEGACY_SESSION',
      status: 'STOPPED',
      startedAt: previewMinutesAgo(4_320),
      lastActivityAt: previewMinutesAgo(4_310),
      endedAt: previewMinutesAgo(4_309),
    },
    {
      id: 'preview-run-006',
      contactId: 'preview-contact-006',
      contactName: 'Preview Contact 06',
      contactPhone: '+91 00000 00106',
      triggerType: 'DEFAULT',
      status: 'FAILED',
      startedAt: previewMinutesAgo(5_760),
      lastActivityAt: previewMinutesAgo(5_755),
      endedAt: previewMinutesAgo(5_754),
    },
  ],
  stats: {
    triggered: 6,
    completed: 2,
    active: 1,
    interrupted: 1,
    stopped: 1,
    failed: 1,
  },
  nextCursor: null,
};

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
    <div className="border-b border-gray-200 px-4 py-3 md:border-b-0 md:border-l first:md:border-l-0">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone ?? 'text-gray-900'}`}>
        {value === undefined ? '—' : value.toLocaleString()}
      </p>
    </div>
  );
}

function ContactName({ name, phone }: { name: string | null; phone: string | null }) {
  return (
    <div className="min-w-0">
      <p className="max-w-[240px] truncate text-sm font-medium text-gray-900">{name || phone || 'Contact unavailable'}</p>
      {name && phone && <p className="mt-0.5 text-xs text-gray-500">{phone}</p>}
    </div>
  );
}

function TranscriptLink({
  contactId,
  executionId,
  preview = false,
}: {
  contactId: string | null;
  executionId: string;
  preview?: boolean;
}) {
  if (preview) {
    return (
      <span
        title="Sample data only; no transcript is linked"
        aria-label="Sample transcript link disabled"
        data-testid={`link-chatbot-execution-chat-${executionId}`}
        className="inline-flex h-9 items-center gap-1.5 border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-400"
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
      className="inline-flex h-9 items-center gap-1.5 border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <MessageCircle className="h-4 w-4" />
      Open chat
    </Link>
  ) : (
    <span className="text-xs text-gray-400">Contact unavailable</span>
  );
}

export default function ChatbotActivity({
  flow,
  onBack,
}: {
  flow: ChatbotFlowSummary;
  onBack: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [samplePreviewEnabled, setSamplePreviewEnabled] = useState(false);
  const isPreview = import.meta.env.DEV && samplePreviewEnabled;
  const cursor = cursors[cursors.length - 1];
  const query = useMemo<ChatbotExecutionQuery>(() => ({
    limit: 20,
    ...(cursor ? { cursor } : {}),
    ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
  }), [cursor, statusFilter]);
  const executionsQuery = useSearchChatbotFlowExecutions();
  const { mutate, reset } = executionsQuery;

  useEffect(() => {
    if (isPreview) return;
    mutate({ id: flow.id, data: query });
  }, [flow.id, isPreview, mutate, query]);

  const isLoading = !isPreview && (executionsQuery.isPending || executionsQuery.isIdle);
  const isError = !isPreview && executionsQuery.isError;
  const data = isPreview ? PREVIEW_ACTIVITY_DATA : executionsQuery.data;
  const error = isPreview ? undefined : executionsQuery.error;
  const executions = data?.executions ?? [];
  const hasLegacyOnlyHistory =
    statusFilter === 'ALL' &&
    cursors.length === 1 &&
    executions.length === 0 &&
    (data?.stats.triggered ?? 0) > 0;

  const changeFilter = (value: StatusFilter) => {
    reset();
    setStatusFilter(value);
    setCursors([undefined]);
  };

  const retry = () => mutate({ id: flow.id, data: query });
  const toggleSamplePreview = () => {
    reset();
    setStatusFilter('ALL');
    setCursors([undefined]);
    setSamplePreviewEnabled(enabled => !enabled);
  };

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
              <p className="mt-2 break-all font-mono text-xs text-gray-500" data-testid="text-activity-chatbot-id">
                Flow ID · {flow.id}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={toggleSamplePreview}
                  data-testid="button-toggle-chatbot-activity-preview"
                  aria-pressed={isPreview}
                  className="h-10 border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {isPreview ? 'Exit sample preview' : 'Preview sample activity'}
                </button>
              )}
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
            </div>
          </div>

          {isPreview && (
            <div
              role="status"
              data-testid="notice-chatbot-activity-preview"
              className="mb-4 border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
            >
              <p className="font-semibold">Sample preview only</p>
              <p className="mt-0.5 text-sky-800">
                These example runs are shown in your browser and are not saved. Transcript links are disabled.
              </p>
            </div>
          )}

          <section aria-label="Chatbot activity totals" className="grid grid-cols-2 border-t border-gray-200 md:grid-cols-6">
            <StatCell label="Triggered" value={data?.stats.triggered} />
            <StatCell label="Completed" value={data?.stats.completed} tone="text-emerald-700" />
            <StatCell label="In progress" value={data?.stats.active} tone="text-sky-700" />
            <StatCell label="Interrupted" value={data?.stats.interrupted} tone="text-amber-800" />
            <StatCell label="Stopped" value={data?.stats.stopped} />
            <StatCell label="Failed" value={data?.stats.failed} tone="text-rose-700" />
          </section>

          <div className="mt-5 overflow-x-auto border border-gray-200">
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Contact</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Triggered by</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Started</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Last activity</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Ended</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Transcript</th>
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
                          : statusFilter === 'ALL'
                            ? 'No triggered conversations yet'
                            : 'No conversations match this status'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {hasLegacyOnlyHistory
                          ? 'This chatbot has earlier lifetime totals, but individual runs were not recorded. New runs will appear here.'
                          : statusFilter === 'ALL'
                            ? 'New runs will appear here when this chatbot is triggered.'
                            : 'Choose a different status to see more activity.'}
                      </p>
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && executions.map(run => (
                  <tr key={run.id} className="transition-colors hover:bg-gray-50/70" data-testid={`row-chatbot-execution-${run.id}`}>
                    <td className="px-4 py-3.5">
                      <ContactName name={run.contactName} phone={run.contactPhone} />
                      <p className="mt-1 max-w-[220px] truncate font-mono text-[11px] text-gray-400" title={`Execution ${run.id} · Contact ${run.contactId ?? 'unavailable'}`}>
                        Run {run.id}
                      </p>
                      <p className="max-w-[220px] truncate font-mono text-[11px] text-gray-400">
                        Contact {run.contactId ?? 'unavailable'}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{triggerLabel(run.triggerType)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-700">{formatDateTime(run.startedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-700">{formatDateTime(run.lastActivityAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-700">{formatDateTime(run.endedAt)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold ${statusStyle(run.status)}`} data-testid={`status-chatbot-execution-${run.id}`}>
                        {statusLabel(run.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <TranscriptLink contactId={run.contactId} executionId={run.id} preview={isPreview} />
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