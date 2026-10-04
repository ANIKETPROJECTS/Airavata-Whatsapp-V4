import { useEffect, useRef, useState, type FormEvent } from 'react';
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

type DemoStep = 'template' | 'details' | 'flow' | 'confirmed';
type TemplateAction = 'details' | 'buy' | null;

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
  const [selectedTemplateAction, setSelectedTemplateAction] = useState<TemplateAction>(null);
  const [checkout, setCheckout] = useState<CheckoutDetails>(emptyCheckout);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paymentPreviewOpen, setPaymentPreviewOpen] = useState(false);
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
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [step, paymentPreviewOpen]);

  const showProductDetails = () => {
    if (step !== 'template') return;
    setSelectedTemplateAction('details');
    setStep('details');
  };

  const openCheckoutFlow = (fromTemplate = false) => {
    if (fromTemplate) setSelectedTemplateAction('buy');
    setPaymentPreviewOpen(false);
    setStep('flow');
  };

  const updateCheckout = (field: keyof CheckoutDetails, value: string) => {
    setCheckout(current => ({ ...current, [field]: value }));
  };

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const orderId = `ATW-${nextOrderNumber.current}`;
    nextOrderNumber.current += 1;
    setReceipt({ ...checkout, orderId });
    setStep('confirmed');
  };

  const replayDemo = () => {
    setStep('template');
    setSelectedTemplateAction(null);
    setCheckout({ ...emptyCheckout });
    setReceipt(null);
    setPaymentPreviewOpen(false);
  };

  const screenScale = screenWidth / 252;
  const screenHeight = Math.round(524 * screenScale);

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
                <FigmaSvgCrop x={0} y={58} width={40} height={36} className="demo-back-art" />
                <div className="demo-shop-avatar">R</div>
                <div className="demo-shop-name"><strong>Rangrez Studio</strong><small>tap here for contact info</small></div>
                <FigmaSvgCrop x={288} y={58} width={88} height={36} className="demo-header-actions-art" />
              </div>
              <div
                ref={chatBodyRef}
                className="demo-chat-body"
                aria-live="polite"
                aria-label="Interactive sample WhatsApp conversation"
                onScroll={event => {
                  const body = event.currentTarget;
                  setShowScrollButton(body.scrollHeight - body.scrollTop - body.clientHeight > 24);
                }}
              >
                <FigmaSvgCrop x={146} y={280} width={101} height={21} className="demo-date-art" />
                <div className="demo-message from-customer message-appear">
                  <span className="demo-message-copy">Hi! I’m looking for something festive.</span>
                  <span className="demo-outgoing-meta"><time>10:40</time><FigmaReadReceipt /></span>
                </div>
                <div className="demo-message from-shop message-appear">
                  <span className="demo-message-copy">Of course. Take a look at our latest arrival.</span>
                  <time>10:41</time>
                </div>

                <div className="demo-product-bubble message-appear" data-testid="card-demo-product-template">
                  <div className="demo-product-card">
                    <img
                      className="demo-product-image"
                      src={sareeImage}
                      alt="Deep crimson Banarasi silk saree with a gold zari border"
                    />
                    <div className="demo-product-info">
                      <span className="demo-template-label">NEW ARRIVAL · PRODUCT TEMPLATE</span>
                      <strong>Banarasi Silk Saree</strong>
                      <p>Handwoven crimson silk with an intricate gold zari border. A timeless drape for festive moments.</p>
                      <div className="demo-product-meta"><span>Pure Katan silk</span><b>{productPrice}</b></div>
                    </div>
                    <div className="demo-template-actions" aria-label="Product template actions">
                      <button
                        type="button"
                        className={`demo-template-action secondary ${selectedTemplateAction === 'details' ? 'is-selected' : ''}`}
                        onClick={showProductDetails}
                        disabled={step !== 'template'}
                        data-testid="button-demo-know-more"
                      >
                        {selectedTemplateAction === 'details' && <Check size={11} />}
                        Know More
                      </button>
                      <button
                        type="button"
                        className={`demo-template-action primary ${selectedTemplateAction === 'buy' ? 'is-selected' : ''}`}
                        onClick={() => openCheckoutFlow(true)}
                        disabled={step !== 'template'}
                        data-testid="button-demo-template-buy-now"
                      >
                        Buy Now <ArrowRight size={11} />
                      </button>
                    </div>
                    <div className="demo-template-meta">
                      <time>10:42</time>
                      <FigmaReadReceipt ariaLabel="Delivered and read" />
                    </div>
                  </div>
                </div>

                {step !== 'template' && (
                  <div className="demo-message from-customer message-appear" data-testid="message-demo-know-more">
                    <span className="demo-message-copy">{selectedTemplateAction === 'details' ? 'Know More' : 'Buy Now'}</span>
                    <span className="demo-outgoing-meta"><time>10:42</time><FigmaReadReceipt /></span>
                  </div>
                )}

                {(step === 'details' || (step === 'flow' && selectedTemplateAction === 'details') || (step === 'confirmed' && selectedTemplateAction === 'details')) && (
                  <div className="demo-message from-shop demo-detail-message message-appear" data-testid="message-demo-product-details">
                    <span className="demo-message-label">PRODUCT DETAILS</span>
                    <p>Meet our Banarasi Silk Saree, woven in Varanasi from pure Katan silk with detailed gold zari buta work.</p>
                    <p>Includes an unstitched blouse piece · 6.3 m saree · Dry-clean care.</p>
                    <div className="demo-detail-price">{productPrice} <span>· Ships in 2–4 days</span></div>
                    <button
                      type="button"
                      className="details-buy-button"
                      onClick={() => openCheckoutFlow()}
                      disabled={step !== 'details'}
                      data-testid="button-demo-details-buy-now"
                    >
                      Buy Now <ArrowRight size={11} />
                    </button>
                    <time>10:42</time>
                  </div>
                )}

                {step === 'flow' && (
                  <div className="demo-flow message-appear" data-testid="card-demo-flow">
                    <div className="flow-heading">
                      <span className="flow-mini-icon">R</span>
                      <span><strong>Delivery details</strong><small>Rangrez Studio · WhatsApp Flow</small></span>
                    </div>
                    <div className="flow-rule" />
                    <form className="flow-form" onSubmit={submitCheckout}>
                      <div className="flow-form-field">
                        <label htmlFor="demo-checkout-name">Full name</label>
                        <input
                          id="demo-checkout-name"
                          name="name"
                          autoComplete="name"
                          required
                          maxLength={60}
                          placeholder="Your name"
                          value={checkout.name}
                          onChange={event => updateCheckout('name', event.target.value)}
                          data-testid="input-demo-name"
                        />
                      </div>
                      <div className="flow-form-field">
                        <label htmlFor="demo-checkout-phone">Mobile number</label>
                        <input
                          id="demo-checkout-phone"
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          required
                          pattern="[0-9+() -]{10,16}"
                          maxLength={16}
                          placeholder="+91 98765 43210"
                          value={checkout.phone}
                          onChange={event => updateCheckout('phone', event.target.value)}
                          data-testid="input-demo-phone"
                        />
                      </div>
                      <div className="flow-form-field">
                        <label htmlFor="demo-checkout-address">Delivery address</label>
                        <textarea
                          id="demo-checkout-address"
                          name="address"
                          autoComplete="street-address"
                          required
                          maxLength={140}
                          rows={2}
                          placeholder="House, street, area"
                          value={checkout.address}
                          onChange={event => updateCheckout('address', event.target.value)}
                          data-testid="input-demo-address"
                        />
                      </div>
                      <div className="flow-form-row">
                        <div className="flow-form-field">
                          <label htmlFor="demo-checkout-city">City</label>
                          <input
                            id="demo-checkout-city"
                            name="city"
                            autoComplete="address-level2"
                            required
                            maxLength={40}
                            placeholder="City"
                            value={checkout.city}
                            onChange={event => updateCheckout('city', event.target.value)}
                            data-testid="input-demo-city"
                          />
                        </div>
                        <div className="flow-form-field">
                          <label htmlFor="demo-checkout-pin">PIN code</label>
                          <input
                            id="demo-checkout-pin"
                            name="pinCode"
                            autoComplete="postal-code"
                            inputMode="numeric"
                            required
                            pattern="[0-9]{6}"
                            maxLength={6}
                            placeholder="6 digits"
                            value={checkout.pinCode}
                            onChange={event => updateCheckout('pinCode', event.target.value)}
                            data-testid="input-demo-pin"
                          />
                        </div>
                      </div>
                      <button className="flow-submit" type="submit" data-testid="button-demo-submit-order">
                        Submit details <ArrowRight size={11} />
                      </button>
                      <p className="flow-disclaimer">Demo only · details are not sent or saved</p>
                    </form>
                  </div>
                )}

                {step === 'confirmed' && receipt && (
                  <>
                    <div className="demo-message from-shop demo-receipt message-appear" data-testid="message-demo-receipt">
                      <span className="receipt-heading"><Check size={11} /> ORDER RECEIPT</span>
                      <strong className="receipt-thanks">Order received, {receipt.name}.</strong>
                      <div className="receipt-line"><span>Order ID</span><b>{receipt.orderId}</b></div>
                      <div className="receipt-line"><span>Banarasi Silk Saree</span><b>{productPrice}</b></div>
                      <div className="receipt-line receipt-total"><span>Total</span><b>{productPrice}</b></div>
                      <div className="receipt-address">
                        Delivering to {receipt.address}, {receipt.city} {receipt.pinCode}
                      </div>
                      <span className="receipt-pending">Payment pending · order is reserved</span>
                      <time>10:44</time>
                    </div>
                    <div className="demo-message from-shop demo-payment message-appear" data-testid="message-demo-payment">
                      <span className="payment-label"><ShieldCheck size={11} /> SECURE RAZORPAY PAYMENT LINK</span>
                      <p>Pay to confirm your order. Your secure payment link is ready.</p>
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
            </div>
          </div>
        </DevicePreviewFrame>
      </div>
    </div>
  );
}