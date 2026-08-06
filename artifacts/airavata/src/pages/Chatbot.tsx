import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState,
  useEdgesState, useReactFlow, ReactFlowProvider, BackgroundVariant,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  Panel, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, Play, Download, Upload, Undo2, Redo2, Plus, Trash2,
  History, BarChart2, Variable, Copy, Clipboard, Layers,
  Loader2, CheckCircle2, AlertCircle, X, FileJson,
  Terminal, Search, CopyPlus, ChevronDown, GitBranch,
} from 'lucide-react';
import { api } from '../lib/api';
import NodeSidebar from '../components/chatbot/NodeSidebar';
import ConfigPanel from '../components/chatbot/ConfigPanel';
import { nodeTypes } from '../components/chatbot/ChatbotNode';
import { NODE_DEF_MAP, NODE_DEFS } from '../components/chatbot/nodeConfig';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ChatbotFlowSummary { id: string; name: string; status: string; updatedAt: string; analytics?: { triggered: number; completed: number } }
interface ChatbotFlow extends ChatbotFlowSummary { nodes: Node[]; edges: Edge[]; variables?: VarDef[] }
interface VarDef { name: string; type: string; defaultValue: string }
interface AnalyticsData { triggered: number; completed: number; dropped: number; completionRate: number; version: number; status: string; updatedAt: string }
interface LogEntry { level: string; message: string; nodeId?: string; timestamp: string; data?: unknown }

function nanoid() { return Math.random().toString(36).slice(2, 10); }

function normalizeImportedNodes(rawNodes: unknown): Node[] {
  if (!Array.isArray(rawNodes)) return [];
  return rawNodes.map((rawNode) => {
    const node = rawNode as Node;
    if (node.type !== 'customApi' || !node.data) return node;

    const data = { ...node.data };
    const url = String(data.url ?? '').trim();
    if (
      url.includes('your-backend.example.com/api/pricing/lookup') ||
      url === '/api/pricing/lookup'
    ) {
      data.url = 'airavata://pricing/lookup';
      data.headers = [];
    }

    if (Array.isArray(data.responseMapping)) {
      data.responseMapping = data.responseMapping.map((rawMapping) => {
        const mapping = rawMapping as Record<string, unknown>;
        return {
          path: String(mapping.path ?? mapping.responsePath ?? mapping.response_path ?? ''),
          variable: String(mapping.variable ?? mapping.variableName ?? mapping.variable_name ?? ''),
        };
      });
    }
    return { ...node, data };
  });
}

// ── API helpers ─────────────────────────────────────────────────────────────
const fetchFlows = () => api.get<{ flows: ChatbotFlowSummary[] }>('/chatbot/flows').then(r => r.flows);
const fetchFlow = (id: string) => api.get<{ flow: ChatbotFlow }>(`/chatbot/flows/${id}`).then(r => r.flow);
const createFlow = (name: string) => api.post<{ flow: ChatbotFlow }>('/chatbot/flows', { name }).then(r => r.flow);
const saveFlow = (id: string, data: object) => api.put<{ flow: ChatbotFlow }>(`/chatbot/flows/${id}`, data).then(r => r.flow);
const deleteFlow = (id: string) => api.delete(`/chatbot/flows/${id}`);

// ── History hook ──────────────────────────────────────────────────────────────
function useHistory<T>(initial: T) {
  const [index, setIndex] = useState(0);
  const history = useRef<T[]>([initial]);
  const push = useCallback((state: T) => {
    history.current = [...history.current.slice(0, index + 1), state];
    setIndex(i => Math.min(i + 1, history.current.length - 1));
  }, [index]);
  const undo = useCallback(() => {
    if (index > 0) { setIndex(i => i - 1); return history.current[index - 1]; }
    return history.current[0];
  }, [index]);
  const redo = useCallback(() => {
    if (index < history.current.length - 1) { setIndex(i => i + 1); return history.current[index + 1]; }
    return history.current[history.current.length - 1];
  }, [index]);
  return { push, undo, redo, canUndo: index > 0, canRedo: index < history.current.length - 1 };
}

