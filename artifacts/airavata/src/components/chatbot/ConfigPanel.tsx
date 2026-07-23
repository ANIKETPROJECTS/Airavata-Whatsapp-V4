import { useState, useEffect } from 'react';
import {
  X, Plus, Trash2, ChevronDown, Eye, Play, Loader2, CheckCircle2,
  AlertCircle, Copy, ChevronRight,
} from 'lucide-react';
import { NODE_DEF_MAP } from './nodeConfig';
import { api } from '../../lib/api';

interface Props {
  node: { id: string; type: string; data: Record<string, unknown> } | null;
  onChange: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
  onDuplicate?: (id: string) => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
        {hint && <span className="text-[9px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const input = 'w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-white transition-colors';
const select = `${input} appearance-none`;

// ── WhatsApp preview bubble ────────────────────────────────────────────────
function WAPreview({ children, label = 'WhatsApp Preview' }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-100">
      <div className="bg-[#075E54] px-3 py-1.5 flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
          <Eye className="w-3 h-3 text-white" />
        </div>
        <span className="text-[10px] text-white font-medium">{label}</span>
      </div>
      <div className="bg-[#ECE5DD] p-3 min-h-10">
        {children}
      </div>
    </div>
  );
}

function WaBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg rounded-tl-none shadow-sm px-3 py-2 max-w-[90%] inline-block">
      {children}
      <p className="text-[8px] text-gray-400 text-right mt-0.5">12:00 ✓✓</p>
    </div>
  );
}

// ── Node-specific configs ──────────────────────────────────────────────────

function StartConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Flow Label">
        <input className={input} value={String(data.label ?? '')} onChange={e => update({ label: e.target.value })} placeholder="My Flow" />
      </Field>
      <Field label="Description" hint="Optional">
        <textarea className={input} rows={3} value={String(data.description ?? '')} onChange={e => update({ description: e.target.value })} placeholder="What does this flow do?" />
      </Field>
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <p className="text-[10px] text-blue-600 font-medium">💡 Tip</p>
        <p className="text-[10px] text-blue-500 mt-0.5">The Start node is the entry point. Connect it to a Keyword or leave it as the default trigger.</p>
      </div>
    </>
  );
}

function KeywordConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const keywords = (data.keywords as string[] | undefined) ?? [];
  const [kw, setKw] = useState('');
  const addKw = () => { if (kw.trim() && !keywords.includes(kw.trim())) { update({ keywords: [...keywords, kw.trim()] }); setKw(''); } };

  return (
    <>
      <Field label="Match Type">
        <div className="relative">
          <select className={select} value={String(data.matchType ?? 'contains')} onChange={e => update({ matchType: e.target.value })}>
            <option value="exact">Exact match</option>
            <option value="contains">Contains keyword</option>
            <option value="starts_with">Starts with</option>
            <option value="ends_with">Ends with</option>
            <option value="regex">Regular expression</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Keywords">
        <div className="flex gap-1.5 mb-2">
          <input className={`${input} flex-1`} value={kw} onChange={e => setKw(e.target.value)} placeholder="Type keyword, press Enter" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKw(); } }} />
          <button onClick={addKw} className="px-2.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 text-[10px] rounded-full border border-violet-200">
              {k}
              <button onClick={() => update({ keywords: keywords.filter((_, j) => j !== i) })} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          {keywords.length === 0 && <p className="text-[10px] text-gray-400 italic">No keywords yet</p>}
        </div>
      </Field>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={!!data.caseSensitive} onChange={e => update({ caseSensitive: e.target.checked })} className="accent-primary w-3.5 h-3.5" />
        <span className="text-xs text-gray-600">Case sensitive matching</span>
      </label>
    </>
  );
}

function TextReplyConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const msg = String(data.message ?? '');
  return (
    <>
      <Field label="Message" hint={`${msg.length}/4096`}>
        <textarea className={input} rows={5} value={msg} onChange={e => update({ message: e.target.value })} placeholder="Type your message... Use {{contact.name}} for variables" maxLength={4096} />
      </Field>
      <Field label="Typing Delay" hint="seconds">
        <input type="number" min={0} max={10} step={0.5} className={input} value={Number(data.typingDelay ?? 1)} onChange={e => update({ typingDelay: Number(e.target.value) })} />
      </Field>
      {msg && (
        <WAPreview>
          <WaBubble>
            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{msg}</p>
          </WaBubble>
        </WAPreview>
      )}
    </>
  );
}

function MediaReplyConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const mediaType = String(data.mediaType ?? 'image');
  const icons: Record<string, string> = { image: '🖼️', video: '🎥', document: '📄', audio: '🎵', sticker: '🎭' };

  return (
    <>
      <Field label="Media Type">
        <div className="grid grid-cols-5 gap-1">
          {['image', 'video', 'document', 'audio', 'sticker'].map(t => (
            <button
              key={t}
              onClick={() => update({ mediaType: t })}
              className={`py-2 rounded-lg text-center transition-colors border ${mediaType === t ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
            >
              <span className="text-sm block">{icons[t]}</span>
              <span className="text-[8px] capitalize block mt-0.5">{t}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Media URL">
        <input className={input} value={String(data.mediaUrl ?? '')} onChange={e => update({ mediaUrl: e.target.value })} placeholder="https://example.com/image.jpg" />
      </Field>
      {mediaType !== 'audio' && mediaType !== 'sticker' && (
        <Field label="Caption" hint="optional">
          <textarea className={input} rows={2} value={String(data.caption ?? '')} onChange={e => update({ caption: e.target.value })} placeholder="Optional caption..." />
        </Field>
      )}
      <WAPreview>
        <div className="bg-white rounded-lg rounded-tl-none overflow-hidden shadow-sm max-w-[90%]">
          <div className="bg-gray-100 h-16 flex items-center justify-center gap-2">
            <span className="text-xl">{icons[mediaType]}</span>
            {data.mediaUrl ? (
              <span className="text-[10px] text-gray-500">URL set</span>
            ) : (
              <span className="text-[10px] text-gray-400">No URL</span>
            )}
          </div>
          {data.caption && <p className="text-[10px] text-gray-700 px-2 py-1">{String(data.caption)}</p>}
          <p className="text-[8px] text-gray-400 text-right px-2 pb-1">12:00 ✓✓</p>
        </div>
      </WAPreview>
    </>
  );
}

function ListReplyConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const sections = (data.sections as Array<{ title: string; rows: Array<{ id: string; title: string; description: string }> }> | undefined) ?? [];

  const addSection = () => update({ sections: [...sections, { title: `Section ${sections.length + 1}`, rows: [{ id: String(Date.now()), title: 'Option 1', description: '' }] }] });
  const removeSection = (si: number) => update({ sections: sections.filter((_, i) => i !== si) });
  const updateSection = (si: number, key: string, val: string) => update({ sections: sections.map((s, i) => i === si ? { ...s, [key]: val } : s) });
  const addRow = (si: number) => update({ sections: sections.map((s, i) => i === si ? { ...s, rows: [...s.rows, { id: String(Date.now()), title: '', description: '' }] } : s) });
  const removeRow = (si: number, ri: number) => update({ sections: sections.map((s, i) => i === si ? { ...s, rows: s.rows.filter((_, j) => j !== ri) } : s) });
  const updateRow = (si: number, ri: number, key: string, val: string) => update({ sections: sections.map((s, i) => i === si ? { ...s, rows: s.rows.map((r, j) => j === ri ? { ...r, [key]: val } : r) } : s) });

  return (
    <>
      <Field label="Header" hint="optional">
        <input className={input} value={String(data.header ?? '')} onChange={e => update({ header: e.target.value })} placeholder="List header..." />
      </Field>
      <Field label="Body Text">
        <textarea className={input} rows={3} value={String(data.body ?? '')} onChange={e => update({ body: e.target.value })} placeholder="Describe the list options..." />
      </Field>
      <Field label="Footer" hint="optional">
        <input className={input} value={String(data.footer ?? '')} onChange={e => update({ footer: e.target.value })} placeholder="Footer text..." />
      </Field>
      <Field label="Button Label">
        <input className={input} value={String(data.buttonText ?? 'Choose')} onChange={e => update({ buttonText: e.target.value })} placeholder="Choose" maxLength={20} />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Sections & Rows</label>
          <button onClick={addSection} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
            <Plus className="w-3 h-3" /> Add Section
          </button>
        </div>
        <div className="space-y-3">
          {sections.map((section, si) => (
            <div key={si} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1.5 border-b border-gray-200">
                <input className="flex-1 text-[11px] font-medium bg-transparent outline-none text-gray-700 placeholder-gray-400" value={section.title} onChange={e => updateSection(si, 'title', e.target.value)} placeholder="Section title..." />
                <button onClick={() => removeSection(si)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
              <div className="p-1.5 space-y-1.5">
                {section.rows.map((row, ri) => (
                  <div key={row.id} className="flex gap-1.5 items-start">
                    <div className="flex-1 space-y-1">
                      <input className={`${input} py-1`} value={row.title} onChange={e => updateRow(si, ri, 'title', e.target.value)} placeholder="Row title (required)" />
                      <input className={`${input} py-1`} value={row.description} onChange={e => updateRow(si, ri, 'description', e.target.value)} placeholder="Description (optional)" />
                    </div>
                    <button onClick={() => removeRow(si, ri)} className="text-gray-400 hover:text-red-500 mt-1 shrink-0"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                {section.rows.length < 10 && (
                  <button onClick={() => addRow(si)} className="w-full py-1 text-[10px] text-primary hover:bg-primary/5 rounded border border-dashed border-primary/30 flex items-center justify-center gap-1">
                    <Plus className="w-3 h-3" /> Add Row
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.body && (
        <WAPreview>
          <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden max-w-[90%]">
            {data.body && <p className="text-[10px] text-gray-800 px-2 pt-2 pb-1">{String(data.body)}</p>}
            {sections[0]?.rows?.slice(0, 2).map((r, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 border-t border-gray-100">
                <span className="text-[10px] text-gray-700">{r.title || 'Option'}</span>
                <ChevronRight className="w-2.5 h-2.5 text-gray-400" />
              </div>
            ))}
            <div className="border-t border-gray-200 px-2 py-1.5 text-center">
              <span className="text-[10px] text-[#128C7E] font-medium">{String(data.buttonText || 'Choose')}</span>
            </div>
          </div>
        </WAPreview>
      )}
    </>
  );
}

function CtaButtonConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const buttons = (data.buttons as Array<{ id: string; title: string }> | undefined) ?? [];
  return (
    <>
      <Field label="Body Text">
        <textarea className={input} rows={4} value={String(data.body ?? '')} onChange={e => update({ body: e.target.value })} placeholder="Message body..." maxLength={1024} />
      </Field>
      <Field label="Footer" hint="optional">
        <input className={input} value={String(data.footer ?? '')} onChange={e => update({ footer: e.target.value })} placeholder="Optional footer text..." />
      </Field>
      <Field label="Buttons" hint="max 3">
        <div className="space-y-1.5">
          {buttons.map((btn, i) => (
            <div key={btn.id} className="flex gap-1.5 items-center">
              <input className={`${input} flex-1`} value={btn.title} onChange={e => update({ buttons: buttons.map((b, j) => j === i ? { ...b, title: e.target.value } : b) })} placeholder={`Button ${i + 1} label`} maxLength={20} />
              <button onClick={() => update({ buttons: buttons.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button onClick={() => update({ buttons: [...buttons, { id: String(Date.now()), title: '' }] })} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add Button
            </button>
          )}
        </div>
      </Field>
      {data.body && (
        <WAPreview>
          <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden max-w-[90%]">
            <div className="px-3 py-2">
              <p className="text-[10px] text-gray-800 leading-relaxed">{String(data.body)}</p>
              {data.footer && <p className="text-[9px] text-gray-400 mt-1">{String(data.footer)}</p>}
              <p className="text-[8px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
            </div>
            {buttons.length > 0 && (
              <div className="border-t border-gray-100">
                {buttons.map((b, i) => (
                  <div key={i} className="border-b border-gray-100 last:border-0 text-center py-1.5">
                    <span className="text-[10px] text-[#128C7E] font-medium">{b.title || `Button ${i + 1}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </WAPreview>
      )}
    </>
  );
}

function TemplateConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const variables = (data.variables as string[] | undefined) ?? [];
  return (
    <>
      <Field label="Template Name">
        <input className={input} value={String(data.templateName ?? '')} onChange={e => update({ templateName: e.target.value })} placeholder="e.g. order_confirmation" />
      </Field>
      <Field label="Language">
        <div className="relative">
          <select className={select} value={String(data.language ?? 'en_US')} onChange={e => update({ language: e.target.value })}>
            <option value="en_US">English (US)</option>
            <option value="en_GB">English (UK)</option>
            <option value="ar">Arabic</option>
            <option value="es_ES">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt_BR">Portuguese (BR)</option>
            <option value="hi">Hindi</option>
            <option value="id">Indonesian</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Header Variable" hint="optional">
        <input className={input} value={String(data.headerVar ?? '')} onChange={e => update({ headerVar: e.target.value })} placeholder="{{1}} value for header..." />
      </Field>
      <Field label="Body Variables" hint="one per line">
        <div className="space-y-1.5">
          {variables.map((v, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <span className="text-[10px] text-gray-400 w-6 shrink-0">{'{{' + (i + 1) + '}}'}</span>
              <input className={`${input} flex-1`} value={v} onChange={e => update({ variables: variables.map((vv, j) => j === i ? e.target.value : vv) })} placeholder={`Value for {{${i + 1}}}`} />
              <button onClick={() => update({ variables: variables.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => update({ variables: [...variables, ''] })} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="w-3 h-3" /> Add Variable
          </button>
        </div>
      </Field>
      <Field label="CTA URL" hint="optional">
        <input className={input} value={String(data.ctaUrl ?? '')} onChange={e => update({ ctaUrl: e.target.value })} placeholder="https://example.com" />
      </Field>
      {data.templateName && (
        <WAPreview>
          <div className="bg-white rounded-lg rounded-tl-none shadow-sm px-3 py-2 max-w-[90%]">
            <div className="bg-indigo-50 rounded px-2 py-1 mb-1.5">
              <p className="text-[9px] text-indigo-400 font-semibold uppercase">Template Header</p>
            </div>
            <p className="text-[10px] text-gray-800">{String(data.templateName)} <span className="text-[9px] text-gray-400">({String(data.language ?? 'en_US')})</span></p>
            {variables.map((v, i) => v && <p key={i} className="text-[9px] text-gray-500">{`{{${i + 1}}}: ${v}`}</p>)}
            <p className="text-[8px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
          </div>
        </WAPreview>
      )}
    </>
  );
}

function TagConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const tags = (data.tags as string[] | undefined) ?? [];
  const [newTag, setNewTag] = useState('');
  const addTag = () => { if (newTag.trim() && !tags.includes(newTag.trim())) { update({ tags: [...tags, newTag.trim()] }); setNewTag(''); } };

  return (
    <>
      <Field label="Action">
        <div className="flex gap-2">
          {['add', 'remove'].map(a => (
            <label key={a} className={`flex-1 text-center py-2 text-xs rounded-lg cursor-pointer border transition-colors font-medium ${data.action === a ? (a === 'add' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500') : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <input type="radio" className="hidden" value={a} checked={data.action === a} onChange={() => update({ action: a })} />
              {a === 'add' ? '+ Add Tags' : '− Remove Tags'}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Tags">
        <div className="flex gap-1.5 mb-2">
          <input className={`${input} flex-1`} value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Type tag name..." onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
          <button onClick={addTag} className="px-2.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <span key={i} className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border ${data.action === 'remove' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {t}
              <button onClick={() => update({ tags: tags.filter((_, j) => j !== i) })} className="hover:opacity-70"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          {tags.length === 0 && <p className="text-[10px] text-gray-400 italic">No tags yet</p>}
        </div>
      </Field>
    </>
  );
}

function AssignAgentConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Assign To">
        <div className="grid grid-cols-3 gap-1.5">
          {[['specific', '👤 Agent'], ['team', '👥 Team'], ['auto', '🔄 Auto']].map(([v, l]) => (
            <button key={v} onClick={() => update({ assignType: v })} className={`py-2 text-xs rounded-lg border transition-colors ${data.assignType === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      {data.assignType === 'specific' && (
        <Field label="Agent ID">
          <input className={input} value={String(data.agentId ?? '')} onChange={e => update({ agentId: e.target.value })} placeholder="Agent ID or username..." />
        </Field>
      )}
      {data.assignType === 'team' && (
        <Field label="Team ID">
          <input className={input} value={String(data.teamId ?? '')} onChange={e => update({ teamId: e.target.value })} placeholder="Team ID or name..." />
        </Field>
      )}
      <Field label="Priority">
        <div className="relative">
          <select className={select} value={String(data.priority ?? 'normal')} onChange={e => update({ priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Internal Note" hint="optional">
        <textarea className={input} rows={2} value={String(data.note ?? '')} onChange={e => update({ note: e.target.value })} placeholder="Note for the agent..." />
      </Field>
    </>
  );
}

function AttributeConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const attrs = (data.attributes as Array<{ name: string; operator: string; value: string }> | undefined) ?? [];
  const addAttr = () => update({ attributes: [...attrs, { name: '', operator: 'set', value: '' }] });
  const removeAttr = (i: number) => update({ attributes: attrs.filter((_, j) => j !== i) });
  const updateAttr = (i: number, key: string, val: string) => update({ attributes: attrs.map((a, j) => j === i ? { ...a, [key]: val } : a) });

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Attributes</label>
        <button onClick={addAttr} className="text-[10px] text-primary hover:underline flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add</button>
      </div>
      <div className="space-y-2">
        {attrs.map((a, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
            <div className="flex gap-1.5">
              <input className={`${input} flex-1`} value={a.name} onChange={e => updateAttr(i, 'name', e.target.value)} placeholder="Attribute name" />
              <button onClick={() => removeAttr(i)} className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex gap-1.5">
              <div className="relative w-28 shrink-0">
                <select className={select} value={a.operator} onChange={e => updateAttr(i, 'operator', e.target.value)}>
                  <option value="set">Set to</option>
                  <option value="append">Append</option>
                  <option value="increment">Increment</option>
                  <option value="decrement">Decrement</option>
                  <option value="clear">Clear</option>
                </select>
                <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400 pointer-events-none" />
              </div>
              {a.operator !== 'clear' && (
                <input className={`${input} flex-1`} value={a.value} onChange={e => updateAttr(i, 'value', e.target.value)} placeholder="Value or {{variable}}" />
              )}
            </div>
          </div>
        ))}
        {attrs.length === 0 && (
          <button onClick={addAttr} className="w-full py-3 text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg hover:border-primary hover:text-primary transition-colors">
            + Add first attribute
          </button>
        )}
      </div>
    </>
  );
}

function ConditionConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const conditions = (data.conditions as Array<{ field: string; operator: string; value: string }> | undefined) ?? [];
  const OPERATORS = [
    { value: 'equals', label: '= equals' },
    { value: 'not_equals', label: '≠ not equals' },
    { value: 'contains', label: '⊃ contains' },
    { value: 'not_contains', label: '⊅ not contains' },
    { value: 'starts_with', label: '↑ starts with' },
    { value: 'greater', label: '> greater than' },
    { value: 'less', label: '< less than' },
    { value: 'is_empty', label: '∅ is empty' },
    { value: 'is_not_empty', label: '∃ is not empty' },
  ];
  const FIELD_SUGGESTIONS = ['contact.name', 'contact.phone', 'contact.email', 'contact.tag', 'last_message', 'button_reply', 'list_reply', 'custom_attribute'];

  return (
    <>
      <Field label="Logic Operator">
        <div className="flex gap-2">
          {['AND', 'OR'].map(l => (
            <label key={l} className={`flex-1 text-center py-2 text-xs rounded-lg cursor-pointer border font-semibold transition-colors ${data.logicType === l ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <input type="radio" className="hidden" value={l} checked={data.logicType === l} onChange={() => update({ logicType: l })} />
              {l === 'AND' ? '🔒 AND (all)' : '🔓 OR (any)'}
            </label>
          ))}
        </div>
      </Field>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Conditions</label>
          <button onClick={() => update({ conditions: [...conditions, { field: '', operator: 'equals', value: '' }] })} className="text-[10px] text-primary hover:underline flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add</button>
        </div>
        <div className="space-y-2">
          {conditions.map((cond, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <input
                    list={`fields-${i}`}
                    className={input}
                    value={cond.field}
                    onChange={e => update({ conditions: conditions.map((c, j) => j === i ? { ...c, field: e.target.value } : c) })}
                    placeholder="contact.name"
                  />
                  <datalist id={`fields-${i}`}>
                    {FIELD_SUGGESTIONS.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>
                <button onClick={() => update({ conditions: conditions.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
              </div>
              <div className="relative">
                <select className={select} value={cond.operator} onChange={e => update({ conditions: conditions.map((c, j) => j === i ? { ...c, operator: e.target.value } : c) })}>
                  {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
              </div>
              {!['is_empty', 'is_not_empty'].includes(cond.operator) && (
                <input className={input} value={cond.value} onChange={e => update({ conditions: conditions.map((c, j) => j === i ? { ...c, value: e.target.value } : c) })} placeholder="Value or {{variable}}" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-orange-50 border border-orange-100 rounded-lg p-2.5">
        <p className="text-[10px] text-orange-700 font-medium mb-1">Output Handles</p>
        <div className="flex gap-2">
          <span className="text-[9px] px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">✓ True — conditions met</span>
          <span className="text-[9px] px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium">✗ False — conditions not met</span>
        </div>
      </div>
    </>
  );
}

function LocationConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Action">
        <div className="flex gap-2">
          {[['request', '📍 Request Location'], ['send', '🗺️ Send Location']].map(([v, l]) => (
            <button key={v} onClick={() => update({ action: v })} className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${data.action === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      {data.action === 'request' ? (
        <Field label="Request Message">
          <textarea className={input} rows={3} value={String(data.message ?? '')} onChange={e => update({ message: e.target.value })} placeholder="Please share your location" />
        </Field>
      ) : (
        <>
          <Field label="Location Name">
            <input className={input} value={String(data.locationName ?? '')} onChange={e => update({ locationName: e.target.value })} placeholder="e.g. Our Office" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <input type="number" step="any" className={input} value={String(data.lat ?? '')} onChange={e => update({ lat: e.target.value })} placeholder="40.7128" />
            </Field>
            <Field label="Longitude">
              <input type="number" step="any" className={input} value={String(data.lng ?? '')} onChange={e => update({ lng: e.target.value })} placeholder="-74.0060" />
            </Field>
          </div>
        </>
      )}
      {data.action === 'request' && data.message && (
        <WAPreview>
          <WaBubble>
            <p className="text-[10px] text-gray-800">{String(data.message)}</p>
          </WaBubble>
        </WAPreview>
      )}
    </>
  );
}

function IntegrationConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const mappings = (data.mappings as Array<{ from: string; to: string }> | undefined) ?? [];
  const SERVICES = ['Google Sheets', 'Notion', 'Airtable', 'HubSpot', 'Salesforce', 'Slack', 'Zapier', 'Make', 'Custom'];

  return (
    <>
      <Field label="Service">
        <div className="relative">
          <select className={select} value={String(data.service ?? '')} onChange={e => update({ service: e.target.value })}>
            <option value="">Select service...</option>
            {SERVICES.map(s => <option key={s} value={s.toLowerCase().replace(' ', '_')}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Action / Webhook URL">
        <input className={input} value={String(data.action ?? '')} onChange={e => update({ action: e.target.value })} placeholder="Action or URL..." />
      </Field>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Field Mappings</label>
          <button onClick={() => update({ mappings: [...mappings, { from: '', to: '' }] })} className="text-[10px] text-primary hover:underline flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add</button>
        </div>
        <div className="space-y-1.5">
          {mappings.map((m, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input className={`${input} flex-1`} value={m.from} onChange={e => update({ mappings: mappings.map((mm, j) => j === i ? { ...mm, from: e.target.value } : mm) })} placeholder="{{contact.field}}" />
              <span className="text-gray-400 text-xs shrink-0">→</span>
              <input className={`${input} flex-1`} value={m.to} onChange={e => update({ mappings: mappings.map((mm, j) => j === i ? { ...mm, to: e.target.value } : mm) })} placeholder="Target field" />
              <button onClick={() => update({ mappings: mappings.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FlowReplyConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="WhatsApp Flow ID">
        <input className={input} value={String(data.flowId ?? '')} onChange={e => update({ flowId: e.target.value })} placeholder="Meta Flow ID..." />
      </Field>
      <Field label="Mode">
        <div className="flex gap-2">
          {[['draft', '🔧 Draft'], ['published', '🚀 Published']].map(([v, l]) => (
            <button key={v} onClick={() => update({ mode: v })} className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${data.mode === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Header Text" hint="optional">
        <input className={input} value={String(data.headerText ?? '')} onChange={e => update({ headerText: e.target.value })} placeholder="Message header..." />
      </Field>
      <Field label="Body Text">
        <textarea className={input} rows={3} value={String(data.bodyText ?? '')} onChange={e => update({ bodyText: e.target.value })} placeholder="Message before the form CTA..." />
      </Field>
      <Field label="CTA Button Label">
        <input className={input} value={String(data.ctaLabel ?? 'Open Form')} onChange={e => update({ ctaLabel: e.target.value })} placeholder="Open Form" maxLength={20} />
      </Field>
      {data.bodyText && (
        <WAPreview>
          <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden max-w-[90%]">
            {data.headerText && <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-100"><p className="text-[10px] font-semibold text-gray-700">{String(data.headerText)}</p></div>}
            <div className="px-3 py-2">
              <p className="text-[10px] text-gray-800">{String(data.bodyText)}</p>
              <p className="text-[8px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
            </div>
            <div className="border-t border-gray-200 px-3 py-1.5 text-center">
              <span className="text-[10px] text-[#128C7E] font-medium">{String(data.ctaLabel || 'Open Form')}</span>
            </div>
          </div>
        </WAPreview>
      )}
    </>
  );
}

function CatalogConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const productIds = (data.productIds as string[] | undefined) ?? [];
  const [pid, setPid] = useState('');
  return (
    <>
      <Field label="Catalog ID" hint="Meta Commerce">
        <input className={input} value={String(data.catalogId ?? '')} onChange={e => update({ catalogId: e.target.value })} placeholder="Meta Catalog ID..." />
      </Field>
      <Field label="Body Text">
        <textarea className={input} rows={3} value={String(data.bodyText ?? '')} onChange={e => update({ bodyText: e.target.value })} placeholder="Check out our products!" />
      </Field>
      <Field label="Footer" hint="optional">
        <input className={input} value={String(data.footerText ?? '')} onChange={e => update({ footerText: e.target.value })} placeholder="Footer text..." />
      </Field>
      <Field label="Product IDs" hint="specific products (optional)">
        <div className="flex gap-1.5 mb-2">
          <input className={`${input} flex-1`} value={pid} onChange={e => setPid(e.target.value)} placeholder="Product retailer ID..." onKeyDown={e => { if (e.key === 'Enter' && pid.trim()) { update({ productIds: [...productIds, pid.trim()] }); setPid(''); } }} />
          <button onClick={() => { if (pid.trim()) { update({ productIds: [...productIds, pid.trim()] }); setPid(''); } }} className="px-2.5 bg-primary text-white rounded-lg text-xs">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {productIds.map((p, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded border border-amber-200">
              {p}
              <button onClick={() => update({ productIds: productIds.filter((_, j) => j !== i) })}><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
        </div>
      </Field>
    </>
  );
}

function CustomApiConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  const headers = (data.headers as Array<{ key: string; value: string }> | undefined) ?? [];
  const responseMapping = (data.responseMapping as Array<{ path: string; variable: string }> | undefined) ?? [];
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: number; elapsed: number; body: unknown; error?: string } | null>(
    data.testResult as { status: number; elapsed: number; body: unknown } | null
  );

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await api.post<{ status: number; elapsed: number; body: unknown; error?: string }>('/chatbot/test-api', {
        method: data.method,
        url: data.url,
        headers,
        body: data.body,
      });
      setTestResult(result);
      update({ testResult: result });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Request failed';
      setTestResult({ status: 0, elapsed: 0, body: null, error });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Field label="Method & URL">
        <div className="flex gap-1.5">
          <div className="relative w-24 shrink-0">
            <select className={select} value={String(data.method ?? 'GET')} onChange={e => update({ method: e.target.value })}>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400 pointer-events-none" />
          </div>
          <input className={`${input} flex-1`} value={String(data.url ?? '')} onChange={e => update({ url: e.target.value })} placeholder="https://api.example.com/..." />
        </div>
      </Field>
      <Field label="Headers">
        <div className="space-y-1.5">
          {headers.map((h, i) => (
            <div key={i} className="flex gap-1.5">
              <input className={`${input} flex-1`} value={h.key} onChange={e => update({ headers: headers.map((hh, j) => j === i ? { ...hh, key: e.target.value } : hh) })} placeholder="Key" />
              <input className={`${input} flex-1`} value={h.value} onChange={e => update({ headers: headers.map((hh, j) => j === i ? { ...hh, value: e.target.value } : hh) })} placeholder="Value" />
              <button onClick={() => update({ headers: headers.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => update({ headers: [...headers, { key: 'Content-Type', value: 'application/json' }] })} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3 h-3" /> Add Header</button>
        </div>
      </Field>
      {!['GET', 'HEAD'].includes(String(data.method ?? 'GET')) && (
        <Field label="Request Body">
          <textarea className={`${input} font-mono text-[10px]`} rows={4} value={String(data.body ?? '')} onChange={e => update({ body: e.target.value })} placeholder={'{"key": "{{variable}}"}'} />
        </Field>
      )}
      <Field label="Response Mapping">
        <div className="space-y-1.5">
          {responseMapping.map((m, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input className={`${input} flex-1`} value={m.path} onChange={e => update({ responseMapping: responseMapping.map((mm, j) => j === i ? { ...mm, path: e.target.value } : mm) })} placeholder="$.data.name" />
              <span className="text-gray-400 text-xs shrink-0">→</span>
              <input className={`${input} flex-1`} value={m.variable} onChange={e => update({ responseMapping: responseMapping.map((mm, j) => j === i ? { ...mm, variable: e.target.value } : mm) })} placeholder="{{variable}}" />
              <button onClick={() => update({ responseMapping: responseMapping.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => update({ responseMapping: [...responseMapping, { path: '', variable: '' }] })} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3 h-3" /> Map Response Field</button>
        </div>
      </Field>

      {/* API Test Button */}
      <button
        onClick={runTest}
        disabled={testing || !data.url}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors border border-primary text-primary hover:bg-primary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {testing ? 'Testing...' : 'Test API Request'}
      </button>

      {testResult && (
        <div className={`border rounded-lg overflow-hidden ${testResult.error || testResult.status >= 400 ? 'border-red-200' : 'border-green-200'}`}>
          <div className={`flex items-center justify-between px-3 py-1.5 ${testResult.error || testResult.status >= 400 ? 'bg-red-50' : 'bg-green-50'}`}>
            <div className="flex items-center gap-2">
              {testResult.error || testResult.status >= 400
                ? <AlertCircle className="w-3 h-3 text-red-500" />
                : <CheckCircle2 className="w-3 h-3 text-green-600" />
              }
              <span className={`text-[10px] font-semibold ${testResult.error || testResult.status >= 400 ? 'text-red-600' : 'text-green-700'}`}>
                {testResult.error ? 'Error' : `${testResult.status} OK`}
              </span>
            </div>
            {testResult.elapsed > 0 && <span className="text-[9px] text-gray-400">{testResult.elapsed}ms</span>}
          </div>
          <div className="p-2 bg-gray-50 max-h-32 overflow-auto">
            <pre className="text-[9px] text-gray-600 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {testResult.error ?? JSON.stringify(testResult.body, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

function ErrorHandlerConfig({ data, update }: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Error Message">
        <textarea className={input} rows={3} value={String(data.errorMessage ?? '')} onChange={e => update({ errorMessage: e.target.value })} placeholder="Sorry, something went wrong. Please try again." />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Max Retries">
          <input type="number" min={0} max={5} className={input} value={Number(data.retryCount ?? 2)} onChange={e => update({ retryCount: Number(e.target.value) })} />
        </Field>
        <Field label="Retry Delay (s)">
          <input type="number" min={0} max={30} className={input} value={Number(data.retryDelay ?? 3)} onChange={e => update({ retryDelay: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Fallback Flow ID" hint="optional">
        <input className={input} value={String(data.fallbackFlowId ?? '')} onChange={e => update({ fallbackFlowId: e.target.value })} placeholder="Flow ID to redirect on max retries..." />
      </Field>
      <div className="bg-rose-50 border border-rose-100 rounded-lg p-2.5">
        <p className="text-[10px] text-rose-700 font-medium mb-1">Output Handles</p>
        <div className="flex gap-2 flex-wrap">
          <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">↺ Retry — attempts remaining</span>
          <span className="text-[9px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">↳ Fallback — max retries reached</span>
        </div>
      </div>
    </>
  );
}

// ── Main config panel ──────────────────────────────────────────────────────
export default function ConfigPanel({ node, onChange, onClose, onDuplicate }: Props) {
  const [localData, setLocalData] = useState<Record<string, unknown>>(node?.data ?? {});

  useEffect(() => {
    setLocalData(node?.data ?? {});
  }, [node?.id]);

  if (!node) return null;

  const def = NODE_DEF_MAP[node.type];
  const update = (patch: Record<string, unknown>) => {
    const next = { ...localData, ...patch };
    setLocalData(next);
    onChange(node.id, next);
  };

  const renderConfig = () => {
    switch (node.type) {
      case 'start': return <StartConfig data={localData} update={update} />;
      case 'keyword': return <KeywordConfig data={localData} update={update} />;
      case 'textReply': return <TextReplyConfig data={localData} update={update} />;
      case 'mediaReply': return <MediaReplyConfig data={localData} update={update} />;
      case 'listReply': return <ListReplyConfig data={localData} update={update} />;
      case 'ctaButton': return <CtaButtonConfig data={localData} update={update} />;
      case 'template': return <TemplateConfig data={localData} update={update} />;
      case 'tag': return <TagConfig data={localData} update={update} />;
      case 'assignAgent': return <AssignAgentConfig data={localData} update={update} />;
      case 'attribute': return <AttributeConfig data={localData} update={update} />;
      case 'condition': return <ConditionConfig data={localData} update={update} />;
      case 'location': return <LocationConfig data={localData} update={update} />;
      case 'integration': return <IntegrationConfig data={localData} update={update} />;
      case 'flowReply': return <FlowReplyConfig data={localData} update={update} />;
      case 'catalog': return <CatalogConfig data={localData} update={update} />;
      case 'customApi': return <CustomApiConfig data={localData} update={update} />;
      case 'errorHandler': return <ErrorHandlerConfig data={localData} update={update} />;
      default: return <p className="text-xs text-gray-400 text-center py-4">No configuration available.</p>;
    }
  };

  return (
    <div className="w-72 h-full bg-white border-l border-gray-200 flex flex-col shrink-0 shadow-lg z-10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: def?.color }} />
          <div>
            <p className="text-[11px] font-bold text-gray-800">{def?.label ?? node.type}</p>
            <p className="text-[9px] text-gray-400 uppercase tracking-wide">{def?.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onDuplicate && (
            <button
              onClick={() => onDuplicate(node.id)}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
              title="Duplicate node (Ctrl+D)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Node label */}
      <div className="px-4 py-2.5 border-b border-gray-100">
        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Node Label</label>
        <input
          className="mt-1 w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-white transition-colors"
          value={String(localData.label ?? def?.label ?? '')}
          onChange={e => update({ label: e.target.value })}
          placeholder="Node label..."
        />
      </div>

      {/* Config content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {renderConfig()}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <p className="text-[9px] text-gray-400">Changes saved automatically</p>
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      </div>
    </div>
  );
}
