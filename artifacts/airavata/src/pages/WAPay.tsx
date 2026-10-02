import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  ChevronDown,
  CircleHelp,
  Clock3,
  CreditCard,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  getGetWaPayDashboardQueryKey,
  useCreateWaPayOrder,
  useGetWaPayDashboard,
  useRefundWaPayOrder,
  useSaveWaPaySettings,
  useUpdateWaPayOrderStatus,
  useVerifyWaPayOrder,
  type WaPayBeneficiaryInput,
  type WaPayOrder,
  type WaPayOrderInput,
  type WaPayOrderItemInput,
  type WaPayOrderStatusInput,
} from '@workspace/api-client-react';
import { toast } from 'sonner';

type DraftItem = {
  name: string;
  quantity: string;
  price: string;
  countryOfOrigin: string;
  importerName: string;
  importerAddressLine1: string;
  importerAddressLine2: string;
  importerCity: string;
  importerZoneCode: string;
  importerPostalCode: string;
  importerCountryCode: string;
};
type OrderFilter = 'all' | 'needs_payment' | 'paid' | 'attention' | 'refunds';

const emptyItem = (): DraftItem => ({
  name: '', quantity: '1', price: '', countryOfOrigin: '', importerName: '',
  importerAddressLine1: '', importerAddressLine2: '', importerCity: '',
  importerZoneCode: '', importerPostalCode: '', importerCountryCode: '',
});

const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);

// Convert decimal rupees to integer paise without binary floating-point rounding.
function rupeesToPaise(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ''] = value.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function remainingWindow(expiry: string) {
  const remaining = new Date(expiry).getTime() - Date.now();
  if (remaining <= 0) return 'Window closed';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function PaymentBadge({ order }: { order: WaPayOrder }) {
  if (order.sendStatus === 'failed') {
    return <span className="wa-badge wa-badge-failed"><AlertCircle />Send failed</span>;
  }
  const successfulRefund = order.refunds.filter(refund => refund.status === 'success').reduce((sum, refund) => sum + refund.amountValue, 0);
  if (order.refunds.some(refund => refund.status === 'pending')) {
    return <span className="wa-badge wa-badge-refund"><RotateCcw />Refund processing</span>;
  }
  if (successfulRefund > 0) {
    return <span className="wa-badge wa-badge-refund"><RotateCcw />{successfulRefund >= order.amountValue ? 'Refunded' : 'Partially refunded'}</span>;
  }
  if (order.refunds.some(refund => refund.status === 'failed')) {
    return <span className="wa-badge wa-badge-failed"><AlertCircle />Refund failed</span>;
  }
  if (order.paymentStatus === 'captured' && order.verificationState === 'verified') {
    return <span className="wa-badge wa-badge-paid"><BadgeCheck />Verified paid</span>;
  }
  if (order.verificationState === 'mismatch') {
    return <span className="wa-badge wa-badge-mismatch"><AlertCircle />Amount mismatch</span>;
  }
  if (order.paymentStatus === 'captured') {
    return <span className="wa-badge wa-badge-check"><CircleHelp />Needs verification</span>;
  }
  return <span className="wa-badge wa-badge-pending"><Clock3 />Awaiting payment</span>;
}

const orderStatuses: Array<{ value: WaPayOrderStatusInput['status']; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'captured', label: 'Captured' },
  { value: 'failed', label: 'Failed' },
];

