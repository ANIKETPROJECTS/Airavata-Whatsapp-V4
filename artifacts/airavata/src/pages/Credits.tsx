import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Receipt,
  WalletCards,
} from 'lucide-react';
import { api } from '../lib/api';

type CreditTransactionType = 'PURCHASE' | 'DEDUCTION' | 'REFUND' | 'ADJUSTMENT';

interface CreditTransaction {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  description?: string | null;
  createdAt: string;
}

interface CreditsResponse {
  balance: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalUsedThisMonth: number;
  transactions: CreditTransaction[];
}

const formatCredits = (value: number) => `${Math.abs(value).toLocaleString('en-IN')} Credits`;
const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function TypeBadge({ type }: { type: CreditTransactionType }) {
  const styles: Record<CreditTransactionType, string> = {
    PURCHASE: 'bg-green-50 text-green-700',
    DEDUCTION: 'bg-orange-50 text-orange-700',
    REFUND: 'bg-blue-50 text-blue-700',
    ADJUSTMENT: 'bg-gray-100 text-gray-700',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[type]}`}>{type}</span>;
}

export default function Credits() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery<CreditsResponse>({
    queryKey: ['credits-transactions', page],
    queryFn: () => api.get(`/billing/transactions?page=${page}&limit=25`),
    refetchOnMount: 'always',
  });

  const transactions = data?.transactions ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Credits</h1>
        <p className="mt-1 text-sm text-gray-500">Track your WhatsApp credit balance and usage history.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-[#25d366] p-5 text-black shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold opacity-75">Current balance</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">
                {isLoading ? '—' : formatCredits(data?.balance ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-white/80 p-2.5"><WalletCards className="h-6 w-6" /></div>
          </div>
          <button
            type="button"
            onClick={() => { window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/wa-pay`; }}
            className="mt-5 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Top up credits
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-500">Used this month</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
            {isLoading ? '—' : formatCredits(data?.totalUsedThisMonth ?? 0)}
          </p>
          <p className="mt-2 text-sm text-gray-500">Based on deduction transactions in the current month.</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Credit history</h2>
            <p className="mt-0.5 text-xs text-gray-500">{data?.total ?? 0} total transactions</p>
          </div>
          <Receipt className="h-5 w-5 text-gray-400" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading credit history…
          </div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-red-600">Unable to load your credit history.</div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <Receipt className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium text-gray-600">No credit transactions yet</p>
            <p className="text-xs">Purchases and message deductions will appear here.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 text-right font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Description</th>
                    <th className="px-5 py-3 text-right font-semibold">Balance after</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((transaction) => {
                    const isCredit = transaction.amount >= 0;
                    return (
                      <tr key={transaction.id} className="hover:bg-gray-50/70">
                        <td className="whitespace-nowrap px-5 py-4 text-gray-600">{formatDate(transaction.createdAt)}</td>
                        <td className="px-5 py-4"><TypeBadge type={transaction.type} /></td>
                        <td className={`whitespace-nowrap px-5 py-4 text-right font-semibold ${isCredit ? 'text-green-700' : 'text-orange-700'}`}>
                          <span className="inline-flex items-center gap-1">
                            {isCredit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                            {isCredit ? '+' : '−'}{formatCredits(transaction.amount)}
                          </span>
                        </td>
                        <td className="max-w-[280px] truncate px-5 py-4 text-gray-600">{transaction.description || '—'}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-gray-900">{formatCredits(transaction.balanceAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-md border p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded-md border p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}