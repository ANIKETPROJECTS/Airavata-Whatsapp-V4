import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, RotateCcw, ShieldCheck } from 'lucide-react';
import { DevicePreviewFrame } from '../DevicePreview';
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

export default function CommerceDemo() {
  const [step, setStep] = useState<DemoStep>('template');
  const [selectedTemplateAction, setSelectedTemplateAction] = useState<TemplateAction>(null);
  const [checkout, setCheckout] = useState<CheckoutDetails>(emptyCheckout);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paymentPreviewOpen, setPaymentPreviewOpen] = useState(false);
  const [screenWidth, setScreenWidth] = useState(252);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const nextOrderNumber = useRef(2048);

  useEffect(() => {
    const updateScreenWidth = () => {
      if (window.innerWidth <= 420) {
        setScreenWidth(225);
      } else if (window.innerWidth <= 780) {
        setScreenWidth(232);
      } else if (window.innerHeight <= 820) {
        setScreenWidth(210);
      } else if (window.innerHeight <= 900) {
        setScreenWidth(232);
      } else {
        setScreenWidth(252);
      }
    };

    updateScreenWidth();
    window.addEventListener('resize', updateScreenWidth);
    return () => window.removeEventListener('resize', updateScreenWidth);
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

  const screenHeight = Math.round(screenWidth * 1.69);
  const statusText: Record<DemoStep, string> = {
    template: 'Template message · choose Know More or Buy Now',
    details: 'Product details sent · choose Buy Now to continue',
    flow: 'WhatsApp Flow · enter delivery details',
    confirmed: 'Receipt generated · payment link shared',
  };

  return (
    <div className="demo-stage">
      <div className="demo-side-note" aria-hidden="true">
        <span>MESSAGE APPEARS ON LOAD</span>
        <span>TEMPLATE TO CHECKOUT</span>
      </div>
      <div className="demo-phone-wrap">
        <div className="demo-device-label"><span className="demo-live-dot" /> INTERACTIVE WHATSAPP ORDER JOURNEY</div>
        <DevicePreviewFrame device="ios" screenWidth={screenWidth}>
          <div className="demo-phone-screen" style={{ height: screenHeight }}>
            <div className="demo-chat-header">
              <div className="demo-back" aria-hidden="true">‹</div>
              <div className="demo-shop-avatar">R</div>
              <div className="demo-shop-name"><strong>Rangrez Studio</strong><small>Business account</small></div>
              <span className="demo-header-dots" aria-hidden="true">···</span>
            </div>
            <div ref={chatBodyRef} className="demo-chat-body" aria-live="polite" aria-label="Interactive sample WhatsApp conversation">
              <div className="demo-date-pill">TODAY</div>

              <div className="demo-product-bubble message-appear" data-testid="card-demo-product-template">
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
              </div>

              {step !== 'template' && (
                <div className="demo-message from-customer message-appear" data-testid="message-demo-know-more">
                  {selectedTemplateAction === 'details' ? 'Know More' : 'Buy Now'}
                  <time>10:42</time>
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
                    <time>10:44</time>
                  </div>
                </>
              )}
            </div>
            <div className="demo-composer"><span>Message</span><span className="composer-send"><ArrowRight size={13} /></span></div>
          </div>
        </DevicePreviewFrame>
        <div className="demo-status" aria-live="polite">
          <span className={`status-dot ${step === 'confirmed' ? 'is-done' : ''}`} />
          <span>{statusText[step]}</span>
          {step === 'confirmed' && (
            <button type="button" onClick={replayDemo} data-testid="button-demo-replay">
              <RotateCcw size={13} /> Start again
            </button>
          )}
        </div>
      </div>
      <div className="demo-side-note demo-side-note-right" aria-hidden="true">
        <span>DEMO ONLY</span><span>NO REAL PAYMENT</span>
      </div>
    </div>
  );
}