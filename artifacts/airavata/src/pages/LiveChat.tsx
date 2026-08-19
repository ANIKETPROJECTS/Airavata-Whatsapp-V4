/**
 * Module 7: Live Chat — wired to real conversation & message data.
 * Polls for new messages every 5 seconds so incoming WhatsApp replies appear live.
 * Supports emoji picker and media attachments (image, document, video, audio).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, MessageSquare, MoreVertical,
  Send, Paperclip, Smile, CheckCheck, Loader2, RefreshCw,
  FileText, Image, Film, Music, X, FileImage, Mic, CheckCircle2, RotateCcw,
  UserRound, Phone, Mail, Tag, UsersRound, Save, ChevronDown, Plus, Megaphone,
  Check, Clock3, CircleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
  status: string;
  windowOpen: boolean;
}

interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaId?: string | null;
  mediaFilename?: string;
  flowData?: Record<string, unknown> | null;
  flowId?: string | null;
  status: string;
  createdAt: string;
}

interface AttachmentFile {
  file: File;
  previewUrl: string | null; // only for images
}

interface ProfileTag {
  id: string;
  name: string;
  color: string;
}

interface ProfileGroup {
  id: string;
  name: string;
  memberCount?: number;
}

interface ContactProfile {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  chatState?: string;
  tags: ProfileTag[];
  group: ProfileGroup | null;
  groups?: ProfileGroup[];
}

interface ContactCampaign {
  id: string;
  name: string;
  templateName?: string | null;
  status: string;
  recipientStatus: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
}

interface TemplateRecord {
  id: string;
  name: string;
  category: string;
  language: string;
  body: string;
  status: string;
}

function extractTemplateVars(body: string): number[] {
  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map(match => parseInt(match[1]!, 10)))].sort((a, b) => a - b);
}

function fillTemplatePreview(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, index) => {
    const value = values[parseInt(index, 10) - 1];
    return value?.trim() ? value.trim() : `{{${index}}}`;
  });
}

function LiveChatTemplateDialog({
  contactPhone,
  onClose,
  onSent,
}: {
  contactPhone: string;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const { data, isLoading } = useQuery<{ templates: TemplateRecord[] }>({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates'),
  });
  const approvedTemplates = (data?.templates ?? []).filter(
    template => template.status.toUpperCase() === 'APPROVED',
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [varValues, setVarValues] = useState<string[]>([]);
  const [otpCode, setOtpCode] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = approvedTemplates.find(template => template.id === selectedTemplateId) ?? null;
  const isAuth = selectedTemplate?.category.toUpperCase() === 'AUTHENTICATION';
  const varIndices = selectedTemplate && !isAuth ? extractTemplateVars(selectedTemplate.body) : [];

  useEffect(() => {
    const nextTemplate = approvedTemplates[0];
    if (!selectedTemplateId && nextTemplate) {
      setSelectedTemplateId(nextTemplate.id);
    }
  }, [approvedTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setVarValues([]);
      setOtpCode('');
      return;
    }
    setVarValues(varIndices.map(() => ''));
    setOtpCode(isAuth ? String(Math.floor(100000 + Math.random() * 900000)) : '');
    setError(null);
  }, [selectedTemplateId, isAuth, selectedTemplate, varIndices.length]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setError(null);
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTemplate) {
      setError('Select an approved template to continue.');
      return;
    }
    if (isAuth) {
      if (!otpCode.trim()) {
        setError('Enter the OTP code to send.');
        return;
      }
    } else {
      for (let index = 0; index < varIndices.length; index++) {
        if (!varValues[index]?.trim()) {
          setError(`Fill in variable {{${varIndices[index]}}}.`);
          return;
        }
      }
    }

    setSending(true);
    setError(null);
    try {
      await api.post('/templates/send-test', {
        templateId: selectedTemplate.id,
        to: contactPhone,
        variables: isAuth ? [otpCode.trim()] : varValues.map(value => value.trim()),
      });
      await onSent();
      toast.success('Template message sent!');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Template send failed. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const preview = selectedTemplate
    ? isAuth
      ? `Your OTP code is ${otpCode.trim() || '______'}. Tap "Copy Code" to copy it.`
      : fillTemplatePreview(selectedTemplate.body, varValues)
    : '';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Send Template Message</h2>
            <p className="text-sm text-gray-500 mt-0.5">Re-engage this customer outside the 24-hour window.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="ml-2 text-sm">Loading approved templates...</span>
          </div>
        ) : approvedTemplates.length === 0 ? (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-4 text-sm text-orange-800">
            No approved templates are available. Create and approve a template before sending.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="live-chat-template">
                Approved template
              </label>
              <select
                id="live-chat-template"
                value={selectedTemplateId}
                onChange={event => handleTemplateChange(event.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                {approvedTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.category})
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <div className="bg-[#efeae2] rounded-lg p-3">
                <div className="bg-white rounded-lg p-3 shadow-sm text-sm text-gray-800 whitespace-pre-wrap">
                  {preview}
                </div>
              </div>
            )}

            <form onSubmit={handleSend} className="space-y-3">
              {isAuth && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700" htmlFor="live-chat-otp">
                    OTP / verification code
                  </label>
                  <input
                    id="live-chat-otp"
                    type="text"
                    value={otpCode}
                    onChange={event => setOtpCode(event.target.value)}
                    placeholder="e.g. 483921"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono tracking-widest"
                  />
                </div>
              )}

              {!isAuth && varIndices.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fill in variables</p>
                  {varIndices.map((index, position) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded shrink-0 text-gray-600">
                        {`{{${index}}}`}
                      </span>
                      <input
                        type="text"
                        value={varValues[position] ?? ''}
                        onChange={event => {
                          const next = [...varValues];
                          next[position] = event.target.value;
                          setVarValues(next);
                          setError(null);
                        }}
                        placeholder={`Value for {{${index}}}`}
                        className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700" htmlFor="live-chat-recipient">
                  Recipient
                </label>
                <input
                  id="live-chat-recipient"
                  type="text"
                  value={contactPhone}
                  readOnly
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500">Locked to the current conversation contact.</p>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !selectedTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Media renderer ────────────────────────────────────────────────────────────

function MediaBubble({ mediaType, mediaId, filename }: {
  mediaType: string;
  mediaId?: string | null;
  filename?: string;
}) {
  // Build the proxy URL when we have a mediaId; fall back to icon-only when we don't.
  const proxyUrl = mediaId
    ? `${import.meta.env.BASE_URL}api/media/proxy?mediaId=${encodeURIComponent(mediaId)}`
    : null;

  if (mediaType === 'image') {
    return proxyUrl ? (
      <img
        src={proxyUrl}
        alt={filename ?? 'image'}
        className="max-w-[260px] max-h-[260px] rounded-lg object-contain cursor-pointer"
        onClick={() => window.open(proxyUrl, '_blank')}
      />
    ) : (
      <div className="flex items-center gap-2 px-1 py-0.5 text-gray-500">
        <Image className="w-5 h-5 shrink-0" />
        <span className="text-xs truncate max-w-[180px]">{filename ?? 'image'}</span>
      </div>
    );
  }

  if (mediaType === 'video') {
    return proxyUrl ? (
      <video
        src={proxyUrl}
        controls
        className="max-w-[280px] max-h-[200px] rounded-lg"
      />
    ) : (
      <div className="flex items-center gap-2 px-1 py-0.5 text-gray-500">
        <Film className="w-5 h-5 shrink-0" />
        <span className="text-xs truncate max-w-[180px]">{filename ?? 'video'}</span>
      </div>
    );
  }

  if (mediaType === 'audio') {
    return proxyUrl ? (
      <audio src={proxyUrl} controls className="max-w-[260px]" />
    ) : (
      <div className="flex items-center gap-2 px-1 py-0.5 text-gray-500">
        <Music className="w-5 h-5 shrink-0" />
        <span className="text-xs truncate max-w-[180px]">{filename ?? 'audio'}</span>
      </div>
    );
  }

  // document / fallback — show a download link when possible
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <FileText className="w-5 h-5 shrink-0 text-gray-500" />
      {proxyUrl ? (
        <a
          href={proxyUrl}
          download={filename ?? 'document'}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline text-blue-600 truncate max-w-[180px]"
        >
          {filename ?? 'document'}
        </a>
      ) : (
        <span className="text-xs text-gray-500 truncate max-w-[180px]">{filename ?? mediaType}</span>
      )}
    </div>
  );
}

// ── Flow submission bubble ────────────────────────────────────────────────────

function FlowDataBubble({ data }: { data: Record<string, unknown> }) {
  // Skip internal Meta fields
  const SKIP = new Set(['flow_token', 'version', 'source']);
  const entries = Object.entries(data).filter(([k]) => !SKIP.has(k));

  function formatKey(k: string) {
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function formatVal(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  return (
    <div className="min-w-[200px]">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-base">📋</span>
        <span className="text-xs font-semibold text-gray-700">Form submitted</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No fields captured</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{formatKey(k)}</span>
              <span className="text-sm text-gray-800 break-words">{formatVal(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactProfilePanel({
  contactId,
  contactPhone,
  lastActiveAt,
  windowOpen,
  conversationStatus,
}: {
  contactId: string;
  contactPhone: string;
  lastActiveAt: string;
  windowOpen: boolean;
  conversationStatus: string;
}) {
  const qc = useQueryClient();
  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftGroupIds, setDraftGroupIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [showNewTag, setShowNewTag] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [showAttributes, setShowAttributes] = useState(true);
  const [showCampaigns, setShowCampaigns] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showGroups, setShowGroups] = useState(true);

  const { data: contactData, isLoading: contactLoading } = useQuery<{
    contacts: ContactProfile[];
  }>({
    queryKey: ['contact-profile', contactId],
    queryFn: () => api.get(`/contacts?search=${encodeURIComponent(contactPhone)}&limit=100`),
    enabled: Boolean(contactId && contactPhone),
  });

  const { data: tagsData } = useQuery<{ tags: ProfileTag[] }>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags'),
  });

  const { data: groupsData } = useQuery<{ groups: ProfileGroup[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups'),
  });

  const { data: campaignData, isLoading: campaignsLoading } = useQuery<{
    campaigns: ContactCampaign[];
  }>({
    queryKey: ['contact-campaigns', contactId],
    queryFn: () => api.get(`/contacts/${contactId}/campaigns`),
    enabled: Boolean(contactId),
  });

  const contact = contactData?.contacts.find(item => item.id === contactId) ?? null;
  const tags = tagsData?.tags ?? [];
  const groups = groupsData?.groups ?? [];
  const campaigns = campaignData?.campaigns ?? [];

  useEffect(() => {
    if (!contact) return;
    setDraftName(contact.name);
    setDraftEmail(contact.email ?? '');
    setDraftTags(contact.tags.map(tag => tag.id));
    setDraftGroupIds((contact.groups ?? (contact.group ? [contact.group] : [])).map(group => group.id));
  }, [contact?.id, contact?.name, contact?.email, contact?.group?.id, contact?.groups, contact?.tags]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/contacts/${contactId}`, {
        name: draftName.trim(),
        email: draftEmail.trim(),
        tags: draftTags,
        groupIds: draftGroupIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-profile', contactId] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Customer profile updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createTagMutation = useMutation({
    mutationFn: () => api.post<{ tag: ProfileTag }>('/tags', {
      name: newTagName.trim(),
      color: '#16a34a',
    }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      setDraftTags(current => [...current, result.tag.id]);
      setNewTagName('');
      setShowNewTag(false);
      toast.success('Tag created and assigned');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleTag = (tagId: string) => {
    setDraftTags(current =>
      current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId],
    );
  };

  if (contactLoading) {
    return (
      <aside className="w-80 border-l bg-white shrink-0 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </aside>
    );
  }

  if (!contact) {
    return (
      <aside className="w-80 border-l bg-white shrink-0 p-5">
        <p className="text-sm text-gray-500">Customer profile is not available for this conversation.</p>
      </aside>
    );
  }

  const displayName = contact.name === contact.phone ? '' : contact.name;
  const formatLastActive = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };
  const formatCampaignDate = (iso?: string | null) => {
    if (!iso) return 'Not available';
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? 'Not available'
      : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };
  const recipientStatus = (status: string) => {
    const normalized = status.toUpperCase();
    if (normalized === 'READ') return { label: 'Read', className: 'bg-green-100 text-green-700', icon: <Check className="w-3 h-3" /> };
    if (normalized === 'DELIVERED') return { label: 'Delivered', className: 'bg-blue-100 text-blue-700', icon: <Check className="w-3 h-3" /> };
    if (normalized === 'FAILED') return { label: 'Failed', className: 'bg-red-100 text-red-700', icon: <CircleAlert className="w-3 h-3" /> };
    if (normalized === 'SENT') return { label: 'Sent', className: 'bg-indigo-100 text-indigo-700', icon: <Check className="w-3 h-3" /> };
    return { label: 'Not read', className: 'bg-gray-100 text-gray-600', icon: <Clock3 className="w-3 h-3" /> };
  };

  return (
    <aside className="w-80 border-l bg-white shrink-0 flex flex-col min-h-0">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Chat profile</p>
          <h3 className="text-base font-semibold text-gray-900 mt-0.5">Customer details</h3>
        </div>
        <UserRound className="w-5 h-5 text-primary" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-5 bg-gradient-to-b from-primary/5 to-white border-b text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 text-primary flex items-center justify-center text-2xl font-bold">
            {contact.name.charAt(0).toUpperCase()}
          </div>
          <h4 className="mt-3 font-semibold text-gray-900 truncate">{displayName || 'Unnamed contact'}</h4>
          <p className="mt-1 text-xs text-gray-500 flex items-center justify-center gap-1">
            <Phone className="w-3 h-3" /> {contact.phone}
          </p>
          <span className={`inline-flex mt-3 px-2 py-1 rounded-full text-[11px] font-medium ${
            contact.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {contact.status === 'blocked' ? 'Blocked' : 'Active customer'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Last active</p>
            <p className="text-xs font-medium text-gray-700 mt-1">{formatLastActive(lastActiveAt)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Conversation</p>
            <p className="text-xs font-medium text-gray-700 mt-1">{conversationStatus}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Session window</p>
            <p className={`text-xs font-medium mt-1 ${windowOpen ? 'text-green-600' : 'text-orange-600'}`}>
              {windowOpen ? 'Open' : 'Closed'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Tags</p>
            <p className="text-xs font-medium text-gray-700 mt-1">{draftTags.length}</p>
          </div>
        </div>

        <div className="border-b">
          <button
            onClick={() => setShowDetails(value => !value)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <span className="text-sm font-semibold text-gray-800">Attributes</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>
          {showDetails && (
            <div className="px-5 pb-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Name</span>
                <input
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                  placeholder="Add customer name"
                  className="mt-1 w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email
                </span>
                <input
                  type="email"
                  value={draftEmail}
                  onChange={event => setDraftEmail(event.target.value)}
                  placeholder="Add an email address"
                  className="mt-1 w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </label>
            </div>
          )}
        </div>

        <div className="border-b">
          <button
            onClick={() => setShowCampaigns(value => !value)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-gray-400" /> Campaigns
              {campaigns.length > 0 && (
                <span className="text-[10px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5">{campaigns.length}</span>
              )}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCampaigns ? 'rotate-180' : ''}`} />
          </button>
          {showCampaigns && (
            <div className="px-5 pb-4">
              {campaignsLoading ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
              ) : campaigns.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">No campaigns have run for this contact.</p>
              ) : (
                <div className="space-y-2">
                  {campaigns.map(campaign => {
                    const status = recipientStatus(campaign.recipientStatus);
                    return (
                      <div key={campaign.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{campaign.name}</p>
                            {campaign.templateName && (
                              <p className="text-[10px] text-gray-400 truncate mt-0.5">{campaign.templateName}</p>
                            )}
                          </div>
                          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
                            {status.icon}{status.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2">
                          Campaign: {campaign.status.toLowerCase()} · Last update: {formatCampaignDate(campaign.readAt ?? campaign.deliveredAt ?? campaign.sentAt ?? campaign.createdAt)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-b">
          <button
            onClick={() => setShowTags(value => !value)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-400" /> Tags
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showTags ? 'rotate-180' : ''}`} />
          </button>
          {showTags && (
            <div className="px-5 pb-4">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {draftTags.length === 0 ? (
                  <span className="text-xs text-gray-400">No tags added</span>
                ) : (
                  draftTags.map(tagId => {
                    const tag = tags.find(item => item.id === tagId);
                    if (!tag) return null;
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className="px-2 py-1 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        title="Remove tag"
                      >
                        {tag.name} ×
                      </button>
                    );
                  })
                )}
              </div>
              {showNewTag && (
                <div className="flex gap-2 mb-3">
                  <input
                    value={newTagName}
                    onChange={event => setNewTagName(event.target.value)}
                    placeholder="New tag name"
                    autoFocus
                    className="min-w-0 flex-1 px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (newTagName.trim()) createTagMutation.mutate();
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newTagName.trim()) createTagMutation.mutate();
                    }}
                    disabled={createTagMutation.isPending || !newTagName.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-xs disabled:opacity-50"
                  >
                    {createTagMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowNewTag(value => !value)}
                className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="w-3 h-3" /> Create tag
              </button>
              {tags.length > 0 ? (
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {tags.map(tag => (
                    <label key={tag.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftTags.includes(tag.id)}
                        onChange={() => toggleTag(tag.id)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Create tags from Contacts to organize customers.</p>
              )}
            </div>
          )}
        </div>

        <div className="border-b">
          <button
            onClick={() => setShowGroups(value => !value)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <UsersRound className="w-4 h-4 text-gray-400" /> Group
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showGroups ? 'rotate-180' : ''}`} />
          </button>
          {showGroups && (
            <div className="px-5 pb-4">
              {groups.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {groups.map(group => (
                    <label key={group.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftGroupIds.includes(group.id)}
                        onChange={() => setDraftGroupIds(current =>
                          current.includes(group.id)
                            ? current.filter(id => id !== group.id)
                            : [...current, group.id],
                        )}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="flex-1">{group.name}</span>
                      {group.memberCount !== undefined && (
                        <span className="text-[10px] text-gray-400">{group.memberCount}</span>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Create groups from Contacts to organize customers.</p>
              )}
              {draftGroupIds.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-2">{draftGroupIds.length} group(s) assigned</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t bg-gray-50">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !draftName.trim()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save profile
        </button>
      </div>
    </aside>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LiveChat() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('All');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentFile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close pickers when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Conversations list (poll every 10s) ──────────────────────────────────

  const { data: convsData, isLoading: convsLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations'),
    refetchInterval: 10_000,
  });

  const conversations = convsData?.conversations ?? [];
  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  // Auto-select first conversation
  useEffect(() => {
    if (!activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0]!.id);
    }
  }, [conversations, activeConvId]);

  // ── Messages for active conversation (poll every 5s) ─────────────────────

  const { data: msgsData, isLoading: msgsLoading } = useQuery<{ messages: Message[] }>({
    queryKey: ['messages', activeConvId],
    queryFn: () => api.get(`/conversations/${activeConvId}/messages`),
    enabled: !!activeConvId,
    refetchInterval: 5_000,
  });

  const messages = msgsData?.messages ?? [];
  const latestMessageId = messages[messages.length - 1]?.id;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Opening a chat marks the inbound messages currently visible in it as read.
  // The latest-message dependency also keeps an actively viewed chat read when
  // a new WhatsApp message arrives during polling.
  useEffect(() => {
    if (!activeConvId) return;
    api.post(`/conversations/${activeConvId}/read`)
      .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => {
        // A transient refresh failure should not interrupt the chat UI.
      });
  }, [activeConvId, latestMessageId, qc]);

  // ── Send text message mutation ────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api.post(`/conversations/${activeConvId}/messages`, { body }),
    onSuccess: () => {
      setMessageInput('');
      qc.invalidateQueries({ queryKey: ['messages', activeConvId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Send media mutation ───────────────────────────────────────────────────

  const sendMediaMutation = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);

      const res = await fetch(`${import.meta.env.BASE_URL}api/conversations/${activeConvId}/media`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: 'Upload failed' }))) as { error?: string };
        throw new Error(err.error ?? 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setMessageInput('');
      setAttachment(prev => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      qc.invalidateQueries({ queryKey: ['messages', activeConvId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ contactId, status }: { contactId: string; status: 'Open' | 'Resolved' }) =>
      api.put(`/conversations/${contactId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isPending = sendMutation.isPending || sendMediaMutation.isPending;

  const handleTemplateSent = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['messages', activeConvId] }),
      qc.invalidateQueries({ queryKey: ['conversations'] }),
    ]);
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    if (isPending || !activeConvId) return;
    if (attachment) {
      sendMediaMutation.mutate({ file: attachment.file, caption: messageInput.trim() });
    } else if (messageInput.trim()) {
      sendMutation.mutate(messageInput.trim());
    }
  }, [attachment, messageInput, activeConvId, isPending, sendMutation, sendMediaMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessageInput(prev => prev + emoji.native);
      return;
    }
    const start = ta.selectionStart ?? messageInput.length;
    const end = ta.selectionEnd ?? messageInput.length;
    const next = messageInput.slice(0, start) + emoji.native + messageInput.slice(end);
    setMessageInput(next);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.native.length;
      ta.setSelectionRange(pos, pos);
    });
    setShowEmojiPicker(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    setAttachment({
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
    });
    e.target.value = '';
  };

  const openFilePicker = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
    setShowAttachMenu(false);
  };

  const clearAttachment = () => {
    setAttachment(prev => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  // ── Filter conversations ──────────────────────────────────────────────────

  const filtered = conversations.filter(c => {
    const matchTab = activeTab === 'All' || c.status === activeTab;
    const matchSearch =
      !search ||
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPhone.includes(search);
    return matchTab && matchSearch;
  });

  const unreadTotals = {
    All: conversations.reduce((sum, conversation) => sum + conversation.unread, 0),
    Open: conversations
      .filter(conversation => conversation.status === 'Open')
      .reduce((sum, conversation) => sum + conversation.unread, 0),
    Resolved: conversations
      .filter(conversation => conversation.status === 'Resolved')
      .reduce((sum, conversation) => sum + conversation.unread, 0),
  };

  const tabs: Array<'All' | 'Open' | 'Resolved'> = ['All', 'Open', 'Resolved'];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-3.5rem)] flex bg-white overflow-hidden">
      {/* Left Panel: Conversation List */}
      <div className="w-80 border-r flex flex-col bg-gray-50/30 shrink-0">
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 border-transparent rounded-lg focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  activeTab === tab ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab}
                {unreadTotals[tab] > 0 && (
                  <span
                    className={`ml-1.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      activeTab === tab ? 'bg-white text-gray-900' : 'bg-primary text-white'
                    }`}
                  >
                    {unreadTotals[tab] > 99 ? '99+' : unreadTotals[tab]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
              <MessageSquare className="w-8 h-8" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs text-center px-4">Messages will appear here when customers contact you via WhatsApp.</p>
            </div>
          ) : (
            filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left p-4 border-b transition-colors hover:bg-gray-50 flex gap-3 ${
                  activeConvId === conv.id
                    ? 'bg-primary/5 border-l-2 border-l-primary'
                    : 'border-l-2 border-l-transparent'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                    {conv.contactName.charAt(0)}
                  </div>
                  {conv.unread > 0 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full border border-white">
                      {conv.unread}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 text-sm truncate">{conv.contactName}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-1">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{conv.lastMessage || '—'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Middle Panel: Active Chat */}
      {activeConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {showTemplateDialog && (
            <LiveChatTemplateDialog
              contactPhone={activeConv.contactPhone}
              onClose={() => setShowTemplateDialog(false)}
              onSent={handleTemplateSent}
            />
          )}
          {/* Chat Header */}
          <div className="h-16 px-6 border-b flex items-center justify-between shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                {activeConv.contactName.charAt(0)}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{activeConv.contactName}</h2>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{activeConv.contactPhone}</span>
                  <span>•</span>
                  {activeConv.windowOpen ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                      24h Window Open
                    </span>
                  ) : (
                    <span className="text-red-500 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      24h Window Closed
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ['messages', activeConvId] });
                  qc.invalidateQueries({ queryKey: ['conversations'] });
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                className={`p-2 rounded-lg transition-colors ${rightPanelOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              <button
                onClick={() => statusMutation.mutate({
                  contactId: activeConv.id,
                  status: activeConv.status === 'Resolved' ? 'Open' : 'Resolved',
                })}
                disabled={statusMutation.isPending}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                  activeConv.status === 'Resolved'
                    ? 'bg-green-50 text-green-700 hover:bg-green-100'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={activeConv.status === 'Resolved' ? 'Reopen conversation' : 'Resolve conversation'}
              >
                {statusMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : activeConv.status === 'Resolved'
                    ? <RotateCcw className="w-3.5 h-3.5" />
                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                {activeConv.status === 'Resolved' ? 'Reopen' : 'Resolve'}
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#efeae2]">
            {msgsLoading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center items-center h-full text-gray-400 text-sm">
                No messages yet
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.direction === 'OUTBOUND' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 shadow-sm ${
                        msg.direction === 'OUTBOUND'
                          ? 'bg-[#dcf8c6] rounded-tr-none text-gray-900'
                          : 'bg-white rounded-tl-none text-gray-900'
                      }`}
                    >
                      {msg.flowData && Object.keys(msg.flowData).length > 0 ? (
                        <FlowDataBubble data={msg.flowData} />
                      ) : msg.mediaType ? (
                        <>
                          <MediaBubble mediaType={msg.mediaType} mediaId={msg.mediaId} filename={msg.mediaFilename} />
                          {msg.body && (
                            <p className="text-sm whitespace-pre-wrap mt-1 text-gray-500 italic">{msg.body}</p>
                          )}
                        </>
                      ) : (
                        msg.body && (
                          <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        )
                      )}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                        {msg.direction === 'OUTBOUND' && (
                          <CheckCheck
                            className={`w-3 h-3 ${
                              msg.status === 'READ' ? 'text-blue-500' : 'text-gray-400'
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="p-4 bg-gray-50 border-t shrink-0">
            {activeConv.windowOpen ? (
              <div className="max-w-3xl mx-auto space-y-2">
                {/* Attachment preview strip */}
                {attachment && (
                  <div className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2 shadow-sm">
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt="preview"
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                        <FileText className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{attachment.file.name}</p>
                      <p className="text-xs text-gray-400">
                        {(attachment.file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      onClick={clearAttachment}
                      className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Input row */}
                <div className="relative flex items-end gap-2 bg-white border rounded-xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                  <div className="flex gap-1 pb-1">
                    {/* Emoji button */}
                    <div className="relative" ref={emojiPickerRef}>
                      <button
                        onClick={() => setShowEmojiPicker(p => !p)}
                        className={`p-2 rounded-lg transition-colors ${showEmojiPicker ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        title="Emoji"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-10 left-0 z-50 shadow-xl rounded-xl overflow-hidden">
                          <Picker
                            data={data}
                            onEmojiSelect={handleEmojiSelect}
                            theme="light"
                            previewPosition="none"
                            skinTonePosition="none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Attachment button + popup menu */}
                    <div className="relative" ref={attachMenuRef}>
                      <button
                        onClick={() => setShowAttachMenu(p => !p)}
                        className={`p-2 rounded-lg transition-colors ${attachment ? 'bg-primary/10 text-primary' : showAttachMenu ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        title="Attach"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>

                      {showAttachMenu && (
                        <div className="absolute bottom-12 left-0 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 w-52 overflow-hidden">
                          {[
                            { label: 'Document', icon: FileText, color: 'bg-indigo-500', accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip' },
                            { label: 'Photos & videos', icon: FileImage, color: 'bg-violet-500', accept: 'image/*,video/*' },
                            { label: 'Audio', icon: Mic, color: 'bg-orange-400', accept: 'audio/*' },
                          ].map(({ label, icon: Icon, color, accept }) => (
                            <button
                              key={label}
                              onClick={() => openFilePicker(accept)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                            >
                              <span className={`w-9 h-9 rounded-full flex items-center justify-center ${color} shrink-0`}>
                                <Icon className="w-4 h-4 text-white" />
                              </span>
                              <span className="text-sm font-medium text-gray-700">{label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={attachment ? 'Add a caption (optional)...' : 'Type a message...'}
                    className="flex-1 max-h-32 min-h-[40px] resize-none border-none outline-none py-2 px-2 text-sm bg-transparent"
                    rows={1}
                  />

                  <div className="pb-1">
                    <button
                      onClick={handleSend}
                      disabled={(!messageInput.trim() && !attachment) || isPending}
                      className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                    >
                      {isPending
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <Send className="w-5 h-5 ml-0.5" />}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto text-center p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  The 24-hour customer service window has closed. You can only send approved Template Messages until the customer replies.
                </p>
                <button
                  onClick={() => setShowTemplateDialog(true)}
                  className="mt-2 px-4 py-1.5 bg-white text-orange-700 text-sm font-medium border border-orange-200 rounded hover:bg-orange-100"
                >
                  Send Template
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Select a conversation</p>
            <p className="text-sm mt-1">Choose a contact from the left to start chatting</p>
          </div>
        </div>
      )}
      {activeConv && rightPanelOpen && (
        <ContactProfilePanel
          contactId={activeConv.contactId}
          contactPhone={activeConv.contactPhone}
          lastActiveAt={activeConv.lastMessageAt}
          windowOpen={activeConv.windowOpen}
          conversationStatus={activeConv.status}
        />
      )}
    </div>
  );
}
