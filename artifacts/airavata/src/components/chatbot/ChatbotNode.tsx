import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow,
  ShoppingBag, AlertTriangle, ChevronRight, FileText, Phone,
} from 'lucide-react';
import { NODE_DEF_MAP } from './nodeConfig';

const ICONS: Record<string, React.ElementType> = {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow,
  ShoppingBag, AlertTriangle, FileText, Phone,
};

// ── WhatsApp-style previews per node type ──────────────────────────────────
function NodePreview({ type, data }: { type: string; data: Record<string, unknown> }) {
  switch (type) {
    case 'start':
      return (
        <p className="text-[10px] text-gray-400 italic leading-relaxed">
          {String(data.description || 'Flow entry point')}
        </p>
      );

    case 'keyword': {
      const kws = Array.isArray(data.keywords) ? (data.keywords as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {kws.length === 0
            ? <span className="text-[10px] text-gray-400 italic">No keywords</span>
            : kws.slice(0, 4).map((k, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-medium rounded-full border border-violet-200">
                  {k}
                </span>
              ))
          }
          {kws.length > 4 && <span className="text-[9px] text-gray-400">+{kws.length - 4}</span>}
        </div>
      );
    }

    case 'textReply': {
      const msg = String(data.message || '');
      return (
        <div className="bg-[#dcf8c6] rounded-lg rounded-tl-none px-2 py-1.5 max-w-full shadow-sm">
          <p className="text-[10px] text-gray-800 leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {msg || <span className="italic text-gray-400">No message</span>}
          </p>
          <p className="text-[8px] text-gray-500 text-right mt-0.5">12:00 ✓✓</p>
        </div>
      );
    }

    case 'mediaReply': {
      const type2 = String(data.mediaType || 'image');
      const icons: Record<string, string> = { image: '🖼️', video: '🎥', document: '📄', audio: '🎵', sticker: '🎭' };
      return (
        <div className="bg-[#dcf8c6] rounded-lg rounded-tl-none overflow-hidden shadow-sm">
          <div className="bg-gray-100 h-10 flex items-center justify-center gap-1.5">
            <span className="text-base">{icons[type2] ?? '📎'}</span>
            <span className="text-[10px] text-gray-500 font-medium capitalize">{type2}</span>
          </div>
          {data.caption && (
            <p className="text-[10px] text-gray-700 px-2 py-1 leading-relaxed line-clamp-1">{String(data.caption)}</p>
          )}
          <p className="text-[8px] text-gray-500 text-right px-2 pb-1">12:00 ✓✓</p>
        </div>
      );
    }

    case 'listReply': {
      const sections = (data.sections as Array<{ title: string; rows: Array<{ title: string }> }> | undefined) ?? [];
      const firstRows = sections[0]?.rows?.slice(0, 2) ?? [];
      return (
        <div className="bg-[#dcf8c6] rounded-lg rounded-tl-none shadow-sm overflow-hidden">
          {data.body && <p className="text-[10px] text-gray-800 px-2 pt-1.5 line-clamp-1">{String(data.body)}</p>}
          <div className="border-t border-gray-200 mt-1">
            {firstRows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 border-b border-gray-100 last:border-0">
                <span className="text-[9px] text-gray-700">{r.title}</span>
                <ChevronRight className="w-2.5 h-2.5 text-gray-400" />
              </div>
            ))}
            {sections[0]?.rows && sections[0].rows.length > 2 && (
              <p className="text-[9px] text-gray-400 px-2 py-0.5">+{sections[0].rows.length - 2} more</p>
            )}
          </div>
          <div className="border-t border-gray-200 px-2 py-1 text-center">
            <span className="text-[10px] text-[#128C7E] font-medium flex items-center justify-center gap-1">
              <List className="w-2.5 h-2.5" />
              {String(data.buttonText || 'Choose')}
            </span>
          </div>
        </div>
      );
    }

    case 'ctaButton': {
      const buttons = (data.buttons as Array<{ title: string }> | undefined) ?? [];
      return (
        <div className="bg-[#dcf8c6] rounded-lg rounded-tl-none shadow-sm overflow-hidden">
          {data.body && <p className="text-[10px] text-gray-800 px-2 pt-1.5 pb-1 line-clamp-2">{String(data.body)}</p>}
          {buttons.length > 0 && (
            <div className="border-t border-gray-200">
              {buttons.slice(0, 3).map((b, i) => (
                <div key={i} className="text-center py-1 border-b border-gray-100 last:border-0">
                  <span className="text-[10px] text-[#128C7E] font-medium">{b.title || `Button ${i + 1}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'template':
      return (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-indigo-400 font-semibold uppercase tracking-wider mb-0.5">Template</p>
          <p className="text-[10px] text-indigo-800 font-medium truncate">
            {String(data.templateName || 'Not selected')}
          </p>
          <p className="text-[9px] text-indigo-400">{String(data.language || 'en_US')}</p>
        </div>
      );

    case 'tag': {
      const tags = (data.tags as string[] | undefined) ?? [];
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${data.action === 'remove' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
            {data.action === 'remove' ? '− Remove' : '+ Add'}
          </span>
          {tags.slice(0, 3).map((t, i) => (
            <span key={i} className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">{t}</span>
          ))}
          {tags.length === 0 && <span className="text-[10px] text-gray-400 italic">No tags set</span>}
        </div>
      );
    }

    case 'condition': {
      const conds = (data.conditions as Array<{ field: string; operator: string; value: string }> | undefined) ?? [];
      return (
        <div className="space-y-1">
          {conds.slice(0, 2).map((c, i) => (
            <div key={i} className="bg-orange-50 border border-orange-100 rounded px-1.5 py-0.5">
              <p className="text-[9px] text-orange-700 truncate font-mono">
                {c.field || 'field'} {c.operator === 'equals' ? '=' : c.operator} {c.value || '?'}
              </p>
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">✓ True</span>
            <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">✗ False</span>
          </div>
        </div>
      );
    }

    case 'assignAgent':
      return (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
          <UserCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <div>
            <p className="text-[10px] text-blue-800 font-medium">
              {data.assignType === 'team' ? 'Assign to Team' : data.agentId ? 'Agent assigned' : 'No agent selected'}
            </p>
            {data.note && <p className="text-[9px] text-blue-400 truncate">{String(data.note)}</p>}
          </div>
        </div>
      );

    case 'customApi':
      return (
        <div className="bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 font-mono">
          <div className="flex items-center gap-1">
            <span className={`text-[9px] font-bold px-1 rounded ${
              data.method === 'GET' ? 'bg-green-100 text-green-700' :
              data.method === 'POST' ? 'bg-blue-100 text-blue-700' :
              data.method === 'PUT' ? 'bg-yellow-100 text-yellow-700' :
              data.method === 'DELETE' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>{String(data.method || 'GET')}</span>
            <span className="text-[9px] text-gray-600 truncate">{String(data.url || 'No URL set')}</span>
          </div>
        </div>
      );

    case 'attribute': {
      const attrs = (data.attributes as Array<{ name: string; value: string }> | undefined) ?? [];
      return (
        <div className="space-y-0.5">
          {attrs.slice(0, 2).map((a, i) => (
            <div key={i} className="flex items-center gap-1 bg-violet-50 rounded px-1.5 py-0.5">
              <span className="text-[9px] text-violet-700 font-medium truncate">{a.name || 'attribute'}</span>
              <span className="text-[9px] text-gray-400">=</span>
              <span className="text-[9px] text-violet-500 truncate">{a.value || '?'}</span>
            </div>
          ))}
          {attrs.length === 0 && <span className="text-[10px] text-gray-400 italic">No attributes set</span>}
        </div>
      );
    }

    case 'location':
      return (
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-2 py-1.5">
          <MapPin className="w-3.5 h-3.5 text-green-600 shrink-0" />
          <p className="text-[10px] text-green-800">
            {data.action === 'send' ? `Send: ${data.locationName || 'Location'}` : 'Request location'}
          </p>
        </div>
      );

    case 'integration':
      return (
        <div className="flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-lg px-2 py-1.5">
          <Link className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <div>
            <p className="text-[10px] text-sky-800 font-medium">{String(data.service || 'No service')}</p>
            {data.action && <p className="text-[9px] text-sky-400">{String(data.action)}</p>}
          </div>
        </div>
      );

    case 'flowReply':
      return (
        <div className="bg-[#dcf8c6] rounded-lg rounded-tl-none shadow-sm overflow-hidden">
          {data.bodyText && <p className="text-[10px] text-gray-800 px-2 pt-1.5 pb-1 line-clamp-1">{String(data.bodyText)}</p>}
          <div className="border-t border-gray-200 px-2 py-1 text-center">
            <span className="text-[10px] text-[#128C7E] font-medium">{String(data.ctaLabel || 'Open Form')}</span>
          </div>
        </div>
      );

    case 'catalog':
      return (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
          <ShoppingBag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <p className="text-[10px] text-amber-800 line-clamp-1">
            {String(data.bodyText || 'Send product catalog')}
          </p>
        </div>
      );

    case 'errorHandler':
      return (
        <div className="space-y-1">
          <div className="bg-rose-50 border border-rose-100 rounded px-2 py-1">
            <p className="text-[9px] text-rose-600 line-clamp-1">{String(data.errorMessage || 'Error fallback message')}</p>
          </div>
          <div className="flex gap-2">
            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">↺ Retry ×{String(data.retryCount ?? 2)}</span>
            <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">↳ Fallback</span>
          </div>
        </div>
      );

    default:
      return <p className="text-[10px] text-gray-400 italic">Configure this node</p>;
  }
}

// ── Dynamic handle helpers ─────────────────────────────────────────────────

/** Returns per-row handles for a listReply node derived from its data. */
function getListReplyHandles(data: Record<string, unknown>) {
  const sections = (data.sections as Array<{ rows: Array<{ id: string; title: string }> }> | undefined) ?? [];
  return sections.flatMap((s) => s.rows ?? []).map((r) => ({ id: r.id, label: r.title }));
}

/** Returns per-button handles for a ctaButton node derived from its data. */
function getCtaButtonHandles(data: Record<string, unknown>) {
  const buttons = (data.buttons as Array<{ id: string; title: string }> | undefined) ?? [];
  return buttons.map((b) => ({ id: b.id, label: b.title }));
}

// ── Main node component ────────────────────────────────────────────────────
export const ChatbotNode = memo(({ data, selected, type }: {
  data: Record<string, unknown>;
  selected: boolean;
  type: string;
}) => {
  const def = NODE_DEF_MAP[type];
  if (!def) return null;
  const Icon = ICONS[def.icon] ?? MessageSquare;
  const isStart = type === 'start';

  // Determine output handles:
  //   - listReply / ctaButton: dynamic, derived from node data
  //   - other nodes with outputHandles: static from nodeConfig
  //   - everything else: single default handle
  const dynamicHandles: Array<{ id: string; label: string }> | null =
    type === 'listReply'
      ? getListReplyHandles(data)
      : type === 'ctaButton'
      ? getCtaButtonHandles(data)
      : null;

  const hasMultiOutputs =
    dynamicHandles != null
      ? dynamicHandles.length > 0
      : (def.outputHandles && def.outputHandles.length > 1);

  return (
    <div
      className={`relative rounded-xl shadow-md transition-all min-w-[220px] max-w-[260px] bg-white ${
        selected
          ? 'shadow-xl scale-[1.02]'
          : 'hover:shadow-lg hover:scale-[1.01]'
      }`}
      style={selected ? { outline: `2px solid ${def.color}`, outlineOffset: '2px' } : undefined}
    >
      {/* Target handle (top) */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: 'white',
            width: 12,
            height: 12,
            border: `2.5px solid ${def.color}`,
            top: -6,
            boxShadow: `0 0 0 2px ${def.color}22`,
          }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ background: `linear-gradient(135deg, ${def.color}, ${def.color}dd)` }}
      >
        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-white text-[11px] font-semibold truncate flex-1 leading-tight">
          {String(data.label || def.label)}
        </span>
        <span className="text-[8px] text-white/60 uppercase tracking-wider shrink-0">{def.category}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 rounded-b-xl border border-t-0 border-gray-100" style={{ borderColor: `${def.color}22` }}>
        <NodePreview type={type} data={data} />
      </div>

      {/* Source handles */}
      {hasMultiOutputs ? (
        // Render one handle per dynamic row/button OR per static outputHandle
        (dynamicHandles ?? def.outputHandles!.map((h) => ({ id: h.id, label: h.label, color: h.color }))).map((h, i, arr) => {
          const pct = ((i + 1) / (arr.length + 1)) * 100;
          const color = ('color' in h ? (h as { color: string }).color : null) ?? def.color;
          return (
            <div key={h.id}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={h.id}
                style={{
                  background: color,
                  width: 10,
                  height: 10,
                  border: '2px solid white',
                  bottom: -5,
                  left: `${pct}%`,
                  boxShadow: `0 0 0 2px ${color}44`,
                }}
              />
              <div
                className="absolute text-[8px] font-bold px-1 rounded truncate max-w-[60px]"
                style={{
                  bottom: -16,
                  left: `${pct}%`,
                  transform: 'translateX(-50%)',
                  color,
                  background: `${color}15`,
                }}
              >
                {h.label}
              </div>
            </div>
          );
        })
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: 'white',
            width: 12,
            height: 12,
            border: `2.5px solid ${def.color}`,
            bottom: -6,
            boxShadow: `0 0 0 2px ${def.color}22`,
          }}
        />
      )}
    </div>
  );
});

ChatbotNode.displayName = 'ChatbotNode';

import { NODE_DEFS } from './nodeConfig';

export const nodeTypes = Object.fromEntries(
  NODE_DEFS.map(def => [
    def.type,
    memo((props: { data: Record<string, unknown>; selected: boolean }) =>
      <ChatbotNode {...props} type={def.type} />
    ),
  ])
);
