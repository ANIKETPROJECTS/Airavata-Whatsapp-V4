import { useState } from 'react';
import { Lottie } from 'lottie-react';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import razorpayLogo from '@/assets/razorpay-merchant-logo.svg';
import paymentSuccessAnimation from '@/assets/payment-success-check.json';

type PreviewMode = 'current' | 'updated';
type Props = { mode: PreviewMode };
type PaymentStage = 'ready' | 'processing';

const amount = '₹6,913.50';
const orderId = 'INV20260901015';

function GooglePayMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="payment-brand-mark">
      <path fill="#4285F4" d="M21.35 12.25c0-.72-.06-1.42-.18-2.1H12v3.97h5.23a4.5 4.5 0 0 1-1.96 2.96v2.47h3.17c1.85-1.7 2.91-4.2 2.91-7.3z" />
      <path fill="#34A853" d="M12 21.6c2.64 0 4.85-.87 6.46-2.36l-3.17-2.47c-.88.59-2 .94-3.29.94-2.53 0-4.68-1.71-5.45-4.01H3.28v2.55A9.75 9.75 0 0 0 12 21.6z" />
      <path fill="#FBBC05" d="M6.55 13.7a5.86 5.86 0 0 1 0-3.4V7.75H3.28a9.75 9.75 0 0 0 0 8.5z" />
      <path fill="#EA4335" d="M12 6.29c1.44 0 2.73.49 3.75 1.46l2.82-2.82C16.84 3.35 14.64 2.4 12 2.4a9.75 9.75 0 0 0-8.72 5.35l3.27 2.55C7.32 8 9.47 6.29 12 6.29z" />
    </svg>
  );
}

function PaytmMark() {
  return <span aria-hidden="true" className="payment-paytm-mark">pay<strong>tm</strong></span>;
}

function PhonePeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="payment-brand-mark">
      <circle cx="12" cy="12" r="11" fill="#5F259F" />
      <path d="M8 5.5h5.25a4 4 0 0 1 0 8H11v5H8zm3 3v2h2.25a1 1 0 0 0 0-2z" fill="#fff" />
    </svg>
  );
}

export function PaymentPreview({ mode }: Props) {
  const updated = mode === 'updated';
  const [upiExpanded, setUpiExpanded] = useState(updated);
  const [selectedApp, setSelectedApp] = useState('Google Pay');
  const [paymentStage, setPaymentStage] = useState<PaymentStage>('ready');

  return (
    <main className={`payment-demo payment-demo--${mode}`}>
      <div className="payment-phone">
        <section className="payment-screen" aria-label="Razorpay payment preview">
          <div className="payment-statusbar">
            <span>23:59</span><span className="payment-island" aria-hidden="true" />
            <span className="payment-status-icons">▮ ▮ 100</span>
          </div>
          <div className="payment-topbar">
            <img src={razorpayLogo} alt="Razorpay" className="payment-logo" />
            <span className="payment-secure"><LockKeyhole size={14} /> Secured</span>
          </div>
          {paymentStage === 'ready' && (
            <div className="payment-summary">
              <div className="payment-merchant">
                <span className="payment-merchant-mark">R</span>
                <span className="payment-merchant-copy"><small>Paying to</small><strong>Rangrez Studio</strong><small>Order #{orderId}</small></span>
              </div>
              <span className="payment-total"><span>Total</span><strong>{amount}</strong></span>
            </div>
          )}
          {paymentStage === 'processing' ? (
            <div className="payment-processing" role="status" aria-live="polite">
              <Lottie
                src={paymentSuccessAnimation}
                loop={false}
                autoplay
                className="payment-lottie"
                aria-hidden="true"
              />
              <strong>Payment successful</strong>
              <span>Completing your payment</span>
              <h2>{amount}</h2>
              <p>Paid to <strong>Rangrez Studio</strong></p>
              <div className="payment-success-details">
                <span><small>Payment ID</small><strong>pay_2026090115R8K4</strong></span>
                <span><small>Method</small><strong>UPI · {selectedApp}</strong></span>
              </div>
              <small className="payment-note"><ShieldCheck size={13} /> Preview only · no payment was processed</small>
            </div>
          ) : (
            <div className="payment-content">
              <div className="payment-heading">
                <strong>Choose a payment method</strong>
                <small>All transactions are secure and encrypted</small>
              </div>
              <button
                type="button"
                className={`payment-method ${upiExpanded ? 'is-selected' : ''}`}
                aria-expanded={upiExpanded}
                onClick={() => !updated && setUpiExpanded(value => !value)}
              >
                <span className="payment-method-icon"><Smartphone size={19} /></span>
                <span className="payment-method-copy"><strong>UPI</strong><small>Google Pay, PhonePe, Paytm and more</small></span>
                {upiExpanded ? <ChevronDown size={16} /> : <ArrowRight size={16} />}
              </button>
              {upiExpanded && (
                <div className="payment-upi-panel">
                  <span className="payment-upi-title">Select a UPI app</span>
                  <div className="payment-apps">
                    <button type="button" className={selectedApp === 'Google Pay' ? 'is-active' : ''} aria-pressed={selectedApp === 'Google Pay'} onClick={() => setSelectedApp('Google Pay')}>
                      <GooglePayMark /><span>Google Pay</span>
                    </button>
                    <button type="button" className={selectedApp === 'Paytm' ? 'is-active' : ''} aria-pressed={selectedApp === 'Paytm'} onClick={() => setSelectedApp('Paytm')}>
                      <PaytmMark /><span>Paytm</span>
                    </button>
                    <button type="button" className={selectedApp === 'PhonePe' ? 'is-active' : ''} aria-pressed={selectedApp === 'PhonePe'} onClick={() => setSelectedApp('PhonePe')}>
                      <PhonePeMark /><span>PhonePe</span>
                    </button>
                  </div>
                  <span className="payment-upi-divider">OR</span>
                  <div className="payment-upi-id">
                    <span><small>UPI ID</small><strong>priya@okaxis</strong></span><Check size={17} />
                  </div>
                </div>
              )}
              <div className="payment-method is-muted">
                <span className="payment-method-icon"><CreditCard size={18} /></span>
                <span className="payment-method-copy"><strong>Cards</strong><small>Visa, Mastercard, RuPay</small></span>
                <ArrowRight size={15} />
              </div>
              <div className="payment-method is-muted">
                <span className="payment-method-icon"><Building2 size={18} /></span>
                <span className="payment-method-copy"><strong>Netbanking</strong><small>All Indian banks</small></span>
                <ArrowRight size={15} />
              </div>
              <button type="button" className="payment-pay" onClick={() => setPaymentStage('processing')}>
                <span>Pay {amount}</span><span>Continue <ArrowRight size={16} /></span>
              </button>
              <p className="payment-note"><ShieldCheck size={13} /> Preview only · no payment is processed</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