// ── Flow list panel ────────────────────────────────────────────────────────────
function FlowList({ flows, activeId, onSelect, onCreate, onDelete }: {
  flows: ChatbotFlowSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = flows.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-52 h-full bg-gray-950 flex flex-col shrink-0 border-r border-gray-800">
      <div className="px-3 pt-3 pb-2.5 border-b border-gray-800 space-y-2">
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Chatbot Flows</p>
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary text-white text-[11px] font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> New Flow
        </button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search flows..."
            className="w-full pl-7 py-1.5 text-[10px] bg-gray-900 border border-gray-800 rounded-lg outline-none focus:border-primary text-gray-300 placeholder-gray-600"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <p className="text-[10px] text-gray-600 text-center py-6 px-3">
            {flows.length === 0 ? 'No flows yet' : 'No matches'}
          </p>
        )}
        {filtered.map(f => (
          <div
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`group px-3 py-2.5 cursor-pointer flex items-start justify-between gap-1 transition-colors ${
              activeId === f.id ? 'bg-primary/20 border-r-2 border-primary' : 'hover:bg-gray-900'
            }`}
          >
            <div className="min-w-0">
              <p className={`text-[11px] font-semibold truncate leading-tight ${activeId === f.id ? 'text-primary' : 'text-gray-300'}`}>{f.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${f.status === 'PUBLISHED' ? 'bg-green-400' : 'bg-yellow-500'}`} />
                <span className="text-[9px] text-gray-600 capitalize">{f.status.toLowerCase()}</span>
              </div>
              {f.analytics && f.analytics.triggered > 0 && (
                <p className="text-[9px] text-gray-600 mt-0.5">{f.analytics.triggered} triggered</p>
              )}
            </div>
            <button
              onClick={e => { e.stopPropagation(); if (confirm('Delete this flow?')) onDelete(f.id); }}
              className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-500 transition-all mt-0.5 shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Analytics panel ────────────────────────────────────────────────────────────
function AnalyticsPanel({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['chatbot-analytics', flowId],
    queryFn: () => api.get<{ analytics: AnalyticsData }>(`/chatbot/flows/${flowId}/analytics`).then(r => r.analytics),
    refetchInterval: 30000,
  });

  return (
    <div className="w-72 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-bold text-gray-800 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" /> Analytics</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Triggered', value: data.triggered, color: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Completed', value: data.completed, color: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Dropped', value: data.dropped, color: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' },
                { label: 'Completion %', value: `${data.completionRate}%`, color: 'bg-violet-500', text: 'text-violet-600', bg: 'bg-violet-50' },
              ].map(stat => (
                <div key={stat.label} className={`${stat.bg} rounded-xl p-3 border border-white`}>
                  <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">{stat.label}</p>
                  <p className={`text-2xl font-black mt-0.5 ${stat.text}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Completion rate bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-gray-600">Completion Rate</span>
                <span className="text-[10px] font-bold text-gray-800">{data.completionRate}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-700"
                  style={{ width: `${data.completionRate}%` }}
                />
              </div>
            </div>

            <div className="border border-gray-100 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">Flow Info</p>
              <div className="space-y-1.5">
                {[
                  { label: 'Status', value: data.status },
                  { label: 'Version', value: `v${data.version}` },
                  { label: 'Last saved', value: new Date(data.updatedAt).toLocaleString() },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">{row.label}</span>
                    <span className={`text-[10px] font-semibold ${row.label === 'Status' ? (data.status === 'PUBLISHED' ? 'text-green-600' : 'text-yellow-600') : 'text-gray-700'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {data.triggered === 0 && (
              <div className="text-center py-4">
                <BarChart2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-[11px] text-gray-500 font-medium">No executions yet</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Publish this flow to start collecting analytics</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Execution logs panel ───────────────────────────────────────────────────────
function LogsPanel({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'info'>('all');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['chatbot-logs', flowId],
    queryFn: () => api.get<{ logs: LogEntry[] }>(`/chatbot/flows/${flowId}/logs`).then(r => r.logs),
  });

  const logs = (data ?? []).filter(l => filter === 'all' || l.level === filter);

  const levelColor: Record<string, string> = {
    error: 'text-red-500 bg-red-50',
    warn: 'text-yellow-600 bg-yellow-50',
    info: 'text-blue-600 bg-blue-50',
    debug: 'text-gray-500 bg-gray-50',
  };

  return (
    <div className="w-80 h-full bg-gray-950 border-l border-gray-800 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-sm font-bold text-gray-200 flex items-center gap-2"><Terminal className="w-4 h-4 text-green-400" /> Execution Logs</span>
        <div className="flex items-center gap-1">
          <button onClick={() => refetch()} className="p-1 text-gray-600 hover:text-gray-400"><CheckCircle2 className="w-3.5 h-3.5" /></button>
          <button onClick={onClose} className="p-1 text-gray-600 hover:text-gray-400"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex gap-1 px-3 py-2 border-b border-gray-800">
        {(['all', 'error', 'info'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2 py-0.5 text-[10px] rounded font-medium capitalize transition-colors ${filter === f ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}>{f}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}
        {!isLoading && logs.length === 0 && (
          <div className="text-center py-10">
            <Terminal className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-[11px] text-gray-500">No logs yet</p>
            <p className="text-[10px] text-gray-700 mt-0.5">Logs appear when the flow executes</p>
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="px-3 py-2 border-b border-gray-900 hover:bg-gray-900 transition-colors">
            <div className="flex items-start gap-2">
              <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase shrink-0 mt-0.5 ${levelColor[log.level] ?? levelColor.debug}`}>
                {log.level}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-300 leading-relaxed">{log.message}</p>
                {log.nodeId && <p className="text-[9px] text-gray-600 font-mono mt-0.5">node: {log.nodeId}</p>}
              </div>
            </div>
            <p className="text-[8px] text-gray-700 mt-1 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History panel ──────────────────────────────────────────────────────────────
function HistoryPanel({ flowId, onClose, onRestore }: { flowId: string; onClose: () => void; onRestore: (nodes: Node[], edges: Edge[]) => void }) {
  const { data } = useQuery({
    queryKey: ['chatbot-history', flowId],
    queryFn: () => api.get<{ history: Array<{ version: number; savedAt: string; nodes: Node[]; edges: Edge[] }> }>(`/chatbot/flows/${flowId}/history`).then(r => r.history),
  });

  return (
    <div className="w-64 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-bold text-gray-800 flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Version History</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-2">
        {!data?.length && (
          <div className="text-center py-8">
            <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">No saved versions yet</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Auto-saves appear here</p>
          </div>
        )}
        {data?.map(snap => (
          <div key={snap.version} className="border border-gray-200 rounded-xl p-3 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">v{snap.version}</span>
              <span className="text-[9px] text-gray-400">{new Date(snap.savedAt).toLocaleTimeString()}</span>
            </div>
            <p className="text-[10px] text-gray-500">{snap.nodes?.length ?? 0} nodes · {snap.edges?.length ?? 0} connections</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{new Date(snap.savedAt).toLocaleDateString()}</p>
            <button
              onClick={() => onRestore(snap.nodes, snap.edges)}
              className="mt-2 w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded-lg border border-primary/20 font-medium transition-colors"
            >
              Restore this version
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Variable manager ───────────────────────────────────────────────────────────
function VarsPanel({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: flowData } = useQuery({ queryKey: ['chatbot-flow', flowId], queryFn: () => fetchFlow(flowId) });
  const [vars, setVars] = useState<VarDef[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => { if (flowData?.variables) setVars(flowData.variables); }, [flowData?.id]);

  const save = () => {
    api.put(`/chatbot/flows/${flowId}`, { variables: vars }).then(() => {
      qc.invalidateQueries({ queryKey: ['chatbot-flow', flowId] });
      toast.success('Variables saved');
    });
  };

  return (
    <div className="w-64 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <span className="text-base">{'{ }'}</span> Variables
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2">
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-2">
          <p className="text-[10px] text-blue-700">Use <code className="bg-blue-100 px-1 rounded font-mono">{'{{var.name}}'}</code> in message fields</p>
        </div>
        {vars.map((v, i) => (
          <div key={i} className="border border-gray-200 rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <code className="text-[10px] font-mono text-primary">{`{{${v.name}}}`}</code>
              <button onClick={() => setVars(vs => vs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
            </div>
            <div className="relative">
              <select
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white appearance-none focus:border-primary"
                value={v.type}
                onChange={e => setVars(vs => vs.map((vv, j) => j === i ? { ...vv, type: e.target.value } : vv))}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
            <input
              className="w-full text-[10px] border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-primary"
              value={v.defaultValue}
              onChange={e => setVars(vs => vs.map((vv, j) => j === i ? { ...vv, defaultValue: e.target.value } : vv))}
              placeholder="Default value..."
            />
          </div>
        ))}
        {vars.length === 0 && (
          <div className="text-center py-6">
            <p className="text-[10px] text-gray-400">No variables defined yet</p>
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-gray-100 space-y-1.5">
        <div className="flex gap-1.5">
          <input
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="variable.name"
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) {
                setVars(vs => [...vs, { name: newName.trim(), type: 'string', defaultValue: '' }]);
                setNewName('');
              }
            }}
          />
          <button
            onClick={() => { if (newName.trim()) { setVars(vs => [...vs, { name: newName.trim(), type: 'string', defaultValue: '' }]); setNewName(''); } }}
            className="px-2 bg-primary text-white text-xs rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button onClick={save} className="w-full py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90">
          Save Variables
        </button>
      </div>
    </div>
  );
}

// ── Node templates ─────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    name: 'Welcome Flow',
    description: 'Greet users and offer options',
    nodes: [
      { id: 'start-1', type: 'start', position: { x: 300, y: 50 }, data: { label: 'Start', description: 'Welcome flow entry' } },
      { id: 'text-1', type: 'textReply', position: { x: 300, y: 180 }, data: { label: 'Welcome', message: 'Hi {{contact.name}}! 👋 Welcome to our service.', typingDelay: 1 } },
      { id: 'cta-1', type: 'ctaButton', position: { x: 300, y: 320 }, data: { label: 'Main Menu', body: 'What would you like to do today?', buttons: [{ id: '1', title: '📦 Track Order' }, { id: '2', title: '💬 Support' }, { id: '3', title: 'ℹ️ About Us' }] } },
    ],
    edges: [
      { id: 'e1', source: 'start-1', target: 'text-1', animated: true },
      { id: 'e2', source: 'text-1', target: 'cta-1', animated: true },
    ],
  },
  {
    name: 'Lead Qualification',
    description: 'Collect contact info & qualify',
    nodes: [
      { id: 'start-1', type: 'start', position: { x: 300, y: 50 }, data: { label: 'Start' } },
      { id: 'text-1', type: 'textReply', position: { x: 300, y: 180 }, data: { label: 'Intro', message: "Hi! I'm here to help you find the best solution. May I ask a few questions?", typingDelay: 1 } },
      { id: 'cond-1', type: 'condition', position: { x: 300, y: 330 }, data: { label: 'Budget Check', conditions: [{ field: 'contact.budget', operator: 'greater', value: '1000' }], logicType: 'AND' } },
      { id: 'assign-1', type: 'assignAgent', position: { x: 150, y: 480 }, data: { label: 'Assign Sales', assignType: 'team', teamId: 'sales', priority: 'high' } },
      { id: 'tag-1', type: 'tag', position: { x: 450, y: 480 }, data: { label: 'Tag Lead', action: 'add', tags: ['nurture', 'cold-lead'] } },
    ],
    edges: [
      { id: 'e1', source: 'start-1', target: 'text-1', animated: true },
      { id: 'e2', source: 'text-1', target: 'cond-1', animated: true },
      { id: 'e3', source: 'cond-1', sourceHandle: 'true', target: 'assign-1', animated: true },
      { id: 'e4', source: 'cond-1', sourceHandle: 'false', target: 'tag-1', animated: true },
    ],
  },
  {
    name: 'Support Bot',
    description: 'Handle support requests',
    nodes: [
      { id: 'start-1', type: 'start', position: { x: 300, y: 50 }, data: { label: 'Start' } },
      { id: 'kw-1', type: 'keyword', position: { x: 300, y: 180 }, data: { label: 'Support Trigger', keywords: ['help', 'support', 'issue', 'problem'], matchType: 'contains' } },
      { id: 'list-1', type: 'listReply', position: { x: 300, y: 330 }, data: { label: 'Issue Type', header: 'Support', body: 'What do you need help with?', buttonText: 'Select Issue', sections: [{ title: 'Common Issues', rows: [{ id: '1', title: 'Billing', description: 'Invoices & payments' }, { id: '2', title: 'Technical', description: 'App or system issues' }, { id: '3', title: 'Account', description: 'Login & settings' }] }] } },
      { id: 'assign-1', type: 'assignAgent', position: { x: 300, y: 500 }, data: { label: 'Assign Agent', assignType: 'auto', priority: 'normal' } },
      { id: 'err-1', type: 'errorHandler', position: { x: 600, y: 330 }, data: { label: 'Error Handler', errorMessage: 'Sorry for the inconvenience. Let me connect you with a team member.', retryCount: 1, retryDelay: 5 } },
    ],
    edges: [
      { id: 'e1', source: 'start-1', target: 'kw-1', animated: true },
      { id: 'e2', source: 'kw-1', target: 'list-1', animated: true },
      { id: 'e3', source: 'list-1', target: 'assign-1', animated: true },
    ],
  },
];

function TemplatesPanel({ onApply, onClose }: { onApply: (tpl: typeof TEMPLATES[0]) => void; onClose: () => void }) {
  return (
    <div className="w-72 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-bold text-gray-800 flex items-center gap-2"><GitBranch className="w-4 h-4 text-primary" /> Templates</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-[10px] text-gray-400">Start with a pre-built template. Your current canvas will be replaced.</p>
        {TEMPLATES.map(tpl => (
          <div key={tpl.name} className="border border-gray-200 rounded-xl p-3 hover:border-primary/40 transition-colors group">
            <p className="text-xs font-bold text-gray-800">{tpl.name}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 mb-3">{tpl.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-gray-400">{tpl.nodes.length} nodes</span>
              <button
                onClick={() => { if (confirm(`Apply "${tpl.name}" template? This replaces the current canvas.`)) { onApply(tpl); onClose(); } }}
                className="text-[10px] text-primary font-semibold hover:underline group-hover:bg-primary/10 px-2 py-0.5 rounded transition-colors"
              >
                Use Template →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main canvas ────────────────────────────────────────────────────────────────
type RightPanel = 'config' | 'history' | 'vars' | 'analytics' | 'logs' | 'templates' | null;

function FlowCanvas({ flowId, addNodeRef }: { flowId: string; addNodeRef?: React.MutableRefObject<((type: string) => void) | null> }) {
  const qc = useQueryClient();
  const { screenToFlowPosition, fitView } = useReactFlow();

  const { data: flowData, isLoading } = useQuery({
    queryKey: ['chatbot-flow', flowId],
    queryFn: () => fetchFlow(flowId),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const [flowName, setFlowName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [clipboard, setClipboard] = useState<Node[]>([]);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const history = useHistory({ nodes: [] as Node[], edges: [] as Edge[] });

  useEffect(() => {
    if (flowData) {
      setNodes(flowData.nodes ?? []);
      setEdges(flowData.edges ?? []);
      setFlowName(flowData.name);
      setSaveStatus('saved');
      setTimeout(() => fitView({ padding: 0.15 }), 50);
    }
  }, [flowData?.id]);

  const saveMutation = useMutation({
    mutationFn: (data: { nodes: Node[]; edges: Edge[]; name?: string; status?: string }) =>
      saveFlow(flowId, data),
    onMutate: () => setSaveStatus('saving'),
    onSuccess: () => { setSaveStatus('saved'); qc.invalidateQueries({ queryKey: ['chatbot-flows'] }); },
    onError: () => { setSaveStatus('unsaved'); toast.error('Failed to save'); },
  });

  const scheduleAutoSave = useCallback((ns: Node[], es: Edge[]) => {
    setSaveStatus('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate({ nodes: ns, edges: es }), 2000);
  }, [flowId]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    const hasMeaningfulChange = changes.some(c => c.type !== 'select' && !(c.type === 'position' && c.dragging));
    if (hasMeaningfulChange) {
      setNodes(nds => { scheduleAutoSave(nds, edges); return nds; });
    }
  }, [onNodesChange, edges, scheduleAutoSave]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    setEdges(eds => { scheduleAutoSave(nodes, eds); return eds; });
  }, [onEdgesChange, nodes, scheduleAutoSave]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      const next = addEdge({
        ...connection,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        style: { stroke: '#6366f1', strokeWidth: 2 },
      }, eds);
      scheduleAutoSave(nodes, next);
      return next;
    });
  }, [nodes, scheduleAutoSave]);

  const addNode = useCallback((type: string, position?: { x: number; y: number }) => {
    const def = NODE_DEF_MAP[type];
    if (!def) return;
    const pos = position ?? { x: 300 + Math.random() * 200, y: 200 + Math.random() * 150 };
    const newNode: Node = {
      id: `${type}-${nanoid()}`,
      type,
      position: pos,
      data: { ...def.defaultData, label: def.label },
    };
    setNodes(nds => { const next = [...nds, newNode]; scheduleAutoSave(next, edges); return next; });
    history.push({ nodes: [...nodes, newNode], edges });
    setSelectedNode(newNode);
    setRightPanel('config');
  }, [nodes, edges, scheduleAutoSave, history]);

  // Expose addNode to parent via ref so NodeSidebar (outside FlowCanvas) can call it
  useEffect(() => {
    if (addNodeRef) addNodeRef.current = addNode;
  }, [addNode, addNodeRef]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, position);
  }, [screenToFlowPosition, addNode]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeDataChange = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes(nds => {
      const next = nds.map(n => n.id === id ? { ...n, data } : n);
      scheduleAutoSave(next, edges);
      return next;
    });
    setSelectedNode(prev => prev?.id === id ? { ...prev, data } : prev);
  }, [edges, scheduleAutoSave]);

  // Duplicate node
  const duplicateNode = useCallback((id?: string) => {
    const targetId = id ?? selectedNode?.id;
    if (!targetId) return;
    const original = nodes.find(n => n.id === targetId);
    if (!original) return;
    const duped: Node = {
      ...original,
      id: `${original.type}-${nanoid()}`,
      position: { x: original.position.x + 40, y: original.position.y + 40 },
      selected: false,
    };
    setNodes(nds => { const next = [...nds, duped]; scheduleAutoSave(next, edges); return next; });
    toast.success('Node duplicated');
  }, [nodes, edges, selectedNode, scheduleAutoSave]);

  const handleUndo = useCallback(() => {
    const prev = history.undo();
    if (prev) { setNodes(prev.nodes); setEdges(prev.edges); scheduleAutoSave(prev.nodes, prev.edges); }
  }, [history]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    if (next) { setNodes(next.nodes); setEdges(next.edges); scheduleAutoSave(next.nodes, next.edges); }
  }, [history]);

  const copySelected = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length) { setClipboard(selected); toast.success(`Copied ${selected.length} node(s)`); }
  }, [nodes]);

  const pasteNodes = useCallback(() => {
    if (!clipboard.length) return;
    const pasted: Node[] = clipboard.map(n => ({
      ...n,
      id: `${n.type}-${nanoid()}`,
      position: { x: n.position.x + 40, y: n.position.y + 40 },
      selected: false,
    }));
    setNodes(nds => { const next = [...nds, ...pasted]; scheduleAutoSave(next, edges); return next; });
    toast.success(`Pasted ${pasted.length} node(s)`);
  }, [clipboard, edges, scheduleAutoSave]);

  const deleteSelected = useCallback(() => {
    const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
    if (!selectedIds.size) return;
    setNodes(nds => { const next = nds.filter(n => !selectedIds.has(n.id)); scheduleAutoSave(next, edges); return next; });
    setEdges(eds => { const next = eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)); scheduleAutoSave(nodes, next); return next; });
    if (selectedNode && selectedIds.has(selectedNode.id)) { setSelectedNode(null); if (rightPanel === 'config') setRightPanel(null); }
  }, [nodes, edges, selectedNode, rightPanel, scheduleAutoSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
        if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
        if (mod && e.key === 'c') { e.preventDefault(); copySelected(); }
        if (mod && e.key === 'v') { e.preventDefault(); pasteNodes(); }
        if (mod && e.key === 'd') { e.preventDefault(); duplicateNode(); }
        if (mod && e.key === 's') { e.preventDefault(); saveMutation.mutate({ nodes, edges }); }
        if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }
        if (e.key === 'Escape') { setSelectedNode(null); setRightPanel(null); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, copySelected, pasteNodes, duplicateNode, deleteSelected, nodes, edges]);

  const exportJson = () => {
    const data = JSON.stringify({ name: flowName, nodes, edges }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `${flowName}.json`; a.click();
  };

  const importJson = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const importedNodes = normalizeImportedNodes(data.nodes);
        if (data.nodes) setNodes(importedNodes);
        if (data.edges) setEdges(data.edges);
        if (data.name) setFlowName(data.name);
        toast.success('Flow imported');
        scheduleAutoSave(importedNodes.length ? importedNodes : nodes, data.edges ?? edges);
      } catch { toast.error('Invalid JSON file'); }
    };
    input.click();
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    const ns = tpl.nodes.map(n => ({ ...n, id: `${n.id}-${nanoid()}` }));
    const idMap = Object.fromEntries(tpl.nodes.map((n, i) => [n.id, ns[i].id]));
    const es = tpl.edges.map(e => ({ ...e, id: `e-${nanoid()}`, source: idMap[e.source], target: idMap[e.target], animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }));
    setNodes(ns as Node[]); setEdges(es as Edge[]);
    scheduleAutoSave(ns as Node[], es as Edge[]);
    toast.success(`Template "${tpl.name}" applied`);
    setTimeout(() => fitView({ padding: 0.15 }), 100);
  };

  const isPublished = flowData?.status === 'PUBLISHED';

  const togglePanel = (panel: RightPanel) => {
    setRightPanel(prev => prev === panel ? null : panel);
    if (panel !== 'config') setSelectedNode(null);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-gray-400">Loading flow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-1.5 px-3 shrink-0 shadow-sm">
        {/* Flow name */}
        <div className="flex items-center gap-1 mr-1 min-w-0 max-w-44">
          {editingName ? (
            <input
              autoFocus
              className="text-sm font-bold text-gray-900 border-b-2 border-primary outline-none px-1 max-w-44 bg-transparent"
              value={flowName}
              onChange={e => setFlowName(e.target.value)}
              onBlur={() => { setEditingName(false); saveMutation.mutate({ nodes, edges, name: flowName }); }}
              onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveMutation.mutate({ nodes, edges, name: flowName }); } }}
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-sm font-bold text-gray-900 hover:bg-gray-100 px-2 py-1 rounded-lg max-w-44 truncate" title="Click to rename">
              {flowName}
            </button>
          )}
        </div>

        {/* Save status badge */}
        <div className="flex items-center gap-1 shrink-0">
          {saveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin text-gray-400" /><span className="text-[10px] text-gray-400">Saving…</span></>}
          {saveStatus === 'saved' && <><CheckCircle2 className="w-3 h-3 text-green-500" /><span className="text-[10px] text-green-600">Saved</span></>}
          {saveStatus === 'unsaved' && <><AlertCircle className="w-3 h-3 text-amber-500" /><span className="text-[10px] text-amber-600">Unsaved</span></>}
        </div>

        <div className="h-5 w-px bg-gray-200 mx-0.5" />

        {/* Undo/Redo */}
        <button onClick={handleUndo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-600 transition-colors"><Undo2 className="w-3.5 h-3.5" /></button>
        <button onClick={handleRedo} disabled={!history.canRedo} title="Redo (Ctrl+Y)" className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-600 transition-colors"><Redo2 className="w-3.5 h-3.5" /></button>

        <div className="h-5 w-px bg-gray-200 mx-0.5" />

        {/* Copy/Paste/Duplicate/Delete */}
        <button onClick={copySelected} title="Copy (Ctrl+C)" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"><Copy className="w-3.5 h-3.5" /></button>
        <button onClick={pasteNodes} disabled={!clipboard.length} title="Paste (Ctrl+V)" className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-600 transition-colors"><Clipboard className="w-3.5 h-3.5" /></button>
        <button onClick={() => duplicateNode()} disabled={!selectedNode} title="Duplicate (Ctrl+D)" className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-600 transition-colors"><CopyPlus className="w-3.5 h-3.5" /></button>
        <button onClick={deleteSelected} title="Delete (Del)" className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 text-gray-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>

        <div className="h-5 w-px bg-gray-200 mx-0.5" />

        {/* Import/Export */}
        <button onClick={importJson} title="Import JSON" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"><Upload className="w-3.5 h-3.5" /></button>
        <button onClick={exportJson} title="Export JSON" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"><Download className="w-3.5 h-3.5" /></button>

        <div className="h-5 w-px bg-gray-200 mx-0.5" />

        {/* Panels */}
        {([
          { key: 'history', icon: History, title: 'Version History' },
          { key: 'vars', icon: () => <span className="text-xs font-mono font-bold">{'{}'}</span>, title: 'Variables' },
          { key: 'analytics', icon: BarChart2, title: 'Analytics' },
          { key: 'logs', icon: Terminal, title: 'Execution Logs' },
          { key: 'templates', icon: GitBranch, title: 'Templates' },
        ] as Array<{ key: RightPanel; icon: React.ElementType; title: string }>).map(({ key, icon: Icon, title }) => (
          <button
            key={key as string}
            onClick={() => togglePanel(key)}
            title={title}
            className={`p-1.5 rounded-lg transition-colors ${rightPanel === key ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}

        <div className="flex-1" />

        {/* Save + Publish */}
        <button
          onClick={() => saveMutation.mutate({ nodes, edges })}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-3 h-3" /> Save
        </button>

        {isPublished ? (
          <button
            onClick={() => saveMutation.mutate({ nodes, edges, status: 'DRAFT' })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors"
          >
            <Layers className="w-3 h-3" /> Set Draft
          </button>
        ) : (
          <button
            onClick={() => { saveMutation.mutate({ nodes, edges, status: 'PUBLISHED' }); toast.success('Flow published!'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 shadow-sm transition-colors"
          >
            <Play className="w-3 h-3" /> Publish
          </button>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => { setSelectedNode(node); setRightPanel('config'); }}
          onPaneClick={() => { setSelectedNode(null); if (rightPanel === 'config') setRightPanel(null); }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          className="bg-gray-50"
          defaultEdgeOptions={{
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
            style: { stroke: '#6366f1', strokeWidth: 2 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e2e8f0" />
          <Controls className="!shadow-md !rounded-xl overflow-hidden" />
          <MiniMap
            nodeColor={n => NODE_DEF_MAP[n.type ?? '']?.color ?? '#94a3b8'}
            maskColor="rgba(248,250,252,0.7)"
            className="!shadow-md !rounded-xl overflow-hidden !border !border-gray-200"
            pannable
            zoomable
          />

          {/* Keyboard hints */}
          <Panel position="bottom-center">
            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full px-4 py-1.5 shadow-sm text-[9px] text-gray-500">
              <span><kbd className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-mono">Ctrl+Z</kbd> Undo</span>
              <span><kbd className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-mono">Ctrl+D</kbd> Duplicate</span>
              <span><kbd className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-mono">Ctrl+C/V</kbd> Copy/Paste</span>
              <span><kbd className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-mono">Shift</kbd> Multi-select</span>
              <span><kbd className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-mono">Del</kbd> Delete</span>
              <span><kbd className="bg-gray-100 px-1 py-0.5 rounded text-[8px] font-mono">Esc</kbd> Deselect</span>
            </div>
          </Panel>
        </ReactFlow>

        {/* Right panels */}
        {rightPanel === 'config' && selectedNode && (
          <ConfigPanel
            node={selectedNode as { id: string; type: string; data: Record<string, unknown> }}
            onChange={onNodeDataChange}
            onClose={() => { setSelectedNode(null); setRightPanel(null); }}
            onDuplicate={duplicateNode}
          />
        )}
        {rightPanel === 'history' && (
          <HistoryPanel flowId={flowId} onClose={() => setRightPanel(null)} onRestore={(ns, es) => { setNodes(ns); setEdges(es); setRightPanel(null); toast.success('Version restored'); }} />
        )}
        {rightPanel === 'vars' && <VarsPanel flowId={flowId} onClose={() => setRightPanel(null)} />}
        {rightPanel === 'analytics' && <AnalyticsPanel flowId={flowId} onClose={() => setRightPanel(null)} />}
        {rightPanel === 'logs' && <LogsPanel flowId={flowId} onClose={() => setRightPanel(null)} />}
        {rightPanel === 'templates' && <TemplatesPanel onApply={applyTemplate} onClose={() => setRightPanel(null)} />}
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 gap-5">
      <div className="w-24 h-24 rounded-3xl bg-white border-2 border-dashed border-gray-300 flex items-center justify-center shadow-sm">
        <FileJson className="w-10 h-10 text-gray-300" />
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-gray-700">No flow selected</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-xs">Create a new chatbot flow or select one from the sidebar to start building</p>
      </div>
      <button onClick={onCreate} className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary/90 shadow-md transition-colors">
        <Plus className="w-4 h-4" /> Create Your First Flow
      </button>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function Chatbot() {
  const qc = useQueryClient();
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  // Bridge: FlowCanvas exposes its addNode fn via this ref so NodeSidebar can call it
  const addNodeRef = useRef<((type: string) => void) | null>(null);

  const { data: flowsData, isLoading } = useQuery({
    queryKey: ['chatbot-flows'],
    queryFn: fetchFlows,
  });
  const flows = flowsData ?? [];

  const createMutation = useMutation({
    mutationFn: () => createFlow('Untitled Flow'),
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ['chatbot-flows'] });
      setActiveFlowId(flow.id);
      toast.success('New flow created');
    },
    onError: () => toast.error('Failed to create flow'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFlow,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['chatbot-flows'] });
      if (activeFlowId === id) setActiveFlowId(null);
      toast.success('Flow deleted');
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: flow list */}
      <FlowList
        flows={flows}
        activeId={activeFlowId}
        onSelect={setActiveFlowId}
        onCreate={createMutation.mutate}
        onDelete={id => deleteMutation.mutate(id)}
      />

      {/* Center: node sidebar + canvas */}
      {activeFlowId ? (
        <ReactFlowProvider key={activeFlowId}>
          <NodeSidebar onAddNode={(type) => addNodeRef.current?.(type)} />
          <FlowCanvas flowId={activeFlowId} addNodeRef={addNodeRef} />
        </ReactFlowProvider>
      ) : (
        <EmptyState onCreate={createMutation.mutate} />
      )}
    </div>
  );
}
