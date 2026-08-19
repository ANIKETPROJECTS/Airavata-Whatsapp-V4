import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowRight, BarChart3, Bot, CheckCircle2, ChevronRight,
  CircleAlert, MessageCircle, MessageSquareReply, Send, Users, XCircle, Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useFacebookEmbeddedSignup } from '@/hooks/use-facebook-embedded-signup';
import facebookIcon from '@assets/facebook_(1)_1787158279371.png';
import verifiedIcon from '@assets/social-media_1787158389051.png';
import sentCardIcon from '@assets/send_(1)_1787159297533.png';
import messageCardIcon from '@assets/message_1787158795063.png';
import viewCardIcon from '@assets/view_1787158851964.png';
import reportCardIcon from '@assets/report_1787158875535.png';

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
  stats: { totalRecipients?: number; sent: number; delivered: number; read: number; failed: number };
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

interface ContactsSummary {
  total: number;
}

interface ChatbotFlow {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  analytics?: {
    triggered?: number;
    completed?: number;
    dropped?: number;
    completionRate?: number;
  };
}

const fmt = (value: number) => value.toLocaleString();
const fmtCompact = (value: number) => value >= 1000
  ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
  : String(value);
const pct = (value: number, total: number) => total > 0 ? `${Math.round((value / total) * 100)}%` : '—';
const formatConversationTime = (value: string) => value
  ? new Date(value).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
