import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, RotateCcw, ShieldCheck } from 'lucide-react';
import { DevicePreviewFrame } from '../DevicePreview';

const transcript = [
  { kind: 'customer', text: 'Hi, is the Everyday Tote available?' },
  { kind: 'bot', text: 'Yes, it is. Made for all your everyday essentials.' },
  { kind: 'customer', text: 'Lovely. I would like to order one.' },
] as const;

export default function CommerceDemo() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [screenWidth, setScreenWidth] = useState(252);
  const chatBodyRef = useRef<HTMLDivElement>(null);

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
    if (!playing) return;
    if (stage >= 6) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStage(current => current + 1), 1450);
    return () => window.clearTimeout(timer);
  }, [playing, stage]);

  useEffect(() => {
    const chatBody = chatBodyRef.current;
    if (stage === 0 || !chatBody) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    chatBody.scrollTo({
      top: chatBody.scrollHeight,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [stage]);

  const beginDemo = () => {
    setStage(1);
    setPlaying(true);
  };
  const replayDemo = () => {
    setStage(0);
    window.setTimeout(() => {
      setStage(1);
      setPlaying(true);
    }, 80);
  };
  const screenHeight = Math.round(screenWidth * 1.69);

  return (
    <div className="demo-stage">
      <div className="demo-side-note" aria-hidden="true">
        <span className="demo-note-top">A CUSTOMER JOURNEY</span>
        <span className="demo-note-bottom">TEMPLATE TO CHECKOUT</span>
      </div>
      <div className="demo-phone-wrap">
        <div className="demo-device-label"><span className="demo-live-dot" /> INTERACTIVE PRODUCT WALKTHROUGH</div>
        <DevicePreviewFrame device="ios" screenWidth={screenWidth}>
          <div className="demo-phone-screen" style={{ height: screenHeight }}>
            <div className="demo-chat-header">
              <div className="demo-back">‹</div>
              <div className="demo-shop-avatar">A</div>
              <div className="demo-shop-name"><strong>Atelier Goods</strong><small>Business account</small></div>
              <span className="demo-header-dots">···</span>
            </div>
            <div ref={chatBodyRef} className="demo-chat-body" aria-live="polite" aria-label="Sample WhatsApp conversation">
              <div className="demo-date-pill">TODAY</div>
              <div className="demo-product-bubble">
                <div className="demo-product-art" aria-hidden="true">
                  <span className="tote-handle" />
                  <span className="tote-body" />
                  <span className="product-sun" />
                </div>
                <div className="demo-product-info">
                  <strong>Everyday Tote</strong>
                  <span>Canvas · Natural</span>
                  <b>₹1,490</b>
                  <button type="button" onClick={beginDemo} disabled={playing} className="demo-buy-button" data-testid="button-demo-buy-now">
                    {playing ? 'Starting conversation…' : 'Buy now'} <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              {stage > 0 && transcript.slice(0, Math.min(stage, 3)).map((message, index) => (
                <div key={message.text} className={`demo-message ${message.kind === 'customer' ? 'from-customer' : 'from-shop'} message-appear`} data-testid={`message-demo-${index + 1}`}>
                  {message.text}<time>{index === 0 ? '10:42' : index === 1 ? '10:42' : '10:43'}</time>
                </div>
              ))}
              {stage >= 4 && (
                <div className="demo-flow message-appear" data-testid="card-demo-flow">
                  <div className="flow-heading"><span className="flow-mini-icon">A</span><span><strong>Delivery details</strong><small>Atelier Goods · WhatsApp Flow</small></span></div>
                  <div className="flow-rule" />
                  <div className="flow-field"><small>FULL NAME</small><b>Sample Customer</b></div>
                  <div className="flow-field"><small>PHONE NUMBER</small><b>+91 90000 12345</b></div>
                  <div className="flow-field"><small>DELIVERY ADDRESS</small><b>12 Sample Lane, Pune</b></div>
                  <div className="flow-submit"><Check size={12} /> DETAILS CONFIRMED</div>
                </div>
              )}
              {stage >= 5 && (
                <div className="demo-order message-appear" data-testid="status-demo-order">
                  <span className="order-check"><Check size={13} /></span><span><strong>Order placed</strong><small>Order AT-2048 · Everyday Tote</small></span>
                </div>
              )}
              {stage >= 6 && (
                <div className="demo-message from-shop demo-payment message-appear" data-testid="message-demo-payment">
                  <span className="payment-label"><ShieldCheck size={12} /> SECURE PAYMENT LINK</span>
                  Your order is ready. Pay ₹1,490 securely with Razorpay.
                  <span className="payment-link">Complete payment <ArrowRight size={11} /></span>
                  <time>10:44</time>
                </div>
              )}
              {stage === 0 && <div className="demo-helper">Select <b>Buy now</b> to watch the demo.</div>}
              {playing && <div className="demo-typing"><i /><i /><i /><span>Atelier Goods is typing</span></div>}
            </div>
            <div className="demo-composer"><span>Message</span><span className="composer-send"><ArrowRight size={13} /></span></div>
          </div>
        </DevicePreviewFrame>
        <div className="demo-status" aria-live="polite">
          <span className={`status-dot ${stage === 6 ? 'is-done' : ''}`} />
          <span>{stage === 0 ? 'Ready when you are' : stage === 6 ? 'Journey complete' : 'Automating the conversation'}</span>
          {stage === 6 && <button type="button" onClick={replayDemo} data-testid="button-demo-replay"><RotateCcw size={13} /> Replay demo</button>}
        </div>
      </div>
      <div className="demo-side-note demo-side-note-right" aria-hidden="true">
        <span>DEMO ONLY</span><span>NO REAL ORDERS</span>
      </div>
    </div>
  );
}