import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowRight, BarChart3, Bot, CheckCircle2, ChevronRight,
  CircleAlert, Clock3, MessageCircle, MessageSquareReply, RefreshCw,
  Send, Smartphone, Users, XCircle, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useFacebookEmbeddedSignup } from '@/hooks/use-facebook-embedded-signup';

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

interface TemplateRecord {
  id: string;
  name: string;
  status: string;
  category?: string;
  language?: string;
  createdAt?: string;
}

interface Conversation {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
  status: string;
}

interface ChatbotFlow {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  analytics?: { triggered: number; completed: number };
}

const fmt = (value: number) => value.toLocaleString();
const pct = (value: number, total: number) => total > 0 ? `${Math.round((value / total) * 100)}%` : '—';

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Send;
  tone: 'blue' | 'green' | 'violet' | 'red' | 'amber' | 'teal';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-gray-500">{detail}</p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
  action,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      {action ?? (href && (
        <a href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          View all <ArrowRight className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const style = normalized === 'APPROVED' || normalized === 'PUBLISHED' || normalized === 'COMPLETED'
    ? 'bg-green-50 text-green-700'
    : normalized === 'REJECTED' || normalized === 'FAILED'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${style}`}>{status.toLowerCase().replace(/^\w/, c => c.toUpperCase())}</span>;
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { launch: launchFbSignup, isConnecting: fbConnecting } = useFacebookEmbeddedSignup();
  const [showConnection, setShowConnection] = useState(true);

  useEffect(() => {
    void refreshUser();
    const onFocus = () => void refreshUser();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
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
  const { data: templatesData, isLoading: templatesLoading } = useQuery<{ templates: TemplateRecord[] }>({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates'),
    refetchInterval: 60_000,
  });
  const { data: conversationsData, isLoading: conversationsLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ['dashboard-conversations'],
    queryFn: () => api.get('/conversations'),
    refetchInterval: 30_000,
  });
  const { data: flowsData, isLoading: flowsLoading } = useQuery<{ flows: ChatbotFlow[] }>({
    queryKey: ['dashboard-chatbot-flows'],
    queryFn: () => api.get('/chatbot/flows'),
    refetchInterval: 60_000,
  });

  const stats = statsData?.stats;
  const campaigns = campaignsData?.campaigns ?? [];
  const templates = templatesData?.templates ?? [];
  const conversations = conversationsData?.conversations ?? [];
  const flows = flowsData?.flows ?? [];
  const connectedPhone = phoneData?.numbers?.[0];

  const activeChats = conversations.filter(c => c.status.toLowerCase() === 'open').length;
  const customerReplies = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0);
  const approvedTemplates = templates.filter(t => t.status.toUpperCase() === 'APPROVED').length;
  const activeCampaigns = campaigns.filter(c => ['SENDING', 'SCHEDULED'].includes(c.status.toUpperCase())).length;
  const liveChatbots = flows.filter(f => f.status.toUpperCase() === 'PUBLISHED').length;
  const recentCampaigns = campaigns.slice(0, 5);
  const recentTemplates = templates.slice(0, 4);
  const recentConversations = conversations.slice(0, 4);
  const recentFlows = flows.slice(0, 4);

  const deliveryRate = pct(stats?.totalDelivered ?? 0, stats?.totalSent ?? 0);
  const readRate = pct(stats?.totalRead ?? 0, stats?.totalDelivered ?? 0);
  const failureRate = pct(stats?.totalFailed ?? 0, stats?.totalSent ?? 0);

  const refreshAll = async () => {
    await Promise.all([refetchStats(), refetchCampaigns(), refreshUser()]);
    toast.success('Dashboard refreshed');
  };

  const isLoading = statsLoading || campaignsLoading;

  return (
    <div className="h-full overflow-y-auto bg-[#f7f9fb]">
      <div className="mx-auto max-w-[1440px] space-y-6 p-5 lg:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Workspace overview</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Good to see you, {user?.businessName ?? 'there'}</h1>
            <p className="mt-1 text-sm text-gray-500">A clear view of your WhatsApp activity and automation health.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshAll} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <a href="/create-campaign" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90">
              <Send className="h-3.5 w-3.5" /> Create campaign
            </a>
          </div>
        </div>

        {showConnection && !user?.metaWabaConnected && (
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-white p-2 text-amber-600"><CircleAlert className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-bold text-gray-900">Connect WhatsApp Business</p>
                <p className="mt-1 text-xs text-gray-600">Connect a number to unlock sending, delivery analytics, templates, and live conversations.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowConnection(false)} className="text-xs font-medium text-gray-500 hover:text-gray-700">Dismiss</button>
              <button onClick={launchFbSignup} disabled={fbConnecting} className="rounded-lg bg-[#1877F2] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                {fbConnecting ? 'Connecting…' : 'Connect Facebook'}
              </button>
            </div>
          </div>
        )}

        {user?.metaWabaConnected && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-green-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 ring-4 ring-green-100" />
              <div>
                <p className="text-xs text-gray-500">WhatsApp connection</p>
                <p className="text-sm font-bold text-gray-900">{phoneLoading ? 'Checking status…' : connectedPhone?.status || 'Connected'}</p>
              </div>
            </div>
            <div className="flex gap-6 text-xs">
              <div><p className="text-gray-500">Quality</p><p className="mt-1 font-semibold text-gray-900">{connectedPhone?.quality || '—'}</p></div>
              <div><p className="text-gray-500">Messaging tier</p><p className="mt-1 font-semibold text-gray-900">{connectedPhone?.messagingTier || '—'}</p></div>
              <div><p className="text-gray-500">Number</p><p className="mt-1 font-semibold text-gray-900">{connectedPhone?.number || '—'}</p></div>
            </div>
          </div>
        )}

        <section>
          <SectionHeading eyebrow="Messaging performance" title="Delivery overview" href="/campaigns-report" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Sent" value={isLoading ? '—' : fmt(stats?.totalSent ?? 0)} detail="Messages sent from campaigns" icon={Send} tone="blue" />
            <MetricCard label="Delivered" value={isLoading ? '—' : fmt(stats?.totalDelivered ?? 0)} detail={`${deliveryRate} delivery rate`} icon={CheckCircle2} tone="green" />
            <MetricCard label="Read" value={isLoading ? '—' : fmt(stats?.totalRead ?? 0)} detail={`${readRate} of delivered messages`} icon={MessageCircle} tone="violet" />
            <MetricCard label="Failed" value={isLoading ? '—' : fmt(stats?.totalFailed ?? 0)} detail={`${failureRate} failure rate`} icon={XCircle} tone="red" />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Customer activity" title="Conversation health" href="/live-chat" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Active chats" value={conversationsLoading ? '—' : fmt(activeChats)} detail="Open conversations needing attention" icon={MessageCircle} tone="teal" />
            <MetricCard label="Customer replies" value={conversationsLoading ? '—' : fmt(customerReplies)} detail="Unread inbound messages" icon={MessageSquareReply} tone="amber" />
            <MetricCard label="Total conversations" value={conversationsLoading ? '—' : fmt(conversations.length)} detail="Contacts with message history" icon={Users} tone="blue" />
            <MetricCard label="Campaigns run" value={fmt(stats?.campaignCount ?? campaigns.length)} detail="All-time campaign count" icon={BarChart3} tone="violet" />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionHeading eyebrow="Recent activity" title="Campaign performance" href="/campaigns-report" />
            {campaignsLoading ? <div className="h-32 animate-pulse rounded-lg bg-gray-50" /> : recentCampaigns.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 text-center">
                <BarChart3 className="h-6 w-6 text-gray-300" />
                <p className="mt-2 text-xs font-semibold text-gray-600">No campaigns yet</p>
                <a href="/create-campaign" className="mt-1 text-xs text-primary hover:underline">Create your first campaign</a>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-400">
                    <tr><th className="pb-3 font-semibold">Campaign</th><th className="pb-3 font-semibold">Sent</th><th className="pb-3 font-semibold">Delivered</th><th className="pb-3 font-semibold">Read</th><th className="pb-3 text-right font-semibold">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentCampaigns.map(c => (
                      <tr key={c.id}>
                        <td className="max-w-[190px] truncate py-3 pr-3 font-semibold text-gray-800">{c.name}</td>
                        <td className="py-3 text-gray-600">{fmt(c.stats.sent)}</td>
                        <td className="py-3 text-gray-600">{fmt(c.stats.delivered)}</td>
                        <td className="py-3 text-gray-600">{fmt(c.stats.read)}</td>
                        <td className="py-3 text-right"><StatusPill status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionHeading eyebrow="Live chat" title="Latest customer replies" href="/live-chat" />
            {conversationsLoading ? <div className="h-32 animate-pulse rounded-lg bg-gray-50" /> : recentConversations.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-500">No conversation activity yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentConversations.map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{c.contactName.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-gray-800">{c.contactName}</p>{c.unread > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>}</div>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">{c.lastMessage || 'No message preview'}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section>
          <SectionHeading eyebrow="Automation workspace" title="Templates, campaigns and chatbots" />
          <div className="grid gap-4 lg:grid-cols-3">
            <ResourceCard title="Active templates" count={approvedTemplates} total={templates.length} detail="Approved and ready to send" icon={Zap} tone="green" href="/manage-templates">
              {templatesLoading ? <div className="h-16 animate-pulse rounded-lg bg-gray-50" /> : recentTemplates.length === 0 ? <EmptyResource text="No templates created yet" href="/add-template" action="Add template" /> : recentTemplates.slice(0, 3).map(t => <ResourceRow key={t.id} name={t.name} meta={t.category || 'WhatsApp template'} status={t.status} />)}
            </ResourceCard>
            <ResourceCard title="Campaigns" count={activeCampaigns} total={campaigns.length} detail="Currently running or scheduled" icon={BarChart3} tone="blue" href="/campaigns-report">
              {campaignsLoading ? <div className="h-16 animate-pulse rounded-lg bg-gray-50" /> : recentCampaigns.length === 0 ? <EmptyResource text="No campaigns created yet" href="/create-campaign" action="Create campaign" /> : recentCampaigns.slice(0, 3).map(c => <ResourceRow key={c.id} name={c.name} meta={`${fmt(c.stats.sent)} sent`} status={c.status} />)}
            </ResourceCard>
            <ResourceCard title="Chatbots" count={liveChatbots} total={flows.length} detail="Published flows handling conversations" icon={Bot} tone="violet" href="/chatbot">
              {flowsLoading ? <div className="h-16 animate-pulse rounded-lg bg-gray-50" /> : recentFlows.length === 0 ? <EmptyResource text="No chatbot flows created yet" href="/chatbot" action="Build a chatbot" /> : recentFlows.slice(0, 3).map(f => <ResourceRow key={f.id} name={f.name} meta={`${fmt(f.analytics?.triggered ?? 0)} triggered`} status={f.status} />)}
            </ResourceCard>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionHeading eyebrow="Account usage" title="Messaging health" />
            <div className="grid gap-4 sm:grid-cols-3">
              <HealthItem label="Delivery rate" value={deliveryRate} progress={stats?.totalSent ? (stats.totalDelivered / stats.totalSent) * 100 : 0} tone="green" />
              <HealthItem label="Read rate" value={readRate} progress={stats?.totalDelivered ? (stats.totalRead / stats.totalDelivered) * 100 : 0} tone="violet" />
              <HealthItem label="Failure rate" value={failureRate} progress={stats?.totalSent ? (stats.totalFailed / stats.totalSent) * 100 : 0} tone="red" />
            </div>
          </section>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionHeading eyebrow="Credits" title="Available balance" href="/wa-pay" />
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-3xl font-bold text-gray-900">{fmt(user?.creditBalance ?? 0)}</p><p className="mt-1 text-xs text-gray-500">credits available for outbound messaging</p></div>
              <a href="/wa-pay" className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800">Manage balance</a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({ title, count, total, detail, icon: Icon, tone, href, children }: {
  title: string; count: number; total: number; detail: string; icon: typeof Zap; tone: 'green' | 'blue' | 'violet'; href: string; children: React.ReactNode;
}) {
  const colors = { green: 'bg-green-50 text-green-600', blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600' };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-gray-900">{title}</h3><p className="text-[11px] text-gray-500">{detail}</p></div></div>
        <a href={href} className="text-gray-400 hover:text-primary"><ArrowRight className="h-4 w-4" /></a>
      </div>
      <div className="mt-4 flex items-end gap-2"><span className="text-2xl font-bold text-gray-900">{count}</span><span className="pb-0.5 text-xs text-gray-400">of {total} total</span></div>
      <div className="mt-4 space-y-1">{children}</div>
    </div>
  );
}

function ResourceRow({ name, meta, status }: { name: string; meta: string; status: string }) {
  return <div className="flex items-center justify-between gap-3 border-t border-gray-100 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-semibold text-gray-800">{name}</p><p className="mt-0.5 text-[10px] text-gray-500">{meta}</p></div><StatusPill status={status} /></div>;
}

function EmptyResource({ text, href, action }: { text: string; href: string; action: string }) {
  return <div className="border-t border-dashed border-gray-200 py-4"><p className="text-[11px] text-gray-500">{text}</p><a href={href} className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline">{action} <ArrowRight className="inline h-3 w-3" /></a></div>;
}

function HealthItem({ label, value, progress, tone }: { label: string; value: string; progress: number; tone: 'green' | 'violet' | 'red' }) {
  const color = { green: 'bg-green-500', violet: 'bg-violet-500', red: 'bg-red-500' }[tone];
  return <div><div className="flex items-center justify-between text-xs"><span className="text-gray-500">{label}</span><span className="font-bold text-gray-900">{value}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div></div>;
}