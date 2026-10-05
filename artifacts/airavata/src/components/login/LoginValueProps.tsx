import {
  Bot,
  CreditCard,
  Megaphone,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';

const journeySteps: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: 'Bring shoppers in',
    description: 'Turn campaign clicks into WhatsApp conversations.',
    icon: Megaphone,
  },
  {
    title: 'Answer and assist',
    description: 'Let chatbots handle common questions; your team can step in.',
    icon: Bot,
  },
  {
    title: 'Guide the purchase',
    description: 'Show products and collect delivery details right in chat.',
    icon: ShoppingBag,
  },
  {
    title: 'Complete the journey',
    description: 'Share payment links, confirmations, and invoice details.',
    icon: CreditCard,
  },
];

export function LoginJourney() {
  return (
    <aside className="login-journey" aria-labelledby="login-journey-title">
      <div className="login-journey-intro">
        <span className="login-journey-eyebrow">THE CUSTOMER JOURNEY</span>
        <h2 id="login-journey-title">From first click to confident checkout.</h2>
        <p>Keep every customer conversation moving in one WhatsApp workspace.</p>
      </div>

      <ol className="login-journey-steps">
        {journeySteps.map(({ title, description, icon: Icon }, index) => (
          <li className="login-journey-step" key={title}>
            <span className="login-journey-marker" aria-hidden="true">
              <Icon size={15} strokeWidth={1.8} />
            </span>
            <div className="login-journey-copy">
              <span className="login-journey-step-label">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
