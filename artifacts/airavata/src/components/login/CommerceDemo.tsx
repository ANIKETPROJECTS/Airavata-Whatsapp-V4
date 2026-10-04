import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronDown,
  Download,
  FileText,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { DevicePreviewFrame } from '../DevicePreview';
import { createDemoInvoicePdf } from './createDemoInvoicePdf';
import figmaChatScreen from '@assets/Messages_-_Full_view_1791144042420.svg';
import sareeImage from '@assets/generated_images/atw-banarasi-saree-product.jpg';

type DemoStep =
  | 'template'
  | 'customerReply'
  | 'details'
  | 'flow'
  | 'confirmed'
  | 'razorpay'
  | 'paymentSuccess'
  | 'paid'
  | 'invoiceViewer';

type CheckoutDetails = {
  name: string;
  phone: string;
  address: string;
  city: string;
  pinCode: string;
};

type Receipt = CheckoutDetails & { orderId: string };

const emptyCheckout: CheckoutDetails = {
  name: '',
  phone: '',
  address: '',
  city: '',
  pinCode: '',
};

const demoCheckout: CheckoutDetails = {
  name: 'Demo Customer',
  phone: '+91 90000 00000',
  address: '12 Demo Lane, Silk Market',
  city: 'Varanasi',
  pinCode: '221001',
};

const productPrice = '₹6,490';
const figmaCanvasScale = 252 / 393;

function FigmaSvgCrop({
  x,
  y,
  width,
  height,
  className,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <span
      className={`demo-figma-crop ${className ?? ''}`}
      style={{ width: width * figmaCanvasScale, height: height * figmaCanvasScale }}
      aria-hidden="true"
    >
      <img
        src={figmaChatScreen}
        alt=""
        draggable={false}
        style={{
          width: 252,
          left: -x * figmaCanvasScale,
          top: -y * figmaCanvasScale,
        }}
      />
    </span>
  );
}

