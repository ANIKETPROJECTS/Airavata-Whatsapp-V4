import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow,
  ShoppingBag, ChevronRight,
} from 'lucide-react';
import { NODE_DEF_MAP } from './nodeConfig';

const ICONS: Record<string, React.ElementType> = {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow,
  ShoppingBag,
};

function getPreview(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'start': return String(data.description || 'Flow entry point');
    case 'keyword': return Array.isArray(data.keywords) && data.keywords.length
      ? (data.keywords as string[]).join(', ')
      : 'No keywords set';
    case 'textReply': return String(data.message || 'No message set');
    case 'mediaReply': return `${data.mediaType || 'image'} • ${data.mediaUrl ? 'URL set' : 'No URL'}`;
    case 'listReply': return String(data.body || 'Interactive list');
    case 'ctaButton': return String(data.body || 'Button message');
    case 'template': return String(data.templateName || 'No template selected');
    case 'tag': return `${data.action === 'remove' ? 'Remove' : 'Add'} tags`;
    case 'condition': return `${data.logicType || 'AND'} condition branch`;
    case 'assignAgent': return data.agentId ? 'Agent assigned' : 'No agent selected';
    case 'customApi': return `${data.method || 'GET'} ${String(data.url || 'No URL')}`;
    case 'attribute': return 'Set contact attributes';
    case 'location': return data.action === 'send' ? 'Send location' : 'Request location';
    case 'integration': return String(data.service || 'No service selected');
    case 'flowReply': return String(data.ctaLabel || 'Open Form');
    case 'catalog': return 'Send product catalog';
    default: return '';
  }
}

export const ChatbotNode = memo(({ data, selected, type }: {
  data: Record<string, unknown>;
  selected: boolean;
  type: string;
}) => {
  const def = NODE_DEF_MAP[type];
  if (!def) return null;
  const Icon = ICONS[def.icon] ?? MessageSquare;
  const preview = getPreview(type, data);
  const isStart = type === 'start';
  const isCondition = type === 'condition';

  return (
    <div
      className={`relative rounded-xl shadow-md transition-all min-w-[200px] max-w-[240px] ${
        selected
          ? 'ring-2 ring-offset-2 shadow-lg scale-[1.02]'
          : 'hover:shadow-lg hover:scale-[1.01]'
      }`}
      style={{ ringColor: def.color }}
    >
      {/* Target handle (top) */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: def.color, width: 10, height: 10, border: '2px solid white', top: -5 }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: def.color }}
      >
        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-white text-xs font-semibold truncate flex-1">{String(data.label || def.label)}</span>
        {selected && (
          <div className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
        )}
      </div>

      {/* Body */}
      <div className="bg-white rounded-b-xl px-3 py-2.5 border border-t-0 border-gray-100">
        <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{preview}</p>

        {/* Condition branch labels */}
        {isCondition && (
          <div className="mt-2 flex gap-2">
            <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">TRUE</span>
            <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">FALSE</span>
          </div>
        )}
      </div>

      {/* Source handles */}
      {isCondition ? (
        <>
          {/* True branch (left) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ background: '#16a34a', width: 10, height: 10, border: '2px solid white', left: '30%', bottom: -5 }}
          />
          {/* False branch (right) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ background: '#dc2626', width: 10, height: 10, border: '2px solid white', left: '70%', bottom: -5 }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: def.color, width: 10, height: 10, border: '2px solid white', bottom: -5 }}
        />
      )}

      {/* Selected ring overlay */}
      {selected && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ boxShadow: `0 0 0 2px ${def.color}` }}
        />
      )}
    </div>
  );
});

ChatbotNode.displayName = 'ChatbotNode';

// Build nodeTypes map for React Flow
import { NODE_DEFS } from './nodeConfig';

export const nodeTypes = Object.fromEntries(
  NODE_DEFS.map(def => [
    def.type,
    memo((props: { data: Record<string, unknown>; selected: boolean }) =>
      <ChatbotNode {...props} type={def.type} />
    ),
  ])
);
