import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowDownAZ, ArrowUpAZ, BarChart3, CreditCard, FileBarChart, Grid2X2, LayoutDashboard, Link2Off, List, LogOut, PanelLeftClose, PanelLeftOpen, Plus, ReceiptText, Search, ShieldCheck, Trash2, UserRound, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { masterApi, masterTokenStorage } from '../lib/api';
import { useFacebookEmbeddedSignup } from '../hooks/use-facebook-embedded-signup';

const PERMISSIONS = [
  ['dashboard', 'Dashboard'], ['live-chat', 'Live Chat'], ['contacts', 'Contacts'],
  ['create-campaign', 'Create Campaign'], ['campaigns-report', 'Campaigns Report'],
  ['add-template', 'Add Template'], ['manage-templates', 'Manage Templates'],
  ['flow-builder', 'Flow Builder'], ['chatbot', 'Chatbot'], ['integration', 'Integration'],
  ['group', 'Groups'], ['catalogue', 'Catalogue'], ['wa-pay', 'WA Pay'],
  ['credits', 'Credits'], ['manage', 'Manage'], ['profile', 'Profile'],
] as const;

type ManagedUser = {
  id: string; businessName: string; email: string; phone?: string | null; timezone?: string;
  role: 'admin' | 'client'; active: boolean; permissions: string[]; creditBalance: number;
  createdAt: string; connection: { connected: boolean; wabaId?: string | null; phoneNumberId?: string | null };
};

type UserForm = {
  businessName: string; email: string; phone: string; password: string;
  role: 'client' | 'admin'; active: boolean; permissions: string[];
};

type CreditTransaction = {
  id: string; userId: string; user: { businessName: string; email: string } | null;
  type: string; amount: number; balanceAfter: number; description: string; createdAt: string;
};

type ViewMode = 'list' | 'grid';

function AdminToolbar({
  search,
  onSearch,
  searchPlaceholder,
  filter,
  onFilter,
  filterOptions,
  sort,
  onSort,
  sortOptions,
  viewMode,
  onViewMode,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  filter: string;
  onFilter: (value: string) => void;
  filterOptions: Array<[string, string]>;
  sort: string;
  onSort: (value: string) => void;
  sortOptions: Array<[string, string]>;
  viewMode: ViewMode;
  onViewMode: (value: ViewMode) => void;
}) {
  return <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 rounded-xl bg-slate-50 border p-3">
    <div className="relative flex-1 min-w-0"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input value={search} onChange={e => onSearch(e.target.value)} placeholder={searchPlaceholder} className="w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-emerald-500" /></div>
    <div className="flex flex-wrap items-center gap-2"><select value={filter} onChange={e => onFilter(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">{filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={sort} onChange={e => onSort(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">{sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="flex rounded-lg border bg-white p-0.5"><button type="button" onClick={() => onViewMode('list')} title="List view" className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}><List className="w-4 h-4" /></button><button type="button" onClick={() => onViewMode('grid')} title="Grid view" className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}><Grid2X2 className="w-4 h-4" /></button></div></div>
  </div>;
}

const blankForm: UserForm = {
  businessName: '', email: '', phone: '', password: '', role: 'client', active: true,
  permissions: PERMISSIONS.map(([value]) => value),
};

function MasterLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await masterApi.post<{ token: string }>('/master-admin/login', { email, password });
      masterTokenStorage.set(result.token);
      onLogin();
      navigate('/MasterAdmin/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign in');
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-7">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><ShieldCheck className="w-7 h-7" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Master Admin</h1><p className="text-sm text-slate-500">Airavata control center</p></div>
        </div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" required className="w-full rounded-lg border px-3 py-2.5 mb-4" />
        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" required className="w-full rounded-lg border px-3 py-2.5 mb-6" />
        <button disabled={busy} className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in securely'}</button>
      </form>
    </div>
  );
}

