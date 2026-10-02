import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Settings2,
  Trash2,
  Workflow,
} from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useConfirmDialog } from '../ConfirmDialog';

export interface ChatbotFlowSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  updatedAt: string;
  analytics?: { triggered: number; completed: number };
}

export interface ChatbotDetailsInput {
  name: string;
  description: string;
}

const chatbotDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a chatbot name.').max(100, 'Name must be 100 characters or fewer.'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer.'),
});

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ChatbotSetupDrawer({
  mode,
  flow,
  isSaving,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  flow?: ChatbotFlowSummary;
  isSaving: boolean;
  onClose: () => void;
  onSave: (values: ChatbotDetailsInput) => Promise<void> | void;
}) {
  const form = useForm<ChatbotDetailsInput>({
    resolver: zodResolver(chatbotDetailsSchema),
    defaultValues: {
      name: flow?.name ?? '',
      description: flow?.description ?? '',
    },
  });

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        type="button"
        aria-label="Close chatbot details"
        data-testid="button-close-chatbot-details-backdrop"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/35"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="chatbot-details-title"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
        }}
        className="relative z-10 flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-start justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Chatbot setup</p>
                <h2 id="chatbot-details-title" className="mt-1 text-xl font-semibold text-gray-900">
                  {mode === 'create' ? 'Create a New Chatbot' : 'Chatbot Details'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chatbot details"
                data-testid="button-close-chatbot-details"
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <p className="text-sm text-gray-500">
                Set up the chatbot details first. You can add its triggers, messages, and actions in the builder next.
              </p>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-sm font-medium text-gray-700">Chatbot name</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        autoFocus
                        maxLength={100}
                        placeholder="e.g. Appointment assistant"
                        data-testid="input-chatbot-name"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </FormControl>
                    <FormDescription>Choose a clear name your team will recognize.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-sm font-medium text-gray-700">What should this chatbot do?</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        rows={4}
                        maxLength={500}
                        placeholder="Describe the questions it answers or the task it helps customers complete."
                        data-testid="input-chatbot-description"
                        className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </FormControl>
                    <FormDescription>Optional. This description appears in your chatbot list.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Next: build the conversation</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Add a trigger, connect message and action elements, then save and publish when ready.
                  </p>
                </div>
              </div>
            </div>

            <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-gray-200 bg-gray-50/70 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                data-testid="button-cancel-chatbot-details"
                className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                data-testid="button-save-chatbot-details"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'create' ? 'Create and continue' : 'Save details'}
              </button>
            </footer>
          </form>
        </Form>
      </aside>
    </div>
  );
}