export default function WAPay() {
  const queryClient = useQueryClient();
  const dashboardQuery = useGetWaPayDashboard({
    query: { queryKey: getGetWaPayDashboardQueryKey() },
  });
  const dashboard = dashboardQuery.data;
  const saveSettings = useSaveWaPaySettings();
  const createOrder = useCreateWaPayOrder();
  const verifyOrder = useVerifyWaPayOrder();
  const refundOrder = useRefundWaPayOrder();
  const updateStatus = useUpdateWaPayOrderStatus();

  const [configName, setConfigName] = useState('');
  const [configId, setConfigId] = useState('');
  const [configTouched, setConfigTouched] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [contactId, setContactId] = useState('');
  const [goodsType, setGoodsType] = useState<WaPayOrderInput['goodsType']>('physical-goods');
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [beneficiary, setBeneficiary] = useState<WaPayBeneficiaryInput>({
    name: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '',
  });
  const [tax, setTax] = useState('');
  const [shipping, setShipping] = useState('');
  const [discount, setDiscount] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<WaPayOrder | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundSpeed, setRefundSpeed] = useState<'normal' | 'instant'>('normal');
  const [statusDrafts, setStatusDrafts] = useState<Record<string, WaPayOrderStatusInput['status']>>({});
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!dashboard || configTouched) return;
    setConfigName(dashboard.settings.configurationName ?? '');
    setConfigId(dashboard.settings.paymentConfigId ?? '');
  }, [dashboard?.settings.configurationName, dashboard?.settings.paymentConfigId, configTouched]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetWaPayDashboardQueryKey() });
  const settingsReady = Boolean(dashboard?.settings.configurationName?.trim());
  const configIdReady = Boolean(dashboard?.settings.paymentConfigId?.trim());
  const eligibleContacts = dashboard?.eligibleContacts.filter(contact => new Date(contact.windowExpiresAt).getTime() > Date.now()) ?? [];
  const canRequest = Boolean(dashboard?.whatsappConnected && settingsReady && eligibleContacts.length > 0);
  const itemPaise = items.map(item => rupeesToPaise(item.price));
  const subtotal = items.reduce((sum, item, index) => {
    const unit = itemPaise[index] ?? 0;
    const quantity = Number(item.quantity);
    return sum + (Number.isInteger(quantity) && quantity > 0 ? unit * quantity : 0);
  }, 0);
  const extraValue = (raw: string) => raw ? rupeesToPaise(raw) ?? 0 : 0;
  const total = Math.max(0, subtotal + extraValue(tax) + extraValue(shipping) - extraValue(discount));
  const updateItemDraft = (index: number, field: keyof DraftItem, value: string) => {
    setItems(current => current.map((entry, row) => row === index ? { ...entry, [field]: value } : entry));
  };

  const saveConfiguration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConfigTouched(true);
    const name = configName.trim();
    if (!name) return;
    saveSettings.mutate({
      data: { configurationName: name, paymentConfigId: configId.trim() || null },
    }, {
      onSuccess: () => {
        toast.success('Razorpay configuration saved');
        invalidate();
      },
      onError: error => toast.error('Could not save configuration', { description: friendlyError(error) }),
    });
  };

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dashboard || !canRequest) return;
    const chosenContact = dashboard.eligibleContacts.find(contact => contact.id === contactId);
    if (!chosenContact || new Date(chosenContact.windowExpiresAt).getTime() <= Date.now()) {
      toast.error('Choose a contact with an open WhatsApp service window');
      return;
    }
    const requestItems = items.map((item): WaPayOrderItemInput | null => {
      const unitAmountValue = rupeesToPaise(item.price);
      const quantity = Number(item.quantity);
      if (!item.name.trim() || !unitAmountValue || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
      if (goodsType === 'physical-goods') {
        const importerAddressLine1 = item.importerAddressLine1.trim();
        const importerCity = item.importerCity.trim();
        const importerZoneCode = item.importerZoneCode.trim();
        const importerPostalCode = item.importerPostalCode.trim();
        const importerCountryCode = item.importerCountryCode.trim().toUpperCase();
        if (!item.countryOfOrigin.trim() || !item.importerName.trim() || !importerAddressLine1 ||
          !importerCity || !importerZoneCode || !importerPostalCode || !/^[A-Z]{2}$/.test(importerCountryCode)) return null;
        return {
          name: item.name.trim(), quantity, unitAmountValue,
          countryOfOrigin: item.countryOfOrigin.trim(),
          importerName: item.importerName.trim(),
          importerAddress: {
            addressLine1: importerAddressLine1,
            ...(item.importerAddressLine2.trim() ? { addressLine2: item.importerAddressLine2.trim() } : {}),
            city: importerCity,
            zoneCode: importerZoneCode,
            postalCode: importerPostalCode,
            countryCode: importerCountryCode,
          },
        };
      }
      return { name: item.name.trim(), quantity, unitAmountValue };
    });
    if (!requestItems.length || requestItems.some(item => !item)) {
      toast.error(goodsType === 'physical-goods'
        ? 'Complete each physical item and importer declaration'
        : 'Check each item name, quantity and amount');
      return;
    }
    if (goodsType === 'physical-goods' && (
      !beneficiary.name.trim() || !beneficiary.addressLine1.trim() ||
      !beneficiary.city.trim() || !beneficiary.state.trim() || !/^\d{6}$/.test(beneficiary.postalCode.trim())
    )) {
      toast.error('Complete the beneficiary shipping recipient and six-digit postal code');
      return;
    }
    const optionalPaise = [tax, shipping, discount].map(value => value ? rupeesToPaise(value) : 0);
    if (optionalPaise.some(value => value === null)) {
      toast.error('Enter amounts in rupees with up to two decimal places');
      return;
    }
    const payload: WaPayOrderInput = {
      contactId,
      goodsType,
      items: requestItems as WaPayOrderItemInput[],
      ...(goodsType === 'physical-goods' ? {
        beneficiaries: [{
          name: beneficiary.name.trim(),
          addressLine1: beneficiary.addressLine1.trim(),
          ...(beneficiary.addressLine2?.trim() ? { addressLine2: beneficiary.addressLine2.trim() } : {}),
          city: beneficiary.city.trim(),
          state: beneficiary.state.trim(),
          postalCode: beneficiary.postalCode.trim(),
        }],
      } : {}),
      ...(tax ? { taxValue: optionalPaise[0] as number } : {}),
      ...(shipping ? { shippingValue: optionalPaise[1] as number } : {}),
      ...(discount ? { discountValue: optionalPaise[2] as number } : {}),
      ...(body.trim() ? { body: body.trim() } : {}),
      ...(footer.trim() ? { footer: footer.trim() } : {}),
    };
    createOrder.mutate({ data: payload }, {
      onSuccess: () => {
        toast.success('Payment request sent');
        invalidate();
        setShowRequest(false);
        setItems([emptyItem()]);
        setBeneficiary({ name: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '' });
        setTax('');
        setShipping('');
        setDiscount('');
        setBody('');
        setFooter('');
      },
      onError: error => {
        toast.error('Payment request could not be sent', { description: friendlyError(error) });
        // A failed WhatsApp send can still leave a recorded order on the server.
        invalidate();
      },
    });
  };

  const verify = (order: WaPayOrder) => verifyOrder.mutate({ id: order.id }, {
    onSuccess: result => {
      toast.success(result.verificationState === 'verified' ? 'Payment verified with Meta' : 'Meta lookup complete', {
        description: result.verificationState === 'mismatch' ? 'The reported amount does not match this order.' : undefined,
      });
      invalidate();
    },
    onError: error => {
      toast.error('Payment could not be verified', { description: friendlyError(error) });
      invalidate();
    },
  });

  const submitRefund = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!refundTarget) return;
    const amountValue = rupeesToPaise(refundAmount);
    const maxRefundable = refundTarget.amountValue - refundTarget.refunds
      .filter(refund => refund.status === 'pending' || refund.status === 'success')
      .reduce((sum, refund) => sum + refund.amountValue, 0);
    if (!amountValue || amountValue > maxRefundable) {
      toast.error('Enter a refund amount up to the original order total');
      return;
    }
    refundOrder.mutate({ id: refundTarget.id, data: { amountValue, speed: refundSpeed } }, {
      onSuccess: () => {
        toast.success('Refund request submitted');
        invalidate();
        setRefundTarget(null);
        setRefundAmount('');
      },
      onError: error => toast.error('Refund could not be submitted', { description: friendlyError(error) }),
    });
  };

  const submitStatus = (order: WaPayOrder) => {
    const status = statusDrafts[order.id] ?? order.orderStatus;
    updateStatus.mutate({
      id: order.id,
      data: { status, ...(statusNotes[order.id]?.trim() ? { description: statusNotes[order.id].trim() } : {}) },
    }, {
      onSuccess: () => {
        toast.success('Order status update sent');
        invalidate();
      },
      onError: error => toast.error('Status update could not be sent', { description: friendlyError(error) }),
    });
  };

  const orders = dashboard?.orders ?? [];
  const visibleOrders = orders.filter(order => {
    if (filter === 'needs_payment') return order.paymentStatus === 'pending' && order.sendStatus === 'sent';
    if (filter === 'paid') return order.paymentStatus === 'captured' && order.verificationState === 'verified';
    if (filter === 'attention') return order.sendStatus === 'failed' || order.verificationState === 'mismatch';
    if (filter === 'refunds') return order.refunds.length > 0;
    return true;
  });
  const capturedTotal = orders.filter(order => order.paymentStatus === 'captured' && order.verificationState === 'verified')
    .reduce((sum, order) => sum + order.amountValue, 0);
  const awaitingCount = orders.filter(order => order.paymentStatus === 'pending' && order.sendStatus === 'sent').length;
  const attentionCount = orders.filter(order => order.sendStatus === 'failed' || order.verificationState === 'mismatch').length;
  const busy = verifyOrder.isPending || refundOrder.isPending || updateStatus.isPending;

  if (dashboardQuery.isPending) {
    return (
      <main className="wa-pay mx-auto max-w-[1440px] space-y-6 px-4 py-6 md:px-8">
        <header className="space-y-3">
          <div className="h-3 w-28 animate-pulse bg-[#e6e7df]" />
          <div className="h-9 w-72 animate-pulse bg-[#e6e7df]" />
          <div className="h-4 w-[26rem] max-w-full animate-pulse bg-[#e6e7df]" />
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(value => <div key={value} className="h-28 animate-pulse border border-[#e6e7df] bg-[#f4f4ef]" />)}
        </div>
        <div className="h-72 animate-pulse border border-[#e6e7df] bg-[#f4f4ef]" />
      </main>
    );
  }

  if (dashboardQuery.isError || !dashboard) {
    return (
      <main className="wa-pay flex min-h-[60vh] items-center justify-center px-4">
        <section className="max-w-lg border border-[#ead6d1] bg-[#fffaf8] p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-[#ad4837]" />
          <h1 className="mt-4 text-xl font-semibold text-[#292d29]">Payments dashboard unavailable</h1>
          <p className="mt-2 text-sm text-[#6d756e]">{friendlyError(dashboardQuery.error)}</p>
          <button type="button" onClick={() => dashboardQuery.refetch()} data-testid="button-retry-wa-pay" className="wa-button wa-button-dark mt-5">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="wa-pay mx-auto max-w-[1440px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-5 border-b border-[#dfe2d9] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em] text-[#467462]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#4b9b70]" /> Payments · WhatsApp
          </p>
          <h1 className="wa-title text-3xl font-semibold tracking-[-0.04em] text-[#252d27] md:text-[2.55rem]">WhatsApp Pay</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736a]">
            Request, verify and reconcile customer payments without leaving your operations desk.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`wa-connection ${dashboard.whatsappConnected ? 'is-connected' : 'is-disconnected'}`} data-testid="status-wa-pay-connection">
            <span className="h-2 w-2 rounded-full" />
            WhatsApp {dashboard.whatsappConnected ? 'connected' : 'not connected'}
          </span>
          <button type="button" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching} data-testid="button-refresh-wa-pay" className="wa-button wa-button-quiet">
            <RefreshCw className={`h-4 w-4 ${dashboardQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={() => setShowRequest(value => !value)} disabled={!canRequest} data-testid="button-new-payment-request" className="wa-button wa-button-dark disabled:cursor-not-allowed disabled:opacity-45">
            {showRequest ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showRequest ? 'Close request' : 'Request payment'}
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Payment overview">
        <div className="wa-stat">
          <div className="flex items-center justify-between"><span>Verified captured</span><ShieldCheck className="h-4 w-4 text-[#498565]" /></div>
          <strong>{money(capturedTotal)}</strong><small>Confirmed by a server-side Meta lookup</small>
        </div>
        <div className="wa-stat">
          <div className="flex items-center justify-between"><span>Awaiting payment</span><Clock3 className="h-4 w-4 text-[#a87525]" /></div>
          <strong>{awaitingCount.toLocaleString('en-IN')}</strong><small>Sent requests not yet verified as paid</small>
        </div>
        <div className={`wa-stat ${attentionCount ? 'wa-stat-warn' : ''}`}>
          <div className="flex items-center justify-between"><span>Needs attention</span><AlertCircle className="h-4 w-4 text-[#b85743]" /></div>
          <strong>{attentionCount.toLocaleString('en-IN')}</strong><small>Failed sends or payment amount mismatches</small>
        </div>
      </section>

      <section className={`wa-setup ${settingsReady ? 'wa-setup-ready' : 'wa-setup-needed'}`} aria-label="Razorpay configuration">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="wa-setup-icon"><Settings2 className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[#28322b]">Razorpay connection</h2>
                <span className={`wa-small-tag ${settingsReady ? 'wa-tag-good' : 'wa-tag-warn'}`}>{settingsReady ? 'Configuration saved' : 'Setup required'}</span>
              </div>
              <p className="mt-1 text-sm text-[#68736a]">
                {settingsReady ? `Linked configuration: ${dashboard.settings.configurationName}` : 'Link the exact payment configuration name from WhatsApp Manager.'}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-2 text-xs font-medium text-[#68736a]">
            <CreditCard className="h-4 w-4" /> Meta native checkout · Razorpay
          </span>
        </div>
        <form onSubmit={saveConfiguration} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="wa-field">
            <span>WhatsApp Manager configuration name <b>*</b></span>
            <input value={configName} onChange={event => setConfigName(event.target.value)} maxLength={60} placeholder={dashboard.settings.configurationName || 'Exact linked name'} required data-testid="input-wa-pay-config-name" />
            <small>Must match the name linked in WhatsApp Manager exactly.</small>
          </label>
          <label className="wa-field">
            <span>Payment configuration ID <em>needed for refunds</em></span>
            <input value={configId} onChange={event => setConfigId(event.target.value)} maxLength={128} placeholder={dashboard.settings.paymentConfigId || 'Meta configuration ID'} data-testid="input-wa-pay-config-id" />
            <small>Find this in your Meta payment configuration. Never enter Razorpay keys here.</small>
          </label>
          <button type="submit" disabled={saveSettings.isPending || !configName.trim()} data-testid="button-save-wa-pay-settings" className="wa-button wa-button-green h-10 disabled:opacity-50">
            {saveSettings.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save setup
          </button>
        </form>
        {configTouched && !configName.trim() && <p role="alert" className="mt-2 text-xs text-[#b34d3c]">Configuration name is required.</p>}
      </section>

      {!dashboard.whatsappConnected && (
        <div className="wa-inline-alert" role="status">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>WhatsApp is not connected. Connect the WhatsApp Business account before sending payment requests.</p>
        </div>
      )}
      {dashboard.whatsappConnected && !settingsReady && (
        <div className="wa-inline-alert wa-inline-warn" role="status">
          <CircleHelp className="h-4 w-4 shrink-0" />
          <p>Save a Razorpay configuration to enable payment requests.</p>
        </div>
      )}

      {showRequest && (
        <section className="wa-request-panel" aria-label="Create payment request">
          <div className="flex flex-col gap-1 border-b border-[#e1e6dd] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="wa-eyebrow">New request</p>
              <h2 className="text-xl font-semibold tracking-tight text-[#26312a]">Build an order for WhatsApp</h2>
            </div>
            <span className="text-xs text-[#69766c]">Amounts are entered in rupees and sent as paise</span>
          </div>
          {eligibleContacts.length === 0 ? (
            <div className="wa-empty-inline mt-4">
              <MessageCircle className="h-5 w-5" />
              <div><strong>No eligible customers right now</strong><p>A customer must have messaged you within the open 24-hour service window.</p></div>
            </div>
          ) : (
            <form onSubmit={submitRequest} className="mt-5 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="wa-field">
                  <span>Customer with open service window <b>*</b></span>
                  <select value={contactId} onChange={event => setContactId(event.target.value)} required data-testid="select-wa-pay-contact">
                    <option value="">Choose a customer</option>
                    {dashboard.eligibleContacts.map(contact => (
                      <option key={contact.id} value={contact.id} disabled={new Date(contact.windowExpiresAt).getTime() <= Date.now()}>
                        {contact.name} · {contact.phone} · {remainingWindow(contact.windowExpiresAt)}
                      </option>
                    ))}
                  </select>
                  <small>Requests can only be sent while the customer's WhatsApp service window is open.</small>
                </label>
                <label className="wa-field">
                  <span>Order type</span>
                  <select value={goodsType} onChange={event => setGoodsType(event.target.value as WaPayOrderInput['goodsType'])} data-testid="select-wa-pay-goods-type">
                    <option value="physical-goods">Physical goods</option>
                    <option value="digital-goods">Digital goods</option>
                  </select>
                </label>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#303a33]">Line items</h3>
                  <button type="button" onClick={() => setItems(current => current.length < 20 ? [...current, emptyItem()] : current)} disabled={items.length >= 20} data-testid="button-add-wa-pay-item" className="wa-text-button disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add item</button>
                </div>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="wa-item-editor">
                      <div className="wa-line-item">
                        <label className="wa-field min-w-0 flex-1"><span className="sr-only">Item {index + 1} name</span><input value={item.name} maxLength={60} onChange={event => updateItemDraft(index, 'name', event.target.value)} placeholder="Item or service" required data-testid={`input-wa-pay-item-name-${index}`} /></label>
                        <label className="wa-field w-[88px]"><span className="sr-only">Quantity</span><input type="number" min="1" max="100" step="1" value={item.quantity} onChange={event => updateItemDraft(index, 'quantity', event.target.value)} aria-label={`Quantity for item ${index + 1}`} data-testid={`input-wa-pay-item-quantity-${index}`} /></label>
                        <label className="wa-field w-36"><span className="sr-only">Unit amount in rupees</span><div className="wa-currency-input"><span>₹</span><input inputMode="decimal" value={item.price} onChange={event => updateItemDraft(index, 'price', event.target.value)} placeholder="0.00" required aria-label={`Unit price in rupees for item ${index + 1}`} data-testid={`input-wa-pay-item-price-${index}`} /></div></label>
                        <button type="button" onClick={() => setItems(current => current.length > 1 ? current.filter((_, row) => row !== index) : current)} disabled={items.length === 1} aria-label={`Remove item ${index + 1}`} data-testid={`button-remove-wa-pay-item-${index}`} className="wa-icon-button disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      {goodsType === 'physical-goods' && (
                        <div className="wa-item-compliance">
                          <p className="wa-compliance-heading">Required Meta declaration · Item {index + 1}</p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <label className="wa-field"><span>Country of origin <b>*</b></span><input value={item.countryOfOrigin} maxLength={80} onChange={event => updateItemDraft(index, 'countryOfOrigin', event.target.value)} placeholder="For example, India" required data-testid={`input-wa-pay-origin-${index}`} /></label>
                            <label className="wa-field"><span>Importer name <b>*</b></span><input value={item.importerName} maxLength={200} onChange={event => updateItemDraft(index, 'importerName', event.target.value)} required data-testid={`input-wa-pay-importer-name-${index}`} /></label>
                            <label className="wa-field"><span>Importer address line 1 <b>*</b></span><input value={item.importerAddressLine1} maxLength={100} onChange={event => updateItemDraft(index, 'importerAddressLine1', event.target.value)} required data-testid={`input-wa-pay-importer-address1-${index}`} /></label>
                            <label className="wa-field"><span>Importer address line 2 <em>optional</em></span><input value={item.importerAddressLine2} maxLength={100} onChange={event => updateItemDraft(index, 'importerAddressLine2', event.target.value)} data-testid={`input-wa-pay-importer-address2-${index}`} /></label>
                            <label className="wa-field"><span>Importer city <b>*</b></span><input value={item.importerCity} maxLength={100} onChange={event => updateItemDraft(index, 'importerCity', event.target.value)} required data-testid={`input-wa-pay-importer-city-${index}`} /></label>
                            <label className="wa-field"><span>Zone / state code <b>*</b></span><input value={item.importerZoneCode} maxLength={60} onChange={event => updateItemDraft(index, 'importerZoneCode', event.target.value)} required data-testid={`input-wa-pay-importer-zone-${index}`} /></label>
                            <label className="wa-field"><span>Importer postal code <b>*</b></span><input value={item.importerPostalCode} maxLength={20} onChange={event => updateItemDraft(index, 'importerPostalCode', event.target.value)} required data-testid={`input-wa-pay-importer-postal-${index}`} /></label>
                            <label className="wa-field"><span>Country code <b>*</b></span><input value={item.importerCountryCode} maxLength={2} pattern="[A-Za-z]{2}" onChange={event => updateItemDraft(index, 'importerCountryCode', event.target.value.toUpperCase())} placeholder="IN" required data-testid={`input-wa-pay-importer-country-${index}`} /></label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {goodsType === 'physical-goods' && (
                <section className="wa-physical-disclosure" aria-label="Physical goods shipping and compliance details">
                  <div className="wa-inline-alert wa-inline-warn">
                    <CircleHelp className="h-4 w-4 shrink-0" />
                    <p>Meta requires shipping beneficiary and importer/origin details for physical goods. These recipient and item compliance fields are sent to Meta with the payment order.</p>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[#303a33]">Shipping recipient <span className="text-[#ad5140]">*</span></p>
                    <p className="mt-1 text-[11px] text-[#78837a]">At least one beneficiary is required for physical-goods orders.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="wa-field"><span>Recipient name <b>*</b></span><input value={beneficiary.name} maxLength={200} onChange={event => setBeneficiary(current => ({ ...current, name: event.target.value }))} required data-testid="input-wa-pay-beneficiary-name" /></label>
                      <label className="wa-field"><span>Address line 1 <b>*</b></span><input value={beneficiary.addressLine1} maxLength={100} onChange={event => setBeneficiary(current => ({ ...current, addressLine1: event.target.value }))} required data-testid="input-wa-pay-beneficiary-address1" /></label>
                      <label className="wa-field"><span>Address line 2 <em>optional</em></span><input value={beneficiary.addressLine2 ?? ''} maxLength={100} onChange={event => setBeneficiary(current => ({ ...current, addressLine2: event.target.value }))} data-testid="input-wa-pay-beneficiary-address2" /></label>
                      <label className="wa-field"><span>City <b>*</b></span><input value={beneficiary.city} maxLength={100} onChange={event => setBeneficiary(current => ({ ...current, city: event.target.value }))} required data-testid="input-wa-pay-beneficiary-city" /></label>
                      <label className="wa-field"><span>State <b>*</b></span><input value={beneficiary.state} maxLength={100} onChange={event => setBeneficiary(current => ({ ...current, state: event.target.value }))} required data-testid="input-wa-pay-beneficiary-state" /></label>
                      <label className="wa-field"><span>Six-digit postal code <b>*</b></span><input inputMode="numeric" maxLength={6} pattern="\d{6}" value={beneficiary.postalCode} onChange={event => setBeneficiary(current => ({ ...current, postalCode: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="000000" required data-testid="input-wa-pay-beneficiary-postal" /></label>
                    </div>
                  </div>
                </section>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {([{ label: 'Tax', value: tax, set: setTax }, { label: 'Shipping', value: shipping, set: setShipping }, { label: 'Discount', value: discount, set: setDiscount }] as const).map(field => (
                  <label key={field.label} className="wa-field">
                    <span>{field.label} <em>optional · ₹</em></span>
                    <div className="wa-currency-input"><span>₹</span><input inputMode="decimal" value={field.value} onChange={event => field.set(event.target.value)} placeholder="0.00" data-testid={`input-wa-pay-${field.label.toLowerCase()}`} /></div>
                  </label>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="wa-field"><span>Message to customer <em>optional</em></span><textarea rows={2} maxLength={1024} value={body} onChange={event => setBody(event.target.value)} placeholder="Add a short note with the payment request" data-testid="input-wa-pay-body" /></label>
                <label className="wa-field"><span>Order footer <em>optional</em></span><input maxLength={60} value={footer} onChange={event => setFooter(event.target.value)} placeholder="For example, Thank you" data-testid="input-wa-pay-footer" /></label>
              </div>
              <div className="flex flex-col gap-4 border-t border-[#e1e6dd] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div><span className="text-xs font-medium uppercase tracking-wider text-[#718076]">Order total</span><p className="text-2xl font-semibold tabular-nums tracking-tight text-[#24352b]">{money(total)}</p></div>
                <button type="submit" disabled={createOrder.isPending || !contactId || !items.every((item, index) => item.name.trim() && itemPaise[index] && Number(item.quantity) >= 1)} data-testid="button-send-wa-pay-request" className="wa-button wa-button-green min-h-11 disabled:cursor-not-allowed disabled:opacity-45">
                  {createOrder.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send payment request
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="wa-orders">
        <div className="flex flex-col gap-4 border-b border-[#e3e6df] px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="wa-eyebrow">Order ledger</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#29322c]">Recent payment orders</h2>
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter payment orders">
            {([
              ['all', 'All orders'],
              ['needs_payment', 'Awaiting'],
              ['paid', 'Verified paid'],
              ['attention', 'Attention'],
              ['refunds', 'Refunds'],
            ] as Array<[OrderFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} data-testid={`filter-wa-pay-${value}`} className={`wa-filter ${filter === value ? 'is-active' : ''}`}>{label}</button>
            ))}
          </div>
        </div>

        {dashboardQuery.isFetching && <div className="h-0.5 w-full overflow-hidden bg-[#eef0e8]"><div className="h-full w-1/3 animate-pulse bg-[#53866a]" /></div>}
        {orders.length === 0 ? (
          <div className="wa-empty-state">
            <div className="wa-empty-mark"><Banknote className="h-6 w-6" /></div>
            <h3>No payment orders yet</h3>
            <p>Once a payment request is sent, its delivery, verification and refund history will be recorded here.</p>
            <button type="button" onClick={() => setShowRequest(true)} disabled={!canRequest} data-testid="button-empty-create-wa-pay" className="wa-button wa-button-dark mt-4 disabled:opacity-45"><Plus className="h-4 w-4" /> Create first request</button>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-[#39443c]">Nothing in this view</p>
            <p className="mt-1 text-sm text-[#758077]">Choose another filter to see more payment orders.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#edf0e9]">
            {visibleOrders.map(order => {
              const expanded = expandedOrder === order.id;
              const orderRefundTotal = order.refunds.reduce((sum, refund) => sum + (refund.status === 'success' ? refund.amountValue : 0), 0);
              const verifiedPaid = order.paymentStatus === 'captured' && order.verificationState === 'verified';
              const refundEligible = verifiedPaid && configIdReady && order.amountValue - orderRefundTotal > 0;
              return (
                <article key={order.id} className="wa-order-row" data-testid={`row-wa-pay-order-${order.id}`}>
                  <button type="button" onClick={() => setExpandedOrder(expanded ? null : order.id)} aria-expanded={expanded} data-testid={`button-expand-wa-pay-order-${order.id}`} className="wa-order-summary">
                    <div className="wa-order-person">
                      <span className="wa-avatar">{order.contactName.trim().charAt(0).toUpperCase() || '?'}</span>
                      <span className="min-w-0"><strong className="block truncate">{order.contactName}</strong><small className="block truncate">{order.recipientPhone}</small></span>
                    </div>
                    <div className="wa-order-ref"><small>Reference</small><strong>{order.referenceId}</strong></div>
                    <div className="wa-order-amount"><small>Amount</small><strong>{money(order.amountValue)}</strong></div>
                    <div className="wa-order-status"><PaymentBadge order={order} /><small>{dateTime(order.createdAt)}</small></div>
                    <ChevronDown className={`wa-chevron h-4 w-4 ${expanded ? 'is-open' : ''}`} />
                  </button>
                  {expanded && (
                    <div className="wa-order-detail">
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-[#303b33]">Payment check</h3>
                            <span className={`wa-small-tag ${order.verificationState === 'verified' ? 'wa-tag-good' : order.verificationState === 'mismatch' ? 'wa-tag-bad' : 'wa-tag-warn'}`}>
                              {order.verificationState === 'verified' ? 'Meta verified' : order.verificationState === 'mismatch' ? 'Mismatch' : 'Not verified'}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] text-[#69766c]">Meta order status: <strong className="font-semibold text-[#445248]">{order.orderStatus}</strong></p>
                          <p className="mt-2 text-xs leading-5 text-[#68736a]">A Meta payment notification is not proof of payment. Only a successful server-side Meta lookup verifies the payment.</p>
                          <div className="mt-3 space-y-2">
                            {order.items.map((item, index) => (
                              <div key={`${item.name}-${index}`} className="flex justify-between gap-4 text-sm">
                                <span className="text-[#556158]">{item.quantity} × {item.name}</span><strong className="tabular-nums text-[#303b33]">{money(item.quantity * item.unitAmountValue)}</strong>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 border-t border-[#e3e7df] pt-3 text-xs text-[#748077]">Last checked {dateTime(order.lastVerifiedAt)} · {order.goodsType === 'physical-goods' ? 'Physical goods' : 'Digital goods'}</p>
                          {order.sendStatus === 'failed' && order.sendError && <p className="mt-2 border-l-2 border-[#c15a47] bg-[#fff5f2] px-3 py-2 text-xs text-[#984b3c]">Send error: {order.sendError}</p>}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-[#303b33]">Activity</h3>
                          <div className="mt-2 space-y-2">
                            {order.transactions.length ? order.transactions.map(transaction => (
                              <div key={transaction.id} className="wa-history-line">
                                <span className={`wa-history-dot ${transaction.status === 'success' ? 'dot-good' : transaction.status === 'failed' ? 'dot-bad' : ''}`} />
                                <div className="min-w-0 flex-1"><strong>{transaction.status === 'success' ? 'Payment captured' : transaction.status === 'failed' ? 'Payment attempt failed' : 'Payment pending'}</strong><small>{transaction.method || transaction.gatewayPaymentId || transaction.errorReason || 'Gateway transaction'} · {dateTime(transaction.updatedAt)}</small></div>
                                {transaction.amountValue !== null && <b>{money(transaction.amountValue)}</b>}
                              </div>
                            )) : <p className="text-xs text-[#7b857d]">No gateway transactions recorded.</p>}
                            {order.refunds.map(refund => (
                              <div key={refund.id} className="wa-history-line">
                                <span className={`wa-history-dot ${refund.status === 'success' ? 'dot-good' : refund.status === 'failed' ? 'dot-bad' : ''}`} />
                                <div className="min-w-0 flex-1"><strong>{refund.status === 'success' ? 'Refund completed' : refund.status === 'failed' ? 'Refund failed' : 'Refund processing'}</strong><small>{refund.speedProcessed || 'Speed pending'} · {dateTime(refund.createdAt)}</small></div><b>{money(refund.amountValue)}</b>
                              </div>
                            ))}
                            {order.refunds.length === 0 && <div className="wa-history-line"><span className="wa-history-dot" /><div><strong>Request {order.sendStatus}</strong><small>Created {dateTime(order.createdAt)}{order.metaMessageId ? ` · Message ${order.metaMessageId}` : ''}</small></div></div>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col gap-4 border-t border-[#e3e7df] pt-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => verify(order)} disabled={busy || order.sendStatus !== 'sent' || verifiedPaid} data-testid={`button-verify-wa-pay-${order.id}`} className="wa-button wa-button-quiet disabled:cursor-not-allowed disabled:opacity-40" title={verifiedPaid ? 'Already verified' : 'Check payment status directly with Meta'}>
                            {verifyOrder.isPending && verifyOrder.variables?.id === order.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify with Meta
                          </button>
                          <button type="button" onClick={() => { setRefundTarget(order); setRefundAmount(((order.amountValue - orderRefundTotal) / 100).toFixed(2)); }} disabled={!refundEligible || busy} data-testid={`button-refund-wa-pay-${order.id}`} className="wa-button wa-button-quiet disabled:cursor-not-allowed disabled:opacity-40" title={!configIdReady ? 'Save a payment configuration ID to enable refunds' : !verifiedPaid ? 'Verify the captured payment before refunding' : 'Submit a full or partial refund'}>
                            <RotateCcw className="h-4 w-4" /> Refund
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[180px_minmax(180px,1fr)_auto] xl:min-w-[620px]">
                          <label className="wa-field"><span className="sr-only">New Meta order status</span><select aria-label="New Meta order status" value={statusDrafts[order.id] ?? order.orderStatus} onChange={event => setStatusDrafts(current => ({ ...current, [order.id]: event.target.value as WaPayOrderStatusInput['status'] }))} data-testid={`select-wa-pay-order-status-${order.id}`}>
                            {orderStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                          </select></label>
                          <label className="wa-field"><span className="sr-only">Status message</span><input aria-label="Optional status message" maxLength={120} value={statusNotes[order.id] ?? ''} onChange={event => setStatusNotes(current => ({ ...current, [order.id]: event.target.value }))} placeholder="Optional customer update" data-testid={`input-wa-pay-status-note-${order.id}`} /></label>
                          <button type="button" onClick={() => submitStatus(order)} disabled={busy || order.sendStatus !== 'sent'} data-testid={`button-send-wa-pay-status-${order.id}`} className="wa-button wa-button-green disabled:cursor-not-allowed disabled:opacity-40">
                            {updateStatus.isPending && updateStatus.variables?.id === order.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />} Send update
                          </button>
                        </div>
                      </div>
                      {!configIdReady && verifiedPaid && <p className="mt-3 text-xs text-[#8b6a2c]">A payment configuration ID is required before a refund can be requested.</p>}
                      {orderRefundTotal > 0 && <p className="mt-2 text-xs text-[#69766c]">Successfully refunded: {money(orderRefundTotal)}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="flex flex-col gap-2 border-t border-[#dfe3db] pt-4 text-xs leading-5 text-[#748077] sm:flex-row sm:items-start sm:justify-between">
        <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#56866a]" /> Payment notifications alone are not proof of payment. Airavata marks an order verified only after the server checks the payment with Meta.</p>
        <p className="shrink-0">Gateway: Razorpay · Currency: INR</p>
      </footer>

      {refundTarget && (
        <div className="wa-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !refundOrder.isPending) setRefundTarget(null); }}>
          <section className="wa-modal" role="dialog" aria-modal="true" aria-labelledby="refund-title">
            <div className="flex items-start justify-between gap-4">
              <div><p className="wa-eyebrow">Verified payment</p><h2 id="refund-title" className="mt-1 text-xl font-semibold text-[#29332c]">Refund payment</h2><p className="mt-1 text-sm text-[#707b72]">{refundTarget.contactName} · {refundTarget.referenceId}</p></div>
              <button type="button" onClick={() => setRefundTarget(null)} disabled={refundOrder.isPending} aria-label="Close refund dialog" data-testid="button-close-wa-pay-refund" className="wa-icon-button"><X className="h-4 w-4" /></button>
            </div>
            <div className="my-5 rounded-md bg-[#f1f4ed] p-3 text-sm"><span className="text-[#69766c]">Maximum refundable</span><strong className="float-right tabular-nums text-[#2f3d33]">{money(Math.max(0, refundTarget.amountValue - refundTarget.refunds.filter(refund => refund.status === 'success').reduce((sum, refund) => sum + refund.amountValue, 0)))}</strong></div>
            <form onSubmit={submitRefund} className="space-y-4">
              <label className="wa-field"><span>Refund amount <b>*</b></span><div className="wa-currency-input"><span>₹</span><input autoFocus inputMode="decimal" value={refundAmount} onChange={event => setRefundAmount(event.target.value)} required data-testid="input-wa-pay-refund-amount" /></div><small>Enter the full or partial amount in rupees.</small></label>
              <label className="wa-field"><span>Processing speed</span><select value={refundSpeed} onChange={event => setRefundSpeed(event.target.value as 'normal' | 'instant')} data-testid="select-wa-pay-refund-speed"><option value="normal">Normal</option><option value="instant">Instant</option></select></label>
              <div className="wa-inline-alert wa-inline-warn"><CircleHelp className="h-4 w-4 shrink-0" /><p>This submits the refund through Meta using the saved payment configuration ID.</p></div>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setRefundTarget(null)} disabled={refundOrder.isPending} data-testid="button-cancel-wa-pay-refund" className="wa-button wa-button-quiet">Cancel</button><button type="submit" disabled={refundOrder.isPending || !configIdReady} data-testid="button-submit-wa-pay-refund" className="wa-button wa-button-dark disabled:opacity-50">{refundOrder.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDownLeft className="h-4 w-4" />} Submit refund</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}