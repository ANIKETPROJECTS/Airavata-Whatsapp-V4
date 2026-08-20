/**
 * Module 8: Campaigns Report — wired to real campaign data from MongoDB.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Users, CheckCircle2, MessageSquare, Download, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

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

interface CampaignRecipient {
  _id: string;
  status: string;
  currentStepId?: string;
  lastError?: string;
  contactId?: { name?: string; phone?: string };
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
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

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

  const { data: recipientData, isLoading: recipientsLoading } = useQuery<{ recipients: CampaignRecipient[] }>({
    queryKey: ['campaign-recipients', selectedCampaign?.id],
    queryFn: () => api.get(`/campaigns/${selectedCampaign!.id}/recipients`),
    enabled: Boolean(selectedCampaign),
    refetchInterval: selectedCampaign ? 10_000 : false,
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
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const fmt = (n?: number) => (n ?? 0) > 0 ? (n!).toLocaleString() : '—';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns Report</h1>
          <p className="text-sm text-gray-500">Track the performance of your broadcast messages</p>
        </div>
        <button
          onClick={() => toast.success('Export coming soon')}
          className="px-4 py-2 border bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 border-b">
                <tr>
                  <th className="px-5 py-3 font-medium">Campaign Name</th>
                  <th className="px-5 py-3 font-medium">Template</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Sent</th>
                  <th className="px-5 py-3 font-medium">Delivered</th>
                  <th className="px-5 py-3 font-medium">Read</th>
                  <th className="px-5 py-3 font-medium">Failed</th>
                  <th className="px-5 py-3 font-medium">Status</th>
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
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor(camp.status)}`}>
                        {camp.status.charAt(0) + camp.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-md">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Detail Drawer */}
      {selectedCampaign && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end animate-in fade-in"
          onClick={() => setSelectedCampaign(null)}
        >
          <div
            className="bg-white w-full max-w-md h-full shadow-xl animate-in slide-in-from-right overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b sticky top-0 bg-white/90 backdrop-blur z-10 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedCampaign.name}</h2>
                <p className="text-sm text-gray-500">Details & Performance</p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Funnel */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Delivery Funnel</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Sent', value: selectedCampaign.stats.sent, cls: 'bg-gray-50 border' },
                    { label: 'Delivered', value: selectedCampaign.stats.delivered, cls: 'bg-green-50 border-green-100', ml: 'ml-4' },
                    { label: 'Read', value: selectedCampaign.stats.read, cls: 'bg-emerald-50 border-emerald-100', ml: 'ml-8' },
                    { label: 'Failed', value: selectedCampaign.stats.failed, cls: 'bg-red-50 border-red-100', ml: 'ml-4' },
                  ].map(row => (
                    <div key={row.label} className={`border rounded-lg p-3 flex justify-between items-center ${row.cls} ${row.ml ?? ''}`}>
                      <span className="text-sm text-gray-600">{row.label}</span>
                      <span className="font-bold text-gray-900">{(row.value ?? 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Information</h3>
                <div className="text-sm space-y-2 text-gray-600">
                  <div className="flex justify-between border-b pb-2">
                    <span>Template</span>
                    <span className="font-medium text-gray-900">{selectedCampaign.templateName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span>Date</span>
                    <span className="font-medium text-gray-900">
                      {new Date(selectedCampaign.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span>Status</span>
                    <span className="font-medium text-gray-900">{selectedCampaign.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Credits Used</span>
                    <span className="font-medium text-gray-900">{selectedCampaign.creditCost}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Recipient status</h3>
                  <span className="text-xs text-gray-400">{recipientData?.recipients.length ?? 0} enrolled</span>
                </div>
                {recipientsLoading ? (
                  <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : !recipientData?.recipients.length ? (
                  <p className="text-sm text-gray-500">Recipient records will appear when the campaign is enrolled.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                    {recipientData.recipients.map(recipient => (
                      <div key={recipient._id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{recipient.contactId?.name || 'Unnamed contact'}</p>
                          <p className="text-xs text-gray-500">{recipient.contactId?.phone ?? '—'}</p>
                          {recipient.lastError && <p className="text-[11px] text-red-600 truncate">{recipient.lastError}</p>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusColor(recipient.status)}`}>
                          {recipient.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
