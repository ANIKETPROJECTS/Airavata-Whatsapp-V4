import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';

import {
  MessageSquare, Image as ImageIcon, FileText, Video, HelpCircle,
  Trash2, Loader2, RefreshCw, Send, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TemplateRecord {
  id: string;
  name: string;
  category: string;
  language: string;
  headerType: string;
  body: string;
  footer?: string;
  status: string;
  rejectionReason?: string;
  metaTemplateId?: string;
  updatedAt: string;
}

// ── Send-Test Dialog ───────────────────────────────────────────────────────────

/** Extract sorted unique variable indices from a template body, e.g. {{1}}, {{2}} → [1, 2] */
function extractVars(body: string): number[] {
  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)];
  const indices = [...new Set(matches.map(m => parseInt(m[1]!, 10)))].sort((a, b) => a - b);
  return indices;
}

/** Replace {{1}}, {{2}} placeholders with the filled-in values for the preview */
function fillPreview(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
    const val = values[parseInt(idx, 10) - 1];
    return val?.trim() ? val.trim() : `{{${idx}}}`;
  });
}

function SendTestDialog({
  template,
  onClose,
}: {
  template: TemplateRecord;
  onClose: () => void;
}) {
  const isAuth = template.category.toUpperCase() === 'AUTHENTICATION';
  const varIndices = isAuth ? [] : extractVars(template.body);
  const [to, setTo] = useState('');
  const [varValues, setVarValues] = useState<string[]>(varIndices.map(() => ''));
  // Auto-generate a 6-digit OTP for authentication templates
  const [otpCode, setOtpCode] = useState(() =>
    isAuth ? String(Math.floor(100000 + Math.random() * 900000)) : ''
  );
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) { toast.error('Enter a phone number'); return; }
    if (isAuth) {
      if (!otpCode.trim()) { toast.error('Enter the OTP code to send'); return; }
    } else {
      for (let i = 0; i < varIndices.length; i++) {
        if (!varValues[i]?.trim()) {
          toast.error(`Fill in variable {{${varIndices[i]}}}`);
          return;
        }
      }
    }
    setSending(true);
    try {
      const res = await api.post<{ ok: boolean; messageId: string | null }>(
        '/templates/send-test',
        {
          templateId: template.id,
          to: to.trim(),
          variables: isAuth ? [otpCode.trim()] : varValues.map(v => v.trim()),
        },
      );
      if (res.ok) {
        toast.success('Template message sent!');
        onClose();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const preview = isAuth
    ? `Your OTP code is ${otpCode.trim() || '______'}. Tap "Copy Code" to copy it.`
    : fillPreview(template.body, varValues);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Send Template Message</h2>
            <p className="text-sm text-gray-500 mt-0.5">Template: <code className="bg-gray-100 px-1 rounded text-xs">{template.name}</code></p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Live preview */}
        <div className="bg-[#efeae2] rounded-lg p-3">
          <div className="bg-white rounded-lg p-3 shadow-sm text-sm text-gray-800 whitespace-pre-wrap">
            {preview}
          </div>
        </div>

        <form onSubmit={handleSend} className="space-y-3">
          {/* Authentication: OTP code input */}
          {isAuth && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">OTP / verification code</label>
              <input
                type="text"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                placeholder="e.g. 483921"
                autoFocus
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono tracking-widest"
              />
              <p className="text-xs text-gray-500">This code will appear in the WhatsApp message with a "Copy Code" button.</p>
            </div>
          )}

          {/* Non-auth: body variable inputs */}
          {!isAuth && varIndices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fill in variables</p>
              {varIndices.map((idx, pos) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded shrink-0 text-gray-600">{`{{${idx}}}`}</span>
                  <input
                    type="text"
                    value={varValues[pos] ?? ''}
                    onChange={e => {
                      const next = [...varValues];
                      next[pos] = e.target.value;
                      setVarValues(next);
                    }}
                    placeholder={`Value for {{${idx}}}`}
                    className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Phone number */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Recipient phone number</label>
            <input
              type="text"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="+919876543210"
              autoFocus={!isAuth && varIndices.length === 0}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <p className="text-xs text-gray-500">Include country code, e.g. +91 for India.</p>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ManageTemplates() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [testTarget, setTestTarget] = useState<TemplateRecord | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ templates: TemplateRecord[] }>({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates'),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => { toast.success('Template deleted'); qc.invalidateQueries({ queryKey: ['templates'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const templates = data?.templates ?? [];

  const filtered = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || t.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'APPROVED': return 'bg-green-100 text-green-700 border-green-200';
      case 'PENDING': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'REJECTED': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getHeaderIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'IMAGE': return <ImageIcon className="w-4 h-4" />;
      case 'VIDEO': return <Video className="w-4 h-4" />;
      case 'DOCUMENT': return <FileText className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {testTarget && (
        <SendTestDialog template={testTarget} onClose={() => setTestTarget(null)} />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Templates</h1>
          <p className="text-sm text-gray-500">View and manage your WhatsApp message templates</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 border rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            title="Sync statuses from Meta"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/add-template')}
            className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            Create Template
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border">
        <input
          type="text"
          placeholder="Search templates..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg text-sm bg-white outline-none w-full sm:w-48"
        >
          <option value="All">All Statuses</option>
          <option value="APPROVED">Approved</option>
          <option value="PENDING">Pending</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading templates…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(t => (
              <div key={t.id} className="bg-white rounded-xl border flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5 border-b">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-gray-900 truncate pr-2 font-mono text-sm">{t.name}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(t.status)}`}>
                      {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs text-gray-500 mb-4">
                    <span className="px-2 py-1 bg-gray-100 rounded">{t.category.charAt(0) + t.category.slice(1).toLowerCase()}</span>
                    <span className="px-2 py-1 bg-gray-100 rounded">{t.language}</span>
                  </div>

                  {/* WhatsApp Bubble Preview */}
                  <div className="bg-[#efeae2] p-3 rounded-lg">
                    <div className="bg-white rounded-lg p-3 shadow-sm text-sm text-gray-800">
                      {t.headerType && t.headerType !== 'NONE' && (
                        <div className="w-full h-16 bg-gray-200 rounded mb-2 flex items-center justify-center text-gray-400">
                          {getHeaderIcon(t.headerType)}
                        </div>
                      )}
                      <p className="line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                    </div>
                  </div>

                  {t.status.toUpperCase() === 'REJECTED' && t.rejectionReason && (
                    <div className="mt-3 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-100 flex items-start gap-1.5">
                      <HelpCircle className="w-4 h-4 shrink-0" />
                      <span>{t.rejectionReason}</span>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 p-3 flex justify-between items-center mt-auto">
                  <span className="text-xs text-gray-500">
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—'}
                  </span>
                  <div className="flex gap-1">
                    {t.status.toUpperCase() === 'APPROVED' && (
                      <button
                        onClick={() => setTestTarget(t)}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                        title="Send test message"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete template "${t.name}"? This will also remove it from Meta.`)) {
                          deleteMutation.mutate(t.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">
                {templates.length === 0 ? 'No templates yet' : 'No templates match your filters'}
              </h3>
              <p className="text-gray-500 mt-1">
                {templates.length === 0
                  ? 'Create your first template to get started.'
                  : 'Try adjusting your search or status filter.'}
              </p>
              {templates.length === 0 && (
                <button
                  onClick={() => navigate('/add-template')}
                  className="mt-4 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90"
                >
                  Create Template
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