export default function ChatbotFlowLibrary({
  flows,
  isStatusUpdating,
  isSaving,
  onCreate,
  onUpdateDetails,
  onOpen,
  onQuickSetup,
  onStatusChange,
  onDelete,
}: {
  flows: ChatbotFlowSummary[];
  isStatusUpdating: boolean;
  isSaving: boolean;
  onCreate: (values: ChatbotDetailsInput) => Promise<void> | void;
  onUpdateDetails: (id: string, values: ChatbotDetailsInput) => Promise<void> | void;
  onOpen: (id: string) => void;
  onQuickSetup: () => void;
  onStatusChange: (id: string, status: 'DRAFT' | 'PUBLISHED') => void;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [drawer, setDrawer] = useState<{ mode: 'create' } | { mode: 'edit'; flow: ChatbotFlowSummary } | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const filteredFlows = flows.filter(flow => {
    const searchText = `${flow.name} ${flow.description ?? ''}`.toLowerCase();
    const matchesSearch = searchText.includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || flow.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const publishedCount = flows.filter(flow => flow.status === 'PUBLISHED').length;
  const triggeredCount = flows.reduce((sum, flow) => sum + (flow.analytics?.triggered ?? 0), 0);
  const completedCount = flows.reduce((sum, flow) => sum + (flow.analytics?.completed ?? 0), 0);

  const handleDelete = async (flow: ChatbotFlowSummary) => {
    if (await confirm({
      title: 'Delete this chatbot?',
      description: `Delete "${flow.name}" and its conversation setup? This cannot be undone.`,
      confirmLabel: 'Delete chatbot',
    })) {
      onDelete(flow.id);
    }
  };

  const handleDrawerSave = async (values: ChatbotDetailsInput) => {
    if (!drawer) return;
    if (drawer.mode === 'edit') {
      await onUpdateDetails(drawer.flow.id, values);
    } else {
      await onCreate(values);
    }
    setDrawer(null);
  };

  return (
    <div className="chatbot-page h-full min-h-0 overflow-y-auto bg-slate-50">
      {confirmDialog}
      <div className="mx-auto w-full max-w-[1480px] space-y-6 p-5 md:p-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chatbots</h1>
            <p className="mt-1 text-sm text-gray-500">Create automated WhatsApp conversations and manage their flow.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onQuickSetup}
              data-testid="button-quick-faq-setup"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Quick FAQ setup
            </button>
            <button
              type="button"
              onClick={() => setDrawer({ mode: 'create' })}
              data-testid="button-create-chatbot"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create a New Chatbot
            </button>
          </div>
        </header>

        <section aria-label="Chatbot overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total chatbots', value: flows.length, icon: Bot, tint: 'bg-emerald-50 text-emerald-700' },
            { label: 'Published', value: publishedCount, icon: CheckCircle2, tint: 'bg-green-50 text-green-700' },
            { label: 'Total triggers', value: triggeredCount, icon: Activity, tint: 'bg-blue-50 text-blue-700' },
            { label: 'Completed conversations', value: completedCount, icon: Clock3, tint: 'bg-violet-50 text-violet-700' },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.tint}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="mt-0.5 text-xl font-semibold text-gray-900" data-testid={`text-chatbot-stat-${stat.label.toLowerCase().replaceAll(' ', '-')}`}>
                    {stat.value.toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Your chatbots</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {flows.length} chatbot{flows.length === 1 ? '' : 's'} in your workspace
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block min-w-0 sm:w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search chatbots"
                  aria-label="Search chatbots"
                  data-testid="input-search-chatbots"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
                aria-label="Filter chatbots by status"
                data-testid="select-chatbot-status"
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </select>
            </div>
          </div>

          {filteredFlows.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-gray-400">
                {flows.length === 0 ? <Bot className="h-8 w-8" /> : <Search className="h-7 w-7" />}
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">
                {flows.length === 0 ? 'No chatbots yet' : 'No chatbots match your search'}
              </h3>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                {flows.length === 0
                  ? 'Create a chatbot, set its details, then add triggers and conversation elements in the builder.'
                  : 'Try another name or status, or clear your search.'}
              </p>
              {flows.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setDrawer({ mode: 'create' })}
                  data-testid="button-create-first-chatbot"
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Create your first chatbot
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
                  data-testid="button-clear-chatbot-filters"
                  className="mt-5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/70">
                    <th scope="col" className="min-w-[330px] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Chatbot</th>
                    <th scope="col" className="w-32 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                    <th scope="col" className="w-28 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Triggered</th>
                    <th scope="col" className="w-32 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Completed</th>
                    <th scope="col" className="w-36 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Last updated</th>
                    <th scope="col" className="w-48 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFlows.map(flow => {
                    const published = flow.status === 'PUBLISHED';
                    return (
                      <tr key={flow.id} className="transition-colors hover:bg-gray-50/80" data-testid={`row-chatbot-${flow.id}`}>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => onOpen(flow.id)}
                            data-testid={`button-open-chatbot-${flow.id}`}
                            className="group flex max-w-full items-start gap-3 text-left"
                          >
                            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-primary">
                              <Bot className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-base font-semibold text-gray-900 group-hover:text-primary">{flow.name}</span>
                              <span className="mt-0.5 block max-w-[440px] truncate text-sm text-gray-500">
                                {flow.description || 'No description added'}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                            published
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${published ? 'bg-green-600' : 'bg-amber-500'}`} />
                            {published ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-right text-sm tabular-nums text-gray-700">
                          {(flow.analytics?.triggered ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-4 text-right text-sm tabular-nums text-gray-700">
                          {(flow.analytics?.completed ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-4 text-right text-sm text-gray-500">{formatUpdatedAt(flow.updatedAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setDrawer({ mode: 'edit', flow })}
                              aria-label={`Edit details for ${flow.name}`}
                              title="Edit details"
                              data-testid={`button-edit-chatbot-details-${flow.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                              <Settings2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpen(flow.id)}
                              aria-label={`Build ${flow.name}`}
                              title="Build chatbot"
                              data-testid={`button-build-chatbot-${flow.id}`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Build
                            </button>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={published}
                              aria-label={published ? `Unpublish ${flow.name}` : `Publish ${flow.name}`}
                              title={published ? 'Unpublish chatbot' : 'Publish chatbot'}
                              disabled={isStatusUpdating}
                              onClick={() => onStatusChange(flow.id, published ? 'DRAFT' : 'PUBLISHED')}
                              data-testid={`switch-chatbot-status-${flow.id}`}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                                published ? 'text-amber-600 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'
                              }`}
                            >
                              {published ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(flow)}
                              aria-label={`Delete ${flow.name}`}
                              title="Delete chatbot"
                              data-testid={`button-delete-chatbot-${flow.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {drawer && (
        <ChatbotSetupDrawer
          mode={drawer.mode}
          flow={drawer.mode === 'edit' ? drawer.flow : undefined}
          isSaving={isSaving}
          onClose={() => setDrawer(null)}
          onSave={handleDrawerSave}
        />
      )}
    </div>
  );
}