function DetailedAnalytics({ analytics, range, onRange }: { analytics: any; range: number; onRange: (value: number) => void }) {
  const daily = analytics?.dailyActivity ?? [];
  const maxDaily = Math.max(1, ...daily.map((item: any) => Math.max(item.purchased, item.used, item.adjustments)));
  const breakdown = analytics?.typeBreakdown ?? [];
  const totalBreakdown = Math.max(1, breakdown.reduce((sum: number, item: any) => sum + item.amount, 0));
  return <section className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Platform analytics</h2><p className="text-sm text-slate-500 mt-1">Detailed account, connection and credit performance.</p></div><select value={range} onChange={e => onRange(Number(e.target.value))} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></div>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{[['Total users', analytics?.users ?? '—'], ['Active users', analytics?.activeUsers ?? '—'], ['Inactive users', analytics?.inactiveUsers ?? '—'], ['Connected accounts', analytics?.connectedUsers ?? '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-white border p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    <div className="grid lg:grid-cols-3 gap-6"><section className="lg:col-span-2 rounded-xl bg-white border p-6"><div className="flex items-center justify-between"><div><h3 className="font-bold">Credit activity trend</h3><p className="text-sm text-slate-500 mt-1">Daily movement for the selected period.</p></div><div className="flex gap-3 text-xs"><span className="text-emerald-600">● Added</span><span className="text-blue-600">● Used</span><span className="text-amber-600">● Adjusted</span></div></div><div className="mt-6 h-64 flex items-end gap-1 border-b border-l px-2 pb-1">{daily.length ? daily.map((item: any) => <div key={item.date} className="flex-1 h-full flex items-end gap-0.5 group" title={`${item.date}: added ${item.purchased}, used ${item.used}, adjusted ${item.adjustments}`}><div className="flex-1 bg-emerald-400 rounded-t" style={{ height: `${Math.max(2, item.purchased / maxDaily * 100)}%` }} /><div className="flex-1 bg-blue-400 rounded-t" style={{ height: `${Math.max(2, item.used / maxDaily * 100)}%` }} /><div className="flex-1 bg-amber-400 rounded-t" style={{ height: `${Math.max(2, item.adjustments / maxDaily * 100)}%` }} /></div>) : <div className="w-full self-center text-center text-sm text-slate-400">No activity in this period.</div>}</div><div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>{daily[0]?.date ?? ''}</span><span>{daily[daily.length - 1]?.date ?? ''}</span></div></section><section className="rounded-xl bg-white border p-6"><h3 className="font-bold">Transaction mix</h3><p className="text-sm text-slate-500 mt-1">Amount by transaction type.</p><div className="mt-6 space-y-4">{breakdown.map((item: any) => <div key={item.type}><div className="flex justify-between text-sm mb-1"><span>{item.type}</span><span className="font-semibold">{item.amount.toLocaleString()}</span></div><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.amount / totalBreakdown * 100}%` }} /></div><p className="text-xs text-slate-400 mt-1">{item.transactions} transactions</p></div>)}{!breakdown.length && <p className="text-sm text-slate-400">No transactions in this period.</p>}</div></section></div>
    <div className="grid lg:grid-cols-3 gap-6"><section className="lg:col-span-2 rounded-xl bg-white border overflow-hidden"><div className="p-6 border-b"><h3 className="font-bold">Top users by usage</h3><p className="text-sm text-slate-500 mt-1">Accounts with the highest credit consumption in this period.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-6 py-3">Rank</th><th className="px-6 py-3">User</th><th className="px-6 py-3">Used</th><th className="px-6 py-3">Purchased</th><th className="px-6 py-3">Transactions</th></tr></thead><tbody className="divide-y">{(analytics?.topUsers ?? []).map((item: any, index: number) => <tr key={`${item.user}-${index}`}><td className="px-6 py-3 font-bold text-slate-400">#{index + 1}</td><td className="px-6 py-3"><p className="font-medium">{item.user}</p><p className="text-xs text-slate-500">{item.email}</p></td><td className="px-6 py-3 font-semibold">{item.used.toLocaleString()}</td><td className="px-6 py-3">{item.purchased.toLocaleString()}</td><td className="px-6 py-3">{item.transactions}</td></tr>)}</tbody></table>{!analytics?.topUsers?.length && <div className="p-8 text-center text-sm text-slate-400">No user activity in this period.</div>}</div></section><section className="rounded-xl bg-white border p-6"><h3 className="font-bold">Account health</h3><p className="text-sm text-slate-500 mt-1">Current workspace status.</p><div className="mt-5 space-y-5"><div><div className="flex justify-between text-sm"><span>Active accounts</span><span className="font-semibold">{analytics?.activeUsers ?? 0}</span></div><div className="mt-2 h-2 bg-slate-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${analytics?.users ? analytics.activeUsers / analytics.users * 100 : 0}%` }} /></div></div><div><div className="flex justify-between text-sm"><span>Connected accounts</span><span className="font-semibold">{analytics?.connectedUsers ?? 0}</span></div><div className="mt-2 h-2 bg-slate-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${analytics?.users ? analytics.connectedUsers / analytics.users * 100 : 0}%` }} /></div></div><div className="grid grid-cols-2 gap-3 pt-2"><div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Purchased</p><p className="text-xl font-bold text-emerald-900">{analytics?.credits?.purchased?.toLocaleString?.() ?? 0}</p></div><div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-blue-700">Used</p><p className="text-xl font-bold text-blue-900">{analytics?.credits?.used?.toLocaleString?.() ?? 0}</p></div></div></div></section></div>
    <section className="rounded-xl bg-white border overflow-hidden"><div className="p-6 border-b"><h3 className="font-bold">Recent platform activity</h3><p className="text-sm text-slate-500 mt-1">Latest credit events across all accounts.</p></div><div className="divide-y">{(analytics?.recentTransactions ?? []).map((item: any) => <div key={item.id} className="px-6 py-3 flex items-center justify-between gap-4 text-sm"><div><p className="font-medium">{item.user}</p><p className="text-xs text-slate-500">{item.description || item.type} · {new Date(item.createdAt).toLocaleString()}</p></div><span className="font-semibold">{item.amount.toLocaleString()} credits</span></div>)}</div></section>
  </section>;
}

function CreditTransactionsPanel({ users, transactions, visibleTransactions, transactionSearch, setTransactionSearch, transactionFilter, setTransactionFilter, transactionSort, setTransactionSort, transactionView, setTransactionView }: any) {
  const rows = visibleTransactions.filter((item: any) => !transactionFilter.userId || item.userId === transactionFilter.userId);
  return <section className="rounded-xl bg-white border overflow-hidden">
    <div className="p-6 border-b flex items-start gap-3"><ReceiptText className="w-6 h-6 text-emerald-600 mt-0.5" /><div><h2 className="text-xl font-bold">Credit transaction details</h2><p className="text-sm text-slate-500 mt-1">A dedicated audit trail for every purchase, deduction, refund and adjustment.</p></div></div>
    <div className="p-5 border-b space-y-3"><AdminToolbar search={transactionSearch} onSearch={setTransactionSearch} searchPlaceholder="Search by user or transaction reason…" filter={transactionFilter.type} onFilter={(value: string) => setTransactionFilter({...transactionFilter, type: value})} filterOptions={[['ALL', 'All types'], ['PURCHASE', 'Purchases'], ['ADJUSTMENT', 'Adjustments'], ['DEDUCTION', 'Deductions'], ['REFUND', 'Refunds']]} sort={transactionSort} onSort={setTransactionSort} sortOptions={[['newest', 'Newest first'], ['amount', 'Highest amount']]} viewMode={transactionView} onViewMode={setTransactionView} /><select value={transactionFilter.userId} onChange={e => setTransactionFilter({...transactionFilter, userId: e.target.value})} className="rounded-lg border px-3 py-2 text-sm"><option value="">All users</option>{users.map((user: any) => <option key={user.id} value={user.id}>{user.businessName}</option>)}</select></div>
    {transactionView === 'list' ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Date', 'User', 'Type', 'Amount', 'Balance after', 'Reason'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((item: any) => <tr key={item.id}><td className="px-5 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td><td className="px-5 py-3">{item.user?.businessName ?? 'Deleted user'}</td><td className="px-5 py-3">{item.type}</td><td className="px-5 py-3 font-semibold">{item.amount.toLocaleString()}</td><td className="px-5 py-3">{item.balanceAfter.toLocaleString()}</td><td className="px-5 py-3 text-slate-500">{item.description || '—'}</td></tr>)}</tbody></table>{!rows.length && <div className="p-8 text-center text-sm text-slate-500">No transactions match these filters.</div>}</div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">{rows.map((item: any) => <div key={item.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><span className="text-xs font-semibold text-slate-500">{item.type}</span><span className="font-bold">{item.amount.toLocaleString()} credits</span></div><p className="mt-3 font-semibold">{item.user?.businessName ?? 'Deleted user'}</p><p className="mt-1 text-xs text-slate-500">{item.description || 'No reason provided'}</p><p className="mt-4 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()} · Balance {item.balanceAfter.toLocaleString()}</p></div>)}</div>}
  </section>;
}

export default function MasterAdmin() {
  const [authenticated, setAuthenticated] = useState(Boolean(masterTokenStorage.get()));
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsRange, setAnalyticsRange] = useState(30);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [report, setReport] = useState<any>(null);
  const [rates, setRates] = useState({ authenticationRate: 1, utilityRate: 1, marketingRate: 1 });
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [transactionFilter, setTransactionFilter] = useState({ userId: '', type: 'ALL' });
  const [creditUser, setCreditUser] = useState<ManagedUser | null>(null);
  const [creditForm, setCreditForm] = useState({ direction: 'add', amount: '', description: '' });
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState('all');
  const [directorySort, setDirectorySort] = useState('newest');
  const [directoryView, setDirectoryView] = useState<ViewMode>('list');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionSort, setTransactionSort] = useState('newest');
  const [transactionView, setTransactionView] = useState<ViewMode>('list');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [form, setForm] = useState<UserForm>(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [location, navigate] = useLocation();
  const { launch: launchFacebookSignup, isConnecting: isConnectingFacebook } = useFacebookEmbeddedSignup(async () => {
    toast.success('Facebook / WhatsApp connection saved');
    await load();
  });
  const pathParts = location.split('/').filter(Boolean);
  const reportUserId = pathParts[1] === 'reports' && pathParts[2] ? pathParts[2] : null;
  const page = reportUserId ? 'reports' : (pathParts[1] ?? 'dashboard');
  const activePage = ['dashboard', 'users', 'credits', 'credit-transactions', 'connections', 'reports', 'analytics'].includes(page) ? page : 'dashboard';

  const load = async () => {
    setLoading(true);
    try {
      const [userResult, analyticsResult] = await Promise.all([
        masterApi.get<{ users: ManagedUser[] }>('/master-admin/users'),
        masterApi.get(`/master-admin/analytics?range=${analyticsRange}`),
      ]);
      setUsers(userResult.users); setAnalytics(analyticsResult);
      const rateResult = await masterApi.get<typeof rates>('/master-admin/credit-setting');
      setRates({ authenticationRate: rateResult.authenticationRate, utilityRate: rateResult.utilityRate, marketingRate: rateResult.marketingRate });
    } catch { masterTokenStorage.clear(); setAuthenticated(false); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (authenticated) void load(); }, [authenticated, analyticsRange]);
  const loadTransactions = async () => {
    const query = new URLSearchParams();
    if (transactionFilter.userId) query.set('userId', transactionFilter.userId);
    if (transactionFilter.type !== 'ALL') query.set('type', transactionFilter.type);
    const result = await masterApi.get<{ transactions: CreditTransaction[] }>(`/master-admin/credit-transactions?${query.toString()}`);
    setTransactions(result.transactions);
  };
  useEffect(() => {
    if (authenticated && ['credits', 'credit-transactions'].includes(activePage)) void loadTransactions().catch(() => undefined);
  }, [authenticated, activePage, transactionFilter.userId, transactionFilter.type]);

  const openCreate = () => { setSelected(null); setForm(blankForm); setShowForm(true); };
  const openEdit = (user: ManagedUser) => {
    setSelected(user);
    setForm({ businessName: user.businessName, email: user.email, phone: user.phone ?? '', password: '', role: user.role, active: user.active, permissions: user.permissions });
    setShowForm(true);
  };
  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const body = { ...form, ...(form.password ? {} : { password: undefined }) };
      if (selected) await masterApi.put(`/master-admin/users/${selected.id}`, body);
      else if (!form.password) { toast.error('Set a password for the new user'); return; }
      else await masterApi.post('/master-admin/users', body);
      toast.success(selected ? 'User updated' : 'User created'); setShowForm(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save user'); }
  };
  const removeUser = async (user: ManagedUser) => {
    if (!window.confirm(`Delete ${user.businessName}? This also removes their stored WhatsApp connection.`)) return;
    try { await masterApi.delete(`/master-admin/users/${user.id}`); toast.success('User deleted'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to delete user'); }
  };
  const toggleActive = async (user: ManagedUser) => {
    try { await masterApi.put(`/master-admin/users/${user.id}`, { active: !user.active }); toast.success(user.active ? 'Account deactivated' : 'Account activated'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update account'); }
  };
  const addCredits = async (user: ManagedUser) => {
    const raw = window.prompt(`Credits to add for ${user.businessName}`, '100');
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount < 1) return;
    try { await masterApi.post(`/master-admin/users/${user.id}/credits`, { amount }); toast.success('Credits added'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add credits'); }
  };
  const openCreditEditor = (user: ManagedUser) => {
    setCreditUser(user);
    setCreditForm({ direction: 'add', amount: '', description: '' });
  };
  const submitCreditAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    if (!creditUser) return;
    try {
      await masterApi.post(`/master-admin/users/${creditUser.id}/credits/adjust`, {
        direction: creditForm.direction,
        amount: Number(creditForm.amount),
        description: creditForm.description,
      });
      toast.success(creditForm.direction === 'add' ? 'Credits added' : 'Credits deducted');
      setCreditUser(null);
      await load();
      await loadTransactions();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to adjust credits'); }
  };
  const showReport = async (user: ManagedUser) => {
    setSelected(user);
    setReport(null);
    navigate(`/MasterAdmin/reports/${user.id}`);
  };
  const disconnect = async (user: ManagedUser) => {
    if (!window.confirm('Disconnect this user’s Facebook/WhatsApp connection?')) return;
    try { await masterApi.post(`/master-admin/users/${user.id}/disconnect`); toast.success('Connection disconnected'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to disconnect'); }
  };
  const saveRates = async () => {
    try {
      await masterApi.put('/master-admin/credit-setting', rates);
      toast.success('Credit rates updated');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update rates'); }
  };
  const signOut = () => { masterTokenStorage.clear(); setAuthenticated(false); navigate('/MasterAdmin'); };
  const goTo = (nextPage: string) => navigate(`/MasterAdmin/${nextPage}`);
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'credits', label: 'Credits & Rates', icon: CreditCard },
    { id: 'credit-transactions', label: 'Credit Transactions', icon: ReceiptText },
    { id: 'connections', label: 'Connections', icon: Link2Off },
    { id: 'reports', label: 'User Reports', icon: FileBarChart },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];
  const visibleUsers = useMemo(() => {
    const query = directorySearch.trim().toLowerCase();
    return [...users]
      .filter(user => !query || `${user.businessName} ${user.email} ${user.phone ?? ''}`.toLowerCase().includes(query))
      .filter(user => directoryFilter === 'all' || (directoryFilter === 'active' ? user.active : directoryFilter === 'inactive' ? !user.active : directoryFilter === 'connected' ? user.connection.connected : !user.connection.connected))
      .sort((a, b) => {
        if (directorySort === 'name') return a.businessName.localeCompare(b.businessName);
        if (directorySort === 'credits') return b.creditBalance - a.creditBalance;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [users, directorySearch, directoryFilter, directorySort]);
  const visibleTransactions = useMemo(() => {
    const query = transactionSearch.trim().toLowerCase();
    return [...transactions]
      .filter(item => !query || `${item.user?.businessName ?? ''} ${item.user?.email ?? ''} ${item.description}`.toLowerCase().includes(query))
      .sort((a, b) => transactionSort === 'amount' ? b.amount - a.amount : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [transactions, transactionSearch, transactionSort]);
  useEffect(() => {
    if (!authenticated || !reportUserId) return;
    const user = users.find(item => item.id === reportUserId);
    if (user) setSelected(user);
    void masterApi.get(`/master-admin/users/${reportUserId}/report`)
      .then(setReport)
      .catch(error => toast.error(error instanceof Error ? error.message : 'Unable to load report'));
  }, [authenticated, reportUserId, users]);

  if (!authenticated) return <MasterLogin onLogin={() => setAuthenticated(true)} />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-[76px]'} shrink-0 bg-slate-950 text-white min-h-screen hidden md:flex flex-col transition-[width] duration-200`}>
        <div className="h-20 px-5 flex items-center gap-3 border-b border-slate-800">
          <div className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-400"><ShieldCheck className="w-6 h-6" /></div>
          {sidebarOpen && <div><p className="font-bold">Airavata</p><p className="text-xs text-slate-400">Master Admin</p></div>}
        </div>
        <nav className="p-3 space-y-1 flex-1">
           {sidebarOpen && <p className="px-3 pt-3 pb-2 text-[11px] uppercase tracking-wider text-slate-500">Control center</p>}
          {navItems.map(item => {
            const Icon = item.icon;
             return <button title={sidebarOpen ? undefined : item.label} key={item.id} onClick={() => goTo(item.id)} className={`w-full flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} rounded-lg px-3 py-2.5 text-sm text-left transition ${activePage === item.id ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}><Icon className="w-4 h-4 shrink-0" />{sidebarOpen && item.label}</button>;
          })}
        </nav>
         <div className="p-3 border-t border-slate-800 space-y-1"><button title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} onClick={() => setSidebarOpen(value => !value)} className={`w-full flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white`}>{sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}{sidebarOpen && 'Collapse sidebar'}</button><button onClick={signOut} className={`w-full flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white`}><LogOut className="w-4 h-4" />{sidebarOpen && 'Sign out'}</button></div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="h-20 bg-white border-b px-5 sm:px-8 flex items-center justify-between">
           <div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(value => !value)} className="hidden md:inline-flex rounded-lg border p-2 text-slate-600 hover:bg-slate-50" title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>{sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}</button><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Master Admin</p><h1 className="text-xl font-bold">{navItems.find(item => item.id === activePage)?.label}</h1></div></div>
          <button onClick={signOut} className="md:hidden flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><LogOut className="w-4 h-4" /> Sign out</button>
          <div className="hidden md:flex items-center gap-2 text-sm text-slate-500"><UserRound className="w-4 h-4" /> Full system access</div>
        </header>
        <main className="p-5 sm:p-8 max-w-[1500px] space-y-6">
          {activePage === 'credit-transactions' && <CreditTransactionsPanel users={users} transactions={transactions} visibleTransactions={visibleTransactions} transactionSearch={transactionSearch} setTransactionSearch={setTransactionSearch} transactionFilter={transactionFilter} setTransactionFilter={setTransactionFilter} transactionSort={transactionSort} setTransactionSort={setTransactionSort} transactionView={transactionView} setTransactionView={setTransactionView} />}
          {activePage === 'dashboard' && <>
            <div><h2 className="text-2xl font-bold">Good day, Master Admin</h2><p className="mt-1 text-sm text-slate-500">Here’s what is happening across Airavata.</p></div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{[['Total users', analytics?.users ?? '—'], ['Active users', analytics?.activeUsers ?? '—'], ['Connected accounts', analytics?.connectedUsers ?? '—'], ['Credits used', analytics?.credits?.used?.toLocaleString?.() ?? '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-white border p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
            <div className="grid lg:grid-cols-2 gap-6"><section className="rounded-xl bg-white border p-5"><div className="flex items-center gap-3 mb-4"><Users className="w-5 h-5 text-emerald-600" /><div><h2 className="font-bold">User management</h2><p className="text-sm text-slate-500">Create accounts and control access.</p></div></div><button onClick={() => goTo('users')} className="text-sm font-semibold text-emerald-700 hover:underline">Open user management <span aria-hidden>→</span></button></section><section className="rounded-xl bg-white border p-5"><div className="flex items-center gap-3 mb-4"><BarChart3 className="w-5 h-5 text-emerald-600" /><div><h2 className="font-bold">Usage analytics</h2><p className="text-sm text-slate-500">Review platform-wide credit activity.</p></div></div><button onClick={() => goTo('analytics')} className="text-sm font-semibold text-emerald-700 hover:underline">Open analytics <span aria-hidden>→</span></button></section></div>
            <section className="rounded-xl bg-white border overflow-hidden"><div className="p-5 border-b flex items-center justify-between"><div><h2 className="font-bold">Recent credit activity</h2><p className="text-sm text-slate-500">Latest account balance changes across the platform.</p></div><button onClick={() => goTo('credits')} className="text-sm font-semibold text-emerald-700">View all</button></div><div className="divide-y">{(analytics?.recentTransactions ?? []).map((item: any) => <div key={item.id} className="px-5 py-3 flex items-center justify-between text-sm"><div><p className="font-medium">{item.user}</p><p className="text-xs text-slate-500">{item.description || item.type} · {new Date(item.createdAt).toLocaleString()}</p></div><span className={`font-semibold ${item.type === 'ADJUSTMENT' ? 'text-amber-600' : 'text-emerald-600'}`}>{item.type === 'ADJUSTMENT' ? '-' : '+'}{item.amount.toLocaleString()}</span></div>)}{!(analytics?.recentTransactions?.length) && <div className="p-6 text-sm text-slate-500">No credit activity yet.</div>}</div></section>
          </>}
          {activePage === 'credits' && <div className="space-y-6"><section className="rounded-xl bg-white border p-6"><div className="flex items-start gap-3 mb-6"><CreditCard className="w-6 h-6 text-emerald-600 mt-0.5" /><div><h2 className="text-xl font-bold">Credits & rates</h2><p className="text-sm text-slate-500">Configure category rates and adjust individual balances with an audit reason.</p></div></div><div className="grid sm:grid-cols-3 gap-4 max-w-2xl">{([['authenticationRate', 'Authentication'], ['utilityRate', 'Utility'], ['marketingRate', 'Marketing']] as const).map(([key, label]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input type="number" min="1" max="1000" value={rates[key]} onChange={e => setRates({...rates, [key]: Number(e.target.value)})} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label>)}</div><button onClick={saveRates} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save category rates</button></section><section className="rounded-xl bg-white border overflow-hidden"><div className="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h3 className="font-semibold">User balances</h3><p className="text-sm text-slate-500">Add or deduct credits using a documented adjustment.</p></div><button onClick={() => loadTransactions()} className="text-sm text-emerald-700 font-semibold">Refresh history</button></div><div className="divide-y">{users.map(user => <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"><div><p className="font-medium">{user.businessName}</p><p className="text-xs text-slate-500">{user.email}</p></div><div className="flex items-center gap-3"><span className="font-semibold">{user.creditBalance.toLocaleString()} credits</span><button onClick={() => openCreditEditor(user)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">Adjust credits</button></div></div>)}</div></section><section className="rounded-xl bg-white border overflow-hidden"><div className="p-5 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-3"><div><h3 className="font-semibold">Credit transaction history</h3><p className="text-sm text-slate-500">Every adjustment, purchase and deduction is recorded here.</p></div><div className="flex gap-2"><select value={transactionFilter.userId} onChange={e => setTransactionFilter({...transactionFilter, userId: e.target.value})} className="rounded-lg border px-3 py-2 text-sm"><option value="">All users</option>{users.map(user => <option key={user.id} value={user.id}>{user.businessName}</option>)}</select><select value={transactionFilter.type} onChange={e => setTransactionFilter({...transactionFilter, type: e.target.value})} className="rounded-lg border px-3 py-2 text-sm"><option value="ALL">All types</option><option value="PURCHASE">Added</option><option value="ADJUSTMENT">Adjusted</option><option value="DEDUCTION">Used</option><option value="REFUND">Refunded</option></select></div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Balance after</th><th className="px-5 py-3">Reason</th></tr></thead><tbody className="divide-y">{transactions.map(item => <tr key={item.id}><td className="px-5 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td><td className="px-5 py-3">{item.user?.businessName ?? 'Deleted user'}</td><td className="px-5 py-3">{item.type}</td><td className="px-5 py-3 font-semibold">{item.amount.toLocaleString()}</td><td className="px-5 py-3">{item.balanceAfter.toLocaleString()}</td><td className="px-5 py-3 text-slate-500">{item.description}</td></tr>)}</tbody></table>{!transactions.length && <div className="p-8 text-center text-sm text-slate-500">No transactions match these filters.</div>}</div></section></div>}
          {activePage === 'users' && <section className="rounded-xl bg-white border overflow-hidden"><div className="p-6 border-b flex items-center justify-between"><div><h2 className="text-xl font-bold">User accounts</h2><p className="text-sm text-slate-500 mt-1">Manage identities, status, roles, passwords and section access.</p></div><button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold"><Plus className="w-4 h-4" /> Add user</button></div><div className="p-5 border-b"><AdminToolbar search={directorySearch} onSearch={setDirectorySearch} searchPlaceholder="Search users by name, email or phone…" filter={directoryFilter} onFilter={setDirectoryFilter} filterOptions={[['all', 'All users'], ['active', 'Active'], ['inactive', 'Inactive'], ['connected', 'Connected'], ['unconnected', 'Not connected']]} sort={directorySort} onSort={setDirectorySort} sortOptions={[['newest', 'Newest first'], ['name', 'Name A–Z'], ['credits', 'Highest balance']]} viewMode={directoryView} onViewMode={setDirectoryView} /></div>{loading ? <div className="p-10 text-center text-slate-500">Loading users…</div> : directoryView === 'list' ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['User', 'Status', 'Access', 'Balance', 'Actions'].map(x => <th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{visibleUsers.map(user => <tr key={user.id} className="hover:bg-slate-50"><td className="px-4 py-4"><div className="font-semibold">{user.businessName}</div><div className="text-xs text-slate-500">{user.email}</div></td><td className="px-4 py-4"><button onClick={() => toggleActive(user)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{user.active ? 'Active' : 'Inactive'}</button></td><td className="px-4 py-4"><span className="text-xs text-slate-600">{user.permissions.length} sections</span></td><td className="px-4 py-4 font-semibold">{user.creditBalance.toLocaleString()}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><button onClick={() => openEdit(user)} className="rounded border px-2 py-1 hover:bg-slate-100">Edit</button><button onClick={() => removeUser(user)} className="rounded border px-2 py-1 text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button></div></td></tr>)}</tbody></table>{!visibleUsers.length && <div className="p-8 text-center text-sm text-slate-500">No users match these filters.</div>}</div> : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">{visibleUsers.map(user => <div key={user.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{user.businessName}</p><p className="text-xs text-slate-500 mt-1">{user.email}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{user.active ? 'Active' : 'Inactive'}</span></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">Access</p><p className="font-semibold">{user.permissions.length} sections</p></div><div><p className="text-xs text-slate-500">Balance</p><p className="font-semibold">{user.creditBalance.toLocaleString()}</p></div></div><div className="mt-4 flex gap-2"><button onClick={() => openEdit(user)} className="flex-1 rounded-lg border px-2 py-1.5 text-sm">Edit</button><button onClick={() => toggleActive(user)} className="flex-1 rounded-lg border px-2 py-1.5 text-sm">{user.active ? 'Deactivate' : 'Activate'}</button></div></div>)}{!visibleUsers.length && <div className="col-span-full p-8 text-center text-sm text-slate-500">No users match these filters.</div>}</div>}</section>}
          {activePage === 'connections' && <section className="rounded-xl bg-white border overflow-hidden"><div className="p-6 border-b"><h2 className="text-xl font-bold">Facebook & WhatsApp connections</h2><p className="text-sm text-slate-500 mt-1">Connect, reconnect, inspect and disconnect any user account. Meta credentials remain encrypted and hidden.</p></div><div className="p-5 border-b"><AdminToolbar search={directorySearch} onSearch={setDirectorySearch} searchPlaceholder="Search connection owners…" filter={directoryFilter} onFilter={setDirectoryFilter} filterOptions={[['all', 'All users'], ['connected', 'Connected'], ['unconnected', 'Not connected'], ['active', 'Active accounts'], ['inactive', 'Inactive accounts']]} sort={directorySort} onSort={setDirectorySort} sortOptions={[['newest', 'Newest first'], ['name', 'Name A–Z'], ['credits', 'Highest balance']]} viewMode={directoryView} onViewMode={setDirectoryView} /></div><div className={directoryView === 'grid' ? 'grid md:grid-cols-2 gap-4 p-5' : 'divide-y'}>{visibleUsers.map(user => <div key={user.id} className={`p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${directoryView === 'grid' ? 'rounded-xl border' : ''}`}><div className="flex items-center gap-3"><div className={`rounded-lg p-2 ${user.connection.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}><Link2Off className="w-5 h-5" /></div><div><p className="font-semibold">{user.businessName}</p><p className="text-xs text-slate-500">{user.email}</p><p className={`text-xs mt-1 ${user.connection.connected ? 'text-emerald-600' : 'text-slate-400'}`}>{user.connection.connected ? `Connected · ${user.connection.phoneNumberId ?? 'Phone ID unavailable'}` : 'Not connected'}</p>{user.connection.connected && <p className="text-[11px] text-slate-400 mt-1">WABA: {user.connection.wabaId ?? 'Unavailable'}</p>}</div></div><div className="flex flex-wrap gap-2"><button disabled={isConnectingFacebook} onClick={() => launchFacebookSignup(user.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{isConnectingFacebook ? 'Connecting…' : user.connection.connected ? 'Reconnect Facebook' : 'Connect Facebook'}</button>{user.connection.connected && <button onClick={() => disconnect(user)} className="rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50">Disconnect</button>}</div></div>)}</div>{!visibleUsers.length && <div className="p-8 text-center text-sm text-slate-500">No connections match these filters.</div>}</section>}
          {activePage === 'reports' && !reportUserId && <section className="rounded-xl bg-white border overflow-hidden"><div className="p-6 border-b"><h2 className="text-xl font-bold">User reports</h2><p className="text-sm text-slate-500 mt-1">Each account has a dedicated report with detailed usage, balances and transaction history.</p></div><div className="p-5 border-b"><AdminToolbar search={directorySearch} onSearch={setDirectorySearch} searchPlaceholder="Search reports by user name or email…" filter={directoryFilter} onFilter={setDirectoryFilter} filterOptions={[['all', 'All users'], ['active', 'Active accounts'], ['inactive', 'Inactive accounts'], ['connected', 'Connected'], ['unconnected', 'Not connected']]} sort={directorySort} onSort={setDirectorySort} sortOptions={[['newest', 'Newest first'], ['name', 'Name A–Z'], ['credits', 'Highest balance']]} viewMode={directoryView} onViewMode={setDirectoryView} /></div><div className={directoryView === 'grid' ? 'grid md:grid-cols-2 gap-4 p-5' : 'divide-y'}>{visibleUsers.map(user => <div key={user.id} className={`p-5 flex items-center justify-between gap-4 ${directoryView === 'grid' ? 'rounded-xl border' : ''}`}><div><p className="font-semibold">{user.businessName}</p><p className="text-xs text-slate-500">{user.email} · Started {new Date(user.createdAt).toLocaleDateString()}</p><p className="text-xs text-slate-400 mt-1">{user.creditBalance.toLocaleString()} current credits · {user.active ? 'Active account' : 'Inactive account'}</p></div><button onClick={() => showReport(user)} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Open detailed report</button></div>)}</div>{!visibleUsers.length && <div className="p-8 text-center text-sm text-slate-500">No reports match these filters.</div>}</section>}
          {activePage === 'reports' && reportUserId && <section className="space-y-6">{!report && <div className="rounded-xl bg-white border p-10 text-center text-slate-500">Loading detailed report…</div>}{report && <><button onClick={() => goTo('reports')} className="text-sm font-semibold text-emerald-700 hover:underline">← Back to all reports</button><div className="rounded-xl bg-white border p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-5"><div><p className="text-xs uppercase tracking-wider text-emerald-600 font-semibold">Account report</p><h2 className="text-2xl font-bold mt-1">{report.user.businessName}</h2><p className="text-sm text-slate-500 mt-1">{report.user.email} · Joined {new Date(report.user.createdAt).toLocaleDateString()}</p></div><div className="flex gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${report.user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{report.user.active ? 'Active' : 'Inactive'}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{report.user.role}</span></div></div><div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[['Current balance', report.user.creditBalance], ['Used today', report.usage.dayUsed], ['Used this week', report.usage.weekUsed], ['Used this month', report.usage.monthUsed], ['Total purchased', report.usage.totalPurchased]].map(([label, value]) => <div key={label} className="rounded-xl bg-white border p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{Number(value).toLocaleString()}</p><p className="text-xs text-slate-400 mt-1">credits</p></div>)}</div><div className="grid lg:grid-cols-3 gap-6"><section className="lg:col-span-2 rounded-xl bg-white border overflow-hidden"><div className="p-5 border-b"><h3 className="font-bold">Credit activity</h3><p className="text-sm text-slate-500 mt-1">{report.usage.totalTransactions} total transactions recorded for this account.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Balance after</th><th className="px-5 py-3">Description</th></tr></thead><tbody className="divide-y">{report.transactions.map((item: any) => <tr key={item.id}><td className="px-5 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td><td className="px-5 py-3">{item.type}</td><td className="px-5 py-3 font-semibold">{item.amount.toLocaleString()}</td><td className="px-5 py-3">{item.balanceAfter.toLocaleString()}</td><td className="px-5 py-3 text-slate-500">{item.description || '—'}</td></tr>)}</tbody></table>{!report.transactions.length && <div className="p-8 text-center text-sm text-slate-500">No transactions recorded.</div>}</div></section><section className="rounded-xl bg-white border p-5"><h3 className="font-bold">Account details</h3><div className="mt-4 space-y-4 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-500">Connection</span><span className={report.user.metaWabaConnected ? 'text-emerald-600 font-semibold' : 'text-slate-500'}>{report.user.metaWabaConnected ? 'Connected' : 'Not connected'}</span></div><div className="flex justify-between gap-3"><span className="text-slate-500">Total used</span><span className="font-semibold">{Number(report.usage.totalUsed).toLocaleString()} credits</span></div><div className="flex justify-between gap-3"><span className="text-slate-500">Transactions</span><span className="font-semibold">{report.usage.totalTransactions}</span></div><div className="flex justify-between gap-3"><span className="text-slate-500">Report period</span><span className="font-semibold">Last 30 days</span></div></div><button onClick={() => openCreditEditor(users.find(user => user.id === reportUserId) ?? selected as ManagedUser)} className="mt-6 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white">Adjust user credits</button></section></div></>}</section>}
          {activePage === 'analytics' && <DetailedAnalytics analytics={analytics} range={analyticsRange} onRange={setAnalyticsRange} />}
        </main>
      </div>
      {creditUser && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={submitCreditAdjustment} className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"><div className="flex items-start justify-between mb-5"><div><h2 className="text-xl font-bold">Adjust credits</h2><p className="text-sm text-slate-500 mt-1">{creditUser.businessName} · {creditUser.creditBalance.toLocaleString()} current credits</p></div><button type="button" onClick={() => setCreditUser(null)}><X /></button></div><div className="grid grid-cols-2 gap-3 mb-4"><button type="button" onClick={() => setCreditForm({...creditForm, direction: 'add'})} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${creditForm.direction === 'add' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : ''}`}>Add credits</button><button type="button" onClick={() => setCreditForm({...creditForm, direction: 'deduct'})} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${creditForm.direction === 'deduct' ? 'border-amber-500 bg-amber-50 text-amber-700' : ''}`}>Deduct credits</button></div><label className="block text-sm font-medium">Amount<input required min="1" max="100000" type="number" value={creditForm.amount} onChange={e => setCreditForm({...creditForm, amount: e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="e.g. 100" /></label><label className="block text-sm font-medium mt-4">Reason<input required value={creditForm.description} onChange={e => setCreditForm({...creditForm, description: e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="e.g. Monthly plan allocation" /></label><p className="mt-3 text-xs text-slate-500">This adjustment will be recorded in the credit transaction history.</p><button className={`mt-5 w-full rounded-lg py-2.5 font-semibold text-white ${creditForm.direction === 'add' ? 'bg-emerald-600' : 'bg-amber-600'}`}>{creditForm.direction === 'add' ? 'Add credits' : 'Deduct credits'}</button></form></div>}
      {showForm && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={saveUser} className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"><div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">{selected ? 'Edit user' : 'Add user'}</h2><button type="button" onClick={() => setShowForm(false)}><X /></button></div><div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-medium">Business name<input required value={form.businessName} onChange={e => setForm({...form, businessName: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">Email<input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">Phone<input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">{selected ? 'New password (optional)' : 'Password'}<input required={!selected} minLength={8} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">Role<select value={form.role} onChange={e => setForm({...form, role: e.target.value as UserForm['role']})} className="mt-1 w-full border rounded-lg px-3 py-2"><option value="client">Client</option><option value="admin">Admin</option></select></label><label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} /> Account active</label></div><div className="mt-5"><h3 className="font-semibold mb-2">Section access</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{PERMISSIONS.map(([value, label]) => <label key={value} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.permissions.includes(value)} onChange={e => setForm({...form, permissions: e.target.checked ? [...form.permissions, value] : form.permissions.filter(item => item !== value)})} />{label}</label>)}</div></div><button className="mt-6 w-full rounded-lg bg-emerald-600 text-white py-2.5 font-semibold">Save user</button></form></div>}
    </div>
  );
}