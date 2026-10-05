import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronDown,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { DevicePreviewFrame } from '../DevicePreview';
import {
  createDemoInvoicePdf,
  formatDemoInvoiceMoney,
  getDemoInvoiceAmounts,
  getDemoInvoiceDate,
  getPaymentReference,
} from './createDemoInvoicePdf';
import figmaChatScreen from '@assets/Messages_-_Full_view_1791144042420.svg';
import sareeImage from '@assets/generated_images/atw-banarasi-saree-product.jpg';
import razorpayLogo from '../../assets/razorpay-logo-blue.png';

type DemoStep =
  | 'template'
  | 'customerReply'
  | 'details'
  | 'flow'
  | 'confirmed'
  | 'razorpay'
  | 'paymentSuccess'
  | 'paid';

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

const checkoutProfile: CheckoutDetails = {
  name: 'Priya Sharma',
  phone: '+91 90000 00000',
  address: '14 Silk Market Road',
  city: 'Varanasi',
  pinCode: '221001',
};

const productPrice = '₹6,490';
const figmaCanvasScale = 252 / 393;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

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

function GooglePayMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="razorpay-brand-mark">
      <path fill="#4285F4" d="M21.35 12.25c0-.72-.06-1.42-.18-2.1H12v3.97h5.23a4.5 4.5 0 0 1-1.96 2.96v2.47h3.17c1.85-1.7 2.91-4.2 2.91-7.3z" />
      <path fill="#34A853" d="M12 21.6c2.64 0 4.85-.87 6.46-2.36l-3.17-2.47c-.88.59-2 .94-3.29.94-2.53 0-4.68-1.71-5.45-4.01H3.28v2.55A9.75 9.75 0 0 0 12 21.6z" />
      <path fill="#FBBC05" d="M6.55 13.7a5.86 5.86 0 0 1 0-3.4V7.75H3.28a9.75 9.75 0 0 0 0 8.5z" />
      <path fill="#EA4335" d="M12 6.29c1.44 0 2.73.49 3.75 1.46l2.82-2.82C16.84 3.35 14.64 2.4 12 2.4a9.75 9.75 0 0 0-8.72 5.35l3.27 2.55C7.32 8 9.47 6.29 12 6.29z" />
    </svg>
  );
}

function PaytmMark() {
  return (
    <span aria-hidden="true" className="razorpay-paytm-mark">
      <span>pay</span><strong>tm</strong>
    </span>
  );
}

function PhonePeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="razorpay-brand-mark">
      <circle cx="12" cy="12" r="11" fill="#5F259F" />
      <path d="M8 5.5h5.25a4 4 0 0 1 0 8H11v5H8zm3 3v2h2.25a1 1 0 0 0 0-2z" fill="#fff" />
    </svg>
  );
}

