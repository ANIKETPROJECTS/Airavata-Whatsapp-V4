import { useState } from 'react';
import { Search, X, GripVertical } from 'lucide-react';
import {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow,
  ShoppingBag, AlertTriangle,
} from 'lucide-react';
import { NODE_DEFS, CATEGORIES, type NodeDef } from './nodeConfig';

const ICONS: Record<string, React.ElementType> = {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow,
  ShoppingBag, AlertTriangle,
};

interface Props {
  onAddNode: (type: string) => void;
}

function NodeCard({ def, onAddNode }: { def: NodeDef; onAddNode: (type: string) => void }) {
  const Icon = ICONS[def.icon] ?? MessageSquare;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', def.type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={() => onAddNode(def.type)}
      className="group flex items-center gap-2.5 mx-2 px-2 py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-all border border-transparent hover:border-gray-200 hover:shadow-sm"
      title={def.description}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
        style={{ backgroundColor: def.bg }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: def.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-800 truncate leading-tight">{def.label}</p>
        <p className="text-[9px] text-gray-400 truncate leading-tight mt-0.5">{def.description}</p>
      </div>
      <GripVertical className="w-3 h-3 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  trigger: '#6d28d9',
  message: '#059669',
  action: '#ca8a04',
  logic: '#ea580c',
  advanced: '#dc2626',
};

export default function NodeSidebar({ onAddNode }: Props) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = NODE_DEFS.filter(d =>
    d.label.toLowerCase().includes(search.toLowerCase()) ||
    d.description.toLowerCase().includes(search.toLowerCase())
  );

  const toggleCategory = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="w-52 h-full bg-white border-r border-gray-200 flex flex-col shrink-0 shadow-sm">
      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Node Library</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-7 pr-7 py-1.5 text-[11px] border border-gray-200 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-gray-50 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto py-1.5 scrollbar-thin">
        {search ? (
          <div className="py-1">
            {filtered.length === 0 ? (
              <div className="text-center py-6 px-3">
                <p className="text-xs text-gray-400">No nodes match</p>
                <p className="text-[10px] text-gray-300 mt-1">"{search}"</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map(def => <NodeCard key={def.type} def={def} onAddNode={onAddNode} />)}
              </div>
            )}
          </div>
        ) : (
          CATEGORIES.map(cat => {
            const nodes = NODE_DEFS.filter(d => d.category === cat.key);
            if (!nodes.length) return null;
            const isCollapsed = collapsed.has(cat.key);
            return (
              <div key={cat.key} className="mb-1">
                <button
                  onClick={() => toggleCategory(cat.key)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-[10px]">{cat.emoji}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CATEGORY_COLORS[cat.key] }}>
                    {cat.label}
                  </span>
                  <span className="text-[9px] text-gray-300 ml-auto">{nodes.length}</span>
                  <span className={`text-[9px] text-gray-300 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5 pb-1">
                    {nodes.map(def => <NodeCard key={def.type} def={def} onAddNode={onAddNode} />)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-[9px] text-gray-400 text-center">
          Drag to canvas or click to add
        </p>
      </div>
    </div>
  );
}
