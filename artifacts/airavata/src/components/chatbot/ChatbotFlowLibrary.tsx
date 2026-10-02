import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2,
  Loader2,
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
    <div className="chatbot-page flex h-full min-h-0 flex-col overflow-hidden bg-white">
      {confirmDialog}
      <header className="z-10 shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="relative flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="whitespace-nowrap text-lg font-semibold text-gray-900">Chatbots</h1>
          </div>

          <div className="order-3 flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 lg:absolute lg:left-1/2 lg:top-1/2 lg:order-none lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:flex-nowrap">
            <label className="relative min-w-[168px] w-full sm:w-[190px] lg:w-[190px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                aria-label="Search chatbots by name or description"
                placeholder="Search chatbots"
                data-testid="input-search-chatbots"
                className="h-10 w-full rounded-none border border-gray-300 bg-white pl-9 pr-3 text-[14px] text-gray-800 outline-none transition-colors placeholder:text-gray-500 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              aria-label="Filter chatbots by status"
              data-testid="select-chatbot-status"
              className="h-10 w-[130px] rounded-none border border-gray-300 bg-white px-2 text-sm font-medium text-gray-800 outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>

          <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 lg:order-none">
            <button
              type="button"
              onClick={onQuickSetup}
              data-testid="button-quick-faq-setup"
              className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap border border-gray-300 bg-white px-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5 sm:px-3"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="hidden sm:inline">Quick FAQ setup</span>
              <span className="sm:hidden">FAQ</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawer({ mode: 'create' })}
              data-testid="button-create-chatbot"
              className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap border border-primary bg-primary px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create a New Chatbot</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-white">
        {filteredFlows.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-12 text-center text-gray-500">
            <Workflow className="h-9 w-9 text-gray-300" />
            <div>
              <p className="text-base font-semibold text-gray-700">
                {flows.length === 0 ? 'No chatbots yet' : 'No chatbots match these filters'}
              </p>
              <p className="mt-1 text-sm">
                {flows.length === 0
                  ? 'Create a chatbot to set its details and start building its conversation.'
                  : 'Try another search or status, or clear the selected filters.'}
              </p>
            </div>
            {flows.length === 0 ? (
              <button
                type="button"
                onClick={() => setDrawer({ mode: 'create' })}
                data-testid="button-create-first-chatbot"
                className="mt-1 inline-flex h-10 items-center gap-1.5 border border-primary bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Create a New Chatbot
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
                data-testid="button-clear-chatbot-filters"
                className="mt-1 text-sm font-semibold text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="px-3 py-3 md:px-6 md:py-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th scope="col" className="min-w-[360px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black md:px-5">
                      Chatbot Name
                    </th>
                    <th scope="col" className="w-24 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-black">
                      Triggered
                    </th>
                    <th scope="col" className="w-24 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-black">
                      Completed
                    </th>
                    <th scope="col" className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-black">
                      Settings
                    </th>
                    <th scope="col" className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-black">
                      Build
                    </th>
                    <th scope="col" className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-black">
                      Publish
                    </th>
                    <th scope="col" className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-black">
                      Delete
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFlows.map(flow => {
                    const published = flow.status === 'PUBLISHED';
                    return (
                      <tr key={flow.id} className="transition-colors hover:bg-gray-50/70" data-testid={`row-chatbot-${flow.id}`}>
                        <td className="px-4 py-4 md:px-5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h2 className="break-words text-lg font-semibold leading-7 text-gray-900">{flow.name}</h2>
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold ${
                              published ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {published ? 'Published' : 'Draft'}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
                            <span className="max-w-[560px] truncate">
                              <span className="font-medium text-gray-500">Description:</span>{' '}
                              {flow.description || 'No description added'}
                            </span>
                            <span>
                              <span className="font-medium text-gray-500">Updated:</span>{' '}
                              {formatUpdatedAt(flow.updatedAt)}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-4 text-center text-sm tabular-nums text-gray-700">
                          {(flow.analytics?.triggered ?? 0).toLocaleString()}
                        </td>
                        <td className="px-2 py-4 text-center text-sm tabular-nums text-gray-700">
                          {(flow.analytics?.completed ?? 0).toLocaleString()}
                        </td>
                        <td className="px-2 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => setDrawer({ mode: 'edit', flow })}
                            aria-label={`Open settings for ${flow.name}`}
                            title="Settings"
                            data-testid={`button-edit-chatbot-details-${flow.id}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            <Settings2 className="h-6 w-6" />
                          </button>
                        </td>
                        <td className="px-2 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => onOpen(flow.id)}
                            aria-label={`Build ${flow.name}`}
                            title="Build chatbot"
                            data-testid={`button-build-chatbot-${flow.id}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            <Pencil className="h-6 w-6" />
                          </button>
                        </td>
                        <td className="px-2 py-4 text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={published}
                            aria-label={published ? `Unpublish ${flow.name}` : `Publish ${flow.name}`}
                            title={published ? 'Unpublish chatbot' : 'Publish chatbot'}
                            disabled={isStatusUpdating}
                            onClick={() => onStatusChange(flow.id, published ? 'DRAFT' : 'PUBLISHED')}
                            data-testid={`switch-chatbot-status-${flow.id}`}
                            className="inline-flex h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span
                              aria-hidden="true"
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                published ? 'bg-green-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                  published ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </span>
                          </button>
                        </td>
                        <td className="px-2 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => void handleDelete(flow)}
                            aria-label={`Delete ${flow.name}`}
                            title="Delete chatbot"
                            data-testid={`button-delete-chatbot-${flow.id}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          >
                            <Trash2 className="h-6 w-6" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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