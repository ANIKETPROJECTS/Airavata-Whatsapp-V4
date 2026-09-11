/**
 * Create Campaign — type-selector landing + per-type sub-forms.
 * Matches the reference design (Quick / CSV / Groups / Tags / Flow).
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ChevronDown, Upload, Loader2, AlertTriangle, Search, X, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import * as XLSX from 'xlsx';

// ── Types ─────────────────────────────────────────────────────────────────────

type CampaignView = 'select' | 'quick' | 'csv' | 'segment' | 'groups' | 'tags' | 'flow' | 'drip' | 'trigger';

interface Template {
  id: string; name: string; body: string; status: string; language: string;
  headerType?: string; headerContent?: string; footer?: string;
  metaComponents?: Array<{ type?: string; format?: string; text?: string }>;
  buttons?: Array<{ type: string; text: string; value?: string }>;
  category?: string;
}
interface Group    { id: string; name: string; memberCount?: number; }
interface TagItem  { id: string; name: string; color?: string; }
interface Contact  { id: string; name: string; phone: string; }
interface PublishedFlow { id: string; name: string; status: string; metaFlowId?: string; }
interface CsvContactRow {
  phone: string;
  name?: string;
  email?: string;
  attributes?: Record<string, string>;
}
interface ParsedCsvBatch {
  file: File;
  contacts: CsvContactRow[];
  invalid: string[];
  duplicates: number;
  error?: string;
}

// ── Country codes ─────────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { label: 'United States (+1)',    code: '+1'   },
  { label: 'United Kingdom (+44)',  code: '+44'  },
  { label: 'India (+91)',           code: '+91'  },
  { label: 'Australia (+61)',       code: '+61'  },
  { label: 'Germany (+49)',         code: '+49'  },
  { label: 'France (+33)',          code: '+33'  },
  { label: 'Brazil (+55)',          code: '+55'  },
  { label: 'Mexico (+52)',          code: '+52'  },
  { label: 'UAE (+971)',            code: '+971' },
  { label: 'Singapore (+65)',       code: '+65'  },
  { label: 'Malaysia (+60)',        code: '+60'  },
  { label: 'Nigeria (+234)',        code: '+234' },
  { label: 'Kenya (+254)',          code: '+254' },
  { label: 'South Africa (+27)',    code: '+27'  },
  { label: 'Pakistan (+92)',        code: '+92'  },
  { label: 'Bangladesh (+880)',     code: '+880' },
  { label: 'Philippines (+63)',     code: '+63'  },
  { label: 'Indonesia (+62)',       code: '+62'  },
  { label: 'Canada (+1)',           code: '+1'   },
  { label: 'Saudi Arabia (+966)',   code: '+966' },
];

// ── Number parser ─────────────────────────────────────────────────────────────

function normalizePhone(value: unknown, countryCode: string) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  const selectedCountryDigits = countryCode.replace(/\D/g, '');
  const hadInternationalPrefix = raw.startsWith('+') || raw.startsWith('00');
  const withoutInternationalPrefix = raw.startsWith('00') ? digits.slice(2) : digits;
  const looksCountryCoded = selectedCountryDigits === '91'
    ? withoutInternationalPrefix.length === 12
    : withoutInternationalPrefix.startsWith(selectedCountryDigits) &&
      withoutInternationalPrefix.length > selectedCountryDigits.length + 6;

  // CSV/XLSX readers can coerce values such as +918600126395 into the
  // number 918600126395 and drop the leading '+'. If the value already
  // starts with the selected country code and has a subscriber number,
  // preserve it instead of adding the country code a second time.
  if (
    hadInternationalPrefix ||
    (selectedCountryDigits &&
      looksCountryCoded)
  ) {
    return `+${withoutInternationalPrefix}`;
  }

  return selectedCountryDigits
    ? `+${selectedCountryDigits}${withoutInternationalPrefix}`
    : withoutInternationalPrefix;
}

function isValidCampaignPhone(value: string, countryCode: string) {
  if (!/^\+?\d{7,15}$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  if (countryCode === '+91' || digits.startsWith('91')) {
    return digits.length === 12;
  }
  return true;
}

function parseNumbers(raw: string, countryCode: string) {
  const entries = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  const normalised: string[] = [];

  for (const entry of entries) {
    normalised.push(normalizePhone(entry, countryCode));
  }

  const valid: string[]    = [];
  const invalid: string[]  = [];
  const seen    = new Set<string>();
  const dupeSet = new Set<string>();

  for (const n of normalised) {
    if (isValidCampaignPhone(n, countryCode)) {
      if (seen.has(n)) dupeSet.add(n);
      else { seen.add(n); valid.push(n); }
    } else {
      invalid.push(n);
    }
  }

  return { valid, invalid, duplicates: dupeSet.size };
}

const normalizedHeader = (value: unknown) =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const PHONE_HEADERS = new Set([
  'phone', 'phonenumber', 'mobile', 'mobilenumber', 'whatsapp',
  'whatsappnumber', 'contactnumber', 'number',
]);
const NAME_HEADERS = new Set(['name', 'fullname', 'contactname']);
const EMAIL_HEADERS = new Set(['email', 'emailaddress']);

async function parseSpreadsheetFile(file: File, countryCode: string) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('The selected spreadsheet is empty');

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[][]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (!rows.length) throw new Error('The selected spreadsheet is empty');

  const firstRow = rows[0] ?? [];
  const headers = firstRow.map(value => String(value ?? '').trim());
  const normalizedHeaders = headers.map(normalizedHeader);
  const phoneIndex = normalizedHeaders.findIndex(header => PHONE_HEADERS.has(header));
  const hasHeader = phoneIndex !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const actualPhoneIndex = hasHeader ? phoneIndex : 0;
  const nameIndex = hasHeader
    ? normalizedHeaders.findIndex(header => NAME_HEADERS.has(header))
    : -1;
  const emailIndex = hasHeader
    ? normalizedHeaders.findIndex(header => EMAIL_HEADERS.has(header))
    : -1;

  const contacts: CsvContactRow[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const row of dataRows) {
    const rawPhone = String(row[actualPhoneIndex] ?? '').trim();
    if (!rawPhone) continue;
    const phone = normalizePhone(rawPhone, countryCode);
    if (!isValidCampaignPhone(phone, countryCode)) {
      invalid.push(rawPhone);
      continue;
    }
    if (seen.has(phone)) {
      duplicates++;
      continue;
    }
    seen.add(phone);

    const attributes: Record<string, string> = {};
    if (hasHeader) {
      headers.forEach((header, index) => {
        const value = String(row[index] ?? '').trim();
        if (
          value &&
          index !== actualPhoneIndex &&
          index !== nameIndex &&
          index !== emailIndex &&
          header
        ) {
          attributes[header] = value;
        }
      });
    }

    const name = nameIndex >= 0 ? String(row[nameIndex] ?? '').trim() : '';
    const email = emailIndex >= 0 ? String(row[emailIndex] ?? '').trim() : '';
    contacts.push({
      phone,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(Object.keys(attributes).length ? { attributes } : {}),
    });
  }

  return { contacts, invalid, duplicates };
}

// ── Shared form fields ────────────────────────────────────────────────────────

function ConfigRow({
  templates, tmplLoading, templateId, setTemplateId,
  campaignName, setCampaignName,
  countryCode, setCountryCode,
  extra,
}: {
  templates: Template[];
  tmplLoading: boolean;
  templateId: string;
  setTemplateId: (v: string) => void;
  campaignName: string;
  setCampaignName: (v: string) => void;
  countryCode: string;
  setCountryCode: (v: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 items-center">
      {/* Template */}
      <div className="relative min-w-[200px] flex-1">
        <select
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          disabled={tmplLoading}
          className="w-full appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        >
          <option value="">Select approved template</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>

      {/* Campaign name */}
      <input
        type="text"
        value={campaignName}
        onChange={e => setCampaignName(e.target.value)}
        placeholder="Campaign name..."
        className="flex-1 min-w-[160px] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {/* Optional extra (group / tag selector) */}
      {extra}

      {/* Country code */}
      <div className="relative">
        <select
          value={countryCode}
          onChange={e => setCountryCode(e.target.value)}
          className="appearance-none border rounded-lg pl-2 pr-7 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">select country</option>
          {COUNTRY_CODES.map(c => (
            <option key={c.label} value={c.code}>{c.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

function NumbersSection({
  value, onChange, countryCode,
  contacts = [],
  placeholder = 'Enter numbers separated by comma...',
}: {
  value: string;
  onChange: (v: string) => void;
  countryCode: string;
  contacts?: Contact[];
  placeholder?: string;
}) {
  const { valid, invalid, duplicates } = useMemo(
    () => parseNumbers(value, countryCode),
    [value, countryCode],
  );

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q),
    ).slice(0, 50);
  }, [contacts, search]);

  function addContact(phone: string) {
    const existing = value.trim();
    const nums = existing
      ? existing.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (!nums.includes(phone)) {
      onChange([...nums, phone].join(', '));
    }
    setSearch('');
  }

  function addAll() {
    const existing = value.trim()
      ? value.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const existingSet = new Set(existing);
    const toAdd = filtered.map(c => c.phone).filter(p => !existingSet.has(p));
    if (toAdd.length) onChange([...existing, ...toAdd].join(', '));
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Numbers</p>

        {/* Contact picker trigger */}
        {contacts.length > 0 && (
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => { setOpen(o => !o); setSearch(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg text-primary border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Select from contacts
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white border rounded-xl shadow-lg z-50 flex flex-col">
                {/* Search */}
                <div className="p-2 border-b">
                  <div className="flex items-center gap-2 px-2 py-1.5 border rounded-lg bg-gray-50">
                    <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search by name or number..."
                      className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
                    />
                    {search && (
                      <button onClick={() => setSearch('')}>
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* List */}
                <div className="overflow-y-auto max-h-52">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No contacts found</p>
                  ) : (
                    filtered.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { addContact(c.phone); }}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left transition-colors"
                      >
                        <div>
                          <p className="text-xs font-medium text-gray-800">{c.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{c.phone}</p>
                        </div>
                        <span className="text-[10px] text-primary font-medium shrink-0 ml-2">+ Add</span>
                      </button>
                    ))
                  )}
                </div>

                {/* Add all visible */}
                {filtered.length > 1 && (
                  <div className="border-t p-2">
                    <button
                      type="button"
                      onClick={addAll}
                      className="w-full text-xs font-semibold text-primary hover:bg-primary/5 py-1.5 rounded-lg transition-colors"
                    >
                      Add all {filtered.length} shown
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-4 items-start">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={6}
          className="flex-1 border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
        />
        <div className="flex flex-col gap-1.5 shrink-0 w-48">
          <div className="bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg text-center">
            Valid Numbers:&nbsp;{valid.length}
          </div>
          <div className="bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg text-center">
            Invalid Numbers:&nbsp;{invalid.length}
          </div>
          <div className="bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg text-center">
            Duplicate Numbers:&nbsp;{duplicates}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButtons({
  validCount,
  onSchedule,
  onSend,
  loading,
}: {
  validCount: number;
  onSchedule: () => void;
  onSend: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-white border rounded-xl p-4 w-fit">
      <button
        onClick={onSchedule}
        className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
      >
        Schedule Campaign
      </button>
      <button
        onClick={onSend}
        disabled={validCount === 0 || loading}
        className="px-5 py-2.5 bg-gray-300 text-gray-500 text-sm font-semibold rounded-lg disabled:opacity-60 enabled:bg-gray-900 enabled:text-white enabled:hover:bg-gray-800 transition-colors flex items-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Create &amp; Start Campaign ({validCount} recipients)
      </button>
    </div>
  );
}

// ── Sub-view wrapper ──────────────────────────────────────────────────────────

function SubViewShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="px-6 py-5 flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <button
          onClick={onBack}
          className="px-4 py-1.5 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors"
        >
          Back
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-5">
        {children}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CreateCampaign() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<CampaignView>('select');

  // Shared form state
  const [templateId, setTemplateId]         = useState('');
  const [campaignName, setCampaignName]     = useState('');
  const [countryCode, setCountryCode]       = useState('');
  const [numbers, setNumbers]               = useState('');
  const [groupId, setGroupId]               = useState('');
  const [tagId, setTagId]                   = useState('');
  const [segmentGroupId, setSegmentGroupId] = useState('');
  const [segmentTagId, setSegmentTagId]     = useState('');
  const [dripSteps, setDripSteps]           = useState('1:0');
  const [triggerEvent, setTriggerEvent]     = useState('inbound_message');
  const [csvFiles, setCsvFiles]             = useState<File[]>([]);
  const [csvBatches, setCsvBatches]         = useState<ParsedCsvBatch[]>([]);
  const [csvParsing, setCsvParsing]         = useState(false);
  const [flowId, setFlowId]                 = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [headerValues, setHeaderValues]     = useState<Record<string, string>>({});
  const csvInputRef = useRef<HTMLInputElement>(null);
  const csvBatchLaunchRef = useRef(false);

  // Schedule modal state (simple — just stores a datetime string)
  const [scheduledAt, setScheduledAt] = useState('');

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: tmplData, isLoading: tmplLoading } = useQuery<{ templates: Template[] }>({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates'),
    enabled: view !== 'select',
  });
  const approvedTemplates = (tmplData?.templates ?? []).filter(
    t => String(t.status).toUpperCase() === 'APPROVED',
  );

  // ── Template variable detection ────────────────────────────────────────────

  const selectedTemplate = approvedTemplates.find(t => t.id === templateId) ?? null;
  const templateStructure = useMemo(() => {
    const components = selectedTemplate?.metaComponents ?? [];
    const bodyComponent = components.find(component => String(component.type).toUpperCase() === 'BODY');
    const headerComponent = components.find(component => String(component.type).toUpperCase() === 'HEADER');
    const bodyText = bodyComponent?.text ?? selectedTemplate?.body ?? '';
    const headerFormat = String(headerComponent?.format ?? selectedTemplate?.headerType ?? 'NONE').toUpperCase();
    const headerText = headerComponent?.text ?? selectedTemplate?.headerContent ?? '';
    const indices = (text: string) => [...new Set(
      [...text.matchAll(/\{\{(\d+)\}\}/g)].map(match => parseInt(match[1]!, 10)),
    )].sort((a, b) => a - b);

    return {
      bodyText,
      bodyVariableIndices: indices(bodyText),
      headerFormat,
      headerText,
      headerVariableIndices: indices(headerText),
      requiresMediaHeader: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat),
    };
  }, [selectedTemplate]);
  const templateVarIndices = templateStructure.bodyVariableIndices;

  // Reset variable values when template changes
  useEffect(() => {
    setVariableValues({});
    setHeaderValues({});
  }, [templateId]);

  const { data: groupsData } = useQuery<{ groups: Group[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get('/groups'),
    enabled: view === 'groups' || view === 'segment',
  });
  const groups = groupsData?.groups ?? [];

  const { data: tagsData } = useQuery<{ tags: TagItem[] }>({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags'),
    enabled: view === 'tags' || view === 'segment',
  });
  const tags = tagsData?.tags ?? [];

  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts'),
    enabled: view !== 'select' && view !== 'csv',
  });
  const contacts = contactsData?.contacts ?? [];

  const { data: flowsData, isLoading: flowsLoading } = useQuery<{ flows: PublishedFlow[] }>({
    queryKey: ['flows'],
    queryFn: () => api.get('/flows'),
    enabled: view === 'flow',
  });
  const publishedFlows = (flowsData?.flows ?? []).filter(
    flow => flow.status === 'PUBLISHED' && Boolean(flow.metaFlowId),
  );

  // ── Parsed numbers ─────────────────────────────────────────────────────────

  const parsed = useMemo(() => parseNumbers(numbers, countryCode), [numbers, countryCode]);

  useEffect(() => {
    if (!csvFiles.length) {
      setCsvBatches([]);
      return;
    }

    let cancelled = false;
    setCsvParsing(true);
    Promise.all(csvFiles.map(async file => {
      try {
        const result = await parseSpreadsheetFile(file, countryCode);
        return { file, ...result };
      } catch (error: unknown) {
        return {
          file,
          contacts: [],
          invalid: [],
          duplicates: 0,
          error: error instanceof Error ? error.message : 'Unable to read the spreadsheet',
        };
      }
    }))
      .then(results => {
        if (!cancelled) setCsvBatches(results);
      })
      .finally(() => {
        if (!cancelled) setCsvParsing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [csvFiles, countryCode]);

  // ── Campaign mutation ──────────────────────────────────────────────────────

  const launchMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/campaigns', payload),
    onSuccess: () => {
      toast.success('Campaign created successfully!');
      if (!csvBatchLaunchRef.current) {
        setTimeout(() => navigate('/campaigns-report'), 1200);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function validateCommon() {
    if (!campaignName.trim()) { toast.error('Enter a campaign name'); return false; }
    if (view === 'flow') {
      if (!flowId) { toast.error('Select a published Flow'); return false; }
    } else if (!templateId) {
      toast.error('Select an approved template');
      return false;
    }
    if (templateId) {
      const missingBody = templateStructure.bodyVariableIndices.filter(
        index => !String(variableValues[String(index)] ?? '').trim(),
      );
      const missingHeader = templateStructure.headerVariableIndices.filter(
        index => !String(headerValues[String(index)] ?? '').trim(),
      );
      const missing = [
        ...missingBody.map(index => `body variable {{${index}}}`),
        ...missingHeader.map(index => `header variable {{${index}}}`),
        ...(templateStructure.requiresMediaHeader && !String(headerValues.media ?? '').trim()
          ? [`${templateStructure.headerFormat.toLowerCase()} header media`]
          : []),
      ];
      if (missing.length > 0) {
        toast.error(`Enter required template values: ${missing.join(', ')}`);
        return false;
      }
    }
    return true;
  }

  function buildPayload(extra: Record<string, unknown> = {}, scheduled = false) {
    return {
      name: campaignName,
      ...(templateId ? { templateId } : {}),
      variableValues,
      headerValues,
      type: view === 'segment' ? 'SEGMENT' : view === 'drip' ? 'DRIP' : view === 'trigger' ? 'TRIGGER' : view === 'flow' ? 'FLOW' : view === 'csv' ? 'CSV' : 'QUICK',
      ...(view === 'drip' ? {
        steps: dripSteps.split(',').map((delay, index) => ({
          id: `step-${index + 1}`,
          templateId,
          delayMinutes: Math.max(0, Number(delay.trim()) || 0),
        })),
      } : {}),
      ...(view === 'trigger' ? { trigger: { event: triggerEvent } } : {}),
      ...(scheduled && scheduledAt ? { scheduledAt } : {}),
      ...extra,
    };
  }

  function handleQuickSend() {
    if (!validateCommon()) return;
    if (parsed.valid.length === 0) { toast.error('No valid phone numbers entered'); return; }
    launchMutation.mutate(buildPayload({ phoneNumbers: parsed.valid }));
  }

  function csvPayload(batch: ParsedCsvBatch) {
    const contactRows = batch.contacts;
    return {
      phoneNumbers: contactRows.map(contact => contact.phone),
      csvContacts: contactRows,
    };
  }

  async function launchCsvBatches(scheduledAtIso?: string) {
    if (!validateCommon()) return;
    if (csvParsing) { toast.error('Wait for the spreadsheets to finish processing'); return; }
    if (!csvBatches.length) { toast.error('Add at least one CSV file'); return; }
    if (csvBatches.some(batch => batch.error)) {
      toast.error('Fix or remove the CSV file that could not be read');
      return;
    }
    if (csvBatches.some(batch => batch.contacts.length === 0)) {
      toast.error('Each CSV batch must contain at least one valid phone number');
      return;
    }
    const invalidCount = csvBatches.reduce((total, batch) => total + batch.invalid.length, 0);
    if (invalidCount > 0) {
      toast.error(
        `Remove or correct ${invalidCount} invalid phone number${invalidCount === 1 ? '' : 's'} before sending`,
      );
      return;
    }

    csvBatchLaunchRef.current = true;
    try {
      for (const [index, batch] of csvBatches.entries()) {
        const batchName = csvBatches.length > 1
          ? `${campaignName.trim()} - Batch ${index + 1}/${csvBatches.length}`
          : campaignName.trim();
        await launchMutation.mutateAsync(buildPayload({
          name: batchName,
          ...(scheduledAtIso ? { scheduledAt: scheduledAtIso } : {}),
          ...csvPayload(batch),
        }));
      }
      toast.success(
        csvBatches.length > 1
          ? `Created ${csvBatches.length} campaign batches successfully`
          : 'Campaign created successfully!',
      );
      setTimeout(() => navigate('/campaigns-report'), 1200);
    } finally {
      csvBatchLaunchRef.current = false;
    }
  }

  function handleCsvSend() {
    void launchCsvBatches();
  }

  function handleCsvSchedule() {
    if (!validateCommon()) return;
    const dt = prompt('Enter scheduled date/time (YYYY-MM-DDTHH:MM):');
    if (!dt) return;
    const date = new Date(dt);
    if (Number.isNaN(date.getTime())) {
      toast.error('Enter a valid scheduled date and time');
      return;
    }
    void launchCsvBatches(date.toISOString());
  }

  function handleFlowSend() {
    if (!validateCommon()) return;
    if (parsed.valid.length === 0) { toast.error('No valid phone numbers entered'); return; }
    launchMutation.mutate(buildPayload({ flowId, phoneNumbers: parsed.valid }));
  }

  function handleGroupSend() {
    if (!validateCommon()) return;
    if (!groupId) { toast.error('Select a contact group'); return; }
    launchMutation.mutate(buildPayload({ groupIds: [groupId] }));
  }

  function handleTagSend() {
    if (!validateCommon()) return;
    if (!tagId) { toast.error('Select a tag'); return; }
    launchMutation.mutate(buildPayload({ tagId, phoneNumbers: parsed.valid }));
  }

  function handleSchedule(extra: Record<string, unknown> = {}) {
    if (!validateCommon()) return;
    const dt = prompt('Enter scheduled date/time (YYYY-MM-DDTHH:MM):');
    if (!dt) return;
    launchMutation.mutate(buildPayload({ scheduledAt: new Date(dt).toISOString(), ...extra }));
  }

  function resetAndGo(v: CampaignView) {
    setTemplateId(''); setCampaignName(''); setCountryCode('');
    setNumbers(''); setGroupId(''); setTagId(''); setSegmentGroupId(''); setSegmentTagId('');
    setCsvFiles([]); setCsvBatches([]);
    setFlowId('');
    setDripSteps('1:0'); setTriggerEvent('inbound_message');
    setVariableValues({});
    setHeaderValues({});
    setView(v);
  }

  // ── WhatsApp text renderer ─────────────────────────────────────────────────

  function renderWABody(text: string): React.ReactNode {
    // substitute variables first
    const substituted = text.replace(/\{\{(\d+)\}\}/g, (_, idx: string) => {
      const v = variableValues[idx] ?? '';
      return v || `{{${idx}}}`;
    });
    // split into lines, then apply inline formatting per line
    return substituted.split('\n').map((line, li) => {
      // parse *bold*, _italic_, ~strike~ inline
      const parts: React.ReactNode[] = [];
      const regex = /(\*[^*]+\*|_[^_]+_|~[^~]+~)/g;
      let last = 0;
      let m: RegExpExecArray | null;
      let pi = 0;
      while ((m = regex.exec(line)) !== null) {
        if (m.index > last) parts.push(<span key={pi++}>{line.slice(last, m.index)}</span>);
        const token = m[0];
        if (token.startsWith('*')) parts.push(<strong key={pi++}>{token.slice(1, -1)}</strong>);
        else if (token.startsWith('_')) parts.push(<em key={pi++}>{token.slice(1, -1)}</em>);
        else parts.push(<s key={pi++}>{token.slice(1, -1)}</s>);
        last = m.index + token.length;
      }
      if (last < line.length) parts.push(<span key={pi++}>{line.slice(last)}</span>);
      return <p key={li} className={li > 0 ? 'mt-1' : ''}>{parts}</p>;
    });
  }

  // ── Variable values + preview section ─────────────────────────────────────

  function VariableValuesSection() {
    if (!selectedTemplate) return null;
    const hasBodyVars = templateStructure.bodyVariableIndices.length > 0;
    const hasHeaderVars = templateStructure.headerVariableIndices.length > 0;
    const needsHeaderInput = hasHeaderVars || templateStructure.requiresMediaHeader;
    const hasInputs = hasBodyVars || needsHeaderInput;

    return (
      <div className="flex flex-col lg:flex-row gap-4">
        {/* WhatsApp preview bubble */}
        <div className="lg:w-72 shrink-0">
          <div
            className="rounded-xl overflow-hidden shadow-sm border"
            style={{ background: '#e5ddd5' }}
          >
            {/* Chat header */}
            <div className="bg-[#075e54] text-white px-4 py-2 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                {selectedTemplate.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium truncate">{selectedTemplate.name}</span>
            </div>

            {/* Message bubble */}
            <div className="p-3">
              <div className="bg-white rounded-lg rounded-tl-none shadow-sm max-w-[90%]">
                {/* Header */}
                {selectedTemplate.headerType && selectedTemplate.headerType !== 'NONE' && selectedTemplate.headerContent && (
                  <div className="px-3 pt-3 pb-1 font-semibold text-gray-900 text-sm border-b border-gray-100">
                    {selectedTemplate.headerContent}
                  </div>
                )}

                {/* Body */}
                <div className="px-3 py-2.5 text-[13px] text-gray-800 leading-[1.5]">
                  {renderWABody(selectedTemplate.body)}
                </div>

                {/* Footer */}
                {selectedTemplate.footer && (
                  <div className="px-3 pb-2 text-[11px] text-gray-400">
                    {selectedTemplate.footer}
                  </div>
                )}

                {/* Timestamp */}
                <div className="px-3 pb-2 text-right text-[10px] text-gray-400">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                </div>

                {/* Buttons */}
                {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {selectedTemplate.buttons.map((btn, bi) => (
                      <div key={bi} className="px-3 py-2 text-center text-[13px] text-[#0084ff] font-medium">
                        {btn.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Variable inputs */}
        {hasInputs && (
          <div className="flex-1 bg-white border rounded-xl p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Template inputs</p>
              <p className="text-xs text-gray-400 mt-0.5">
                These values are required by the approved Meta template structure.
              </p>
            </div>
            <div className="space-y-3">
              {hasBodyVars && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Body variables</p>
                  {templateStructure.bodyVariableIndices.map(i => (
                    <div key={`body-${i}`}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Body variable {`{{${i}}}`}:</label>
                      <input
                        type="text"
                        value={variableValues[String(i)] ?? ''}
                        onChange={e => setVariableValues(prev => ({ ...prev, [String(i)]: e.target.value }))}
                        placeholder="Text, {{name}}, or {{phone}}"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
                </div>
              )}
              {hasHeaderVars && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Header variables</p>
                  {templateStructure.headerVariableIndices.map(i => (
                    <div key={`header-${i}`}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Header variable {`{{${i}}}`}:</label>
                      <input
                        type="text"
                        value={headerValues[String(i)] ?? ''}
                        onChange={e => setHeaderValues(prev => ({ ...prev, [String(i)]: e.target.value }))}
                        placeholder="Header text, {{name}}, or {{phone}}"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
                </div>
              )}
              {templateStructure.requiresMediaHeader && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {templateStructure.headerFormat} header
                  </p>
                  <label className="block text-xs font-medium text-gray-600">
                    Media URL or Meta media ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={headerValues.media ?? ''}
                    onChange={e => setHeaderValues(prev => ({ ...prev, media: e.target.value }))}
                    placeholder={`Enter the ${templateStructure.headerFormat.toLowerCase()} URL or media ID`}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Campaign type cards ────────────────────────────────────────────────────

  const types = [
    {
      key: 'quick' as CampaignView,
      title: 'Quick Campaign',
      desc: 'Send a simple message to a single recipient or group. Perfect for quick communications or testing your setup.',
      btnLabel: 'Start Quick Campaign',
      btnClass: 'bg-primary text-white hover:bg-primary/90',
    },
    {
      key: 'csv' as CampaignView,
      title: 'CSV Campaign',
      desc: 'Upload a CSV file with multiple recipients to send personalized messages at scale. Ideal for marketing or notifications.',
      btnLabel: 'Start CSV Campaign',
      btnClass: 'bg-primary text-white hover:bg-primary/90',
    },
    {
      key: 'segment' as CampaignView,
      title: 'Segment Campaign',
      desc: 'Build a unified audience from groups, tags, and contact filters, then send an approved WhatsApp template to the matching contacts.',
      btnLabel: 'Start Segment Campaign',
      btnClass: 'bg-primary text-white hover:bg-primary/90',
    },
    {
      key: 'drip' as CampaignView,
      title: 'Drip Campaign',
      desc: 'Send a time-based sequence of approved WhatsApp templates with per-contact progress and delay controls.',
      btnLabel: 'Start Drip Campaign',
      btnClass: 'bg-primary text-white hover:bg-primary/90',
    },
    {
      key: 'trigger' as CampaignView,
      title: 'Trigger Campaign',
      desc: 'Enroll contacts into an automated campaign when a supported event occurs, while keeping each send idempotent.',
      btnLabel: 'Start Trigger Campaign',
      btnClass: 'bg-primary text-white hover:bg-primary/90',
    },
    {
      key: 'flow' as CampaignView,
      title: 'Flow Campaign',
      desc: 'Send interactive WhatsApp Flows to multiple recipients in bulk. Collect structured responses like forms, surveys, and registrations at scale.',
      btnLabel: 'Start Flow Campaign',
      btnClass: 'bg-primary text-white hover:bg-primary/90',
    },
  ];

  // ── Select view ────────────────────────────────────────────────────────────

  if (view === 'select') {
    return (
      <div className="h-full flex flex-col bg-gray-50 overflow-y-auto">
        <div className="text-center py-10 px-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Create New Campaign</h1>
          <p className="text-gray-500 text-base">Select a campaign type to get started with your WhatsApp messaging</p>
        </div>

        <div className="px-8 pb-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto w-full">
          {types.map(t => (
            <CampaignTypeCard key={t.key} {...t} onStart={() => resetAndGo(t.key)} />
          ))}
        </div>
      </div>
    );
  }

  // ── Segment Campaign ───────────────────────────────────────────────────────

  if (view === 'segment') {
    return (
      <SubViewShell title="Segment Campaign" onBack={() => setView('select')}>
        <ConfigRow
          templates={approvedTemplates} tmplLoading={tmplLoading}
          templateId={templateId} setTemplateId={setTemplateId}
          campaignName={campaignName} setCampaignName={setCampaignName}
          countryCode={countryCode} setCountryCode={setCountryCode}
          extra={
            <div className="flex flex-1 min-w-[320px] gap-2">
              <select value={segmentGroupId} onChange={e => setSegmentGroupId(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Any group</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={segmentTagId} onChange={e => setSegmentTagId(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Any tag</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          }
        />
        <VariableValuesSection />
        <div className="bg-white border rounded-xl p-4 text-sm text-gray-600">
          {segmentGroupId || segmentTagId
            ? 'The selected group or tag will be resolved again at send time and inactive or unsubscribed contacts will be skipped.'
            : 'Choose a group or tag to define the segment audience.'}
        </div>
        <ActionButtons
          validCount={segmentGroupId || segmentTagId ? 1 : 0}
          onSchedule={() => handleSchedule({
            groupIds: segmentGroupId ? [segmentGroupId] : [],
            tagIds: segmentTagId ? [segmentTagId] : [],
          })}
          onSend={() => {
            if (!validateCommon()) return;
            if (!segmentGroupId && !segmentTagId) { toast.error('Choose a group or tag'); return; }
            launchMutation.mutate(buildPayload({
              groupIds: segmentGroupId ? [segmentGroupId] : [],
              tagIds: segmentTagId ? [segmentTagId] : [],
            }));
          }}
          loading={launchMutation.isPending}
        />
      </SubViewShell>
    );
  }

  // ── Drip / Trigger Campaigns ───────────────────────────────────────────────

  if (view === 'drip' || view === 'trigger') {
    return (
      <SubViewShell title={view === 'drip' ? 'Drip Campaign' : 'Trigger Campaign'} onBack={() => setView('select')}>
        <ConfigRow
          templates={approvedTemplates} tmplLoading={tmplLoading}
          templateId={templateId} setTemplateId={setTemplateId}
          campaignName={campaignName} setCampaignName={setCampaignName}
          countryCode={countryCode} setCountryCode={setCountryCode}
        />
        {view === 'drip' ? (
          <div className="bg-white border rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-800">Sequence delays</p>
            <p className="text-xs text-gray-500">Enter comma-separated delays in minutes. The first step sends immediately.</p>
            <input value={dripSteps} onChange={e => setDripSteps(e.target.value)} placeholder="0, 1440, 4320" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        ) : (
          <div className="bg-white border rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-800">Enrollment trigger</p>
            <select value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
               <option value="contact_created">New contact added</option>
            </select>
          </div>
        )}
        <NumbersSection value={numbers} onChange={setNumbers} countryCode={countryCode} contacts={contacts} />
        <ActionButtons
          validCount={parsed.valid.length}
          onSchedule={() => handleSchedule({ phoneNumbers: parsed.valid })}
          onSend={() => {
            if (!validateCommon()) return;
            if (!parsed.valid.length) { toast.error('Add at least one recipient'); return; }
            launchMutation.mutate(buildPayload({ phoneNumbers: parsed.valid }));
          }}
          loading={launchMutation.isPending}
        />
      </SubViewShell>
    );
  }

  // ── Quick Campaign ─────────────────────────────────────────────────────────

  if (view === 'quick') {
    return (
      <SubViewShell title="Quick Campaign" onBack={() => setView('select')}>
        <ConfigRow
          templates={approvedTemplates} tmplLoading={tmplLoading}
          templateId={templateId} setTemplateId={setTemplateId}
          campaignName={campaignName} setCampaignName={setCampaignName}
          countryCode={countryCode} setCountryCode={setCountryCode}
        />
        <VariableValuesSection />
         <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
           <div>
             <p className="text-sm font-semibold text-blue-900">Need to reach more than 50 contacts?</p>
             <p className="text-xs text-blue-700 mt-1">
               Upload one or more CSV batches. Each file will run as a separate campaign.
             </p>
           </div>
           <button
             type="button"
             onClick={() => setView('csv')}
             className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
           >
             Upload CSV batches
           </button>
         </div>
        <NumbersSection value={numbers} onChange={setNumbers} countryCode={countryCode} contacts={contacts} />
        <ActionButtons
          validCount={parsed.valid.length}
          onSchedule={() => handleSchedule({ phoneNumbers: parsed.valid })}
          onSend={handleQuickSend}
          loading={launchMutation.isPending}
        />
      </SubViewShell>
    );
  }

  // ── CSV Campaign ───────────────────────────────────────────────────────────

  if (view === 'csv') {
    return (
      <SubViewShell title="CSV Campaign" onBack={() => setView('select')}>
        <ConfigRow
          templates={approvedTemplates} tmplLoading={tmplLoading}
          templateId={templateId} setTemplateId={setTemplateId}
          campaignName={campaignName} setCampaignName={setCampaignName}
          countryCode={countryCode} setCountryCode={setCountryCode}
        />

        {/* File upload */}
        <input
          ref={csvInputRef}
          type="file"
           multiple
          accept=".csv,.xlsx,.xls"
          className="hidden"
           onChange={e => {
             const selected = Array.from(e.target.files ?? []);
             if (selected.length) {
               setCsvFiles(previous => {
                 const existing = new Set(previous.map(file => `${file.name}:${file.size}:${file.lastModified}`));
                 return [
                   ...previous,
                   ...selected.filter(file => !existing.has(`${file.name}:${file.size}:${file.lastModified}`)),
                 ];
               });
             }
             e.currentTarget.value = '';
           }}
        />
        <div>
          <button
            onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <Upload className="w-4 h-4" />
             ADD CSV FILES
          </button>
           {csvParsing && <p className="mt-2 text-sm text-gray-500">Reading spreadsheets…</p>}
           {!csvParsing && csvBatches.length > 0 && (
             <div className="mt-3 space-y-2">
               <p className="text-sm font-semibold text-gray-700">
                 {csvBatches.length} batch{csvBatches.length === 1 ? '' : 'es'} · {csvBatches.reduce((total, batch) => total + batch.contacts.length, 0)} valid recipients
               </p>
               {csvBatches.map((batch, index) => (
                 <div key={`${batch.file.name}-${batch.file.lastModified}`} className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
                   <div className="min-w-0">
                     <p className="font-medium text-gray-700 truncate">{batch.file.name}</p>
                     {batch.error ? (
                       <p className="text-red-600">{batch.error}</p>
                     ) : (
                       <p className="text-gray-500">
                         {batch.contacts.length} valid · {batch.duplicates} duplicate{batch.duplicates === 1 ? '' : 's'} removed
                         {batch.invalid.length > 0 ? ` · ${batch.invalid.length} invalid skipped` : ''}
                       </p>
                     )}
                   </div>
                   <button
                     type="button"
                     onClick={() => setCsvFiles(previous => previous.filter((_, fileIndex) => fileIndex !== index))}
                     className="shrink-0 p-1 text-gray-400 hover:text-red-600"
                     aria-label={`Remove ${batch.file.name}`}
                   >
                     <X className="w-4 h-4" />
                   </button>
                 </div>
               ))}
             </div>
           )}
        </div>

        <div className="flex items-center gap-3 bg-white border rounded-xl p-4 w-fit">
          <button
             onClick={handleCsvSchedule}
             disabled={csvParsing || csvBatches.length === 0 || launchMutation.isPending}
            className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            Schedule Campaign
          </button>
          <button
            onClick={handleCsvSend}
             disabled={csvParsing || csvBatches.length === 0 || launchMutation.isPending}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
             {launchMutation.isPending ? 'Creating batches…' : 'Run CSV campaign batches'}
          </button>
        </div>
      </SubViewShell>
    );
  }

  // ── Groups Campaign ────────────────────────────────────────────────────────

  if (view === 'groups') {
    return (
      <SubViewShell title="Group Campaign" onBack={() => setView('select')}>
        <ConfigRow
          templates={approvedTemplates} tmplLoading={tmplLoading}
          templateId={templateId} setTemplateId={setTemplateId}
          campaignName={campaignName} setCampaignName={setCampaignName}
          countryCode={countryCode} setCountryCode={setCountryCode}
          extra={
            <div className="relative min-w-[180px] flex-1">
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className="w-full appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select a contact group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          }
        />
        <VariableValuesSection />
        <NumbersSection value={numbers} onChange={setNumbers} countryCode={countryCode} contacts={contacts} />
        <ActionButtons
          validCount={groupId ? (groups.find(g => g.id === groupId)?.memberCount ?? parsed.valid.length) : parsed.valid.length}
          onSchedule={() => handleSchedule({ groupIds: [groupId] })}
          onSend={handleGroupSend}
          loading={launchMutation.isPending}
        />
      </SubViewShell>
    );
  }

  // ── Tags Campaign ──────────────────────────────────────────────────────────

  if (view === 'tags') {
    return (
      <SubViewShell title="Tag Campaign" onBack={() => setView('select')}>
        <ConfigRow
          templates={approvedTemplates} tmplLoading={tmplLoading}
          templateId={templateId} setTemplateId={setTemplateId}
          campaignName={campaignName} setCampaignName={setCampaignName}
          countryCode={countryCode} setCountryCode={setCountryCode}
        />

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Select Tag to Filter Contacts</p>
          <div className="relative w-56">
            <select
              value={tagId}
              onChange={e => setTagId(e.target.value)}
              className="w-full appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select a tag to filter contacts</option>
              {tags.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <p className="text-xs text-gray-500">
            Select a tag to automatically populate the numbers field with contacts that have this tag.
            You can also manually enter or edit numbers in the field below.
          </p>
        </div>

        <VariableValuesSection />
        <NumbersSection
          value={numbers}
          onChange={setNumbers}
          countryCode={countryCode}
          contacts={contacts}
          placeholder="Enter numbers separated by comma or select a tag above to filter contacts"
        />
        <ActionButtons
          validCount={parsed.valid.length}
          onSchedule={() => handleSchedule({ tagId, phoneNumbers: parsed.valid })}
          onSend={handleTagSend}
          loading={launchMutation.isPending}
        />
      </SubViewShell>
    );
  }

  // ── Flow Campaign ──────────────────────────────────────────────────────────

  if (view === 'flow') {
    return (
      <SubViewShell title="Flow Campaign" onBack={() => setView('select')}>
        <p className="text-sm text-gray-500 -mt-2">Send a WhatsApp Flow to multiple recipients in bulk</p>

        <div className="bg-white border rounded-xl p-6 space-y-6">
          {/* Campaign name */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign Name *</p>
            <input
              type="text"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. May Lead Gen Campaign"
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Select Flow */}
           <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Flow *</p>
             <select
               value={flowId}
               onChange={e => setFlowId(e.target.value)}
               disabled={flowsLoading}
               className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
             >
               <option value="">{flowsLoading ? 'Loading published Flows…' : 'Select a published Flow'}</option>
               {publishedFlows.map(flow => (
                 <option key={flow.id} value={flow.id}>{flow.name}</option>
               ))}
             </select>
             {!flowsLoading && publishedFlows.length === 0 && (
               <p className="text-xs text-amber-700">No published Flows found. Publish a Flow first from the Flow Builder.</p>
             )}
          </div>

          {/* Country code */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Country Code <span className="normal-case font-normal">(Auto-prefix for local numbers)</span>
            </p>
            <div className="relative w-48">
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                className="w-full appearance-none border rounded-lg pl-3 pr-8 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select Country</option>
                {COUNTRY_CODES.map(c => (
                  <option key={c.label} value={c.code}>{c.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Phone numbers */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient Phone Numbers *</p>
            <textarea
              value={numbers}
              onChange={e => setNumbers(e.target.value)}
              placeholder="Enter phone numbers"
              rows={5}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
            />
            <p className="text-xs text-gray-400">
              Include country code, no + prefix. Accepts one per line, comma, or semicolon separated.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white border rounded-xl p-4 w-fit">
          <button
             onClick={() => handleSchedule({ flowId, phoneNumbers: parsed.valid })}
            className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            Schedule Campaign
          </button>
          <button
             onClick={handleFlowSend}
             disabled={parsed.valid.length === 0 || !flowId || launchMutation.isPending}
            className="px-5 py-2.5 bg-gray-300 text-gray-500 text-sm font-semibold rounded-lg disabled:opacity-60 enabled:bg-gray-900 enabled:text-white enabled:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            {launchMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Send Flow Campaign ({parsed.valid.length} recipients)
          </button>
        </div>
      </SubViewShell>
    );
  }

  return null;
}

// ── Campaign type card ────────────────────────────────────────────────────────

function CampaignTypeCard({
  title, desc, btnLabel, btnClass, onStart,
}: {
  title: string;
  desc: string;
  btnLabel: string;
  btnClass: string;
  onStart: () => void;
}) {
  return (
    <div className="bg-white border rounded-2xl shadow-sm p-6 flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div className="flex-1">
        <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={onStart}
        className={`w-full py-2.5 text-sm font-bold rounded-lg transition-colors ${btnClass}`}
      >
        {btnLabel}
      </button>
    </div>
  );
}
