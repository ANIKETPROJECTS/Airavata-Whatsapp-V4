import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { BarChart3, Check, ChevronRight, Link2Off, LogOut, Plus, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { masterApi, masterTokenStorage } from '../lib/api';

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

export default function MasterAdmin() {
  const [authenticated, setAuthenticated] = useState(Boolean(masterTokenStorage.get()));
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [report, setReport] = useState<any>(null);
  const [rates, setRates] = useState({ authenticationRate: 1, utilityRate: 1, marketingRate: 1 });
  const [form, setForm] = useState<UserForm>(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();

  const load = async () => {
    setLoading(true);
    try {
      const [userResult, analyticsResult] = await Promise.all([
        masterApi.get<{ users: ManagedUser[] }>('/master-admin/users'),
        masterApi.get('/master-admin/analytics'),
      ]);
      setUsers(userResult.users); setAnalytics(analyticsResult);
      const rateResult = await masterApi.get<typeof rates>('/master-admin/credit-setting');
      setRates({ authenticationRate: rateResult.authenticationRate, utilityRate: rateResult.utilityRate, marketingRate: rateResult.marketingRate });
    } catch { masterTokenStorage.clear(); setAuthenticated(false); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (authenticated) void load(); }, [authenticated]);

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
  const showReport = async (user: ManagedUser) => {
    setSelected(user);
    try { setReport(await masterApi.get(`/master-admin/users/${user.id}/report`)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load report'); }
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

  if (!authenticated) return <MasterLogin onLogin={() => setAuthenticated(true)} />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><ShieldCheck className="text-emerald-400" /><div><h1 className="font-bold">Airavata Master Admin</h1><p className="text-xs text-slate-400">Users, access, connections, credits and analytics</p></div></div>
        <button onClick={signOut} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><LogOut className="w-4 h-4" /> Sign out</button>
      </header>
      <main className="p-6 max-w-[1500px] mx-auto space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Total users', analytics?.users ?? '—'], ['Active users', analytics?.activeUsers ?? '—'],
            ['Connected accounts', analytics?.connectedUsers ?? '—'], ['Credits used', analytics?.credits?.used?.toLocaleString?.() ?? '—'],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-white border p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
        </div>
        <section className="rounded-xl bg-white border p-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div><h2 className="font-bold text-lg">Credit rates</h2><p className="text-sm text-slate-500">Configure credits used by WhatsApp template categories.</p></div>
            <div className="flex flex-wrap items-end gap-3">
              {([['authenticationRate', 'Authentication'], ['utilityRate', 'Utility'], ['marketingRate', 'Marketing']] as const).map(([key, label]) => <label key={key} className="text-xs text-slate-500">{label}<input type="number" min="1" max="1000" value={rates[key]} onChange={e => setRates({...rates, [key]: Number(e.target.value)})} className="mt-1 block w-28 rounded-lg border px-3 py-2 text-sm text-slate-900" /></label>)}
              <button onClick={saveRates} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save rates</button>
            </div>
          </div>
        </section>
        <section className="rounded-xl bg-white border overflow-hidden">
          <div className="p-5 border-b flex items-center justify-between"><div><h2 className="font-bold text-lg">User accounts</h2><p className="text-sm text-slate-500">Manage access, credentials, connections and credits.</p></div><button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold"><Plus className="w-4 h-4" /> Add user</button></div>
          {loading ? <div className="p-10 text-center text-slate-500">Loading users…</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['User','Status','Access','Connection','Credits','Actions'].map(x => <th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{users.map(user => <tr key={user.id} className="hover:bg-slate-50">
            <td className="px-4 py-4"><div className="font-semibold">{user.businessName}</div><div className="text-xs text-slate-500">{user.email}</div></td>
            <td className="px-4 py-4"><button onClick={() => toggleActive(user)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{user.active ? 'Active' : 'Inactive'}</button></td>
            <td className="px-4 py-4"><span className="text-xs text-slate-600">{user.permissions.length} sections</span></td>
            <td className="px-4 py-4"><span className={user.connection.connected ? 'text-emerald-600' : 'text-slate-400'}>{user.connection.connected ? 'Connected' : 'Not connected'}</span></td>
            <td className="px-4 py-4 font-semibold">{user.creditBalance.toLocaleString()}</td>
            <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><button onClick={() => openEdit(user)} className="rounded border px-2 py-1 hover:bg-slate-100">Edit</button><button onClick={() => addCredits(user)} className="rounded border px-2 py-1 hover:bg-slate-100">Credits</button><button onClick={() => showReport(user)} className="rounded border px-2 py-1 hover:bg-slate-100">Report</button>{user.connection.connected && <button onClick={() => disconnect(user)} title="Disconnect Facebook/WhatsApp" className="rounded border px-2 py-1 text-amber-700 hover:bg-amber-50"><Link2Off className="w-4 h-4" /></button>}<button onClick={() => removeUser(user)} title="Delete user" className="rounded border px-2 py-1 text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button></div></td>
          </tr>)}</tbody></table></div>}
        </section>
        {showForm && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={saveUser} className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"><div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">{selected ? 'Edit user' : 'Add user'}</h2><button type="button" onClick={() => setShowForm(false)}><X /></button></div><div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-medium">Business name<input required value={form.businessName} onChange={e => setForm({...form, businessName: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">Email<input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">Phone<input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">{selected ? 'New password (optional)' : 'Password'}<input required={!selected} minLength={8} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2" /></label><label className="text-sm font-medium">Role<select value={form.role} onChange={e => setForm({...form, role: e.target.value as UserForm['role']})} className="mt-1 w-full border rounded-lg px-3 py-2"><option value="client">Client</option><option value="admin">Admin</option></select></label><label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} /> Account active</label></div><div className="mt-5"><h3 className="font-semibold mb-2">Section access</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{PERMISSIONS.map(([value, label]) => <label key={value} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.permissions.includes(value)} onChange={e => setForm({...form, permissions: e.target.checked ? [...form.permissions, value] : form.permissions.filter(item => item !== value)})} />{label}</label>)}</div></div><button className="mt-6 w-full rounded-lg bg-emerald-600 text-white py-2.5 font-semibold">Save user</button></form></div>}
        {report && selected && <div className="rounded-xl bg-white border p-5"><div className="flex justify-between"><div><h2 className="font-bold text-lg">{selected.businessName} report</h2><p className="text-sm text-slate-500">Started {new Date(report.user.createdAt).toLocaleDateString()}</p></div><button onClick={() => setReport(null)}><X className="w-5 h-5" /></button></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">{[['Today',report.usage.dayUsed],['Last 7 days',report.usage.weekUsed],['Last 30 days',report.usage.monthUsed],['Total used',report.usage.totalUsed],['Purchased',report.usage.totalPurchased]].map(([label,value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold mt-1">{Number(value).toLocaleString()}</p></div>)}</div></div>}
      </main>
    </div>
  );
}