function InvoiceDocumentPage({
  receipt,
  paymentMethod,
  thumbnail = false,
}: {
  receipt: Receipt;
  paymentMethod: string;
  thumbnail?: boolean;
}) {
  const tax = getDemoInvoiceAmounts();
  const paymentId = getPaymentReference(receipt.orderId);

  return (
    <article className={`invoice-page-preview ${thumbnail ? 'invoice-page-preview--thumbnail' : ''}`}>
      <div className="invoice-page-brand">
        <span className="invoice-page-brand-copy">
          <strong>RANGREZ STUDIO</strong>
          <small>HANDWOVEN BANARASI TEXTILES</small>
        </span>
        <span className="invoice-page-sample-tag">GST INVOICE<br />SAMPLE PREVIEW</span>
      </div>
      <div className="invoice-page-heading">
        <span><h2>Tax invoice</h2><small>INV-{receipt.orderId}</small></span>
        <span className="invoice-page-validity">Not valid for tax claim</span>
      </div>
      <div className="invoice-page-summary">
        <div><small>INVOICE DATE</small><strong>{getDemoInvoiceDate()}</strong></div>
        <div><small>ORDER NUMBER</small><strong>{receipt.orderId}</strong></div>
        <div><small>PAYMENT</small><strong className="invoice-paid-label">UPI · {paymentMethod}</strong></div>
      </div>
      <div className="invoice-page-parties">
        <section>
          <small>SOLD BY</small>
          <strong>Rangrez Studio</strong>
          <span>Varanasi, Uttar Pradesh 221001</span>
          <span>GSTIN: Not configured (sample)</span>
        </section>
        <section>
          <small>BILL TO / SHIP TO</small>
          <strong>{receipt.name}</strong>
          <span>{receipt.phone}</span>
          <span>{receipt.address}, {receipt.city} {receipt.pinCode}</span>
        </section>
      </div>
      <p className="invoice-page-supply">Place of supply: Uttar Pradesh · Intra-state sample sale</p>
      <div className="invoice-page-table">
        <div className="invoice-page-table-head"><span>DESCRIPTION</span><span>HSN</span><span>QTY</span><span>INCL. GST</span></div>
        <div className="invoice-page-item">
          <span>Banarasi Silk Saree<small>Pure Katan silk · 6.3 m</small></span>
          <span>5007</span><span>1</span><strong>{formatDemoInvoiceMoney(tax.totalPaise)}</strong>
        </div>
      </div>
      <div className="invoice-page-accounting">
        <div className="invoice-page-tax-list">
          <strong>GST BREAKUP · INCLUDED IN PRICE</strong>
          <span><small>Taxable value</small><b>{formatDemoInvoiceMoney(tax.taxablePaise)}</b></span>
          <span><small>CGST @ 2.5%</small><b>{formatDemoInvoiceMoney(tax.cgstPaise)}</b></span>
          <span><small>SGST @ 2.5%</small><b>{formatDemoInvoiceMoney(tax.sgstPaise)}</b></span>
          <span className="invoice-page-gst-total"><small>Total GST · 5%</small><b>{formatDemoInvoiceMoney(tax.gstPaise)}</b></span>
        </div>
        <div className="invoice-page-grand-total">
          <small>TOTAL PAID</small>
          <strong>{formatDemoInvoiceMoney(tax.totalPaise)}</strong>
          <span>Includes GST</span>
        </div>
      </div>
      <div className="invoice-page-payment-ref">
        <span>Payment reference <strong>{paymentId}</strong></span>
        <span>Order status <strong>Processing</strong></span>
      </div>
      <p className="invoice-page-amount-words">Amount in words: Indian Rupees Six Thousand Four Hundred Ninety Only</p>
      <small className="invoice-page-disclaimer">Sample invoice preview. GSTIN is not configured. No payment or order was created; do not use for tax claims.</small>
    </article>
  );
}

