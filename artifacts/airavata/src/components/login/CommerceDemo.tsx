import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { DevicePreviewFrame } from '../DevicePreview';
import figmaChatScreen from '@assets/Messages_-_Full_view_1791144042420.svg';
import sareeImage from '@assets/generated_images/atw-banarasi-saree-product.jpg';

type DemoStep = 'template' | 'customerReply' | 'details' | 'flow' | 'confirmed';

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
  const [paymentPreviewOpen, setPaymentPreviewOpen] = useState(false);
  const [flowTypingField, setFlowTypingField] = useState<keyof CheckoutDetails | null>(null);
  const [screenWidth, setScreenWidth] = useState(252);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const demoStageRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
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
    chatBody.scrollTo({
      top: chatBody.scrollHeight,
      behavior: prefersReducedMotion || step === 'confirmed' ? 'auto' : 'smooth',
    });
    if (step === 'confirmed') setShowScrollButton(false);
  }, [step, paymentPreviewOpen]);

  useEffect(() => {
    let timeout: number | undefined;
    if (step === 'template') {
      timeout = window.setTimeout(() => setStep('customerReply'), 2100);
    } else if (step === 'customerReply') {
      timeout = window.setTimeout(() => setStep('details'), 1900);
    } else if (step === 'details') {
      timeout = window.setTimeout(() => setStep('flow'), 3300);
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
          fieldStart + length * 24,
        ));
      }
      cursor += value.length * 24 + 250;
    }
    timers.push(window.setTimeout(() => setFlowTypingField(null), cursor));
    timers.push(window.setTimeout(() => completeCheckout(demoCheckout), cursor + 700));

    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [step, completeCheckout]);

  const openCheckoutFlow = () => {
    setPaymentPreviewOpen(false);
    setStep('flow');
  };

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    completeCheckout(checkout);
  };

  const replayDemo = () => {
    setStep('template');
    setCheckout({ ...emptyCheckout });
    setReceipt(null);
    setPaymentPreviewOpen(false);
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

                {(step === 'details' || step === 'flow' || step === 'confirmed') && (
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

                {(step === 'flow' || step === 'confirmed') && (
                  <div className="demo-message from-customer message-appear" data-testid="message-demo-buy-now">
                    <span className="demo-message-copy">Buy Now</span>
                    <span className="demo-outgoing-meta"><time>10:43</time><FigmaReadReceipt /></span>
                  </div>
                )}

                {step === 'confirmed' && receipt && (
                  <>
                    <div className="demo-message from-business demo-receipt message-appear" data-testid="message-demo-receipt">
                      <span className="receipt-heading"><Check size={11} /> ORDER RECEIPT · DEMO</span>
                      <strong className="receipt-thanks">Thank you, {receipt.name}! Your saree is reserved.</strong>
                      <div className="receipt-line"><span>Invoice number</span><b>{receipt.orderId}</b></div>
                      <div className="receipt-line"><span>Banarasi Silk Saree</span><b>{productPrice}</b></div>
                      <div className="receipt-line receipt-total"><span>Total</span><b>{productPrice}</b></div>
                      <div className="receipt-address">
                        Delivering to {receipt.address}, {receipt.city} {receipt.pinCode}
                      </div>
                      <span className="receipt-pending">Payment pending · order is reserved</span>
                      <time>10:44</time>
                    </div>
                    <div className="demo-message from-business demo-payment message-appear" data-testid="message-demo-payment">
                      <span className="payment-label"><ShieldCheck size={11} /> SECURE PAYMENT LINK</span>
                      <p>Complete payment to confirm your order. This sample link will not process a real payment.</p>
                      <button
                        type="button"
                        className="payment-link"
                        onClick={() => setPaymentPreviewOpen(true)}
                        data-testid="button-demo-payment-link"
                      >
                        Pay {productPrice} <ArrowRight size={11} />
                      </button>
                      {paymentPreviewOpen && (
                        <span className="payment-note" role="status">Demo preview · no payment is processed</span>
                      )}
                      <button
                        type="button"
                        className="demo-replay-button"
                        onClick={replayDemo}
                        data-testid="button-demo-replay"
                      >
                        <RotateCcw size={10} /> Start demo again
                      </button>
                      <time>10:44</time>
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
            </div>
          </div>
        </DevicePreviewFrame>
      </div>
    </div>
  );
}