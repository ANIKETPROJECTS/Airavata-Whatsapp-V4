import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface AdminUser {
  id: string;
  businessName: string;
  email: string;
  phone: string | null;
  role: 'admin' | 'client';
  creditBalance: number;
  metaWabaConnected: boolean;
  createdAt: string;
}

interface UsersResponse {
  users: AdminUser[];
}

interface CreditSettingResponse {
  creditsPerMessage: number;
  updatedAt?: string;
}

export default function Admin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rate, setRate] = useState('');
  const [topUpAmounts, setTopUpAmounts] = useState<Record<string, string>>({});

  const usersQuery = useQuery<UsersResponse>({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users'),
    enabled: user?.role === 'admin',
  });

  const settingQuery = useQuery<CreditSettingResponse>({
    queryKey: ['admin-credit-setting'],
    queryFn: () => api.get('/admin/credit-setting'),
    enabled: user?.role === 'admin',
  });

  useEffect(() => {
    if (settingQuery.data) setRate(String(settingQuery.data.creditsPerMessage));
  }, [settingQuery.data]);

  const saveRate = useMutation({
    mutationFn: (creditsPerMessage: number) =>
      api.put<CreditSettingResponse>('/admin/credit-setting', { creditsPerMessage }),
    onSuccess: (data) => {
      setRate(String(data.creditsPerMessage));
      queryClient.invalidateQueries({ queryKey: ['admin-credit-setting'] });
      toast.success('Credit rate updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addCredits = useMutation({
    mutationFn: ({ userId, amount }: { userId: string; amount: number }) =>
      api.post(`/admin/users/${userId}/credits`, { amount }),
    onSuccess: (_data, variables) => {
      setTopUpAmounts((current) => ({ ...current, [variables.userId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Credits added');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white border rounded-xl p-10 text-center">
          <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-gray-900">Admin access required</h1>
          <p className="text-sm text-gray-500 mt-2">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const handleSaveRate = () => {
    const value = Number(rate);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      toast.error('Enter a whole number from 1 to 1,000');
      return;
    }
    saveRate.mutate(value);
  };

  const handleTopUp = (adminUser: AdminUser) => {
    const amount = Number(topUpAmounts[adminUser.id]);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
      toast.error('Enter a whole number from 1 to 100,000');
      return;
    }
    addCredits.mutate({ userId: adminUser.id, amount });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">Admin Console</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">Manage client accounts and WhatsApp credit settings.</p>
      </div>

      <section className="bg-white border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Credits per WhatsApp message</h2>
            <p className="text-sm text-gray-500 mt-1">This rate applies to every successful outbound message.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              max="1000"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              className="w-28 px-3 py-2 border rounded-lg text-sm"
              aria-label="Credits per message"
            />
            <button
              onClick={handleSaveRate}
              disabled={saveRate.isPending || settingQuery.isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {saveRate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save rate
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="p-5 border-b flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-500" />
          <div>
            <h2 className="font-semibold text-gray-900">User accounts</h2>
            <p className="text-sm text-gray-500">Review balances and add credits manually.</p>
          </div>
        </div>
        {usersQuery.isLoading ? (
          <div className="p-10 flex justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : usersQuery.isError ? (
          <div className="p-8 text-center text-sm text-red-600">{(usersQuery.error as Error).message}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">WhatsApp</th>
                  <th className="px-5 py-3 font-medium">Balance</th>
                  <th className="px-5 py-3 font-medium">Add credits</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(usersQuery.data?.users ?? []).map((adminUser) => (
                  <tr key={adminUser.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">{adminUser.businessName}</p>
                      <p className="text-xs text-gray-500">{adminUser.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${adminUser.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {adminUser.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={adminUser.metaWabaConnected ? 'text-green-600' : 'text-gray-400'}>
                        {adminUser.metaWabaConnected ? 'Connected' : 'Not connected'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-900">
                      {(adminUser.creditBalance ?? 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          max="100000"
                          placeholder="Amount"
                          value={topUpAmounts[adminUser.id] ?? ''}
                          onChange={(event) => setTopUpAmounts((current) => ({ ...current, [adminUser.id]: event.target.value }))}
                          className="w-24 px-2.5 py-1.5 border rounded-md text-sm"
                          aria-label={`Credits for ${adminUser.businessName}`}
                        />
                        <button
                          onClick={() => handleTopUp(adminUser)}
                          disabled={addCredits.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-xs font-medium disabled:opacity-60"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}