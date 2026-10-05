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
    title: 'Launch the campaign',
    description: 'Interested shoppers message on WhatsApp for product details after seeing your campaign.',
    icon: Megaphone,
  },
  {
    title: 'AI answers and assists',
    description: 'AI answers product questions and guides customers to buy—no human handoff.',
    icon: Bot,
  },
  {
    title: 'Capture details and create the order',
    description: 'Flow Builder collects delivery details; the AI chatbot creates the purchase order and guides payment.',
    icon: ShoppingBag,
  },
  {
    title: 'Collect payment and send the invoice',
    description: 'Payment gateway completes checkout; the invoice is generated and sent automatically in WhatsApp.',
    icon: CreditCard,
  },
];

export function LoginJourney() {
  return (
    <aside className="login-journey" aria-labelledby="login-journey-title">
      <div className="login-journey-intro">
        <span className="login-journey-eyebrow">THE CUSTOMER JOURNEY</span>
        <h2 id="login-journey-title">From campaign to completed order.</h2>
        <p>Campaigns, AI, Flow Builder and payments automate every step in WhatsApp.</p>
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
