import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, Eye } from 'lucide-react';
import { NODE_DEF_MAP } from './nodeConfig';

interface Props {
  node: { id: string; type: string; data: Record<string, unknown> } | null;
  onChange: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 text-xs border rounded-lg outline-none focus:border-primary bg-white';
const selectCls = 'w-full px-2.5 py-1.5 text-xs border rounded-lg outline-none focus:border-primary bg-white appearance-none';

function StartConfig({ data, update }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Flow Name">
        <input className={inputCls} value={String(data.label ?? '')} onChange={e => update({ label: e.target.value })} placeholder="My Flow" />
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={2} value={String(data.description ?? '')} onChange={e => update({ description: e.target.value })} placeholder="What does this flow do?" />
      </Field>
    </>
  );
}

function KeywordConfig({ data, update }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void }) {
  const keywords = (data.keywords as string[] | undefined) ?? [];
  const [kw, setKw] = useState('');

  return (
    <>
      <Field label="Match Type">
        <div className="relative">
          <select className={selectCls} value={String(data.matchType ?? 'contains')} onChange={e => update({ matchType: e.target.value })}>
            <option value="exact">Exact match</option>
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
            <option value="regex">Regex</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Keywords">
        <div className="flex gap-1 mb-1.5">
          <input className={inputCls} value={kw} onChange={e => setKw(e.target.value)} placeholder="Add keyword..." onKeyDown={e => { if (e.key === 'Enter' && kw.trim()) { update({ keywords: [...keywords, kw.trim()] }); setKw(''); } }} />
          <button onClick={() => { if (kw.trim()) { update({ keywords: [...keywords, kw.trim()] }); setKw(''); } }} className="px-2 bg-primary text-white rounded-lg text-xs">+</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {keywords.map((k, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded-full">
              {k}
              <button onClick={() => update({ keywords: keywords.filter((_, j) => j !== i) })}><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
        </div>
      </Field>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!data.caseSensitive} onChange={e => update({ caseSensitive: e.target.checked })} className="accent-primary" />
        <span className="text-xs text-gray-600">Case sensitive</span>
      </label>
    </>
  );
}

function TextReplyConfig({ data, update }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Message">
        <textarea className={inputCls} rows={4} value={String(data.message ?? '')} onChange={e => update({ message: e.target.value })} placeholder="Type your message... Use {{contact.name}} for variables" />
      </Field>
      <Field label="Typing Delay (seconds)">
        <input type="number" min={0} max={10} className={inputCls} value={Number(data.typingDelay ?? 1)} onChange={e => update({ typingDelay: Number(e.target.value) })} />
      </Field>
      {/* WhatsApp preview */}
      {data.message && (
        <div className="bg-[#e9f5fb] rounded-xl p-3 mt-1">
          <p className="text-[10px] font-semibold text-gray-500 mb-2 flex items-center gap-1"><Eye className="w-3 h-3" /> WhatsApp Preview</p>
          <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm max-w-[90%]">
            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{String(data.message)}</p>
            <p className="text-[9px] text-gray-400 text-right mt-0.5">12:00 PM</p>
          </div>
        </div>
      )}
    </>
  );
}

function MediaReplyConfig({ data, update }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Media Type">
        <div className="relative">
          <select className={selectCls} value={String(data.mediaType ?? 'image')} onChange={e => update({ mediaType: e.target.value })}>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
            <option value="audio">Audio</option>
            <option value="sticker">Sticker</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Media URL">
        <input className={inputCls} value={String(data.mediaUrl ?? '')} onChange={e => update({ mediaUrl: e.target.value })} placeholder="https://example.com/image.jpg" />
      </Field>
      <Field label="Caption">
        <textarea className={inputCls} rows={2} value={String(data.caption ?? '')} onChange={e => update({ caption: e.target.value })} placeholder="Optional caption..." />
      </Field>
    </>
  );
}

