import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Upload, Loader2, Users, X, ChevronDown, UserRound, Phone, Mail,
  Tag, UsersRound, Save, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { ContactGroupsManager, ContactTagsManager } from './ContactManagers';
import contactViewIcon from '@assets/eye_1788722260035.png';
import contactDeleteIcon from '@assets/bin_1788722265074.png';
import importContactsIcon from '@assets/import_1788724282150.png';
import exportContactsIcon from '@assets/export_1788724297530.png';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TagObj   { id: string; name: string; color: string }
interface GroupObj { id: string; name: string }
interface CampaignObj {
  id: string;
  name: string;
  status: string;
  recipientStatus: string;
}
interface Contact {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  attributes?: Record<string, unknown>;
  status: 'active' | 'blocked' | 'unsubscribed';
  chatState?: 'DOR' | 'REQ' | 'CLOSED' | 'ACTIVE';
  hasConversation?: boolean;
  unreadMessages?: number;
  tags: TagObj[];
  group: GroupObj | null;
  groups?: GroupObj[];
  campaigns?: CampaignObj[];
  lastContactedAt?: string | null;
  createdAt: string;
}

const CHAT_STATES = [
  { value: 'NO_CHAT', label: 'No conversation' },
  { value: 'NEEDS_REPLY', label: 'Needs reply' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

type AttributeField = {
  key: string;
  label: string;
  placeholder?: string;
  kind?: 'text' | 'date' | 'select';
  options?: { value: string; label: string }[];
};

const DEFAULT_ATTRIBUTE_FIELDS: AttributeField[] = [
  { key: 'instagram_username', label: 'Instagram username', placeholder: '@username' },
  { key: 'facebook_profile', label: 'Facebook profile / page', placeholder: 'Profile or page link' },
  { key: 'linkedin_profile', label: 'LinkedIn profile', placeholder: 'Profile link' },
  { key: 'website', label: 'Website', placeholder: 'https://example.com' },
  { key: 'address_line_1', label: 'Address', placeholder: 'House / street address' },
  { key: 'address_line_2', label: 'Address line 2', placeholder: 'Apartment, landmark, etc.' },
  { key: 'city', label: 'City', placeholder: 'City' },
  { key: 'state', label: 'State / province', placeholder: 'State or province' },
  { key: 'postal_code', label: 'PIN / postal code', placeholder: 'PIN or postal code' },
  { key: 'country', label: 'Country', placeholder: 'Country' },
  { key: 'lead_source', label: 'Lead source', placeholder: 'Instagram, referral, website, etc.' },
  {
    key: 'lead_stage',
    label: 'Lead stage',
    kind: 'select',
    options: [
      { value: 'new_lead', label: 'New lead' },
      { value: 'contacted', label: 'Contacted' },
      { value: 'qualified', label: 'Qualified' },
      { value: 'customer', label: 'Customer' },
      { value: 'inactive', label: 'Inactive' },
    ],
  },
  { key: 'preferred_language', label: 'Preferred language', placeholder: 'English, Hindi, etc.' },
  {
    key: 'preferred_contact_channel',
    label: 'Preferred contact channel',
    kind: 'select',
    options: [
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Phone call' },
      { value: 'instagram', label: 'Instagram' },
    ],
  },
  {
    key: 'marketing_opt_in',
    label: 'Marketing opt-in',
    kind: 'select',
    options: [
      { value: 'opted_in', label: 'Opted in' },
      { value: 'opted_out', label: 'Opted out' },
      { value: 'not_set', label: 'Not set' },
    ],
  },
  { key: 'date_of_birth', label: 'Date of birth', kind: 'date' },
  { key: 'preferred_contact_time', label: 'Preferred contact time', placeholder: 'Morning, afternoon, etc.' },
];

const DEFAULT_ATTRIBUTE_KEYS = new Set(DEFAULT_ATTRIBUTE_FIELDS.map(field => field.key));

const COUNTRIES = [
  { code: '1', label: 'United States / Canada (+1)' },
  { code: '7', label: 'Russia / Kazakhstan (+7)' },
  { code: '20', label: 'Egypt (+20)' },
  { code: '27', label: 'South Africa (+27)' },
  { code: '31', label: 'Netherlands (+31)' },
  { code: '33', label: 'France (+33)' },
  { code: '34', label: 'Spain (+34)' },
  { code: '39', label: 'Italy (+39)' },
  { code: '41', label: 'Switzerland (+41)' },
  { code: '44', label: 'United Kingdom (+44)' },
  { code: '49', label: 'Germany (+49)' },
  { code: '52', label: 'Mexico (+52)' },
  { code: '55', label: 'Brazil (+55)' },
  { code: '60', label: 'Malaysia (+60)' },
  { code: '61', label: 'Australia (+61)' },
  { code: '64', label: 'New Zealand (+64)' },
  { code: '65', label: 'Singapore (+65)' },
  { code: '81', label: 'Japan (+81)' },
  { code: '82', label: 'South Korea (+82)' },
  { code: '86', label: 'China (+86)' },
  { code: '90', label: 'Turkey (+90)' },
  { code: '91', label: 'India (+91)' },
  { code: '92', label: 'Pakistan (+92)' },
  { code: '94', label: 'Sri Lanka (+94)' },
  { code: '880', label: 'Bangladesh (+880)' },
  { code: '977', label: 'Nepal (+977)' },
  { code: '966', label: 'Saudi Arabia (+966)' },
  { code: '971', label: 'United Arab Emirates (+971)' },
  { code: '974', label: 'Qatar (+974)' },
  { code: 'UNKNOWN', label: 'Other / Unknown' },
] as const;
type CountryCount = { code: string; count: number };

function isPlaceholderName(name: string | null | undefined, phone: string) {
  const normalizedName = name?.trim();
  return !normalizedName || normalizedName === phone.trim() ||
    normalizedName.replace(/\D/g, '') === phone.replace(/\D/g, '');
}

function contactDisplayName(contact: Pick<Contact, 'name' | 'phone'>) {
  return isPlaceholderName(contact.name, contact.phone) ? 'NA' : contact.name!.trim();
}

function contactGroups(contact: Pick<Contact, 'group' | 'groups'>) {
  const groups = contact.groups?.length ? contact.groups : contact.group ? [contact.group] : [];
  return groups.filter((group, index, all) => all.findIndex(item => item.id === group.id) === index);
}

function campaignRecipientLabel(status: string) {
  return status.toLowerCase().replace(/_/g, ' ');
}

function contactStatusLabel(status: Contact['status']) {
  if (status === 'blocked') return 'Blocked';
  if (status === 'unsubscribed') return 'Unsubscribed';
  return 'Active';
}

function ContactStatusBadge({ status }: { status: Contact['status'] }) {
  const colors = {
    active: 'text-green-700 bg-green-50 border-green-200',
    blocked: 'text-red-700 bg-red-50 border-red-200',
    unsubscribed: 'text-orange-700 bg-orange-50 border-orange-200',
  };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${colors[status]}`}>
      {contactStatusLabel(status)}
    </span>
  );
}

function chatStateFormValue(state?: Contact['chatState']) {
  if (state === 'CLOSED') return 'CLOSED';
  if (state === 'ACTIVE') return 'OPEN';
  if (state === 'REQ') return 'NEEDS_REPLY';
  return 'NO_CHAT';
}

function chatStateStorageValue(state: string) {
  if (state === 'CLOSED') return 'CLOSED';
  if (state === 'OPEN') return 'ACTIVE';
  if (state === 'NEEDS_REPLY') return 'REQ';
  return 'DOR';
}

function attributeValueToString(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function ContactProfileSidebar({
  contact,
  groups,
  tags,
  onClose,
  onSaved,
}: {
  contact: Contact;
  groups: GroupObj[];
  tags: TagObj[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftStatus, setDraftStatus] = useState<Contact['status']>('active');
  const [draftChatState, setDraftChatState] = useState('DOR');
  const [draftAttributes, setDraftAttributes] = useState<Array<{ key: string; value: string }>>([]);
  const [draftCustomAttributes, setDraftCustomAttributes] = useState<Array<{ key: string; value: string }>>([]);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftGroupIds, setDraftGroupIds] = useState<string[]>([]);
  const [showAttributes, setShowAttributes] = useState(true);
  const [showCampaigns, setShowCampaigns] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showGroups, setShowGroups] = useState(true);

  useEffect(() => {
    setDraftName(isPlaceholderName(contact.name, contact.phone) ? '' : contact.name ?? '');
    setDraftEmail(contact.email ?? '');
    setDraftStatus(contact.status);
    setDraftChatState(chatStateFormValue(contact.chatState));
    const storedEntries = Object.entries(contact.attributes ?? {});
    const storedValues = new Map(storedEntries);
    const defaultEntries = DEFAULT_ATTRIBUTE_FIELDS.map(field => ({
      key: field.key,
      value: attributeValueToString(storedValues.get(field.key)),
    }));
    const customEntries = storedEntries
      .filter(([key]) => !DEFAULT_ATTRIBUTE_KEYS.has(key))
      .map(([key, value]) => ({ key, value: attributeValueToString(value) }));
    setDraftAttributes(defaultEntries);
    setDraftCustomAttributes(customEntries);
    setDraftTags(contact.tags.map(tag => tag.id));
    setDraftGroupIds(contactGroups(contact).map(group => group.id));
  }, [contact.id]);

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/contacts/${contact.id}`, {
      name: draftName.trim(),
      email: draftEmail.trim(),
      status: draftStatus,
      chatState: chatStateStorageValue(draftChatState),
      attributes: Object.fromEntries(
        [...draftAttributes, ...draftCustomAttributes]
          .map(attribute => ({ key: attribute.key.trim(), value: attribute.value.trim() }))
          .filter(attribute => attribute.key && attribute.value),
      ),
      tags: draftTags,
      groupIds: draftGroupIds,
    }),
    onSuccess: () => {
      onSaved();
      toast.success('Client profile updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleTag = (tagId: string) => {
    setDraftTags(current => current.includes(tagId)
      ? current.filter(id => id !== tagId)
      : [...current, tagId]);
  };

  const toggleGroup = (groupId: string) => {
    setDraftGroupIds(current => current.includes(groupId)
      ? current.filter(id => id !== groupId)
      : [...current, groupId]);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25">
      <aside className="flex h-full w-full max-w-[390px] flex-col border-l bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Client profile</p>
            <h2 className="mt-0.5 text-base font-semibold text-gray-900">Customer details</h2>
          </div>
          <div className="flex items-center gap-1">
            <UserRound className="h-5 w-5 text-primary" />
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close client profile"
              title="Close client profile"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="border-b bg-gradient-to-b from-primary/5 to-white px-5 py-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary">
              {contactDisplayName(contact).charAt(0).toUpperCase()}
            </div>
            <h3 className="mt-3 truncate font-semibold text-gray-900">{contactDisplayName(contact)}</h3>
            <p className="mt-1 flex items-center justify-center gap-1 text-xs text-gray-500">
              <Phone className="h-3 w-3" /> {contact.phone}
            </p>
            <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${
              draftStatus === 'blocked'
                ? 'bg-red-100 text-red-700'
                : draftStatus === 'unsubscribed'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-green-100 text-green-700'
            }`}>
              {contactStatusLabel(draftStatus)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b px-5 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Created</p>
              <p className="mt-1 text-xs font-medium text-gray-700">{new Date(contact.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Tags</p>
              <p className="mt-1 text-xs font-medium text-gray-700">{draftTags.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Groups</p>
              <p className="mt-1 text-xs font-medium text-gray-700">{draftGroupIds.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Chat status</p>
              <div className="mt-1">
                <ChatStateBadge state={contact.chatState} hasConversation={contact.hasConversation} unreadMessages={contact.unreadMessages} />
              </div>
            </div>
          </div>

          <div className="border-b">
            <button
              onClick={() => setShowAttributes(value => !value)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-gray-800">Attributes</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showAttributes ? 'rotate-180' : ''}`} />
            </button>
            {showAttributes && (
              <div className="space-y-3 px-5 pb-4">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Name</span>
                  <input
                    value={draftName}
                    onChange={event => setDraftName(event.target.value)}
                    placeholder="Add client name"
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label className="block">
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
                    <Mail className="h-3 w-3" /> Email
                  </span>
                  <input
                    type="email"
                    value={draftEmail}
                    onChange={event => setDraftEmail(event.target.value)}
                    placeholder="Add an email address"
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Client status</span>
                    <select
                      value={draftStatus}
                      onChange={event => setDraftStatus(event.target.value as Contact['status'])}
                      className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs focus:border-primary focus:outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="blocked">Blocked</option>
                      <option value="unsubscribed">Unsubscribed</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Chat status</span>
                    <select
                      value={draftChatState}
                      onChange={event => setDraftChatState(event.target.value)}
                      className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs focus:border-primary focus:outline-none"
                    >
                      {CHAT_STATES.map(state => <option key={state.value} value={state.value}>{state.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="pt-1">
                  <div className="mb-2">
                    <span className="text-xs font-semibold text-gray-700">Marketing & customer details</span>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Add social profiles, location, lead information, and contact preferences for personalized outreach.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DEFAULT_ATTRIBUTE_FIELDS.map((field, index) => {
                      const attribute = draftAttributes[index] ?? { key: field.key, value: '' };
                      return (
                        <label key={field.key} className={`block ${field.key === 'address_line_1' || field.key === 'address_line_2' ? 'col-span-2' : ''}`}>
                          <span className="text-[11px] font-medium text-gray-500">{field.label}</span>
                          {field.kind === 'select' ? (
                            <select
                              value={attribute.value}
                              onChange={event => setDraftAttributes(current => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, value: event.target.value } : item,
                              ))}
                              className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs focus:border-primary focus:outline-none"
                            >
                              <option value="">Select</option>
                              {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          ) : (
                            <input
                              type={field.kind === 'date' ? 'date' : 'text'}
                              value={attribute.value}
                              onChange={event => setDraftAttributes(current => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, value: event.target.value } : item,
                              ))}
                              placeholder={field.placeholder}
                              className="mt-1 w-full rounded-lg border px-2.5 py-2 text-xs focus:border-primary focus:outline-none"
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-5 border-t pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-700">Additional custom attributes</span>
                      <p className="mt-0.5 text-[11px] text-gray-400">Add unlimited fields for your own customer data.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraftCustomAttributes(current => [...current, { key: '', value: '' }])}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                    >
                      <Plus className="h-3 w-3" /> Add field
                    </button>
                  </div>
                  {draftCustomAttributes.length > 0 ? (
                    <div className="space-y-2">
                      {draftCustomAttributes.map((attribute, index) => (
                        <div key={`${index}-${attribute.key}`} className="flex items-center gap-1.5">
                            <input
                              value={attribute.key}
                              onChange={event => setDraftCustomAttributes(current => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, key: event.target.value } : item,
                              ))}
                              placeholder="Field name"
                              className="w-[42%] min-w-0 rounded-lg border px-2.5 py-2 text-xs focus:border-primary focus:outline-none"
                            />
                            <input
                              value={attribute.value}
                              onChange={event => setDraftCustomAttributes(current => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, value: event.target.value } : item,
                              ))}
                              placeholder="Value"
                              className="min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-xs focus:border-primary focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setDraftCustomAttributes(current => current.filter((_, itemIndex) => itemIndex !== index))}
                              className="p-1.5 text-gray-400 hover:text-red-500"
                              title="Remove attribute"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400">No custom attributes yet. Use “Add field” for anything else.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-b">
            <button
              onClick={() => setShowCampaigns(value => !value)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-gray-800">
                Campaigns {contact.campaigns && contact.campaigns.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{contact.campaigns.length}</span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showCampaigns ? 'rotate-180' : ''}`} />
            </button>
            {showCampaigns && (
              <div className="space-y-2 px-5 pb-4">
                {contact.campaigns && contact.campaigns.length > 0 ? contact.campaigns.map(campaign => (
                  <div key={campaign.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="min-w-0 truncate text-xs font-semibold text-gray-800">{campaign.name}</span>
                    <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] capitalize text-blue-700">
                      {campaignRecipientLabel(campaign.recipientStatus)}
                    </span>
                  </div>
                )) : <p className="text-xs text-gray-400">No active campaigns for this client.</p>}
              </div>
            )}
          </div>

          <div className="border-b">
            <button
              onClick={() => setShowTags(value => !value)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Tag className="h-4 w-4 text-gray-400" /> Tags</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showTags ? 'rotate-180' : ''}`} />
            </button>
            {showTags && (
              <div className="px-5 pb-4">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {draftTags.length === 0 ? <span className="text-xs text-gray-400">No tags added</span> : draftTags.map(tagId => {
                    const tag = tags.find(item => item.id === tagId);
                    return tag ? (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className="rounded-full px-2 py-1 text-[11px] font-medium"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        title="Remove tag"
                      >
                        {tag.name} ×
                      </button>
                    ) : null;
                  })}
                </div>
                {tags.length > 0 ? (
                  <div className="max-h-28 space-y-1 overflow-y-auto">
                    {tags.map(tag => (
                      <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                        <input type="checkbox" checked={draftTags.includes(tag.id)} onChange={() => toggleTag(tag.id)} className="accent-primary" />
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </label>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-400">Create tags from Contacts to organize clients.</p>}
              </div>
            )}
          </div>

          <div className="border-b">
            <button
              onClick={() => setShowGroups(value => !value)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-800"><UsersRound className="h-4 w-4 text-gray-400" /> Groups</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showGroups ? 'rotate-180' : ''}`} />
            </button>
            {showGroups && (
              <div className="px-5 pb-4">
                {groups.length > 0 ? (
                  <div className="max-h-36 space-y-1.5 overflow-y-auto">
                    {groups.map(group => (
                      <label key={group.id} className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                        <input type="checkbox" checked={draftGroupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} className="accent-primary" />
                        <span className="flex-1">{group.name}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-400">Create groups from Contacts to organize clients.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="border-t bg-gray-50 p-4">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save profile
          </button>
        </div>
      </aside>
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────
function EditModal({
  contact, groups, tags, onClose, onSaved,
}: {
  contact: Contact;
  groups: GroupObj[];
  tags: TagObj[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]           = useState(isPlaceholderName(contact.name, contact.phone) ? '' : contact.name ?? '');
  const [status, setStatus]       = useState<Contact['status']>(contact.status);
  const [chatState, setChatState] = useState<string>(chatStateFormValue(contact.chatState));
  const [groupIds, setGroupIds]   = useState<string[]>(
    contact.groups?.map(group => group.id) ?? (contact.group ? [contact.group.id] : []),
  );
  const [tagIds, setTagIds]       = useState<string[]>(contact.tags.map(tag => tag.id));
  const [saving, setSaving]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/contacts/${contact.id}`, {
        name: name.trim(),
        status,
        chatState: chatStateStorageValue(chatState),
         groupIds,
        tags: tagIds,
      });
      toast.success('Contact updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">Edit Contact: {contact.phone}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="flex gap-4 flex-wrap">
            {/* Name */}
            <div className="flex-1 min-w-[140px] space-y-1">
              <label className="text-sm font-medium text-gray-600">Name:</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Contact Status */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">Contact Status:</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as Contact['status'])}
                  className="appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="active">Active</option>
                  <option value="blocked">Blocked</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Chat State */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">Chat State:</label>
              <div className="relative">
                <select
                  value={chatState}
                  onChange={e => setChatState(e.target.value)}
                  className="appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {CHAT_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Phone (read-only) */}
            <div className="flex-1 min-w-[140px] space-y-1">
              <label className="text-sm font-medium text-gray-600">Phone Number:</label>
              <input
                value={contact.phone}
                readOnly
                className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none"
              />
              <p className="text-xs text-gray-400">Phone number cannot be edited</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
             <div className="space-y-1">
               <label className="text-sm font-medium text-gray-600">Groups:</label>
               <div className="max-h-28 overflow-y-auto rounded-lg border p-2 space-y-1">
                 {groups.length === 0 ? (
                   <p className="text-xs text-gray-400">Create groups from Manage Groups first.</p>
                 ) : groups.map(group => (
                   <label key={group.id} className="flex items-center gap-2 text-sm text-gray-700">
                     <input
                       type="checkbox"
                       checked={groupIds.includes(group.id)}
                       onChange={() => setGroupIds(current => current.includes(group.id)
                         ? current.filter(id => id !== group.id)
                         : [...current, group.id])}
                       className="accent-primary"
                     />
                     {group.name}
                   </label>
                 ))}
               </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">Tags:</label>
              <div className="max-h-28 overflow-y-auto rounded-lg border p-2 space-y-1">
                {tags.length === 0 ? (
                  <p className="text-xs text-gray-400">Create tags from Manage Tags first.</p>
                ) : tags.map(tag => (
                  <label key={tag.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={tagIds.includes(tag.id)}
                      onChange={() => setTagIds(current => current.includes(tag.id)
                        ? current.filter(id => id !== tag.id)
                        : [...current, tag.id])}
                      className="accent-primary"
                    />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button type="button" onClick={onClose}
              className="px-5 py-2 text-sm font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Import CSV Modal ───────────────────────────────────────────────────────────
function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const csv = await file.text();
      const res = await api.post<{ imported: number; total: number }>('/contacts/import', { csv });
      toast.success(`Imported ${res.imported} of ${res.total} contacts`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Import Contacts</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Upload a CSV with <code className="bg-gray-100 px-1 rounded">phone</code>, optional <code className="bg-gray-100 px-1 rounded">name</code> and <code className="bg-gray-100 px-1 rounded">email</code>. Missing names display as <strong>NA</strong>.</p>
          <label className={`block w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            {importing ? (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="text-sm">Importing…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Upload className="w-8 h-8 opacity-40" /><span className="text-sm font-medium">Click to upload CSV</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Chat state badge ───────────────────────────────────────────────────────────
function ChatStateBadge({
  state,
  hasConversation = false,
  unreadMessages = 0,
}: {
  state?: string;
  hasConversation?: boolean;
  unreadMessages?: number;
}) {
  const s = unreadMessages > 0 || state === 'REQ'
    ? 'NEEDS_REPLY'
    : state === 'CLOSED'
      ? 'CLOSED'
      : hasConversation || state === 'ACTIVE'
        ? 'OPEN'
        : 'NO_CHAT';
  const colors: Record<string, string> = {
    NO_CHAT: 'text-gray-600 bg-gray-50 border-gray-200',
    NEEDS_REPLY: 'text-blue-600 bg-blue-50 border-blue-200',
    OPEN:    'text-green-600 bg-green-50 border-green-200',
    CLOSED: 'text-gray-600 bg-gray-50 border-gray-200',
  };
  const labels: Record<string, string> = {
    NO_CHAT: 'No conversation',
    NEEDS_REPLY: 'Needs reply',
    OPEN: 'Open',
    CLOSED: 'Closed',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${colors[s] ?? colors.NO_CHAT}`}>
      {labels[s] ?? labels.NO_CHAT}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Contacts() {
  const { confirm, confirmDialog } = useConfirmDialog();
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState<'contacts' | 'groups' | 'tags'>('contacts');
  const [search, setSearch]       = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [chatStateFilter, setChatStateFilter] = useState('');
  const [page, setPage]           = useState(1);
  const perPage = 30;
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [showImport, setShowImport]   = useState(false);

  const params = new URLSearchParams({
    search, page: String(page), limit: String(perPage),
    ...(groupFilter ? { groupId: groupFilter } : {}),
    ...(tagFilter ? { tagId: tagFilter } : {}),
    ...(countryFilter ? { country: countryFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(chatStateFilter ? { chatState: chatStateFilter } : {}),
  });

  const { data, isLoading } = useQuery<{ contacts: Contact[]; total: number; pages: number }>({
    queryKey: ['contacts', search, groupFilter, tagFilter, countryFilter, statusFilter, chatStateFilter, page, perPage],
    queryFn: () => api.get(`/contacts?${params}`),
    placeholderData: prev => prev,
    refetchInterval: 10000,
  });

  const { data: groupsData } = useQuery<{ groups: GroupObj[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups'),
  });
  const { data: tagsData } = useQuery<{ tags: TagObj[] }>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags'),
  });
  const { data: countriesData } = useQuery<{ countries: CountryCount[] }>({
    queryKey: ['contact-countries'],
    queryFn: () => api.get('/contacts/countries'),
    staleTime: 300000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => {
      toast.success('Contact deleted');
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-countries'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/contacts/bulk-delete', { ids }),
    onSuccess: (res: { deleted: number }) => {
      toast.success(`${res.deleted} contacts deleted`);
      setSelected(new Set());
      setSelectionMode(false);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-countries'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const contacts = data?.contacts ?? [];
  const groups   = groupsData?.groups ?? [];
  const tags     = tagsData?.tags ?? [];
  const countryCounts = new Map((countriesData?.countries ?? []).map(country => [country.code, country.count]));
  const availableCountries = COUNTRIES.filter(country => (countryCounts.get(country.code) ?? 0) > 0);

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleAll = () => setSelected(
    selected.size === contacts.length && contacts.length > 0
      ? new Set()
      : new Set(contacts.map(c => c.id)),
  );

  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelected(new Set(contacts.map(c => c.id)));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['contact-countries'] });
  };
  const refreshContactManagement = () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact-countries'] });
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['tags'] });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {confirmDialog}
      {viewContact && (
        <ContactProfileSidebar
          contact={viewContact}
          groups={groups}
          tags={tags}
          onClose={() => setViewContact(null)}
          onSaved={() => {
            invalidate();
            qc.invalidateQueries({ queryKey: ['groups'] });
          }}
        />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={invalidate} />
      )}

      {/* Tab bar */}
      <div className="bg-primary flex items-center justify-between px-0 shrink-0">
        <div className="flex">
          {[
            { label: 'Contacts', section: 'contacts' as const },
            { label: 'Manage Groups', section: 'groups' as const },
            { label: 'Manage Tags', section: 'tags' as const },
          ].map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveSection(tab.section)}
              className={`px-6 py-3.5 text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeSection === tab.section
                  ? 'bg-white text-primary'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              {i === 0 && <Users className="w-4 h-4" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeSection === 'groups' ? (
        <ContactGroupsManager onChanged={refreshContactManagement} />
      ) : activeSection === 'tags' ? (
        <ContactTagsManager onChanged={refreshContactManagement} />
      ) : (
      <>
      {/* Toolbar */}
      <div className="overflow-x-auto border-b">
        <div className="flex min-w-max items-center gap-2 px-6 py-3">
        <div className="relative shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
           className="pl-9 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none w-48"
          />
        </div>

        <select
          value={groupFilter}
          onChange={e => { setGroupFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by group"
        >
          <option value="">All Groups</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        <select
          value={tagFilter}
          onChange={e => { setTagFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by tag"
        >
          <option value="">All Tags</option>
          {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>

        <select
          value={countryFilter}
          onChange={e => { setCountryFilter(e.target.value); setPage(1); setSelected(new Set()); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by country"
        >
          <option value="">All Countries</option>
          {availableCountries.map(country => (
            <option key={country.code} value={country.code}>
              {country.label} · {countryCounts.get(country.code)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>

        <select
          value={chatStateFilter}
          onChange={e => { setChatStateFilter(e.target.value); setPage(1); }}
          className="shrink-0 border rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Filter by chat state"
        >
          <option value="">All Chat States</option>
          {CHAT_STATES.map(state => <option key={state.value} value={state.value}>{state.label}</option>)}
        </select>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {selected.size > 0 && (
            <>
              <button
                onClick={() => exitSelectionMode()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                title="Clear selection without deleting contacts"
                aria-label="Clear selection without deleting contacts"
              >
                <X className="h-4 w-4" />
                Clear selection
              </button>
              <button
                onClick={async () => {
                  if (!await confirm({
                    title: 'Delete selected contacts?',
                    description: `Delete ${selected.size} selected contact${selected.size === 1 ? '' : 's'}? This cannot be undone.`,
                    confirmLabel: 'Delete contacts',
                  })) return;
                  bulkDeleteMutation.mutate([...selected]);
                }}
                className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
              >
                Delete {selected.size}
              </button>
            </>
          )}

          {selectionMode ? (
            <>
              <button
                onClick={toggleAll}
                className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {selected.size === contacts.length && contacts.length > 0 ? 'Clear all' : 'Select all'}
              </button>
              <button
                onClick={exitSelectionMode}
                className="rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Done
              </button>
            </>
          ) : (
            <button
              onClick={enterSelectionMode}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Select all
            </button>
          )}

          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border p-2 text-gray-600 hover:bg-gray-50"
            title="Import contacts"
            aria-label="Import contacts"
          >
            <img src={importContactsIcon} alt="" className="h-5 w-5 object-contain" />
          </button>

          <div className="relative">
            <button
              onClick={() => window.open('/api/contacts/export', '_blank')}
              className="rounded-lg border border-primary/30 p-2 text-primary hover:bg-primary/5"
              title="Export contacts"
              aria-label="Export contacts"
            >
              <img src={exportContactsIcon} alt="" className="h-5 w-5 object-contain" />
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Users className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">{search ? 'No contacts match your search' : 'No contacts yet'}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b">
              <tr>
                {selectionMode && (
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" className="rounded border-gray-300 accent-primary"
                      checked={selected.size === contacts.length && contacts.length > 0}
                      onChange={toggleAll} />
                  </th>
                )}
                <th className="px-4 py-3 font-semibold">Phone Number</th>
                <th className="px-4 py-3 font-semibold">Name ↑</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Chat Status</th>
                 <th className="px-4 py-3 font-semibold">Campaigns</th>
                 <th className="px-4 py-3 font-semibold">Groups</th>
                <th className="px-4 py-3 font-semibold">Tags</th>
                <th className="px-4 py-3 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-800">
              {contacts.map(contact => (
                <tr
                  key={contact.id}
                  className={`hover:bg-gray-50 transition-colors ${selected.has(contact.id) ? 'bg-primary/5' : ''}`}
                >
                  {selectionMode && (
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded border-gray-300 accent-primary"
                        checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)} />
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-gray-700">{contact.phone}</td>
                  <td className="px-4 py-3 font-medium">{contactDisplayName(contact)}</td>
                  <td className="px-4 py-3">
                    <ContactStatusBadge status={contact.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ChatStateBadge
                      state={contact.chatState}
                      hasConversation={contact.hasConversation}
                      unreadMessages={contact.unreadMessages}
                    />
                  </td>
                  <td className="px-4 py-3">
                     {contact.campaigns && contact.campaigns.length > 0 ? (
                       <div className="space-y-1">
                         {contact.campaigns.map(campaign => (
                           <div key={campaign.id} className="flex items-center gap-2 whitespace-nowrap">
                             <span className="font-medium text-gray-700">{campaign.name}</span>
                             <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] capitalize text-gray-500">
                               {campaignRecipientLabel(campaign.recipientStatus)}
                             </span>
                           </div>
                         ))}
                       </div>
                    ) : (
                       <span className="text-xs text-gray-400">No campaigns</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                     {contactGroups(contact).length > 0 ? (
                       <div className="space-y-1">
                         {contactGroups(contact).map(group => (
                           <div key={group.id} className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                             {group.name}
                           </div>
                         ))}
                      </div>
                    ) : (
                       <span className="text-xs text-gray-400">No groups</span>
                     )}
                   </td>
                   <td className="px-4 py-3">
                     {contact.tags.length > 0 ? (
                       <div className="space-y-1">
                         {contact.tags.map(t => (
                           <div key={t.id}
                             className="w-fit rounded-full px-2 py-0.5 text-xs font-medium"
                             style={{ backgroundColor: t.color + '22', color: t.color }}>
                             {t.name}
                           </div>
                         ))}
                       </div>
                     ) : (
                       <span className="text-gray-400 text-xs">No tags</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setViewContact(contact)}
                        className="rounded-lg border border-gray-200 p-2 hover:border-primary hover:bg-primary/5"
                        title="View contact"
                        aria-label={`View ${contactDisplayName(contact)}`}
                      >
                        <img src={contactViewIcon} alt="" className="h-4 w-4 object-contain" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirm({
                            title: 'Delete this contact?',
                            description: `Delete ${contactDisplayName(contact)}? This cannot be undone.`,
                            confirmLabel: 'Delete contact',
                          })) deleteMutation.mutate(contact.id);
                        }}
                        className="rounded-lg border border-red-200 p-2 hover:bg-red-50"
                        title="Delete contact"
                        aria-label={`Delete ${contactDisplayName(contact)}`}
                      >
                        <img src={contactDeleteIcon} alt="" className="h-4 w-4 object-contain" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(data?.pages ?? 0) > 1 && (
        <div className="px-6 py-4 border-t flex items-center justify-between bg-white text-sm text-gray-500 shrink-0">
          <div>Showing page {page} of {data?.pages} ({data?.total} total)</div>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Prev</button>
            <button onClick={() => setPage(p => Math.min(data?.pages ?? 1, p + 1))} disabled={page === (data?.pages ?? 1)}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