export default function CommerceDemo() {
  const [step, setStep] = useState<DemoStep>('template');
  const [checkout, setCheckout] = useState<CheckoutDetails>(emptyCheckout);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [invoicePdfUrl, setInvoicePdfUrl] = useState<string | null>(null);
  const [invoiceFileSize, setInvoiceFileSize] = useState('');
  const [invoiceViewerOpen, setInvoiceViewerOpen] = useState(false);
  const [postPaymentStage, setPostPaymentStage] = useState<'payment' | 'invoice' | 'order'>('payment');
  const [razorpayStage, setRazorpayStage] = useState<'methods' | 'upi' | 'processing'>('methods');
  const [selectedUpiApp, setSelectedUpiApp] = useState<'Google Pay' | 'Paytm' | 'PhonePe'>('Google Pay');
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
    const isInitialTemplate = step === 'template';
    const shouldJumpToLatest = step === 'confirmed' || step === 'paid';
    chatBody.scrollTo({
      top: isInitialTemplate ? 0 : chatBody.scrollHeight,
      behavior: isInitialTemplate || prefersReducedMotion || shouldJumpToLatest ? 'auto' : 'smooth',
    });
    if (shouldJumpToLatest) setShowScrollButton(false);
  }, [step, postPaymentStage]);

  useEffect(() => {
    const timeouts: number[] = [];
    if (step === 'template') {
      timeouts.push(window.setTimeout(() => setStep('customerReply'), 3300));
    } else if (step === 'customerReply') {
      timeouts.push(window.setTimeout(() => setStep('details'), 3200));
    } else if (step === 'details') {
      timeouts.push(window.setTimeout(() => setStep('flow'), 4700));
    } else if (step === 'confirmed') {
      timeouts.push(window.setTimeout(() => setStep('razorpay'), 4700));
    } else if (step === 'razorpay') {
      setRazorpayStage('methods');
      timeouts.push(window.setTimeout(() => setRazorpayStage('upi'), 1400));
      timeouts.push(window.setTimeout(() => setRazorpayStage('processing'), 4100));
      timeouts.push(window.setTimeout(() => setStep('paymentSuccess'), 5700));
    } else if (step === 'paymentSuccess') {
      timeouts.push(window.setTimeout(() => {
        setPostPaymentStage('payment');
        setStep('paid');
      }, 3700));
    } else if (step === 'paid') {
      timeouts.push(window.setTimeout(() => setPostPaymentStage('invoice'), 1700));
      timeouts.push(window.setTimeout(() => setPostPaymentStage('order'), 3800));
      timeouts.push(window.setTimeout(() => {
        if (invoiceViewerShownRef.current) return;
        invoiceViewerShownRef.current = true;
        setInvoiceViewerOpen(true);
      }, 9200));
    }
    return () => timeouts.forEach(timeout => window.clearTimeout(timeout));
  }, [step]);

  useEffect(() => {
    if (!invoiceViewerOpen) return;
    const timeout = window.setTimeout(() => setInvoiceViewerOpen(false), 7000);
    return () => window.clearTimeout(timeout);
  }, [invoiceViewerOpen]);

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
      setInvoiceFileSize('');
      return;
    }

    const invoicePdf = createDemoInvoicePdf(receipt, selectedUpiApp);
    const invoiceUrl = URL.createObjectURL(invoicePdf);
    setInvoiceFileSize(formatFileSize(invoicePdf.size));
    setInvoicePdfUrl(invoiceUrl);
    return () => URL.revokeObjectURL(invoiceUrl);
  }, [receipt, selectedUpiApp]);

  useEffect(() => {
    if (step !== 'flow') return;
    setCheckout({ ...emptyCheckout });
    setFlowTypingField(null);

    const timers: number[] = [];
    const fields = Object.entries(checkoutProfile) as Array<[keyof CheckoutDetails, string]>;
    let cursor = 400;
    for (const [field, value] of fields) {
      const fieldStart = cursor;
      timers.push(window.setTimeout(() => setFlowTypingField(field), fieldStart));
      for (let length = 1; length <= value.length; length += 1) {
        timers.push(window.setTimeout(
          () => setCheckout(current => ({ ...current, [field]: value.slice(0, length) })),
          fieldStart + length * 50,
        ));
      }
      cursor += value.length * 50 + 300;
    }
    timers.push(window.setTimeout(() => setFlowTypingField(null), cursor));
    timers.push(window.setTimeout(() => completeCheckout(checkoutProfile), cursor + 900));

    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [step, completeCheckout]);

  const openCheckoutFlow = () => {
    setStep('flow');
  };

  const openInvoiceViewer = () => {
    if (!invoicePdfUrl) return;
    invoiceViewerShownRef.current = true;
    setInvoiceViewerOpen(true);
  };

  const closeInvoiceViewer = () => {
    setInvoiceViewerOpen(false);
  };

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    completeCheckout(checkout);
  };

  const replayDemo = () => {
    setStep('template');
    setCheckout({ ...emptyCheckout });
    setReceipt(null);
    setInvoiceFileSize('');
    setInvoiceViewerOpen(false);
    setPostPaymentStage('payment');
    setRazorpayStage('methods');
    setSelectedUpiApp('Google Pay');
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
                  aria-label="WhatsApp conversation preview on a customer's phone"
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
                      <span className="demo-template-label">{'Hello 👋 NEW ARRIVAL ✨ BANARASI COLLECTION 💛'}</span>
                      <strong>Banarasi Silk Saree</strong>
                      <p>A festive new arrival, handwoven in rich crimson Katan silk with intricate gold zari detailing.</p>
                      <div className="demo-product-meta"><b>{productPrice}</b></div>
                    </div>
                    <div className="demo-template-meta">
                      <time>10:40</time>
                    </div>
                    <button
                      type="button"
                      className="demo-template-cta"
                      onClick={openCheckoutFlow}
                      aria-label={`Buy Banarasi Silk Saree for ${productPrice}`}
                      data-testid="button-demo-template-buy-now"
                    >
                      <ExternalLink size={10} aria-hidden="true" /> Buy Now
                    </button>
                  </div>
                </div>

                {step !== 'template' && (
                  <div className="demo-message from-customer message-appear" data-testid="message-demo-customer-question">
                    <span className="demo-message-copy">I love this saree! 😍 Could you share a few more details about it?</span>
                    <span className="demo-outgoing-meta"><time>10:41</time><FigmaReadReceipt /></span>
                  </div>
                )}

                {(step === 'details' || step === 'flow' || step === 'confirmed' || step === 'razorpay' || step === 'paymentSuccess' || step === 'paid') && (
                  <div className="demo-message from-business demo-detail-message message-appear" data-testid="message-demo-product-details">
                    <div className="demo-detail-content">
                      <p>Absolutely! This Banarasi saree is handwoven in Varanasi from pure Katan silk.</p>
                      <div className="demo-spec-list">
                        <div className="demo-spec-row"><span>Fabric</span><b>Pure Katan silk</b></div>
                        <div className="demo-spec-row"><span>Saree length</span><b>6.3 metres</b></div>
                        <div className="demo-spec-row"><span>Blouse</span><b>Matching unstitched piece</b></div>
                        <div className="demo-spec-row"><span>Work & care</span><b>Gold zari · dry clean</b></div>
                        <div className="demo-spec-row"><span>Delivery time</span><b>Ships in 2–4 days</b></div>
                        <div className="demo-spec-row"><span>Price</span><b>{productPrice}</b></div>
                      </div>
                    </div>
                    <span className="demo-incoming-meta demo-detail-meta"><time>10:42</time></span>
                    <button
                      type="button"
                      className={`demo-template-cta details-buy-button ${step === 'details' ? 'demo-auto-press' : ''}`}
                      onClick={openCheckoutFlow}
                      disabled={step !== 'details'}
                      aria-label={`Buy Banarasi Silk Saree for ${productPrice}`}
                      data-testid="button-demo-details-buy-now"
                    >
                      <ExternalLink size={10} aria-hidden="true" /> Buy Now
                    </button>
                  </div>
                )}

                {(step === 'flow' || step === 'confirmed' || step === 'razorpay' || step === 'paymentSuccess' || step === 'paid') && (
                  <div className="demo-message from-customer message-appear" data-testid="message-demo-buy-now">
                    <span className="demo-message-copy">Buy Now</span>
                    <span className="demo-outgoing-meta"><time>10:43</time><FigmaReadReceipt /></span>
                  </div>
                )}

                {step === 'confirmed' && receipt && (
                  <>
                    <div className="demo-message from-business demo-receipt message-appear" data-testid="message-demo-receipt">
                      <span className="receipt-heading"><Check size={11} /> ORDER SUMMARY</span>
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
                      <span className="payment-label"><ShieldCheck size={11} /> RAZORPAY PAYMENT LINK</span>
                      <p>Continue to secure checkout to confirm your order.</p>
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
                {step === 'paid' && receipt && (
                  <>
                    <div className="demo-message from-business demo-payment-confirmation message-appear" data-testid="message-demo-payment-success">
                      <span className="payment-label"><Check size={11} /> PAYMENT CONFIRMED</span>
                      <strong className="receipt-thanks">Payment received · {productPrice}</strong>
                      <div className="receipt-line"><span>Payment ID</span><b>{getPaymentReference(receipt.orderId)}</b></div>
                      <div className="receipt-line"><span>Method</span><b>UPI</b></div>
                      <time>10:45</time>
                    </div>
                    {postPaymentStage !== 'payment' && (
                      <div className="demo-message from-business demo-invoice message-appear" data-testid="message-demo-invoice-pdf">
                        <span className="invoice-heading"><FileText size={11} /> INVOICE SHARED · PDF</span>
                        {invoicePdfUrl ? (
                          <div className="invoice-document">
                            <div className="invoice-document-thumbnail" role="img" aria-label={`First-page preview of Invoice-${receipt.orderId}.pdf`}>
                              <InvoiceDocumentPage receipt={receipt} paymentMethod={selectedUpiApp} thumbnail />
                            </div>
                            <button
                              type="button"
                              className="invoice-file-row"
                              onClick={openInvoiceViewer}
                              aria-label={`Open Invoice-${receipt.orderId}.pdf`}
                              data-testid="button-demo-invoice-preview"
                            >
                              <span className="invoice-file-icon"><FileText size={16} /><b>PDF</b></span>
                              <span className="invoice-file-copy">
                                <strong>Invoice-{receipt.orderId}.pdf</strong>
                                <small>1 page · {invoiceFileSize} · PDF</small>
                              </span>
                            </button>
                          </div>
                        ) : (
                          <span className="invoice-preparing">Preparing invoice PDF…</span>
                        )}
                        <time>10:46</time>
                      </div>
                    )}
                    {postPaymentStage === 'order' && (
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
                          <RotateCcw size={10} /> Replay conversation
                        </button>
                        <time>10:47</time>
                      </div>
                    )}
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
                      <span className="flow-screen-kicker">SECURE CHECKOUT</span>
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
                        {checkoutReady ? 'Submit delivery details' : 'Adding customer details…'} <ArrowRight size={12} />
                      </button>
                      <p className="flow-auto-note"><span className="flow-auto-dot" /> Preview profile fills automatically · details aren’t saved or sent</p>
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
                  aria-label="Razorpay checkout preview"
                  data-testid="card-demo-razorpay"
                >
                  <div className="razorpay-topbar">
                    <img src={razorpayLogo} alt="Razorpay" className="razorpay-logo" />
                    <span className="razorpay-secure-label"><LockKeyhole size={10} /> Secured</span>
                  </div>
                  {step === 'razorpay' ? (
                    <>
                      <div className="razorpay-order-summary">
                        <div className="razorpay-merchant">
                          <span className="razorpay-merchant-mark">R</span>
                          <span><small>Paying to</small><strong>Rangrez Studio</strong><small>Order #{receipt.orderId}</small></span>
                        </div>
                        <div className="razorpay-total">
                          <span>Total</span>
                          <strong>{productPrice}</strong>
                        </div>
                      </div>
                      <div className="razorpay-checkout-content">
                        <div className="razorpay-section-heading">
                          <strong>Choose a payment method</strong>
                          <small>All transactions are secure and encrypted</small>
                        </div>
                        <button
                          type="button"
                          className={`razorpay-method ${razorpayStage !== 'methods' ? 'is-selected' : ''}`}
                          onClick={() => setRazorpayStage('upi')}
                        >
                          <span className="razorpay-method-icon"><Smartphone size={13} /></span>
                          <span className="razorpay-method-copy"><strong>UPI</strong><small>Google Pay, PhonePe, Paytm and more</small></span>
                          <ChevronDown size={11} className="razorpay-method-chevron" />
                        </button>
                        {razorpayStage !== 'methods' && (
                          <div className="razorpay-upi-panel message-appear">
                            <span className="razorpay-upi-title">Select a UPI app</span>
                            <div className="razorpay-upi-apps">
                              <button type="button" className={selectedUpiApp === 'Google Pay' ? 'is-active' : ''} aria-pressed={selectedUpiApp === 'Google Pay'} onClick={() => setSelectedUpiApp('Google Pay')}>
                                <GooglePayMark /><span>Google Pay</span>
                              </button>
                              <button type="button" className={selectedUpiApp === 'Paytm' ? 'is-active' : ''} aria-pressed={selectedUpiApp === 'Paytm'} onClick={() => setSelectedUpiApp('Paytm')}>
                                <PaytmMark /><span>Paytm</span>
                              </button>
                              <button type="button" className={selectedUpiApp === 'PhonePe' ? 'is-active' : ''} aria-pressed={selectedUpiApp === 'PhonePe'} onClick={() => setSelectedUpiApp('PhonePe')}>
                                <PhonePeMark /><span>PhonePe</span>
                              </button>
                            </div>
                            <span className="razorpay-upi-divider">OR</span>
                            <div className="razorpay-upi-id">
                              <span><small>UPI ID</small><strong>priya@okaxis</strong></span>
                              <Check size={11} />
                            </div>
                          </div>
                        )}
                        <div className="razorpay-method is-muted">
                          <span className="razorpay-method-icon"><CreditCard size={13} /></span>
                          <span className="razorpay-method-copy"><strong>Cards</strong><small>Visa, Mastercard, RuPay</small></span>
                          <ArrowRight size={10} />
                        </div>
                        <div className="razorpay-method is-muted">
                          <span className="razorpay-method-icon"><Building2 size={13} /></span>
                          <span className="razorpay-method-copy"><strong>Netbanking</strong><small>All Indian banks</small></span>
                          <ArrowRight size={10} />
                        </div>
                        <button
                          type="button"
                          className="razorpay-pay-button"
                          onClick={() => setStep('paymentSuccess')}
                          data-testid="button-demo-razorpay-pay"
                          disabled={razorpayStage === 'processing'}
                        >
                          {razorpayStage === 'processing' ? (
                            <><LoaderCircle size={12} className="razorpay-spinner" /> Processing securely…</>
                          ) : (
                            <><span>Pay {productPrice}</span><span>Continue <ArrowRight size={10} /></span></>
                          )}
                        </button>
                        <p className="razorpay-preview-note"><ShieldCheck size={9} /> Preview only · no payment is processed</p>
                      </div>
                    </>
                  ) : (
                    <div className="razorpay-success-content" data-testid="message-demo-razorpay-success">
                      <span className="razorpay-success-icon"><Check size={22} /></span>
                      <span className="razorpay-success-label">PAYMENT SUCCESSFUL</span>
                      <h2>{productPrice}</h2>
                      <p>Paid to <strong>Rangrez Studio</strong></p>
                      <div className="razorpay-success-details">
                        <span><small>Payment ID</small><strong>{getPaymentReference(receipt.orderId)}</strong></span>
                        <span><small>Method</small><strong>UPI · {selectedUpiApp}</strong></span>
                      </div>
                      <small><ShieldCheck size={9} /> Preview only · no payment was processed</small>
                    </div>
                  )}
                </div>
              )}
              {invoiceViewerOpen && step === 'paid' && receipt && invoicePdfUrl && (
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
                       <small>PDF document · 1 page · {invoiceFileSize}</small>
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
                    <InvoiceDocumentPage receipt={receipt} paymentMethod={selectedUpiApp} />
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