import { useState } from 'react';
import { Check, Copy, FileCode2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const textMessageExample = `curl -X POST "https://YOUR-AIRAVATA-DOMAIN/api/integrations/v1/whatsapp/messages/text" \\
  -H "Authorization: Bearer YOUR_AIRAVATA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phoneNumberId": "YOUR_PHONE_NUMBER_ID",
    "to": "+919876543210",
    "text": "Your order is ready.",
    "clientMessageId": "order-1042-ready"
  }'`;

const templateMessageExample = `curl -X POST "https://YOUR-AIRAVATA-DOMAIN/api/integrations/v1/whatsapp/messages/template" \\
  -H "Authorization: Bearer YOUR_AIRAVATA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phoneNumberId": "YOUR_PHONE_NUMBER_ID",
    "to": "+919876543210",
    "templateName": "order_update",
    "languageCode": "en_US",
    "clientMessageId": "order-1042-update",
    "components": [{
      "type": "body",
      "parameters": [{ "type": "text", "text": "1042" }]
    }]
  }'`;

const listTemplatesExample = `curl -G "https://YOUR-AIRAVATA-DOMAIN/api/integrations/v1/whatsapp/templates" \\
  -H "Authorization: Bearer YOUR_AIRAVATA_API_KEY" \\
  --data-urlencode "phoneNumberId=YOUR_PHONE_NUMBER_ID"`;

const signatureExample = `import { createHmac, timingSafeEqual } from "node:crypto";

// Preserve the exact raw request body before JSON parsing.
const timestamp = request.headers["x-airavata-webhook-timestamp"];
const signature = request.headers["x-airavata-webhook-signature"];
const rawBody = request.rawBody;

const digest = createHmac("sha256", WEBHOOK_SECRET)
  .update(\`\${timestamp}.\${rawBody}\`)
  .digest("hex");
const expected = Buffer.from(\`sha256=\${digest}\`);
const received = Buffer.from(signature ?? "");

const valid =
  received.length === expected.length &&
  timingSafeEqual(received, expected);
if (!valid) throw new Error("Invalid Airavata webhook signature");`;

function CopyCode({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`${title} copied`);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Unable to copy code');
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#dce5dd] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#526457] transition hover:bg-[#f1f6f2]"
      aria-label={`Copy ${title}`}
      data-testid={`button-copy-${title.toLowerCase().replaceAll(' ', '-')}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeCard({ title, description, code }: { title: string; description: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#dfe8e0] bg-white shadow-[0_2px_10px_rgba(29,63,43,0.025)]">
      <div className="flex flex-col justify-between gap-2 border-b border-[#e5ece6] px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold text-[#294635]">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-[#718076]">{description}</p>
        </div>
        <CopyCode title={title} code={code} />
      </div>
      <pre className="overflow-x-auto bg-[#172b20] p-4 font-mono text-xs leading-5 text-[#e1eee4]"><code>{code}</code></pre>
    </div>
  );
}

export default function IntegrationApiDocs() {
  return (
    <section id="api-quick-start" className="space-y-5 scroll-mt-6" data-testid="section-api-documentation">
      <div>
        <div className="flex items-center gap-2">
          <FileCode2 className="h-5 w-5 text-[#176b46]" />
          <h2 className="text-lg font-semibold tracking-tight text-[#193c2d]">API quick start</h2>
        </div>
        <p className="mt-1 text-sm leading-5 text-[#68786c]">
          Make server-to-server requests with the Airavata API key and your phone number ID.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { number: '1', title: 'Create an API key', text: 'Make a separate key for each CRM, ERP, or website.' },
          { number: '2', title: 'Send from your server', text: 'Keep the key out of browser code and mobile apps.' },
          { number: '3', title: 'Receive event callbacks', text: 'Add a signed webhook URL for inbound messages and delivery updates.' },
        ].map((step) => (
          <div key={step.number} className="rounded-xl border border-[#dfe8e0] bg-white p-4 shadow-[0_2px_10px_rgba(29,63,43,0.025)]">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e7f2e9] text-xs font-semibold text-[#176b46]">{step.number}</span>
              <h3 className="text-sm font-semibold text-[#294635]">{step.title}</h3>
            </div>
          <p className="mt-2 text-sm leading-5 text-[#68786c]">{step.text}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[#ecdcb6] bg-[#fbf5e8] p-4 text-sm leading-5 text-[#725a28]">
        Free-form text is allowed only within WhatsApp's 24-hour customer-service window. Outside that window, send an approved template. Template sends use the category-based rate configured for the workspace.
      </div>
      <p className="text-xs leading-5 text-[#718076]">
        Use a unique <code className="rounded bg-[#edf2ed] px-1 font-mono text-[#415947]">clientMessageId</code> for each send. Retrying the same ID and payload returns the original result instead of sending twice; a different payload with the same ID is rejected.
      </p>

      <div className="space-y-3">
        <CodeCard
          title="Send a free-text reply"
          description="The recipient must have messaged this WhatsApp number in the last 24 hours."
          code={textMessageExample}
        />
        <CodeCard
          title="Send an approved template"
          description="Use the exact approved template name and language; pass variable components in Meta's format."
          code={templateMessageExample}
        />
        <CodeCard
          title="List approved templates"
          description="Use this endpoint to discover valid template names, languages, categories, and component structure."
          code={listTemplatesExample}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[#dfe8e0] bg-white shadow-[0_2px_10px_rgba(29,63,43,0.025)]">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-[#28734d]" />
          <div>
            <h3 className="text-sm font-semibold text-[#294635]">Verify signed webhooks</h3>
            <p className="text-xs text-[#718076]">Verify the raw request body before parsing or acting on an event.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3 text-xs text-[#55695a]">
          <code className="rounded bg-[#eff4ef] px-2 py-1 font-mono">X-Airavata-Webhook-Id</code>
          <code className="rounded bg-[#eff4ef] px-2 py-1 font-mono">X-Airavata-Webhook-Event</code>
          <code className="rounded bg-[#eff4ef] px-2 py-1 font-mono">X-Airavata-Webhook-Timestamp</code>
          <code className="rounded bg-[#eff4ef] px-2 py-1 font-mono">X-Airavata-Webhook-Signature</code>
        </div>
        <div className="flex justify-end border-t border-[#e5ece6] px-4 py-2">
          <CopyCode title="Webhook signature example" code={signatureExample} />
        </div>
        <pre className="overflow-x-auto bg-[#172b20] p-4 font-mono text-xs leading-5 text-[#e1eee4]"><code>{signatureExample}</code></pre>
        <p className="border-t border-[#e5ece6] px-4 py-3 text-xs leading-5 text-[#718076]">
          The signature is HMAC-SHA256 of <code className="rounded bg-[#edf2ed] px-1 font-mono text-[#415947]">timestamp + "." + rawBody</code>, prefixed with <code className="rounded bg-[#edf2ed] px-1 font-mono text-[#415947]">sha256=</code>. Use the signing secret shown once when the webhook is created. Reject stale timestamps and deduplicate delivery IDs.
        </p>
      </div>
    </section>
  );
}