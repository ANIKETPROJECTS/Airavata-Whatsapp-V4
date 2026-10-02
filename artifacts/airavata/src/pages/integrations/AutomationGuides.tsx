import { useState } from 'react';
import { ArrowDown, ArrowUpRight, ChevronDown, ChevronUp, Copy, Workflow } from 'lucide-react';
import { SiMake, SiN8N, SiZapier } from 'react-icons/si';
import type { IconType } from 'react-icons';
import { toast } from 'sonner';

interface AutomationTool {
  id: string;
  name: string;
  description: string;
  color: string;
  background: string;
  icon: IconType;
  steps: string[];
}

const tools: AutomationTool[] = [
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect Catch Hook triggers and Webhooks actions.',
    color: '#ff4a00',
    background: 'bg-orange-50',
    icon: SiZapier,
    steps: [
      'Create a Zap with Webhooks by Zapier → Catch Hook, then copy its webhook URL.',
      'In Airavata, add a webhook using that URL and choose the events to forward.',
      'To send messages, add a Webhooks by Zapier → POST action using the Airavata text or template endpoint. Add Authorization: Bearer YOUR_API_KEY and send JSON with phoneNumberId, to, text/templateName, and a unique clientMessageId.',
    ],
  },
  {
    id: 'make',
    name: 'Make',
    description: 'Use a custom webhook trigger and an HTTP request module.',
    color: '#6d00cc',
    background: 'bg-violet-50',
    icon: SiMake,
    steps: [
      'Add a Webhooks → Custom webhook trigger in a Make scenario and copy the generated URL.',
      'Add that URL in Airavata as a webhook destination, then select the events your scenario should receive.',
      'To send messages, add an HTTP → Make a request module with method POST, JSON content type, and Authorization: Bearer YOUR_API_KEY.',
    ],
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Use Webhook and HTTP Request nodes in one workflow.',
    color: '#ea4b71',
    background: 'bg-rose-50',
    icon: SiN8N,
    steps: [
      'Add a Webhook node, activate the workflow, and copy its production URL.',
      'Register that URL in Airavata and choose contact, inbound-message, and delivery events.',
      'To send messages, add an HTTP Request node that posts JSON to the Airavata API with an Authorization: Bearer YOUR_API_KEY header.',
    ],
  },
];

const sendEndpoint = 'https://YOUR-AIRAVATA-DOMAIN/api/integrations/v1/whatsapp/messages/text';

export default function AutomationGuides() {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(sendEndpoint);
      toast.success('API endpoint copied');
    } catch {
      toast.error('Unable to copy endpoint');
    }
  };

  return (
    <section className="space-y-5" data-testid="section-automation-guides">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e7f2e9] text-[#176b46]">
          <Workflow className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#193c2d]">Connect automation tools</h2>
          <p className="mt-1 text-sm leading-5 text-[#68786c]">
            These are working HTTP setup guides, not one-click OAuth connections. The same API works with any CRM, ERP, or website that can make HTTPS requests.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {tools.map((tool) => {
          const BrandIcon = tool.icon;
          const expanded = expandedTool === tool.id;
          return (
            <article key={tool.id} className="overflow-hidden rounded-xl border border-[#dfe8e0] bg-white shadow-[0_2px_10px_rgba(29,63,43,0.025)] transition hover:border-[#c8d9cb]" data-testid={`card-automation-${tool.id}`}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tool.background}`}>
                    <BrandIcon size={27} color={tool.color} aria-hidden="true" />
                  </div>
                  <span className="rounded-full bg-[#e7f4eb] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#176b46]">HTTP SETUP</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#294635]">{tool.name}</h3>
                <p className="mt-1 min-h-10 text-sm leading-5 text-[#718076]">{tool.description}</p>
                <button
                  type="button"
                  onClick={() => setExpandedTool(expanded ? null : tool.id)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#dce5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#435c49] transition hover:bg-[#f3f7f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b46]/30"
                  aria-expanded={expanded}
                  aria-controls={`guide-content-${tool.id}`}
                  data-testid={`button-toggle-guide-${tool.id}`}
                >
                  {expanded ? 'Hide setup guide' : 'View setup guide'}
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {expanded && (
                <div id={`guide-content-${tool.id}`} className="space-y-4 border-t border-[#e5ece6] bg-[#f7f9f7] p-5">
                  <ol className="space-y-3">
                    {tool.steps.map((step, index) => (
                      <li key={step} className="flex gap-3 text-sm leading-5 text-[#475a4b]">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#54715c] ring-1 ring-[#dce5dd]">{index + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="rounded-lg border border-[#dfe8e0] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#43584a]">Text-message endpoint</p>
                      <button
                        type="button"
                        onClick={copyEndpoint}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#176b46] hover:underline"
                        data-testid={`button-copy-endpoint-${tool.id}`}
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </button>
                    </div>
                    <code className="mt-2 block break-all font-mono text-[11px] leading-5 text-[#586b5c]" data-testid={`text-endpoint-${tool.id}`}>{sendEndpoint}</code>
                    <a
                      href="#api-quick-start"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#176b46] hover:underline"
                      data-testid={`link-examples-${tool.id}`}
                    >
                      See request examples <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="flex gap-2 text-xs leading-5 text-[#718076]">
                    <ArrowDown className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    For incoming WhatsApp messages, configure the tool's webhook URL in the Airavata Webhooks section.
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}