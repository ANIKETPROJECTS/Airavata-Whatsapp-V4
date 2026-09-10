/**
 * Module 8: Campaigns Report — wired to real campaign data from MongoDB.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Users, CheckCircle2, MessageSquare, Download, Eye, Loader2, X, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import MetaInsightsPanel from '@/components/MetaInsightsPanel';
import { useAuth } from '@/context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  templateName: string | null;
  status: string;
  stats: {
    totalRecipients: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  creditCost: number;
  createdAt: string;
}

interface CampaignMessageDetail {
  id: string;
  phoneNumber: string;
  contactName: string | null;
  status: string;
  messageId: string | null;
  updatedAt: string;
  errorCode: string | null;
  errorReason: string | null;
  errorDetails: string | null;
  request: unknown;
  response: unknown;
}

interface CampaignDetailResponse {
  campaign: Campaign;
  messageDetails: CampaignMessageDetail[];
  apiRequest: {
    templateName: string | null;
    language: string | null;
    variables: Record<string, unknown>;
    phoneNumbers: string[];
    payloads: unknown[];
  };
  rawResponses: Array<{
    phoneNumber: string;
    messageId: string | null;
    status: string;
    response: unknown;
  }>;
}

interface Stats {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  campaignCount: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CampaignsReport() {
  const { user } = useAuth();
  const isMetaDirect = user?.billingMode === 'meta_direct';
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns'),
    refetchInterval: 15_000,
  });

  const { data: statsData } = useQuery<{ stats: Stats }>({
    queryKey: ['campaigns-stats'],
    queryFn: () => api.get('/campaigns/stats/summary'),
    refetchInterval: 15_000,
  });

  const { data: campaignDetailData, isLoading: campaignDetailLoading } = useQuery<CampaignDetailResponse>({
    queryKey: ['campaign-detail', selectedCampaign?.id],
    queryFn: () => api.get(`/campaigns/${selectedCampaign!.id}`),
    enabled: Boolean(selectedCampaign),
    refetchInterval: selectedCampaign ? 10_000 : false,
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api.delete(`/campaigns/${campaignId}`),
    onSuccess: () => {
      toast.success('Failed campaign deleted.');
      const deletedId = selectedCampaign?.id;
      setSelectedCampaign(null);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns-stats'] });
      if (deletedId) {
        queryClient.removeQueries({ queryKey: ['campaign-detail', deletedId] });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const campaigns = data?.campaigns ?? [];
  const stats = statsData?.stats;

  const avgDelivery =
    stats && stats.totalSent > 0
      ? ((stats.totalDelivered / stats.totalSent) * 100).toFixed(1) + '%'
      : '—';
  const avgRead =
    stats && stats.totalSent > 0
      ? ((stats.totalRead / stats.totalSent) * 100).toFixed(1) + '%'
      : '—';

  const statusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED': return 'bg-green-100 text-green-700';
      case 'SENDING': return 'bg-blue-100 text-blue-700';
      case 'SCHEDULED': return 'bg-yellow-100 text-yellow-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      case 'SENT': return 'bg-blue-100 text-blue-700';
      case 'DELIVERED': return 'bg-green-100 text-green-700';
      case 'READ': return 'bg-emerald-100 text-emerald-700';
      case 'QUEUED':
      case 'RESERVED': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const campaignDisplayStatus = (campaign: Campaign) => {
    const normalized = campaign.status.toUpperCase();
    const sent = campaign.stats.sent ?? 0;
    const failed = campaign.stats.failed ?? 0;

    // COMPLETED means the send loop finished, not that every recipient
    // succeeded. Make a partial failure visible instead of hiding it.
    if (failed > 0 && sent > 0 && ['COMPLETED', 'FAILED'].includes(normalized)) {
      return {
        label: 'Completed with failures',
        className: 'bg-amber-100 text-amber-700',
      };
    }

    if (failed > 0 && sent === 0) {
      return {
        label: 'Failed',
        className: 'bg-red-100 text-red-700',
      };
    }

    return {
      label: campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase(),
      className: statusColor(campaign.status),
    };
  };

  const isFailedCampaign = (campaign: Campaign) =>
    campaign.status.toUpperCase() === 'FAILED';

  const handleDeleteCampaign = (campaign: Campaign) => {
    if (!isFailedCampaign(campaign) || deleteCampaignMutation.isPending) return;
    const confirmed = window.confirm(
      `Delete the failed campaign "${campaign.name}"? This removes its report and send records but keeps your contacts.`,
    );
    if (confirmed) {
      setSelectedCampaign(null);
      deleteCampaignMutation.mutate(campaign.id);
    }
  };

  const fmt = (n?: number) => (n ?? 0).toLocaleString();
  const rate = (value: number, total: number) =>
    total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0.0%';
  const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
  const copyJson = async (label: string, value: unknown) => {
    try {
      await navigator.clipboard.writeText(formatJson(value));
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleExport = () => {
    if (campaigns.length === 0) {
      toast.info('There are no campaigns to export yet.');
      return;
    }

    const csvCell = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const headers = [
      'Campaign Name',
      'Template',
      'Date',
      'Sent',
      'Delivered',
      'Delivery Rate',
      'Read',
      'Read Rate',
      'Failed',
      'Status',
    ];
    const rows = campaigns.map(campaign => {
      const sent = campaign.stats.sent ?? 0;
      const delivered = campaign.stats.delivered ?? 0;
      const read = campaign.stats.read ?? 0;
      const failed = campaign.stats.failed ?? 0;

      return [
        campaign.name,
        campaign.templateName ?? '',
        new Date(campaign.createdAt).toISOString(),
        sent,
        delivered,
        rate(delivered, sent),
        read,
        rate(read, sent),
        failed,
        campaignDisplayStatus(campaign).label,
      ];
    });

    const csv = [
      headers,
      ...rows,
    ].map(row => row.map(value => csvCell(value)).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `campaigns-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}.`);
  };

  const handleMessageExport = () => {
    const rows = campaignDetailData?.messageDetails ?? [];
    if (rows.length === 0) {
      toast.info('There are no message records to export for this campaign.');
      return;
    }

    const csvCell = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Phone Number',
      'Status',
      'Message ID',
      'Updated timestamp',
      'Error Code',
      'Error Reason',
      'Error Details',
    ];
    const csv = [
      headers,
      ...rows.map(row => [
        row.phoneNumber,
        row.status,
        row.messageId ?? '',
        new Date(row.updatedAt).toISOString(),
        row.errorCode ?? '',
        row.errorReason ?? '',
        row.errorDetails ?? '',
      ]),
    ].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(selectedCampaign?.name ?? 'campaign').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-messages.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} message record${rows.length === 1 ? '' : 's'}.`);
  };

  return (
    <div className="w-full min-w-0 p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns Report</h1>
          <p className="text-sm text-gray-500">Track the performance of your broadcast messages</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 border bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <MetaInsightsPanel />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Campaigns</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats?.campaignCount ?? campaigns.length}</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Sent</p>
            <h3 className="text-2xl font-bold text-gray-900">{(stats?.totalSent ?? 0).toLocaleString()}</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Avg. Delivery Rate</p>
            <h3 className="text-2xl font-bold text-gray-900">{avgDelivery}</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Avg. Read Rate</p>
            <h3 className="text-2xl font-bold text-gray-900">{avgRead}</h3>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <BarChart3 className="w-10 h-10" />
            <p className="font-medium text-gray-600">No campaigns yet</p>
            <p className="text-sm">Create and launch your first campaign to see results here.</p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 border-b">
                <tr>
                  <th className="px-5 py-3 font-medium">Campaign Name</th>
                  <th className="px-5 py-3 font-medium">Template</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Sent</th>
                  <th className="px-5 py-3 font-medium">Delivered</th>
                  <th className="px-5 py-3 font-medium">Read</th>
                  <th className="px-5 py-3 font-medium">Failed</th>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Status</th>
                  <th className="px-5 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-900">
                {campaigns.map(camp => (
                  <tr
                    key={camp.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedCampaign(camp)}
                  >
                    <td className="px-5 py-4 font-medium">{camp.name}</td>
                    <td className="px-5 py-4 text-gray-600">{camp.templateName ?? '—'}</td>
                    <td className="px-5 py-4 text-gray-600">
                      {new Date(camp.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">{fmt(camp.stats.sent)}</td>
                    <td className="px-5 py-4">{fmt(camp.stats.delivered)}</td>
                    <td className="px-5 py-4">{fmt(camp.stats.read)}</td>
                    <td className="px-5 py-4">{fmt(camp.stats.failed)}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium ${campaignDisplayStatus(camp).className}`}>
                        {campaignDisplayStatus(camp).label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedCampaign(camp);
                        }}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-md"
                        aria-label={`View ${camp.name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {isFailedCampaign(camp) && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteCampaign(camp);
                          }}
                          className="ml-1 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                          aria-label={`Delete failed campaign ${camp.name}`}
                          title="Delete failed campaign"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Detail View */}
      {selectedCampaign && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 sm:p-6 animate-in fade-in"
          onClick={() => setSelectedCampaign(null)}
        >
          <div
            className="mx-auto min-h-full w-full max-w-7xl overflow-hidden rounded-xl bg-white shadow-2xl animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Campaign details</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">{selectedCampaign.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMessageExport}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
                {isFailedCampaign(selectedCampaign) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCampaign(selectedCampaign)}
                    disabled={deleteCampaignMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteCampaignMutation.isPending ? 'Deleting…' : 'Delete'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCampaign(null)}
                  aria-label="Close campaign details"
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6 p-5 sm:p-7">
              {campaignDetailLoading ? (
                <div className="flex min-h-72 items-center justify-center text-gray-400">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Campaign summary */}
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Campaign summary</h3>
                        <p className="mt-1 text-sm text-gray-500">The send overview and delivery outcome for this campaign.</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${campaignDisplayStatus(selectedCampaign).className}`}>
                        {campaignDisplayStatus(selectedCampaign).label}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                      {[
                        ['Template name', selectedCampaign.templateName ?? '—'],
                        ['Campaign ID', selectedCampaign.id],
                        ['Date & time', new Date(selectedCampaign.createdAt).toLocaleString()],
                        ['Total messages', fmt(campaignDetailData?.apiRequest?.phoneNumbers.length ?? selectedCampaign.stats.totalRecipients)],
                        ['Sent', fmt(selectedCampaign.stats.sent)],
                        ['Failed', fmt(selectedCampaign.stats.failed)],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                          <p className="mt-1 truncate text-sm font-bold text-gray-900" title={value}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Request sent to Meta */}
                  <section className="rounded-xl border border-gray-200">
                    <div className="border-b border-gray-200 px-4 py-4 sm:px-5">
                      <h3 className="text-base font-bold text-gray-900">API request sent to Meta</h3>
                      <p className="mt-1 text-sm text-gray-500">Template, recipients, variables, and the recorded request payloads.</p>
                    </div>
                    <div className="grid gap-4 p-4 lg:grid-cols-3 sm:p-5">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Template</p>
                        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                          <p className="font-semibold">{campaignDetailData?.apiRequest?.templateName ?? selectedCampaign.templateName ?? '—'}</p>
                          <p className="mt-1 text-xs text-gray-500">Language: {campaignDetailData?.apiRequest?.language ?? '—'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Phone numbers</p>
                        <div className="max-h-32 overflow-y-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700">
                          {campaignDetailData?.apiRequest?.phoneNumbers.length
                            ? campaignDetailData.apiRequest.phoneNumbers.map(phone => <div key={phone}>{phone}</div>)
                            : 'No send records available'}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Variables used</p>
                          <button
                            type="button"
                            onClick={() => copyJson('Variables', campaignDetailData?.apiRequest?.variables ?? {})}
                            className="inline-flex items-center gap-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            aria-label="Copy variables used"
                            title="Copy variables used"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <pre className="max-h-32 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-green-300">{formatJson(campaignDetailData?.apiRequest?.variables ?? {})}</pre>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 p-4 sm:p-5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recorded Meta payloads</p>
                        <button
                          type="button"
                          onClick={() => copyJson('Recorded Meta payloads', campaignDetailData?.apiRequest?.payloads ?? [])}
                          className="inline-flex items-center gap-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Copy all recorded Meta payloads"
                          title="Copy all recorded Meta payloads"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {campaignDetailData?.apiRequest?.payloads.length ? (
                        <pre className="max-h-64 overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-green-300">{formatJson(campaignDetailData.apiRequest?.payloads)}</pre>
                      ) : (
                        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Request payloads were not recorded for these historical sends.</p>
                      )}
                    </div>
                  </section>

                  {/* Raw responses */}
                  <section className="rounded-xl border border-gray-200">
                    <div className="border-b border-gray-200 px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-gray-900">Raw response received from Meta</h3>
                          <p className="mt-1 text-sm text-gray-500">The provider response captured for each send attempt.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyJson('Raw Meta responses', campaignDetailData?.rawResponses ?? [])}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
                          aria-label="Copy all raw Meta responses"
                          title="Copy all raw Meta responses"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 sm:p-5">
                      {campaignDetailData?.rawResponses.length ? (
                        <pre className="max-h-72 overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-sky-300">{formatJson(campaignDetailData.rawResponses)}</pre>
                      ) : (
                        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No Meta responses have been recorded yet.</p>
                      )}
                    </div>
                  </section>

                  {/* Individual message table */}
                  <section className="rounded-xl border border-gray-200">
                    <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Individual message details</h3>
                        <p className="mt-1 text-sm text-gray-500">{campaignDetailData?.messageDetails.length ?? 0} message records</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleMessageExport}
                        className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                      >
                        <Download className="h-4 w-4" /> Download table
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Phone Number</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                            <th className="px-4 py-3 font-semibold">Message ID</th>
                            <th className="px-4 py-3 font-semibold">Updated timestamp</th>
                            <th className="px-4 py-3 font-semibold">Error Code</th>
                            <th className="px-4 py-3 font-semibold">Error reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(campaignDetailData?.messageDetails ?? []).map(row => (
                            <tr key={row.id} className="align-top">
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{row.phoneNumber}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusColor(row.status)}`}>{row.status.replace('_', ' ')}</span>
                              </td>
                              <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-gray-600" title={row.messageId ?? ''}>{row.messageId ?? '—'}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-gray-600">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td>
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-red-700">{row.errorCode ?? '—'}</td>
                             <td className="max-w-[360px] px-4 py-3 text-xs text-gray-600">
                               <div>{row.errorReason ?? '—'}</div>
                               {row.errorDetails && <div className="mt-1 text-gray-500">{row.errorDetails}</div>}
                             </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!campaignDetailData?.messageDetails.length && (
                        <p className="p-6 text-center text-sm text-gray-500">No individual message records are available for this campaign.</p>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