const campaignTargeted = (campaign: Campaign) => campaign.stats.totalRecipients ?? campaign.stats.sent + campaign.stats.failed;
const campaignCompletion = (campaign: Campaign) => pct(campaign.stats.sent, campaignTargeted(campaign));
const campaignSuccess = (campaign: Campaign) => {
  const targeted = campaignTargeted(campaign);
  return pct(Math.min(campaign.stats.delivered, targeted), targeted);
};

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  iconSrc,
  hideIcon,
  large,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Send;
  iconSrc?: string;
  large?: boolean;
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
    <div className="rounded-none border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={large ? 'text-sm font-semibold text-gray-800' : 'text-xs font-medium text-gray-800'}>{label}</p>
          <p className={large ? 'mt-2 text-3xl font-bold tracking-tight text-black' : 'mt-2 text-2xl font-bold tracking-tight text-black'}>{value}</p>
        </div>
        {hideIcon ? null : iconSrc ? (
          <img src={iconSrc} alt="" className="h-8 w-8 shrink-0 object-contain" />
        ) : (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
      </div>
      <p className={large ? 'mt-3 text-xs text-gray-800' : 'mt-3 text-[11px] text-gray-800'}>{detail}</p>
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
        <h2 className="text-base font-bold text-black">{title}</h2>
      </div>
      {action ?? (href && (
        <a href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          View all <ArrowRight className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}

function StatusPill({ status, large = false }: { status: string; large?: boolean }) {
  const normalized = status.toUpperCase();
  const style = normalized === 'COMPLETED'
    ? 'bg-green-500 text-white'
    : normalized === 'APPROVED' || normalized === 'PUBLISHED'
      ? 'bg-green-50 text-green-700'
    : normalized === 'REJECTED' || normalized === 'FAILED'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2.5 py-1 ${large ? 'text-xs' : 'text-[10px]'} font-semibold ${style}`}>{status.toLowerCase().replace(/^\w/, c => c.toUpperCase())}</span>;
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { launch: launchFbSignup, isConnecting: fbConnecting } = useFacebookEmbeddedSignup();

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
  const { data: statsData, isLoading: statsLoading } = useQuery<{ stats: CampaignStats }>({
    queryKey: ['campaigns-stats'],
    queryFn: () => api.get('/campaigns/stats/summary'),
    refetchInterval: 30_000,
  });
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ campaigns: Campaign[] }>({
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
  const { data: contactsData, isLoading: contactsLoading } = useQuery<ContactsSummary>({
    queryKey: ['dashboard-contacts-summary'],
    queryFn: () => api.get('/contacts?limit=1'),
    refetchInterval: 60_000,
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
  const contactTotal = contactsData?.total ?? 0;

  const activeChats = conversations.filter(c => c.status.toLowerCase() === 'open').length;
  const customerReplies = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0);
  const approvedTemplates = templates.filter(t => t.status.toUpperCase() === 'APPROVED').length;
  const activeCampaigns = campaigns.filter(c => ['SENDING', 'SCHEDULED'].includes(c.status.toUpperCase())).length;
  const liveChatbots = flows.filter(f => f.status.toUpperCase() === 'PUBLISHED').length;
  const recentCampaigns = campaigns.slice(0, 8);
  const recentTemplates = templates.slice(0, 4);
  const recentConversations = conversations.slice(0, 10);
  const recentFlows = flows.slice(0, 4);
  const totalFlowTriggered = flows.reduce((sum, flow) => sum + (flow.analytics?.triggered ?? 0), 0);
  const totalFlowCompleted = flows.reduce((sum, flow) => sum + (flow.analytics?.completed ?? 0), 0);
  const totalFlowDropped = flows.reduce(
    (sum, flow) => sum + (flow.analytics?.dropped ?? Math.max(0, (flow.analytics?.triggered ?? 0) - (flow.analytics?.completed ?? 0))),
    0,
  );
  const flowCompletionRate = pct(totalFlowCompleted, totalFlowTriggered);

  const deliveryRate = pct(stats?.totalDelivered ?? 0, stats?.totalSent ?? 0);
  const readRate = pct(stats?.totalRead ?? 0, stats?.totalDelivered ?? 0);
  const failureRate = pct(stats?.totalFailed ?? 0, stats?.totalSent ?? 0);

  const isLoading = statsLoading || campaignsLoading;

  return (
    <div className="h-full overflow-y-auto bg-white text-black">
      <div className="mx-auto max-w-[1440px] space-y-6 p-5 lg:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Workspace overview</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-black">Good to see you, {user?.businessName ?? 'there'}</h1>
            <p className="mt-1 text-sm text-gray-800">A clear view of your WhatsApp activity and automation health.</p>
          </div>
          <div className="flex items-center">
            {user?.metaWabaConnected ? (
              <div className="inline-flex items-center gap-2.5 border border-blue-100 bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-sm">
                <img src={facebookIcon} alt="Facebook" className="h-7 w-7 object-contain" />
                <img src={verifiedIcon} alt="Verified" className="h-7 w-7 object-contain" />
                <span>Connected &amp; verified</span>
              </div>
            ) : (
              <button
                onClick={launchFbSignup}
                disabled={fbConnecting}
                className="inline-flex items-center gap-2.5 border border-blue-100 bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-sm hover:bg-blue-50 disabled:opacity-60"
              >
                <img src={facebookIcon} alt="Facebook" className="h-7 w-7 object-contain" />
                <span>{fbConnecting ? 'Connecting…' : 'Connect Facebook'}</span>
              </button>
            )}
          </div>
        </div>

        {user?.metaWabaConnected && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-none border border-green-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 ring-4 ring-green-100" />
              <div>
                <p className="text-xs text-gray-800">WhatsApp connection</p>
                <p className="text-sm font-bold text-black">{phoneLoading ? 'Checking status…' : connectedPhone?.status || 'Connected'}</p>
              </div>
            </div>
            <div className="flex gap-6 text-xs">
              <div><p className="text-gray-800">Quality</p><p className="mt-1 font-semibold text-black">{connectedPhone?.quality || '—'}</p></div>
              <div><p className="text-gray-800">Messaging tier</p><p className="mt-1 font-semibold text-black">{connectedPhone?.messagingTier || '—'}</p></div>
              <div><p className="text-gray-800">Number</p><p className="mt-1 font-semibold text-black">{connectedPhone?.number || '—'}</p></div>
            </div>
          </div>
        )}

        <section>
          <SectionHeading eyebrow="Messaging performance" title="Delivery overview" href="/campaigns-report" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Sent" value={isLoading ? '—' : fmt(stats?.totalSent ?? 0)} detail="Messages sent from campaigns" icon={Send} iconSrc={sentCardIcon} large tone="blue" />
            <MetricCard label="Delivered" value={isLoading ? '—' : fmt(stats?.totalDelivered ?? 0)} detail={`${deliveryRate} delivery rate`} icon={CheckCircle2} iconSrc={messageCardIcon} large tone="green" />
            <MetricCard label="Read" value={isLoading ? '—' : fmt(stats?.totalRead ?? 0)} detail={`${readRate} of delivered messages`} icon={MessageCircle} iconSrc={viewCardIcon} large tone="violet" />
            <MetricCard label="Failed" value={isLoading ? '—' : fmt(stats?.totalFailed ?? 0)} detail={`${failureRate} failure rate`} icon={XCircle} iconSrc={reportCardIcon} large tone="red" />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Customer activity" title="Conversation health" href="/live-chat" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Total contacts" value={contactsLoading ? '—' : fmt(contactTotal)} detail="Contacts in your workspace" icon={Users} hideIcon large tone="blue" />
            <MetricCard label="Active chats" value={conversationsLoading ? '—' : fmt(activeChats)} detail="Chats needing attention" icon={MessageCircle} hideIcon large tone="teal" />
            <MetricCard label="Customer replies" value={conversationsLoading ? '—' : fmt(customerReplies)} detail="Unread inbound messages" icon={MessageSquareReply} hideIcon large tone="amber" />
            <MetricCard label="Total conversations" value={conversationsLoading ? '—' : fmt(conversations.length)} detail="Contacts with message history" icon={Users} hideIcon large tone="blue" />
            <MetricCard label="Campaigns run" value={fmt(stats?.campaignCount ?? campaigns.length)} detail="All-time campaign count" icon={BarChart3} hideIcon large tone="violet" />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Recent activity" title="Campaign performance" href="/campaigns-report" />
          <div className="rounded-none border border-gray-200 bg-white p-5 shadow-sm">
            {campaignsLoading ? <div className="h-40 animate-pulse bg-gray-50" /> : recentCampaigns.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center border border-dashed border-gray-200 text-center">
                <BarChart3 className="h-6 w-6 text-gray-300" />
                <p className="mt-2 text-sm font-semibold text-gray-800">No campaigns yet</p>
                <a href="/create-campaign" className="mt-1 text-sm text-primary hover:underline">Create your first campaign</a>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] table-fixed text-[15px]">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[12%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="pb-3 text-center font-semibold">Campaign</th>
                    <th className="pb-3 text-center font-semibold">Date</th>
                    <th className="pb-3 text-center font-semibold">Targeted</th>
                    <th className="pb-3 text-center font-semibold">Sent</th>
                    <th className="pb-3 text-center font-semibold">Delivered</th>
                    <th className="pb-3 text-center font-semibold">Read</th>
                    <th className="pb-3 text-center font-semibold">Failed</th>
                    <th className="pb-3 text-center font-semibold">Completed</th>
                    <th className="pb-3 text-center font-semibold">Success ratio</th>
                    <th className="pb-3 text-center font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentCampaigns.map(c => (
                    <tr key={c.id}>
                      <td className="max-w-[220px] truncate py-4 pr-4 text-center font-semibold text-black">{c.name}</td>
                      <td className="whitespace-nowrap py-4 text-center text-gray-800">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="py-4 text-center font-semibold text-black">{fmtCompact(campaignTargeted(c))}</td>
                      <td className="py-4 text-center text-gray-800">{fmtCompact(c.stats.sent)}</td>
                      <td className="py-4 text-center text-gray-800">{fmtCompact(c.stats.delivered)}</td>
                      <td className="py-4 text-center text-gray-800">{fmtCompact(c.stats.read)}</td>
                      <td className="py-4 text-center font-semibold text-red-700">{fmtCompact(c.stats.failed)}</td>
                      <td className="py-4 text-center font-semibold text-black">{campaignCompletion(c)}</td>
                      <td className="py-4 text-center font-semibold text-black">{campaignSuccess(c)}</td>
                      <td className="py-4 text-center"><StatusPill status={c.status} large /></td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Live chat" title="Latest customer replies" href="/live-chat" />
          <div className="rounded-none border border-gray-200 bg-white p-5 shadow-sm">
            {conversationsLoading ? <div className="h-40 animate-pulse bg-gray-50" /> : recentConversations.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center border border-dashed border-gray-200 text-sm text-gray-800">No conversation activity yet</div>
            ) : (
              <div className="grid gap-x-8 divide-y divide-gray-100 md:grid-cols-2 md:divide-y-0">
                {recentConversations.map(c => (
                  <div key={c.id} className="flex items-center gap-4 border-b border-gray-100 py-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">{c.contactName.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-base font-semibold text-black">{c.contactName}</p>
                        {c.unread > 0 && <span className="bg-primary px-2.5 py-1 text-sm font-bold text-white">{c.unread}</span>}
                      </div>
                      <p className="mt-1 truncate text-base text-gray-800">{c.lastMessage || 'No message preview'}</p>
                      <p className="mt-1 text-sm font-medium text-gray-600">{formatConversationTime(c.lastMessageAt)}</p>
                    </div>
                    <a
                      href={`/live-chat?conversationId=${encodeURIComponent(c.id)}`}
                      aria-label={`Open chat with ${c.contactName}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-gray-900 transition-colors hover:bg-gray-100"
                    >
                      <ChevronRight className="h-6 w-6 stroke-[2.5]" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

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

        <section className="rounded-none border border-gray-200 bg-white p-5 shadow-sm">
          <SectionHeading eyebrow="Automation analytics" title="Flow performance and responses" href="/chatbot" />
          {flowsLoading ? (
            <div className="h-32 animate-pulse rounded-lg bg-gray-50" />
          ) : flows.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 text-center">
              <Bot className="h-6 w-6 text-gray-300" />
              <p className="mt-2 text-xs font-semibold text-gray-800">No chatbot flow data yet</p>
              <a href="/chatbot" className="mt-1 text-xs text-primary hover:underline">Build your first flow</a>
            </div>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Triggered" value={fmt(totalFlowTriggered)} detail="Flow starts" icon={Bot} tone="violet" />
                <MetricCard label="Completed" value={fmt(totalFlowCompleted)} detail="Successful completions" icon={CheckCircle2} tone="green" />
                <MetricCard label="Dropped" value={fmt(totalFlowDropped)} detail="Started but not completed" icon={CircleAlert} tone="amber" />
                <MetricCard label="Completion rate" value={flowCompletionRate} detail="Completed of triggered" icon={Activity} tone="teal" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="pb-3 font-semibold">Flow</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold">Triggered</th>
                      <th className="pb-3 font-semibold">Completed</th>
                      <th className="pb-3 font-semibold">Dropped</th>
                      <th className="pb-3 text-right font-semibold">Completion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {flows.slice(0, 8).map(flow => {
                      const triggered = flow.analytics?.triggered ?? 0;
                      const completed = flow.analytics?.completed ?? 0;
                      const dropped = flow.analytics?.dropped ?? Math.max(0, triggered - completed);
                      return (
                        <tr key={flow.id}>
                          <td className="max-w-[220px] truncate py-3 pr-3 font-semibold text-gray-800">{flow.name}</td>
                          <td className="py-3"><StatusPill status={flow.status} /></td>
                          <td className="py-3 text-gray-800">{fmt(triggered)}</td>
                          <td className="py-3 text-gray-800">{fmt(completed)}</td>
                          <td className="py-3 text-gray-800">{fmt(dropped)}</td>
                          <td className="py-3 text-right font-semibold text-gray-800">{flow.analytics?.completionRate ?? (triggered > 0 ? Math.round((completed / triggered) * 100) : 0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="rounded-none border border-gray-200 bg-white p-5 shadow-sm">
            <SectionHeading eyebrow="Account usage" title="Messaging health" />
            <div className="grid gap-4 sm:grid-cols-3">
              <HealthItem label="Delivery rate" value={deliveryRate} progress={stats?.totalSent ? (stats.totalDelivered / stats.totalSent) * 100 : 0} tone="green" />
              <HealthItem label="Read rate" value={readRate} progress={stats?.totalDelivered ? (stats.totalRead / stats.totalDelivered) * 100 : 0} tone="violet" />
              <HealthItem label="Failure rate" value={failureRate} progress={stats?.totalSent ? (stats.totalFailed / stats.totalSent) * 100 : 0} tone="red" />
            </div>
          </section>
          <section className="rounded-none border border-gray-200 bg-white p-5 shadow-sm">
            <SectionHeading eyebrow="Credits" title="Available balance" href="/wa-pay" />
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-3xl font-bold text-black">{fmt(user?.creditBalance ?? 0)}</p><p className="mt-1 text-xs text-gray-800">credits available for outbound messaging</p></div>
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
    <div className="rounded-none border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-black">{title}</h3><p className="text-[11px] text-gray-800">{detail}</p></div></div>
        <a href={href} className="text-gray-400 hover:text-primary"><ArrowRight className="h-4 w-4" /></a>
      </div>
      <div className="mt-4 flex items-end gap-2"><span className="text-2xl font-bold text-black">{count}</span><span className="pb-0.5 text-xs text-gray-800">of {total} total</span></div>
      <div className="mt-4 space-y-1">{children}</div>
    </div>
  );
}

function ResourceRow({ name, meta, status }: { name: string; meta: string; status: string }) {
  return <div className="flex items-center justify-between gap-3 border-t border-gray-100 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-semibold text-black">{name}</p><p className="mt-0.5 text-[10px] text-gray-800">{meta}</p></div><StatusPill status={status} /></div>;
}

function EmptyResource({ text, href, action }: { text: string; href: string; action: string }) {
  return <div className="border-t border-dashed border-gray-200 py-4"><p className="text-[11px] text-gray-800">{text}</p><a href={href} className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline">{action} <ArrowRight className="inline h-3 w-3" /></a></div>;
}

function HealthItem({ label, value, progress, tone }: { label: string; value: string; progress: number; tone: 'green' | 'violet' | 'red' }) {
  const color = { green: 'bg-green-500', violet: 'bg-violet-500', red: 'bg-red-500' }[tone];
  return <div><div className="flex items-center justify-between text-xs"><span className="text-gray-800">{label}</span><span className="font-bold text-black">{value}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div></div>;
}