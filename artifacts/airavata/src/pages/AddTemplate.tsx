import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Image as ImageIcon, FileText, Video, AlertCircle, Loader2, Shield, Clock, Zap, ChevronDown, Plus, Trash2, Phone, Link } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

interface Flow {
  id: string;
  name: string;
  status: string;
  metaFlowId?: string;
  screens?: Array<{ id: string }>;
}

/** Returns sorted unique variable numbers found in a string */
function extractVars(text: string): number[] {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map(m => parseInt(m[1]!, 10)))].sort((a, b) => a - b);
}

/** Replace {{N}} with sample value for the live preview */
function applySamples(text: string, samples: Record<number, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => samples[parseInt(n, 10)] || `[Var ${n}]`);
}

export default function AddTemplate() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // ── Shared fields ──────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('en_US');

  // ── MARKETING / UTILITY fields ─────────────────────────────────────────────
  const [headerType, setHeaderType] = useState('NONE');
  const [headerContent, setHeaderContent] = useState('');
  const [bodyText, setBodyText] = useState('Hi {{1}}, welcome to our service!');
  const [footerText, setFooterText] = useState('');
  const [samples, setSamples] = useState<Record<number, string>>({});

  // ── Buttons ────────────────────────────────────────────────────────────────
  type ButtonMode = 'NONE' | 'QUICK_REPLY' | 'CTA';
  const [buttonMode, setButtonMode] = useState<ButtonMode>('NONE');
  const [quickReplies, setQuickReplies] = useState(['', '', '']);
  const [ctaUrl, setCtaUrl] = useState({ enabled: false, text: 'Visit Website', url: '' });
  const [ctaPhone, setCtaPhone] = useState({ enabled: false, text: 'Call Us', phone: '' });

  // ── Flow button fields ─────────────────────────────────────────────────────
  const [flowButtonEnabled, setFlowButtonEnabled] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [flowButtonText, setFlowButtonText] = useState('Open Form');

  // ── Linked Chatbot ─────────────────────────────────────────────────────────
  const [linkedChatbotEnabled, setLinkedChatbotEnabled] = useState(false);
  const [linkedChatbotId, setLinkedChatbotId] = useState('');

  const { data: flowsData } = useQuery<{ flows: Flow[] }>({
    queryKey: ['whatsapp-flows'],
    queryFn: () => api.get('/flows'),
  });
  const publishedFlows = (flowsData?.flows ?? []).filter(f => f.status === 'PUBLISHED' && f.metaFlowId);
  const selectedFlow = publishedFlows.find(f => f.id === selectedFlowId);

  interface ChatbotFlow { id: string; name: string; status: string; }
  const { data: chatbotData } = useQuery<{ flows: ChatbotFlow[] }>({
    queryKey: ['chatbot-flows'],
    queryFn: () => api.get('/chatbot/flows'),
  });
  const publishedChatbotFlows = (chatbotData?.flows ?? []).filter(f => f.status === 'PUBLISHED');

  // ── AUTHENTICATION fields ──────────────────────────────────────────────────
  const [addSecurityRec, setAddSecurityRec] = useState(true);
  const [codeExpiry, setCodeExpiry] = useState(5);
  const [enableExpiry, setEnableExpiry] = useState(true);
  const [otpType, setOtpType] = useState<'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP'>('COPY_CODE');

  const isAuth = category === 'AUTHENTICATION';

  const insertVariable = () => {
    const match = bodyText.match(/\{\{(\d+)\}\}/g);
    const nextNum = match ? match.length + 1 : 1;
    setBodyText(prev => prev + ` {{${nextNum}}}`);
  };

  const bodyVars = useMemo(() => extractVars(bodyText), [bodyText]);
  const headerVars = useMemo(
    () => (headerType === 'TEXT' ? extractVars(headerContent) : []),
    [headerType, headerContent],
  );
  const allVars = useMemo(
    () => [...new Set([...bodyVars, ...headerVars])].sort((a, b) => a - b),
    [bodyVars, headerVars],
  );
  const setSample = (idx: number, value: string) =>
    setSamples(prev => ({ ...prev, [idx]: value }));

  const submitMutation = useMutation({
    mutationFn: () => {
      if (isAuth) {
        return api.post('/templates', {
          name,
          category,
          language,
          headerType: 'NONE',
          body: undefined,
          addSecurityRecommendation: addSecurityRec,
          codeExpirationMinutes: enableExpiry ? codeExpiry : undefined,
          otpType,
        });
      }

      const bodySamples = bodyVars.map(i => samples[i] ?? '');
      const headerSample = headerVars.length > 0 ? (samples[headerVars[0]!] ?? '') : undefined;

      const DIGIT_WORDS = ['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE'];
      const sanitizeScreenId = (id: string) => id.replace(/\d/g, d => DIGIT_WORDS[parseInt(d)] ?? d);

      const fb = flowButtonEnabled && selectedFlow && selectedFlow.metaFlowId
        ? {
            flowId: selectedFlow.metaFlowId,
            flowName: selectedFlow.name,
            text: flowButtonText.trim() || 'Open Form',
            navigateScreen: sanitizeScreenId(selectedFlow.screens?.[0]?.id ?? 'SCREEN_A'),
          }
        : undefined;

      // Build button payload based on active mode
      const qrButtons = !fb && buttonMode === 'QUICK_REPLY'
        ? quickReplies.filter(r => r.trim()).slice(0, 3)
        : undefined;
      const ctaButtonsList = !fb && buttonMode === 'CTA'
        ? [
            ...(ctaUrl.enabled ? [{ type: 'URL', text: ctaUrl.text.trim() || 'Visit Website', value: ctaUrl.url }] : []),
            ...(ctaPhone.enabled ? [{ type: 'PHONE_NUMBER', text: ctaPhone.text.trim() || 'Call Us', value: ctaPhone.phone }] : []),
          ]
        : undefined;

      return api.post('/templates', {
        name,
        category,
        language,
        headerType,
        headerContent: headerType === 'TEXT' ? headerContent : undefined,
        body: bodyText,
        footer: footerText || undefined,
        bodySamples: bodySamples.length > 0 ? bodySamples : undefined,
        headerSample: headerSample || undefined,
        flowButton: fb,
        quickReplies: qrButtons,
        ctaButtons: ctaButtonsList,
        linkedChatbotFlowId: linkedChatbotEnabled && linkedChatbotId ? linkedChatbotId : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Template submitted to Meta for approval');
      qc.invalidateQueries({ queryKey: ['templates'] });
      navigate('/manage-templates');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Template name is required'); return; }
    if (!isAuth) {
      if (!bodyText.trim()) { toast.error('Body is required'); return; }
      for (const idx of allVars) {
        if (!samples[idx]?.trim()) {
          toast.error(`Please provide a sample value for {{${idx}}}`);
          return;
        }
      }
    }
    if (!isAuth && flowButtonEnabled && !selectedFlowId) {
      toast.error('Please select a flow to attach, or disable the flow button');
      return;
    }
    if (!isAuth && buttonMode === 'QUICK_REPLY') {
      const filled = quickReplies.filter(r => r.trim());
      if (filled.length === 0) { toast.error('Add at least one Quick Reply button label'); return; }
    }
    if (!isAuth && buttonMode === 'CTA') {
      if (!ctaUrl.enabled && !ctaPhone.enabled) { toast.error('Enable at least one CTA button'); return; }
      if (ctaUrl.enabled && !ctaUrl.url.trim()) { toast.error('Enter a URL for the Website button'); return; }
      if (ctaPhone.enabled && !ctaPhone.phone.trim()) { toast.error('Enter a phone number for the Call button'); return; }
    }
    submitMutation.mutate();
  };

  const headerOptions = [
    { value: 'NONE', label: 'None' },
    { value: 'TEXT', label: 'Text' },
    { value: 'IMAGE', label: 'Image' },
    { value: 'VIDEO', label: 'Video' },
    { value: 'DOCUMENT', label: 'Document' },
  ];

  const PLACEHOLDERS: Record<number, string> = {
    1: 'e.g. Rahul', 2: 'e.g. ORDER123', 3: 'e.g. 3 Jan 2025',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Add Template</h1>
        <p className="text-sm text-gray-500 mb-6">Create a message template for Meta's approval.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Template name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="e.g. order_confirmation"
              required
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none"
            />
            <p className="text-xs text-gray-400">Lowercase and underscores only</p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Category</label>
            <div className="flex flex-wrap gap-3">
              {[
                { value: 'MARKETING', label: 'Marketing', desc: 'Promotions & offers' },
                { value: 'UTILITY', label: 'Utility', desc: 'Order updates, alerts' },
                { value: 'AUTHENTICATION', label: 'Authentication', desc: 'OTP & verification' },
              ].map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 px-4 py-3 border rounded-lg cursor-pointer transition-colors min-w-[140px] ${
                    category === opt.value
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio" name="category" value={opt.value}
                    checked={category === opt.value}
                    onChange={() => setCategory(opt.value)}
                    className="hidden"
                  />
                  <div>
                    <div className={`text-sm font-medium ${category === opt.value ? 'text-primary' : 'text-gray-800'}`}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full md:w-1/2 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
            >
              <option value="en_US">English (US)</option>
              <option value="en_GB">English (UK)</option>
              <option value="hi_IN">Hindi</option>
              <option value="es_ES">Spanish</option>
            </select>
          </div>

          <div className="border-t pt-6 space-y-6">
            {/* ── AUTHENTICATION-specific fields ─────────────────────────────── */}
            {isAuth ? (
              <div className="space-y-5">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 space-y-1">
                  <p className="font-semibold">Authentication templates</p>
                  <p className="text-xs text-blue-700">
                    Meta auto-generates the OTP body text (e.g. "482913 is your verification code.").
                    You configure the security options and button type below.
                  </p>
                </div>

                {/* Security recommendation */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={addSecurityRec}
                    onChange={e => setAddSecurityRec(e.target.checked)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                      <Shield className="w-4 h-4 text-gray-400" />
                      Add security recommendation
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Appends "For your security, never share this code." to the message.
                    </p>
                  </div>
                </label>

                {/* Code expiry */}
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableExpiry}
                      onChange={e => setEnableExpiry(e.target.checked)}
                      className="accent-primary"
                    />
                    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                      <Clock className="w-4 h-4 text-gray-400" />
                      Show code expiration
                    </div>
                  </label>
                  {enableExpiry && (
                    <div className="flex items-center gap-2 ml-7">
                      <input
                        type="number"
                        min={1} max={90}
                        value={codeExpiry}
                        onChange={e => setCodeExpiry(Number(e.target.value))}
                        className="w-20 px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-primary focus:border-primary"
                      />
                      <span className="text-sm text-gray-600">minutes</span>
                    </div>
                  )}
                </div>

                {/* OTP button type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">OTP button type</label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { value: 'COPY_CODE', label: 'Copy Code', desc: 'User taps to copy the OTP' },
                      { value: 'ONE_TAP', label: 'One Tap', desc: 'Auto-fills the OTP in-app' },
                      { value: 'ZERO_TAP', label: 'Zero Tap', desc: 'Auto-submits without tapping' },
                    ].map(opt => (
                      <label
                        key={opt.value}
                        className={`flex flex-col px-4 py-2.5 border rounded-lg cursor-pointer transition-colors min-w-[120px] ${
                          otpType === opt.value ? 'bg-primary/10 border-primary' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio" name="otpType" value={opt.value}
                          checked={otpType === opt.value}
                          onChange={() => setOtpType(opt.value as typeof otpType)}
                          className="hidden"
                        />
                        <span className={`text-sm font-medium ${otpType === opt.value ? 'text-primary' : 'text-gray-800'}`}>
                          {opt.label}
                        </span>
                        <span className="text-xs text-gray-400 mt-0.5">{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ── MARKETING / UTILITY fields ─────────────────────────────────── */
              <>
                {/* Header */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">
                    Header <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {headerOptions.map(opt => (
                      <label
                        key={opt.value}
                        className={`px-4 py-2 border rounded-lg text-sm cursor-pointer transition-colors ${
                          headerType === opt.value
                            ? 'bg-primary/10 border-primary text-primary font-medium'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <input
                          type="radio" name="headerType" value={opt.value}
                          checked={headerType === opt.value}
                          onChange={() => setHeaderType(opt.value)}
                          className="hidden"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {headerType === 'TEXT' && (
                    <input
                      type="text"
                      value={headerContent}
                      onChange={e => setHeaderContent(e.target.value)}
                      placeholder="Header text (no emojis or special characters)"
                      maxLength={60}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none"
                    />
                  )}
                  {headerType !== 'NONE' && headerType !== 'TEXT' && (
                    <p className="text-xs text-gray-500">
                      Media URL will be provided when sending the campaign.
                    </p>
                  )}
                </div>

                {/* Body */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">Body</label>
                    <button
                      type="button"
                      onClick={insertVariable}
                      className="text-xs font-medium text-primary hover:bg-primary/5 px-2 py-1 rounded"
                    >
                      + Add Variable
                    </button>
                  </div>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none resize-y"
                    placeholder="Type your message here..."
                    required
                  />
                  <p className="text-xs text-gray-400">
                    Use <code className="bg-gray-100 px-1 rounded">{'{{1}}'}</code>,{' '}
                    <code className="bg-gray-100 px-1 rounded">{'{{2}}'}</code> for personalisation variables.
                  </p>
                </div>

                {/* Sample Values */}
                {allVars.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Sample Values Required</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Meta requires an example value for every variable to review and approve your template.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {allVars.map(idx => (
                        <div key={idx} className="flex items-center gap-3">
                          <code className="text-xs font-mono bg-amber-100 border border-amber-300 text-amber-800 px-2 py-1 rounded w-14 text-center shrink-0">
                            {`{{${idx}}}`}
                          </code>
                          <input
                            type="text"
                            value={samples[idx] ?? ''}
                            onChange={e => setSample(idx, e.target.value)}
                            placeholder={PLACEHOLDERS[idx] ?? `e.g. value_${idx}`}
                            className={`flex-1 px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 bg-white ${
                              !samples[idx]?.trim() ? 'border-amber-300' : 'border-gray-300'
                            }`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    Footer <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={e => setFooterText(e.target.value)}
                    placeholder="e.g. Reply STOP to opt out"
                    maxLength={60}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none"
                  />
                </div>

                {/* Buttons */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Buttons <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-0.5">Add up to 3 Quick Reply buttons or CTA buttons (URL / Phone).</p>
                  </div>

                  {/* Mode picker */}
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'NONE', label: 'None' },
                      { value: 'QUICK_REPLY', label: '⚡ Quick Reply' },
                      { value: 'CTA', label: '🔗 Call-to-Action' },
                    ] as { value: ButtonMode; label: string }[]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setButtonMode(opt.value);
                          if (opt.value !== 'NONE') setFlowButtonEnabled(false);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          buttonMode === opt.value
                            ? 'bg-primary/10 border-primary text-primary font-medium'
                            : 'hover:bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Quick Reply inputs */}
                  {buttonMode === 'QUICK_REPLY' && (
                    <div className="border rounded-lg p-4 space-y-2 bg-purple-50 border-purple-100">
                      <p className="text-xs text-purple-800 mb-3">
                        When a customer taps a Quick Reply, the chatbot will be triggered automatically using the button text as the intent keyword.
                      </p>
                      {quickReplies.map((reply, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-mono w-5 text-center text-gray-400">{i + 1}</span>
                          <input
                            type="text"
                            value={reply}
                            onChange={e => {
                              const next = [...quickReplies];
                              next[i] = e.target.value;
                              setQuickReplies(next);
                            }}
                            placeholder={['e.g. Interested', 'e.g. Buy Now', 'e.g. Talk to Sales'][i]}
                            maxLength={25}
                            className="flex-1 px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-primary focus:border-primary bg-white"
                          />
                          {reply && (
                            <button type="button" onClick={() => { const next = [...quickReplies]; next[i] = ''; setQuickReplies(next); }} className="text-gray-400 hover:text-gray-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <p className="text-xs text-gray-400 pt-1">Max 25 characters per button · Up to 3 buttons</p>
                    </div>
                  )}

                  {/* CTA inputs */}
                  {buttonMode === 'CTA' && (
                    <div className="border rounded-lg p-4 space-y-4 bg-blue-50 border-blue-100">
                      {/* URL button */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ctaUrl.enabled}
                            onChange={e => setCtaUrl(v => ({ ...v, enabled: e.target.checked }))}
                            className="accent-primary"
                          />
                          <Link className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium text-gray-800">Website URL button</span>
                        </label>
                        {ctaUrl.enabled && (
                          <div className="ml-6 space-y-2">
                            <input
                              type="text"
                              value={ctaUrl.text}
                              onChange={e => setCtaUrl(v => ({ ...v, text: e.target.value }))}
                              placeholder="Button label"
                              maxLength={25}
                              className="w-full px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-primary focus:border-primary bg-white"
                            />
                            <input
                              type="url"
                              value={ctaUrl.url}
                              onChange={e => setCtaUrl(v => ({ ...v, url: e.target.value }))}
                              placeholder="https://yourwebsite.com"
                              className="w-full px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-primary focus:border-primary bg-white"
                            />
                          </div>
                        )}
                      </div>

                      {/* Phone button */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ctaPhone.enabled}
                            onChange={e => setCtaPhone(v => ({ ...v, enabled: e.target.checked }))}
                            className="accent-primary"
                          />
                          <Phone className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-medium text-gray-800">Phone Number button</span>
                        </label>
                        {ctaPhone.enabled && (
                          <div className="ml-6 space-y-2">
                            <input
                              type="text"
                              value={ctaPhone.text}
                              onChange={e => setCtaPhone(v => ({ ...v, text: e.target.value }))}
                              placeholder="Button label"
                              maxLength={25}
                              className="w-full px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-primary focus:border-primary bg-white"
                            />
                            <input
                              type="tel"
                              value={ctaPhone.phone}
                              onChange={e => setCtaPhone(v => ({ ...v, phone: e.target.value }))}
                              placeholder="+91 98765 43210"
                              className="w-full px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-primary focus:border-primary bg-white"
                            />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">You can enable one or both CTA buttons.</p>
                    </div>
                  )}
                </div>

                {/* Linked Chatbot */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-indigo-500" />
                      Linked Chatbot
                      <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setLinkedChatbotEnabled(v => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${linkedChatbotEnabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${linkedChatbotEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {linkedChatbotEnabled && (
                    <div className="border rounded-lg p-4 space-y-3 bg-indigo-50 border-indigo-100">
                      <p className="text-xs text-indigo-800">
                        When a customer taps a Quick Reply button on this template, the selected chatbot flow will start automatically — skipping keyword matching.
                      </p>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">Select Chatbot Flow</label>
                        {publishedChatbotFlows.length === 0 ? (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            No published chatbot flows found. Build and publish a flow in the Chatbot Builder first.
                          </p>
                        ) : (
                          <div className="relative">
                            <select
                              value={linkedChatbotId}
                              onChange={e => setLinkedChatbotId(e.target.value)}
                              className="w-full px-3 py-2 pr-8 border rounded-lg text-sm bg-white outline-none appearance-none focus:ring-indigo-400 focus:border-indigo-400"
                            >
                              <option value="">— Choose a chatbot flow —</option>
                              {publishedChatbotFlows.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Flow Button */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-green-500" />
                      Attach a WhatsApp Flow
                      <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => { setFlowButtonEnabled(v => !v); if (!flowButtonEnabled) setButtonMode('NONE'); }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${flowButtonEnabled ? 'bg-primary' : 'bg-gray-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${flowButtonEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {flowButtonEnabled && (
                    <div className="border rounded-lg p-4 space-y-3 bg-green-50 border-green-100">
                      <p className="text-xs text-green-800">
                        A button will be added to the template that opens the selected flow inside WhatsApp.
                      </p>

                      {/* Flow selector */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">Select Flow</label>
                        {publishedFlows.length === 0 ? (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            No published flows found. Publish a flow in Flow Builder first.
                          </p>
                        ) : (
                          <div className="relative">
                            <select
                              value={selectedFlowId}
                              onChange={e => setSelectedFlowId(e.target.value)}
                              className="w-full px-3 py-2 pr-8 border rounded-lg text-sm bg-white outline-none appearance-none focus:ring-primary focus:border-primary"
                            >
                              <option value="">— Choose a flow —</option>
                              {publishedFlows.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>
                        )}
                      </div>

                      {/* Button label */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-700">Button Label</label>
                        <input
                          type="text"
                          value={flowButtonText}
                          onChange={e => setFlowButtonText(e.target.value)}
                          placeholder="e.g. Book Appointment"
                          maxLength={25}
                          className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-primary focus:border-primary"
                        />
                        <p className="text-xs text-gray-400">Max 25 characters</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
              <AlertCircle className="w-5 h-5 shrink-0 text-blue-500" />
              <p>Meta requires approval for all templates. This usually takes a few minutes but can take up to 24 hours.</p>
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/manage-templates')}
              className="px-4 py-2 border rounded-lg font-medium text-gray-700 hover:bg-gray-50"
              disabled={submitMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 shadow-sm flex items-center gap-2 disabled:opacity-60"
            >
              {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit for Approval
            </button>
          </div>
        </form>
      </div>

      {/* ── Preview ───────────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-80 shrink-0">
        <div className="sticky top-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Preview</h3>

          <div className="bg-[#efeae2] rounded-3xl p-4 h-[520px] border-8 border-gray-900 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-14 bg-[#075e54] flex items-center px-4 shadow-sm z-10">
              <div className="w-8 h-8 rounded-full bg-white/20 mr-3" />
              <div className="text-white">
                <div className="font-medium text-sm">Your Business</div>
                <div className="text-[10px] opacity-80">Official Business Account</div>
              </div>
            </div>

            <div className="pt-16 pb-4 h-full overflow-y-auto flex flex-col">
              <div className="self-start max-w-[90%]">
                {/* Message bubble */}
                <div className={`bg-white p-3 shadow-sm text-sm text-gray-800 ${
                  !isAuth && buttonMode === 'CTA' && (ctaUrl.enabled || ctaPhone.enabled)
                    ? 'rounded-lg rounded-tl-none rounded-b-none'
                    : 'rounded-lg rounded-tl-none'
                }`}>
                  {isAuth ? (
                    /* Authentication preview */
                    <div className="space-y-2">
                      <p className="font-semibold text-gray-900">482913 is your verification code.</p>
                      {addSecurityRec && (
                        <p className="text-gray-500 text-xs">For your security, never share this code.</p>
                      )}
                      {enableExpiry && (
                        <p className="text-gray-400 text-xs">This code expires in {codeExpiry} minutes.</p>
                      )}
                      <div className="border-t pt-2 mt-2">
                        <button className="w-full text-center text-[#0084ff] text-sm font-medium py-1">
                          {otpType === 'COPY_CODE' ? '📋 Copy Code' : '✅ Autofill'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Marketing / Utility preview */
                    <>
                      {headerType !== 'NONE' && (
                        <div className="mb-2 w-full aspect-video bg-gray-200 rounded flex items-center justify-center text-gray-400">
                          {headerType === 'IMAGE' && <ImageIcon className="w-6 h-6" />}
                          {headerType === 'VIDEO' && <Video className="w-6 h-6" />}
                          {headerType === 'DOCUMENT' && <FileText className="w-6 h-6" />}
                          {headerType === 'TEXT' && (
                            <span className="font-bold text-gray-800 p-2 text-center">
                              {applySamples(headerContent || 'HEADER TEXT', samples)}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {applySamples(bodyText, samples)}
                      </div>
                      {footerText && (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                          {footerText}
                        </div>
                      )}
                    </>
                  )}
                  {!isAuth && flowButtonEnabled && (flowButtonText || selectedFlow) && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <button className="w-full text-center text-[#0084ff] text-sm font-medium py-1 flex items-center justify-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        {flowButtonText || 'Open Form'}
                      </button>
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 text-right mt-1">12:00 PM</div>
                </div>

                {/* CTA buttons — attached below bubble with dividers */}
                {!isAuth && buttonMode === 'CTA' && (ctaUrl.enabled || ctaPhone.enabled) && (
                  <div className="bg-white rounded-b-lg shadow-sm overflow-hidden border-t border-gray-100">
                    {ctaUrl.enabled && (
                      <div className="px-3 py-2 text-xs text-[#0084ff] text-center flex items-center justify-center gap-1 border-t border-gray-100 first:border-t-0">
                        <Link className="w-3 h-3" />
                        {ctaUrl.text || 'Visit Website'}
                      </div>
                    )}
                    {ctaPhone.enabled && (
                      <div className="px-3 py-2 text-xs text-[#0084ff] text-center flex items-center justify-center gap-1 border-t border-gray-100">
                        <Phone className="w-3 h-3" />
                        {ctaPhone.text || 'Call Us'}
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Reply pills — appear below bubble */}
                {!isAuth && buttonMode === 'QUICK_REPLY' && quickReplies.some(r => r.trim()) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {quickReplies.filter(r => r.trim()).map((reply, i) => (
                      <div key={i} className="bg-white rounded-full px-3 py-1 text-[11px] text-[#0084ff] font-medium border border-white shadow-sm whitespace-nowrap">
                        {reply}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2 text-xs text-amber-800">
            <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <span>Preview is approximate. Final rendering depends on the recipient's WhatsApp version.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
