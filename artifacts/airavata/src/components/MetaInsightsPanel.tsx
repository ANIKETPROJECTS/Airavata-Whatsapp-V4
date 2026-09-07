import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, DollarSign, Loader2, MessageCircle, Send, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type RangeDays = 7 | 30;

type MetaInsights = {
  sent: number;
  delivered: number;
  received: number;
  totalMessages: number;
  totalCharges: number;
  currency: string | null;
  chargesAvailable: boolean;
  categories: Array<{
    category: string;
    pricingType: string | null;
    messages: number;
    charges: number;
    currency: string | null;
  }>;
  daily: Array<{
    start: number;
    end: number;
    sent: number;
    delivered: number;
    received: number;
    messages: number;
    charges: number;
  }>;
  start: number;
  end: number;
  rangeDays: number;
};

const formatNumber = (value: number) => value.toLocaleString();
const formatCharge = (value: number, currency: string | null) =>
  currency ? `${currency} ${value.toFixed(2)}` : '—';
const formatCategory = (value: string) =>
  value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (character) => character.toUpperCase());

export default function MetaInsightsPanel() {
  const { user } = useAuth();
  const [rangeDays, setRangeDays] = useState<RangeDays>(7);
  const [showDaily, setShowDaily] = useState(false);
  const visible = user?.billingMode === 'meta_direct';

  const { data, isLoading, error } = useQuery<{ insights: MetaInsights }>({
    queryKey: ['meta-billing-insights', rangeDays],
    queryFn: () => api.get(`/meta/billing-insights?range=${rangeDays}`),
    enabled: visible,
  });

  if (!visible) return null;

  const insights = data?.insights;
  const deliveryRate = insights && insights.sent > 0
    ? `${((insights.delivered / insights.sent) * 100).toFixed(1)}%`
    : '—';

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Meta Partner Insights</p>
          <h2 className="text-base font-bold text-black">Meta billing insights</h2>
          <p className="mt-1 text-sm text-gray-600">Messaging activity and approximate Meta charges for your direct-billed account.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          Date range
          <select
            value={rangeDays}
            onChange={(event) => setRangeDays(Number(event.target.value) as RangeDays)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
      </div>

      <div className="rounded-none border border-gray-200 bg-white p-5 shadow-sm">
        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Meta insights…
          </div>
        ) : error ? (
          <div className="flex min-h-32 items-center justify-center text-center text-sm text-red-600">
            Unable to load Meta billing insights right now.
          </div>
        ) : insights ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <InsightCard label="Messages sent" value={formatNumber(insights.sent)} icon={Send} />
              <InsightCard label="Messages delivered" value={formatNumber(insights.delivered)} icon={Truck} detail={`Delivery rate ${deliveryRate}`} />
              <InsightCard label="Messages received" value={formatNumber(insights.received)} icon={MessageCircle} />
              <InsightCard label="Priced messages" value={formatNumber(insights.totalMessages)} icon={BarChart3} detail="Paid and free message volume" />
              <InsightCard
                label="Approx. charges"
                value={insights.chargesAvailable ? formatCharge(insights.totalCharges, insights.currency) : 'Unavailable'}
                icon={DollarSign}
                detail={insights.chargesAvailable ? 'Reported by Meta' : 'Meta did not return charge data'}
              />
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-black">Message pricing breakdown</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(insights.start * 1000).toLocaleDateString()} – {new Date(insights.end * 1000).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDaily((current) => !current)}
                  aria-expanded={showDaily}
                  aria-label={showDaily ? 'Hide daily analytics' : 'Show daily analytics'}
                  title={showDaily ? 'Hide daily analytics' : 'Show daily analytics'}
                  className={`rounded-md p-1.5 transition-colors ${showDaily ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:bg-gray-100 hover:text-primary'}`}
                >
                  <BarChart3 className="h-5 w-5" />
                </button>
              </div>
              {insights.categories.length === 0 ? (
                <div className="border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                  No Meta conversation activity in this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="pb-3 font-semibold">Category</th>
                        <th className="pb-3 text-right font-semibold">Messages</th>
                        <th className="pb-3 text-right font-semibold">Approx. charges</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {insights.categories.map((category) => (
                        <tr key={`${category.category}-${category.pricingType ?? 'unknown'}`}>
                          <td className="py-3 font-semibold text-gray-800">
                            {formatCategory(category.category)}
                            {category.pricingType && (
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                {formatCategory(category.pricingType)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right text-gray-700">{formatNumber(category.messages)}</td>
                          <td className="py-3 text-right font-semibold text-gray-800">
                            {insights.chargesAvailable ? formatCharge(category.charges, category.currency || insights.currency) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {showDaily && (
              <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3">
                  <h3 className="font-bold text-black">Daily analytics</h3>
                  <p className="mt-1 text-xs text-gray-500">Messages, delivery, inbound activity, and approximate charges by day.</p>
                </div>
                {insights.daily.length === 0 ? (
                  <p className="py-5 text-center text-sm text-gray-500">No daily Meta analytics are available for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="pb-3 font-semibold">Date</th>
                          <th className="pb-3 text-right font-semibold">Sent</th>
                          <th className="pb-3 text-right font-semibold">Delivered</th>
                          <th className="pb-3 text-right font-semibold">Received</th>
                          <th className="pb-3 text-right font-semibold">Priced</th>
                          <th className="pb-3 text-right font-semibold">Charges</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {insights.daily.map((day) => (
                          <tr key={day.start}>
                            <td className="py-3 font-medium text-gray-800">{new Date(day.start * 1000).toLocaleDateString()}</td>
                            <td className="py-3 text-right text-gray-700">{formatNumber(day.sent)}</td>
                            <td className="py-3 text-right text-gray-700">{formatNumber(day.delivered)}</td>
                            <td className="py-3 text-right text-gray-700">{formatNumber(day.received)}</td>
                            <td className="py-3 text-right text-gray-700">{formatNumber(day.messages)}</td>
                            <td className="py-3 text-right font-semibold text-gray-800">
                              {insights.chargesAvailable ? formatCharge(day.charges, insights.currency) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <p className="mt-5 text-xs text-gray-500">
              Charges are approximate values returned by Meta’s pricing analytics and may differ from the final Meta invoice.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function InsightCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: typeof Send;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-600">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-black">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      {detail && <p className="mt-2 text-xs text-gray-500">{detail}</p>}
    </div>
  );
}