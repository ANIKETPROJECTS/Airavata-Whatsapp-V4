/**
 * Dashboard — stat cards and recent campaigns wired to real data from MongoDB.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send, CheckCircle2, XCircle, MessageSquare,
  BarChart2, ArrowRight, PlayCircle, Users, Download, RefreshCw, Loader2
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useFacebookEmbeddedSignup } from '@/hooks/use-facebook-embedded-signup';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignStats {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  campaignCount: number;
}

interface Campaign {
  id: string;
  name: string;
  templateName: string | null;
  status: string;
  stats: { sent: number; delivered: number; read: number; failed: number };
  createdAt: string;
}

interface PhoneNumber {
  id: string;
  number: string;
  quality: string;
  messagingTier: string;
  status: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [showChecklist, setShowChecklist] = useState(true);
  const { launch: launchFbSignup, isConnecting: fbConnecting } = useFacebookEmbeddedSignup();

  useEffect(() => {
    void refreshUser();

    const handleWindowFocus = () => {
      void refreshUser();
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [refreshUser]);

  const { data: phoneData, isLoading: phoneLoading } = useQuery<{ numbers: PhoneNumber[] }>({
    queryKey: ['dashboard-phonenumbers'],
    queryFn: () => api.get('/phonenumbers'),
    enabled: Boolean(user?.metaWabaConnected),
    refetchInterval: 60_000,
  });

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery<{ stats: CampaignStats }>({
    queryKey: ['campaigns-stats'],
    queryFn: () => api.get('/campaigns/stats/summary'),
    refetchInterval: 30_000,
  });

  const { data: campaignsData, isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns'),
    refetchInterval: 30_000,
  });

  const stats = statsData?.stats;
  const recentCampaigns = (campaignsData?.campaigns ?? []).slice(0, 6);
  const connectedPhone = phoneData?.numbers?.[0];

  const statCards = [
    {
      label: 'Total Sent',
      value: stats?.totalSent ?? 0,
      icon: Send,
      color: 'bg-blue-500',
      light: 'bg-blue-50',
    },
    {
      label: 'Delivered',
      value: stats?.totalDelivered ?? 0,
      icon: CheckCircle2,
      color: 'bg-green-500',
      light: 'bg-green-50',
    },
    {
      label: 'Read',
      value: stats?.totalRead ?? 0,
      icon: MessageSquare,
      color: 'bg-purple-500',
      light: 'bg-purple-50',
    },
    {
      label: 'Failed',
      value: stats?.totalFailed ?? 0,
      icon: XCircle,
      color: 'bg-red-500',
      light: 'bg-red-50',
    },
  ];

  const statusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED': return 'bg-green-100 text-green-700';
      case 'SENDING': return 'bg-blue-100 text-blue-700';
      case 'SCHEDULED': return 'bg-yellow-100 text-yellow-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  // Build a simple chart from recent campaigns
  const chartData = recentCampaigns.slice().reverse().map(c => ({
    date: new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    sent: c.stats.sent,
    delivered: c.stats.delivered,
    read: c.stats.read,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 border border-primary/10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome Back, {user?.businessName ?? 'there'} 👋
          </h1>
          <p className="text-gray-600">
            {user?.metaWabaConnected
              ? 'Your WhatsApp Business API is connected and ready to send messages.'
              : 'Connect your WhatsApp Business Account to start sending messages.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white text-gray-700 font-medium rounded-lg border shadow-sm hover:bg-gray-50">
            Schedule Demo
          </button>
        </div>
      </div>

      {/* WhatsApp connection status */}
      {!user?.metaWabaConnected ? (
        <div className="bg-white rounded-xl border border-amber-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">WhatsApp connection</p>
            <h2 className="text-lg font-bold text-gray-900 mt-1">Not connected yet</h2>
            <p className="text-sm text-gray-600 mt-1">Connect your WhatsApp Business Account to start sending messages.</p>
          </div>
          <button
            onClick={launchFbSignup}
            disabled={fbConnecting}
            className="shrink-0 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg shadow-sm hover:bg-[#1877F2]/90 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {fbConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
            {fbConnecting ? 'Connecting…' : 'Connect Facebook'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-green-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-500">WhatsApp connection</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <h2 className="text-lg font-bold text-gray-900">
                  {phoneLoading ? 'Loading status…' : (connectedPhone?.status || 'CONNECTED')}
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <p className="text-gray-500">Quality Rating</p>
                <p className="font-semibold text-gray-900">{phoneLoading ? '—' : (connectedPhone?.quality || '—')}</p>
              </div>
              <div>
                <p className="text-gray-500">Tier / Quota</p>
                <p className="font-semibold text-gray-900">{phoneLoading ? '—' : (connectedPhone?.messagingTier || '—')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Checklist */}
      {showChecklist && (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Getting Started</h2>
            <button onClick={() => setShowChecklist(false)} className="text-sm text-gray-500 hover:text-gray-700">
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { done: true, title: 'Connect Number', desc: 'WhatsApp API linked' },
              { done: false, title: 'Create Template', desc: 'Get your first template approved' },
              { done: false, title: 'Add Contacts', desc: 'Import your audience' },
              { done: false, title: 'Launch Campaign', desc: 'Send your first message' },
            ].map((item, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border ${item.done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
              >
                <CheckCircle2 className={`w-6 h-6 mb-2 ${item.done ? 'text-green-600' : 'text-gray-300'}`} />
                <h3 className="font-medium text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${card.light}`}>
              <card.icon className={`w-6 h-6 ${card.color.replace('bg-', 'text-')}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">{card.label}</p>
              {statsLoading ? (
                <div className="h-7 w-16 bg-gray-100 rounded animate-pulse mt-1" />
              ) : (
                <h3 className="text-2xl font-bold text-gray-900">{card.value.toLocaleString()}</h3>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Credit Balance Pill */}
      <div className="flex items-center gap-3 bg-white border rounded-xl p-4">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
          <BarChart2 className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-500">Credit Balance</p>
          <p className="font-bold text-gray-900">{(user?.creditBalance ?? 0).toLocaleString()} credits</p>
        </div>
        <a href="/wa-pay" className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
          Top up <ArrowRight className="w-3 h-3" />
        </a>
      </div>

      {/* Trend Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Message Trends</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2} dot={false} name="Sent" />
              <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} name="Delivered" />
              <Line type="monotone" dataKey="read" stroke="#a855f7" strokeWidth={2} dot={false} name="Read" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Campaigns Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Recent Campaigns</h2>
          <button
            onClick={() => { refetchStats(); refetchCampaigns(); }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {campaignsLoading ? (
          <div className="flex justify-center items-center h-32 text-gray-300">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : recentCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Users className="w-8 h-8" />
            <p className="text-sm font-medium text-gray-500">No campaigns yet</p>
            <a href="/create-campaign" className="text-xs text-primary hover:underline">
              Create your first campaign →
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 border-b">
                <tr>
                  <th className="px-5 py-3 font-medium">Campaign Name</th>
                  <th className="px-5 py-3 font-medium">Template</th>
                  <th className="px-5 py-3 font-medium">Sent</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-900">
                {recentCampaigns.map(camp => (
                  <tr key={camp.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{camp.name}</td>
                    <td className="px-5 py-4 text-gray-600">{camp.templateName ?? '—'}</td>
                    <td className="px-5 py-4">{camp.stats.sent > 0 ? camp.stats.sent.toLocaleString() : '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor(camp.status)}`}>
                        {camp.status.charAt(0) + camp.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Download APK Card */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Download Airavata Mobile App</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                {['Manage conversations on the go', 'Instant notification for new messages', 'Launch campaigns from anywhere'].map(b => (
                  <li key={b} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            onClick={() => toast.info('APK download will be available soon')}
            className="px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 whitespace-nowrap flex items-center gap-2 shrink-0"
          >
            <PlayCircle className="w-4 h-4" /> Download APK
          </button>
        </div>
      </div>
    </div>
  );
}