function FigmaReadReceipt({ ariaLabel }: { ariaLabel?: string }) {
  return (
    <svg
      width="10"
      height="7"
      viewBox="352.5 392 15 10"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
    >
      <path
        d="M366.724 393.242C366.971 392.934 366.921 392.484 366.613 392.237C366.305 391.989 365.854 392.039 365.607 392.347L359.922 399.428L359.487 398.993C359.207 398.714 358.754 398.714 358.474 398.994C358.195 399.273 358.195 399.727 358.475 400.007L359.475 401.006C359.619 401.15 359.817 401.225 360.02 401.214C360.223 401.203 360.411 401.106 360.539 400.947L366.724 393.242ZM362.638 393.243C362.885 392.934 362.835 392.484 362.527 392.236C362.219 391.989 361.768 392.039 361.521 392.347L355.836 399.429L353.9 397.494C353.621 397.214 353.168 397.214 352.888 397.494C352.609 397.773 352.609 398.227 352.889 398.506L355.389 401.006C355.533 401.15 355.731 401.225 355.934 401.214C356.137 401.203 356.326 401.106 356.453 400.948L362.638 393.243Z"
        fill="#007BFC"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function CommerceDemo() {
  const [step, setStep] = useState<DemoStep>('template');
  const [checkout, setCheckout] = useState<CheckoutDetails>(emptyCheckout);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [invoicePdfUrl, setInvoicePdfUrl] = useState<string | null>(null);
  const [flowTypingField, setFlowTypingField] = useState<keyof CheckoutDetails | null>(null);
  const [screenWidth, setScreenWidth] = useState(252);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const demoStageRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const invoiceViewerShownRef = useRef(false);
  const nextOrderNumber = useRef(2048);

  useEffect(() => {
    const stage = demoStageRef.current;
    if (!stage) return;

    const updateScreenWidth = () => {
      const heightLimit = Math.floor(stage.clientHeight / 2.35);
      const widthLimit = stage.clientWidth - 36;
      if (heightLimit <= 0 || widthLimit <= 0) return;
      setScreenWidth(Math.max(160, Math.min(heightLimit, widthLimit)));
    };

    const observer = new ResizeObserver(updateScreenWidth);
    observer.observe(stage);
    updateScreenWidth();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const chatBody = chatBodyRef.current;
    if (!chatBody) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldJumpToLatest = step === 'confirmed' || step === 'paid';
    chatBody.scrollTo({
      top: chatBody.scrollHeight,
      behavior: prefersReducedMotion || shouldJumpToLatest ? 'auto' : 'smooth',
    });
    if (shouldJumpToLatest) setShowScrollButton(false);
  }, [step]);

  useEffect(() => {
    let timeout: number | undefined;
    if (step === 'template') {
      timeout = window.setTimeout(() => setStep('customerReply'), 3300);
    } else if (step === 'customerReply') {
      timeout = window.setTimeout(() => setStep('details'), 3200);
    } else if (step === 'details') {
      timeout = window.setTimeout(() => setStep('flow'), 4700);
    } else if (step === 'confirmed') {
      timeout = window.setTimeout(() => setStep('razorpay'), 4700);
    } else if (step === 'razorpay') {
      timeout = window.setTimeout(() => setStep('paymentSuccess'), 5700);
    } else if (step === 'paymentSuccess') {
      timeout = window.setTimeout(() => setStep('paid'), 3700);
    } else if (step === 'paid' && !invoiceViewerShownRef.current) {
      timeout = window.setTimeout(() => {
        invoiceViewerShownRef.current = true;
        setStep('invoiceViewer');
      }, 6500);
    } else if (step === 'invoiceViewer') {
      timeout = window.setTimeout(() => setStep('paid'), 7500);
    }
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [step]);

  const completeCheckout = useCallback((details: CheckoutDetails) => {
    const orderId = `ATW-${nextOrderNumber.current}`;
    nextOrderNumber.current += 1;
    setReceipt({ ...details, orderId });
    setFlowTypingField(null);
    setStep('confirmed');
  }, []);

  useEffect(() => {
    if (!receipt) {
      setInvoicePdfUrl(null);
      return;
    }

    const invoiceUrl = URL.createObjectURL(createDemoInvoicePdf(receipt));
    setInvoicePdfUrl(invoiceUrl);
    return () => URL.revokeObjectURL(invoiceUrl);
  }, [receipt]);

  useEffect(() => {
    if (step !== 'flow') return;
    setCheckout({ ...emptyCheckout });
    setFlowTypingField(null);

    const timers: number[] = [];
    const fields = Object.entries(demoCheckout) as Array<[keyof CheckoutDetails, string]>;
    let cursor = 400;
    for (const [field, value] of fields) {
      const fieldStart = cursor;
      timers.push(window.setTimeout(() => setFlowTypingField(field), fieldStart));
      for (let length = 1; length <= value.length; length += 1) {
        timers.push(window.setTimeout(
          () => setCheckout(current => ({ ...current, [field]: value.slice(0, length) })),
          fieldStart + length * 42,
        ));
      }
      cursor += value.length * 42 + 350;
    }
    timers.push(window.setTimeout(() => setFlowTypingField(null), cursor));
    timers.push(window.setTimeout(() => completeCheckout(demoCheckout), cursor + 1100));

    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [step, completeCheckout]);

  const openCheckoutFlow = () => {
    setStep('flow');
  };

  const openInvoiceViewer = () => {
    if (!invoicePdfUrl) return;
    invoiceViewerShownRef.current = true;
    setStep('invoiceViewer');
  };

  const closeInvoiceViewer = () => {
    setStep('paid');
  };

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    completeCheckout(checkout);
  };

  const replayDemo = () => {
    setStep('template');
    setCheckout({ ...emptyCheckout });
    setReceipt(null);
    invoiceViewerShownRef.current = false;
    setFlowTypingField(null);
  };

  const screenScale = screenWidth / 252;
  const screenHeight = Math.round(524 * screenScale);
  const checkoutReady = Object.values(checkout).every(Boolean);

  return (
    <div className="demo-stage" ref={demoStageRef}>
      <div className="demo-phone-wrap">
        <DevicePreviewFrame device="ios" screenWidth={screenWidth} hideStatusBar>
          <div className="demo-phone-screen" style={{ height: screenHeight }}>
            <div className="demo-screen-content" style={{ transform: `scale(${screenScale})` }}>
              <div className="demo-status-bar" aria-label="iPhone status bar, 23:59, battery 100 percent">
                <FigmaSvgCrop x={0} y={0} width={393} height={42} className="demo-status-art" />
              </div>
              <div className="demo-chat-header">
                <FigmaSvgCrop x={3} y={58} width={22} height={36} className="demo-back-art" />
                <div className="demo-shop-avatar">R</div>
                <div className="demo-shop-name"><strong>Rangrez Studio</strong><small>tap here for contact info</small></div>
                <FigmaSvgCrop x={288} y={58} width={88} height={36} className="demo-header-actions-art" />
              </div>
              <div
                ref={chatBodyRef}
                className="demo-chat-body"
                aria-live="polite"
                 aria-label="Self-running WhatsApp conversation on a customer's phone"
                onScroll={event => {
                  const body = event.currentTarget;
                  setShowScrollButton(body.scrollHeight - body.scrollTop - body.clientHeight > 24);
                }}
              >
                <FigmaSvgCrop x={146} y={280} width={101} height={21} className="demo-date-art" />
                <div className="demo-product-bubble message-appear" data-testid="card-demo-product-template">
                  <div className="demo-product-card">
                    <img
                      className="demo-product-image"
                      src={sareeImage}
                      alt="Deep crimson Banarasi silk saree with a gold zari border"
                    />
                    <div className="demo-product-info">
                      <span className="demo-template-label">NEW ARRIVAL · BANARASI COLLECTION</span>
                      <strong>Banarasi Silk Saree</strong>
                      <p>A festive new arrival, handwoven in rich crimson Katan silk with intricate gold zari detailing.</p>
                      <div className="demo-product-meta"><span>Pure Katan · 6.3 m</span><b>{productPrice}</b></div>
                    </div>
                    <div className="demo-template-meta">
                      <time>10:40</time>
                    </div>
                  </div>
                </div>

                {step !== 'template' && (
                  <div className="demo-message from-customer message-appear" data-testid="message-demo-customer-question">
                    <span className="demo-message-copy">This saree is beautiful! Could you share the fabric, length and blouse details?</span>
                    <span className="demo-outgoing-meta"><time>10:41</time><FigmaReadReceipt /></span>
                  </div>
                )}

                {(step === 'details' || step === 'flow' || step === 'confirmed' || step === 'razorpay' || step === 'paymentSuccess' || step === 'paid' || step === 'invoiceViewer') && (
                  <div className="demo-message from-business demo-detail-message message-appear" data-testid="message-demo-product-details">
                    <span className="demo-message-label">AUTOMATED CHATBOT REPLY</span>
                    <p>Absolutely! This Banarasi saree is handwoven in Varanasi from pure Katan silk.</p>
                    <div className="demo-spec-list">
                      <div className="demo-spec-row"><span>Fabric</span><b>Pure Katan silk</b></div>
                      <div className="demo-spec-row"><span>Saree length</span><b>6.3 metres</b></div>
                      <div className="demo-spec-row"><span>Blouse</span><b>Matching unstitched piece</b></div>
                      <div className="demo-spec-row"><span>Work & care</span><b>Gold zari · dry clean</b></div>
                    </div>
                    <div className="demo-detail-price">{productPrice} <span>· Ships in 2–4 days</span></div>
                    <button
                      type="button"
                      className={`details-buy-button ${step === 'details' ? 'demo-auto-press' : ''}`}
                      onClick={openCheckoutFlow}
                      disabled={step !== 'details'}
                      data-testid="button-demo-details-buy-now"
                    >
                      Buy Now <ArrowRight size={11} />
                    </button>
                    <span className="demo-incoming-meta"><time>10:42</time></span>
                  </div>
                )}

                {(step === 'flow' || step === 'confirmed' || step === 'razorpay' || step === 'paymentSuccess' || step === 'paid' || step === 'invoiceViewer') && (
                  <div className="demo-message from-customer message-appear" data-testid="message-demo-buy-now">
                    <span className="demo-message-copy">Buy Now</span>
                    <span className="demo-outgoing-meta"><time>10:43</time><FigmaReadReceipt /></span>
                  </div>
                )}

                {step === 'confirmed' && receipt && (
                  <>
                    <div className="demo-message from-business demo-receipt message-appear" data-testid="message-demo-receipt">
                      <span className="receipt-heading"><Check size={11} /> ORDER SUMMARY · DEMO</span>
                      <strong className="receipt-thanks">Thanks, {receipt.name}! Your saree is reserved.</strong>
                      <div className="receipt-line"><span>Order number</span><b>{receipt.orderId}</b></div>
                      <div className="receipt-line"><span>Banarasi Silk Saree</span><b>{productPrice}</b></div>
                      <div className="receipt-line receipt-total"><span>Total</span><b>{productPrice}</b></div>
                      <div className="receipt-address">
                        Delivering to {receipt.address}, {receipt.city} {receipt.pinCode}
                      </div>
                      <span className="receipt-pending">Payment pending · order is reserved</span>
                      <time>10:44</time>
                    </div>
                    <div className="demo-message from-business demo-payment message-appear" data-testid="message-demo-payment">
                      <span className="payment-label"><ShieldCheck size={11} /> RAZORPAY PAYMENT LINK · DEMO</span>
                      <p>Continue to the secure-looking sample checkout. This preview cannot charge you.</p>
                      <button
                        type="button"
                        className="payment-link"
                        onClick={() => setStep('razorpay')}
                        data-testid="button-demo-payment-link"
                      >
                        Pay with Razorpay · {productPrice} <ArrowRight size={11} />
                      </button>
                      <time>10:44</time>
                    </div>
                  </>
                )}
                {(step === 'paid' || step === 'invoiceViewer') && receipt && (
                  <>
                    <div className="demo-message from-business demo-payment-confirmation message-appear" data-testid="message-demo-payment-success">
                      <span className="payment-label"><Check size={11} /> RAZORPAY PAYMENT SUCCESSFUL · DEMO</span>
                      <strong className="receipt-thanks">Payment received · {productPrice}</strong>
                      <div className="receipt-line"><span>Payment ID</span><b>pay_DEMO{receipt.orderId.replace(/\D/g, '')}</b></div>
                      <div className="receipt-line"><span>Method</span><b>UPI · Demo</b></div>
                      <time>10:45</time>
                    </div>
                    <div className="demo-message from-business demo-invoice message-appear" data-testid="message-demo-invoice-pdf">
                      <span className="invoice-heading"><FileText size={11} /> INVOICE SHARED · PDF</span>
                      <div className="invoice-document">
                        <span className="invoice-file-icon"><FileText size={16} /></span>
                        <span className="invoice-file-copy">
                          <strong>Invoice-{receipt.orderId}.pdf</strong>
                          <small>PDF · 1 page · Payment received</small>
                        </span>
                      </div>
                      {invoicePdfUrl ? (
                        <button
                          type="button"
                          className="invoice-open-link"
                          onClick={openInvoiceViewer}
                          data-testid="button-demo-invoice-preview"
                        >
                          Preview invoice <ArrowRight size={10} />
                        </button>
                      ) : (
                        <span className="invoice-preparing">Preparing invoice PDF…</span>
                      )}
                      <time>10:46</time>
                    </div>
                    <div className="demo-message from-business demo-order-status message-appear" data-testid="message-demo-order-status">
                      <span className="order-status-heading"><PackageCheck size={11} /> ORDER UPDATE</span>
                      <div className="order-status-summary">
                        <span className="order-status-number">Order {receipt.orderId}</span>
                        <strong>Processing</strong>
                      </div>
                      <div className="order-status-timeline" aria-label="Paid, processing, dispatch next">
                        <div className="order-timeline-step is-complete"><span /><small>Paid</small></div>
                        <div className="order-timeline-connector is-complete" />
                        <div className="order-timeline-step is-current"><span /><small>Processing</small></div>
                        <div className="order-timeline-connector" />
                        <div className="order-timeline-step"><span /><small>Dispatch</small></div>
                      </div>
                      <p>Your saree is being prepared. Tracking will be shared once it is dispatched.</p>
                      <button
                        type="button"
                        className="demo-replay-button"
                        onClick={replayDemo}
                        data-testid="button-demo-replay"
                      >
                        <RotateCcw size={10} /> Start demo again
                      </button>
                      <time>10:47</time>
                    </div>
                  </>
                )}
                {showScrollButton && (
                  <button
                    type="button"
                    className="demo-scroll-bottom"
                    aria-label="Scroll to latest messages"
                    onClick={() => chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: 'smooth' })}
                  >
                    <ChevronDown size={15} strokeWidth={2.2} />
                  </button>
                )}
              </div>
              <div className="demo-chat-footer">
                <div role="group" aria-label="WhatsApp message composer">
                  <FigmaSvgCrop x={0} y={1625} width={393} height={45} className="demo-composer-art" />
                </div>
              </div>
              {step === 'flow' && (
                <div className="demo-flow-screen" role="region" aria-label="WhatsApp Flow delivery form" data-testid="card-demo-flow">
                  <div className="flow-screen-topbar">
                    <span className="flow-screen-mark">R</span>
                    <span className="flow-screen-brand">
                      <strong>Rangrez Studio</strong>
                      <small>WhatsApp Flow · Secure checkout</small>
                    </span>
                    <span className="flow-screen-page">1 OF 1</span>
                  </div>
                  <div className="flow-screen-content">
                    <div className="flow-screen-intro">
                      <span className="flow-screen-kicker">SECURE CHECKOUT · DEMO</span>
                      <h2>Delivery details</h2>
                      <p>Where should we deliver your new Banarasi saree?</p>
                    </div>
                    <div className="flow-order-summary">
                      <img src={sareeImage} alt="" />
                      <span className="flow-order-copy">
                        <strong>Banarasi Silk Saree</strong>
                        <small>Pure Katan silk · 6.3 m</small>
                      </span>
                      <b>{productPrice}</b>
                    </div>
                    <form className="flow-screen-form" onSubmit={submitCheckout}>
                      <div className={`flow-screen-field ${flowTypingField === 'name' ? 'is-typing' : ''}`}>
                        <label htmlFor="demo-checkout-name">Full name</label>
                        <input id="demo-checkout-name" name="name" autoComplete="name" required maxLength={60} value={checkout.name} readOnly data-testid="input-demo-name" />
                      </div>
                      <div className={`flow-screen-field ${flowTypingField === 'phone' ? 'is-typing' : ''}`}>
                        <label htmlFor="demo-checkout-phone">Mobile number</label>
                        <input id="demo-checkout-phone" name="phone" type="tel" autoComplete="tel" required pattern="[0-9+() -]{10,16}" maxLength={16} value={checkout.phone} readOnly data-testid="input-demo-phone" />
                      </div>
                      <div className={`flow-screen-field ${flowTypingField === 'address' ? 'is-typing' : ''}`}>
                        <label htmlFor="demo-checkout-address">Delivery address</label>
                        <textarea id="demo-checkout-address" name="address" autoComplete="street-address" required maxLength={140} rows={2} value={checkout.address} readOnly data-testid="input-demo-address" />
                      </div>
                      <div className="flow-screen-fields-row">
                        <div className={`flow-screen-field ${flowTypingField === 'city' ? 'is-typing' : ''}`}>
                          <label htmlFor="demo-checkout-city">City</label>
                          <input id="demo-checkout-city" name="city" autoComplete="address-level2" required maxLength={40} value={checkout.city} readOnly data-testid="input-demo-city" />
                        </div>
                        <div className={`flow-screen-field ${flowTypingField === 'pinCode' ? 'is-typing' : ''}`}>
                          <label htmlFor="demo-checkout-pin">PIN code</label>
                          <input id="demo-checkout-pin" name="pinCode" autoComplete="postal-code" required pattern="[0-9]{6}" maxLength={6} value={checkout.pinCode} readOnly data-testid="input-demo-pin" />
                        </div>
                      </div>
                      <button className="flow-screen-submit" type="submit" disabled={!checkoutReady} data-testid="button-demo-submit-order">
                        {checkoutReady ? 'Submit delivery details' : 'Adding sample details…'} <ArrowRight size={12} />
                      </button>
                      <p className="flow-auto-note"><span className="flow-auto-dot" /> Sample details fill automatically · nothing is saved or sent</p>
                    </form>
                  </div>
                </div>
              )}
              {(step === 'razorpay' || step === 'paymentSuccess') && receipt && (
                <div
                  className="demo-razorpay-screen"
                  role="dialog"
                  aria-modal="true"
                  aria-live="polite"
                  aria-label="Simulated Razorpay checkout"
                  data-testid="card-demo-razorpay"
                >
                  <div className="razorpay-topbar">
                    <span className="razorpay-brand-copy">
                      <strong>Razorpay</strong>
                      <small>Payment gateway</small>
                    </span>
                    <span className="razorpay-secure-label"><ShieldCheck size={12} /> Secure checkout</span>
                  </div>
                  {step === 'razorpay' ? (
                    <div className="razorpay-checkout-content">
                      <div className="razorpay-order-summary">
                        <div className="razorpay-merchant">
                          <span><strong>Rangrez Studio</strong><small>Order {receipt.orderId}</small></span>
                        </div>
                        <div className="razorpay-total">
                          <span>Amount to pay</span>
                          <strong>{productPrice}</strong>
                        </div>
                      </div>
                      <span className="razorpay-method-heading">Payment method</span>
                      <div className="razorpay-method">
                        <span className="razorpay-method-radio is-selected" aria-hidden="true" />
                        <span className="razorpay-method-copy"><strong>UPI</strong><small>Pay using a UPI app</small></span>
                        <span className="razorpay-upi-mark">UPI</span>
                      </div>
                      <div className="razorpay-upi-reference">
                        <span>Sample UPI ID</span>
                        <strong>demo@upi</strong>
                      </div>
                      <button
                        type="button"
                        className="razorpay-pay-button"
                        onClick={() => setStep('paymentSuccess')}
                        data-testid="button-demo-razorpay-pay"
                      >
                        Pay {productPrice} <ArrowRight size={11} />
                      </button>
                      <p className="razorpay-demo-note">Demonstration checkout · No payment is processed</p>
                    </div>
                  ) : (
                    <div className="razorpay-success-content" data-testid="message-demo-razorpay-success">
                      <span className="razorpay-success-icon"><Check size={22} /></span>
                      <span className="razorpay-success-label">PAYMENT CONFIRMED</span>
                      <h2>Payment successful</h2>
                      <p>{productPrice} paid to Rangrez Studio</p>
                      <span className="razorpay-success-id">Payment ID · pay_DEMO{receipt.orderId.replace(/\D/g, '')}</span>
                      <small>Returning to your WhatsApp chat shortly</small>
                    </div>
                  )}
                </div>
              )}
              {step === 'invoiceViewer' && receipt && invoicePdfUrl && (
                <div
                  className="demo-invoice-viewer"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Invoice PDF preview for order ${receipt.orderId}`}
                  data-testid="card-demo-invoice-viewer"
                >
                  <div className="invoice-viewer-topbar">
                    <button type="button" aria-label="Back to WhatsApp chat" onClick={closeInvoiceViewer}>
                      <ChevronLeft size={16} />
                    </button>
                    <span className="invoice-viewer-title">
                      <strong>Invoice-{receipt.orderId}.pdf</strong>
                      <small>PDF document · 1 page</small>
                    </span>
                    <a
                      href={invoicePdfUrl}
                      download={`Invoice-${receipt.orderId}.pdf`}
                      aria-label="Download invoice PDF"
                      data-testid="link-demo-invoice-download"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                  <div className="invoice-viewer-canvas">
                    <article className="invoice-page-preview">
                      <div className="invoice-page-brand">
                        <strong>RANGREZ STUDIO</strong>
                        <span>PAYMENT INVOICE</span>
                      </div>
                      <div className="invoice-page-heading">
                        <h2>Invoice</h2>
                        <span>INV-{receipt.orderId}</span>
                      </div>
                      <div className="invoice-page-summary">
                        <div><small>ORDER NUMBER</small><strong>{receipt.orderId}</strong></div>
                        <div><small>PAYMENT STATUS</small><strong className="invoice-paid-label">Paid · UPI</strong></div>
                      </div>
                      <div className="invoice-page-customer">
                        <small>BILLED TO</small>
                        <strong>{receipt.name}</strong>
                        <span>{receipt.phone}</span>
                        <span>{receipt.address}, {receipt.city} {receipt.pinCode}</span>
                      </div>
                      <div className="invoice-page-table">
                        <div className="invoice-page-table-head"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>
                        <div className="invoice-page-item"><span>Banarasi Silk Saree<small>Pure Katan silk · 6.3 m</small></span><span>1</span><strong>₹6,490</strong></div>
                      </div>
                      <div className="invoice-page-total"><span>Total paid</span><strong>₹6,490</strong></div>
                      <div className="invoice-page-order-state">
                        <span>Order status</span><strong>Processing</strong>
                      </div>
                      <small className="invoice-page-disclaimer">Demo invoice only. No real payment or order was created.</small>
                    </article>
                  </div>
                  <div className="invoice-viewer-footer">
                    <span>Shared in your WhatsApp chat</span>
                    <a href={invoicePdfUrl} download={`Invoice-${receipt.orderId}.pdf`}>
                      <Download size={11} /> Download PDF
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DevicePreviewFrame>
      </div>
    </div>
  );
}