function CtaButtonConfig({ data, update }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void }) {
  const buttons = (data.buttons as Array<{ id: string; title: string }> | undefined) ?? [];
  return (
    <>
      <Field label="Body Text">
        <textarea className={inputCls} rows={3} value={String(data.body ?? '')} onChange={e => update({ body: e.target.value })} placeholder="Message body..." />
      </Field>
      <Field label="Footer">
        <input className={inputCls} value={String(data.footer ?? '')} onChange={e => update({ footer: e.target.value })} placeholder="Optional footer..." />
      </Field>
      <Field label="Buttons (max 3)">
        <div className="space-y-1.5">
          {buttons.map((btn, i) => (
            <div key={btn.id} className="flex gap-1.5 items-center">
              <input className={`${inputCls} flex-1`} value={btn.title} onChange={e => update({ buttons: buttons.map((b, j) => j === i ? { ...b, title: e.target.value } : b) })} placeholder={`Button ${i + 1}`} />
              <button onClick={() => update({ buttons: buttons.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button onClick={() => update({ buttons: [...buttons, { id: String(Date.now()), title: '' }] })} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add Button
            </button>
          )}
        </div>
      </Field>
    </>
  );
}

function ConditionConfig({ data, update }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void }) {
  const conditions = (data.conditions as Array<{ field: string; operator: string; value: string }> | undefined) ?? [];
  return (
    <>
      <Field label="Logic">
        <div className="flex gap-2">
          {['AND', 'OR'].map(l => (
            <label key={l} className={`flex-1 text-center py-1 text-xs rounded-lg cursor-pointer border transition-colors ${data.logicType === l ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <input type="radio" name="logic" value={l} checked={data.logicType === l} onChange={() => update({ logicType: l })} className="hidden" />
              {l}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Conditions">
        <div className="space-y-2">
          {conditions.map((cond, i) => (
            <div key={i} className="grid grid-cols-3 gap-1 items-center">
              <input className={inputCls} value={cond.field} onChange={e => update({ conditions: conditions.map((c, j) => j === i ? { ...c, field: e.target.value } : c) })} placeholder="Field" />
              <div className="relative">
                <select className={selectCls} value={cond.operator} onChange={e => update({ conditions: conditions.map((c, j) => j === i ? { ...c, operator: e.target.value } : c) })}>
                  <option value="equals">=</option>
                  <option value="not_equals">≠</option>
                  <option value="contains">Contains</option>
                  <option value="greater">{'>'}</option>
                  <option value="less">{'<'}</option>
                </select>
              </div>
              <div className="flex gap-0.5">
                <input className={`${inputCls} flex-1`} value={cond.value} onChange={e => update({ conditions: conditions.map((c, j) => j === i ? { ...c, value: e.target.value } : c) })} placeholder="Value" />
                <button onClick={() => update({ conditions: conditions.filter((_, j) => j !== i) })} className="text-red-400"><X className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
          <button onClick={() => update({ conditions: [...conditions, { field: '', operator: 'equals', value: '' }] })} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="w-3 h-3" /> Add Condition
          </button>
        </div>
      </Field>
    </>
  );
}

function CustomApiConfig({ data, update }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void }) {
  const headers = (data.headers as Array<{ key: string; value: string }> | undefined) ?? [];
  return (
    <>
      <Field label="Method & URL">
        <div className="flex gap-1.5">
          <div className="relative w-24 shrink-0">
            <select className={selectCls} value={String(data.method ?? 'GET')} onChange={e => update({ method: e.target.value })}>
              {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
          <input className={`${inputCls} flex-1`} value={String(data.url ?? '')} onChange={e => update({ url: e.target.value })} placeholder="https://api.example.com/..." />
        </div>
      </Field>
      <Field label="Headers">
        <div className="space-y-1">
          {headers.map((h, i) => (
            <div key={i} className="flex gap-1">
              <input className={`${inputCls} flex-1`} value={h.key} onChange={e => update({ headers: headers.map((hh, j) => j === i ? { ...hh, key: e.target.value } : hh) })} placeholder="Key" />
              <input className={`${inputCls} flex-1`} value={h.value} onChange={e => update({ headers: headers.map((hh, j) => j === i ? { ...hh, value: e.target.value } : hh) })} placeholder="Value" />
              <button onClick={() => update({ headers: headers.filter((_, j) => j !== i) })} className="text-red-400"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => update({ headers: [...headers, { key: '', value: '' }] })} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="w-3 h-3" /> Add Header</button>
        </div>
      </Field>
      <Field label="Body (JSON)">
        <textarea className={`${inputCls} font-mono`} rows={3} value={String(data.body ?? '')} onChange={e => update({ body: e.target.value })} placeholder='{"key": "value"}' />
      </Field>
    </>
  );
}

function GenericConfig({ data, update, type }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; type: string }) {
  const def = NODE_DEF_MAP[type];
  const keys = Object.keys(data).filter(k => !['label'].includes(k));
  return (
    <>
      {keys.map(key => (
        <Field key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}>
          {typeof data[key] === 'boolean' ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={data[key] as boolean} onChange={e => update({ [key]: e.target.checked })} className="accent-primary" />
              <span className="text-xs text-gray-600">Enabled</span>
            </label>
          ) : typeof data[key] === 'number' ? (
            <input type="number" className={inputCls} value={data[key] as number} onChange={e => update({ [key]: Number(e.target.value) })} />
          ) : (
            <input className={inputCls} value={String(data[key] ?? '')} onChange={e => update({ [key]: e.target.value })} placeholder={`Enter ${key}...`} />
          )}
        </Field>
      ))}
      {!keys.length && (
        <p className="text-xs text-gray-400 text-center py-4">No configuration needed for {def?.label ?? type}.</p>
      )}
    </>
  );
}

export default function ConfigPanel({ node, onChange, onClose }: Props) {
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
      case 'ctaButton': return <CtaButtonConfig data={localData} update={update} />;
      case 'condition': return <ConditionConfig data={localData} update={update} />;
      case 'customApi': return <CustomApiConfig data={localData} update={update} />;
      default: return <GenericConfig data={localData} update={update} type={node.type} />;
    }
  };

  return (
    <div className="w-64 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: def?.color }} />
          <span className="text-sm font-semibold text-gray-800">{def?.label ?? node.type}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded p-0.5 hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Node label */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Node Label</label>
        <input
          className="mt-1 w-full px-2.5 py-1.5 text-xs border rounded-lg outline-none focus:border-primary bg-white"
          value={String(localData.label ?? def?.label ?? '')}
          onChange={e => update({ label: e.target.value })}
          placeholder="Node label..."
        />
      </div>

      {/* Config content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {renderConfig()}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-[10px] text-gray-400 text-center">Changes auto-apply</p>
      </div>
    </div>
  );
}
