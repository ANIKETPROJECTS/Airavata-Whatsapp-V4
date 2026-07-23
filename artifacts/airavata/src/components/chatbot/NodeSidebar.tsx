import { useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow,
  ShoppingBag,
} from 'lucide-react';
import { NODE_DEFS, CATEGORIES, type NodeDef } from './nodeConfig';

const ICONS: Record<string, React.ElementType> = {
  Play, Hash, MessageSquare, Image, List, MousePointerClick, Layout,
  Tag, GitBranch, UserCheck, Code, Database, MapPin, Link, Workflow, ShoppingBag,
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
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-colors group"
      title={def.description}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: def.bg }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: def.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{def.label}</p>
        <p className="text-[10px] text-gray-400 truncate">{def.description}</p>
      </div>
    </div>
  );
}

export default function NodeSidebar({ onAddNode }: Props) {
  const [search, setSearch] = useState('');

  const filtered = NODE_DEFS.filter(d =>
    d.label.toLowerCase().includes(search.toLowerCase()) ||
    d.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-52 h-full bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Node Library</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-7 pr-7 py-1.5 text-xs border rounded-lg outline-none focus:border-primary bg-gray-50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto py-1">
        {search ? (
          <div className="py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No nodes found</p>
            ) : (
              filtered.map(def => <NodeCard key={def.type} def={def} onAddNode={onAddNode} />)
            )}
          </div>
        ) : (
          CATEGORIES.map(cat => {
            const nodes = NODE_DEFS.filter(d => d.category === cat.key);
            if (!nodes.length) return null;
            return (
              <div key={cat.key} className="mb-1">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white">
                  {cat.label}
                </p>
                {nodes.map(def => <NodeCard key={def.type} def={def} onAddNode={onAddNode} />)}
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-[10px] text-gray-400 text-center">Drag or click to add nodes</p>
      </div>
    </div>
  );
}
