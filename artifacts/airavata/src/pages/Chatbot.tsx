import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState,
  useEdgesState, useReactFlow, ReactFlowProvider, BackgroundVariant,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, Play, Download, Upload, Undo2, Redo2, Plus, Trash2,
  History, BarChart2, Variable, Copy, Clipboard, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, X, FileJson, Layers,
} from 'lucide-react';
import { api } from '../lib/api';
import NodeSidebar from '../components/chatbot/NodeSidebar';
import ConfigPanel from '../components/chatbot/ConfigPanel';
import { nodeTypes } from '../components/chatbot/ChatbotNode';
import { NODE_DEF_MAP } from '../components/chatbot/nodeConfig';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ChatbotFlowSummary { id: string; name: string; status: string; updatedAt: string; analytics?: { triggered: number; completed: number } }
interface ChatbotFlow extends ChatbotFlowSummary { nodes: Node[]; edges: Edge[] }

// ── API helpers ────────────────────────────────────────────────────────────────
const fetchFlows = () => api.get<{ flows: ChatbotFlowSummary[] }>('/chatbot/flows').then(r => r.flows);
const fetchFlow = (id: string) => api.get<{ flow: ChatbotFlow }>(`/chatbot/flows/${id}`).then(r => r.flow);
const createFlow = (name: string) => api.post<{ flow: ChatbotFlow }>('/chatbot/flows', { name }).then(r => r.flow);
const saveFlow = (id: string, data: object) => api.put<{ flow: ChatbotFlow }>(`/chatbot/flows/${id}`, data).then(r => r.flow);
const deleteFlow = (id: string) => api.delete(`/chatbot/flows/${id}`);

function nanoid() { return Math.random().toString(36).slice(2, 10); }

// ── History hook ───────────────────────────────────────────────────────────────
function useHistory<T>(initial: T) {
  const [index, setIndex] = useState(0);
  const history = useRef<T[]>([initial]);

  const push = useCallback((state: T) => {
    history.current = [...history.current.slice(0, index + 1), state];
    setIndex(i => i + 1);
  }, [index]);

  const undo = useCallback(() => {
    if (index > 0) { setIndex(i => i - 1); return history.current[index - 1]; }
    return history.current[index];
  }, [index]);

  const redo = useCallback(() => {
    if (index < history.current.length - 1) { setIndex(i => i + 1); return history.current[index + 1]; }
    return history.current[index];
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
  return (
    <div className="w-56 h-full bg-gray-950 flex flex-col shrink-0 border-r border-gray-800">
      <div className="px-3 pt-3 pb-2 border-b border-gray-800">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Chatbot Flows</p>
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Flow
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {flows.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-6 px-3">No flows yet. Create one to get started.</p>
        )}
        {flows.map(f => (
          <div
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`group px-3 py-2.5 cursor-pointer flex items-start justify-between gap-1 transition-colors ${
              activeId === f.id ? 'bg-primary/20 border-r-2 border-primary' : 'hover:bg-gray-800'
            }`}
          >
            <div className="min-w-0">
              <p className={`text-xs font-medium truncate ${activeId === f.id ? 'text-primary' : 'text-gray-200'}`}>{f.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${f.status === 'PUBLISHED' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-[10px] text-gray-500">{f.status}</span>
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(f.id); }}
              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all mt-0.5 shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main canvas (needs ReactFlowProvider wrapping) ────────────────────────────
function FlowCanvas({ flowId }: { flowId: string }) {
  const qc = useQueryClient();
  const { screenToFlowPosition } = useReactFlow();

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
  const [showHistory, setShowHistory] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const history = useHistory({ nodes: [] as Node[], edges: [] as Edge[] });

  // Load flow data into canvas
  useEffect(() => {
    if (flowData) {
      setNodes(flowData.nodes ?? []);
      setEdges(flowData.edges ?? []);
      setFlowName(flowData.name);
      setSaveStatus('saved');
    }
  }, [flowData?.id]);

  const saveMutation = useMutation({
    mutationFn: (data: { nodes: Node[]; edges: Edge[]; name?: string; status?: string }) =>
      saveFlow(flowId, data),
    onMutate: () => setSaveStatus('saving'),
    onSuccess: () => { setSaveStatus('saved'); qc.invalidateQueries({ queryKey: ['chatbot-flows'] }); },
    onError: () => { setSaveStatus('unsaved'); toast.error('Failed to save'); },
  });

  // Debounced auto-save
  const scheduleAutoSave = useCallback((ns: Node[], es: Edge[]) => {
    setSaveStatus('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate({ nodes: ns, edges: es }), 2000);
  }, [flowId]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    const hasPositionChange = changes.some(c => c.type === 'position' && !c.dragging);
    if (hasPositionChange) {
      setNodes(nds => { scheduleAutoSave(nds, edges); return nds; });
    }
  }, [onNodesChange, edges, scheduleAutoSave]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    setEdges(eds => { scheduleAutoSave(nodes, eds); return eds; });
  }, [onEdgesChange, nodes, scheduleAutoSave]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      const next = addEdge({ ...connection, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds);
      scheduleAutoSave(nodes, next);
      return next;
    });
  }, [nodes, scheduleAutoSave]);

  // Add node (from sidebar click or drop)
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
  }, [nodes, edges, scheduleAutoSave, history]);

  // Drop from sidebar
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

  // Node data change from config panel
  const onNodeDataChange = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes(nds => {
      const next = nds.map(n => n.id === id ? { ...n, data } : n);
      scheduleAutoSave(next, edges);
      return next;
    });
    setSelectedNode(prev => prev?.id === id ? { ...prev, data } : prev);
  }, [edges, scheduleAutoSave]);

  // Undo / redo
  const handleUndo = useCallback(() => {
    const prev = history.undo();
    if (prev) { setNodes(prev.nodes); setEdges(prev.edges); scheduleAutoSave(prev.nodes, prev.edges); }
  }, [history]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    if (next) { setNodes(next.nodes); setEdges(next.edges); scheduleAutoSave(next.nodes, next.edges); }
  }, [history]);

  // Copy / paste
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

  // Delete selected
  const deleteSelected = useCallback(() => {
    const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
    if (!selectedIds.size) return;
    setNodes(nds => { const next = nds.filter(n => !selectedIds.has(n.id)); scheduleAutoSave(next, edges); return next; });
    setEdges(eds => { const next = eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)); scheduleAutoSave(nodes, next); return next; });
    if (selectedNode && selectedIds.has(selectedNode.id)) setSelectedNode(null);
  }, [nodes, edges, selectedNode, scheduleAutoSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
      if (mod && e.key === 'c') { e.preventDefault(); copySelected(); }
      if (mod && e.key === 'v') { e.preventDefault(); pasteNodes(); }
      if (mod && e.key === 's') { e.preventDefault(); saveMutation.mutate({ nodes, edges }); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, copySelected, pasteNodes, deleteSelected, nodes, edges]);

  // Export / import
  const exportJson = () => {
    const data = JSON.stringify({ name: flowName, nodes, edges }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${flowName}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
        if (data.name) setFlowName(data.name);
        toast.success('Flow imported');
        scheduleAutoSave(data.nodes ?? nodes, data.edges ?? edges);
      } catch { toast.error('Invalid JSON file'); }
    };
    input.click();
  };

  const publish = () => {
    saveMutation.mutate({ nodes, edges, status: 'PUBLISHED' });
    toast.success('Flow published!');
  };

  const unpublish = () => {
    saveMutation.mutate({ nodes, edges, status: 'DRAFT' });
    toast.success('Flow set to draft');
  };

  const isPublished = flowData?.status === 'PUBLISHED';

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-2 px-4 shrink-0">
        {/* Flow name */}
        {editingName ? (
          <input
            autoFocus
            className="text-sm font-semibold text-gray-900 border-b-2 border-primary outline-none px-1 max-w-48"
            value={flowName}
            onChange={e => setFlowName(e.target.value)}
            onBlur={() => { setEditingName(false); saveMutation.mutate({ nodes, edges, name: flowName }); }}
            onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveMutation.mutate({ nodes, edges, name: flowName }); } }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-sm font-semibold text-gray-900 hover:bg-gray-100 px-2 py-1 rounded max-w-48 truncate"
            title="Click to rename"
          >
            {flowName}
          </button>
        )}

        {/* Save status */}
        <div className="flex items-center gap-1 text-xs ml-1">
          {saveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin text-gray-400" /><span className="text-gray-400">Saving…</span></>}
          {saveStatus === 'saved' && <><CheckCircle2 className="w-3 h-3 text-green-500" /><span className="text-green-600">Saved</span></>}
          {saveStatus === 'unsaved' && <><AlertCircle className="w-3 h-3 text-amber-500" /><span className="text-amber-600">Unsaved</span></>}
        </div>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* Undo / Redo */}
        <button onClick={handleUndo} disabled={!history.canUndo} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600" title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4" />
        </button>
        <button onClick={handleRedo} disabled={!history.canRedo} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600" title="Redo (Ctrl+Y)">
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* Copy / Paste */}
        <button onClick={copySelected} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Copy selected (Ctrl+C)">
          <Copy className="w-4 h-4" />
        </button>
        <button onClick={pasteNodes} disabled={!clipboard.length} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600" title="Paste (Ctrl+V)">
          <Clipboard className="w-4 h-4" />
        </button>
        <button onClick={deleteSelected} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Delete selected (Del)">
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* Import / Export */}
        <button onClick={importJson} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Import JSON">
          <Upload className="w-4 h-4" />
        </button>
        <button onClick={exportJson} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Export JSON">
          <Download className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* History / Variables */}
        <button onClick={() => { setShowHistory(v => !v); setShowVars(false); }} className={`p-1.5 rounded hover:bg-gray-100 ${showHistory ? 'bg-gray-100 text-primary' : 'text-gray-600'}`} title="Version history">
          <History className="w-4 h-4" />
        </button>
        <button onClick={() => { setShowVars(v => !v); setShowHistory(false); }} className={`p-1.5 rounded hover:bg-gray-100 ${showVars ? 'bg-gray-100 text-primary' : 'text-gray-600'}`} title="Variable manager">
          <Variable className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Analytics">
          <BarChart2 className="w-4 h-4" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save */}
        <button
          onClick={() => saveMutation.mutate({ nodes, edges })}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>

        {/* Publish / Unpublish */}
        {isPublished ? (
          <button
            onClick={unpublish}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
          >
            <Layers className="w-3.5 h-3.5" /> Set Draft
          </button>
        ) : (
          <button
            onClick={publish}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 shadow-sm"
          >
            <Play className="w-3.5 h-3.5" /> Publish
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
          onNodeClick={(_, node) => setSelectedNode(node)}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          className="bg-gray-50"
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls className="shadow-md" />
          <MiniMap
            nodeColor={n => NODE_DEF_MAP[n.type ?? '']?.color ?? '#94a3b8'}
            maskColor="rgba(0,0,0,0.05)"
            className="shadow-md rounded-xl overflow-hidden"
          />

          {/* Keyboard shortcut hints */}
          <Panel position="bottom-center">
            <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full px-4 py-1.5 shadow-sm text-[10px] text-gray-500">
              <span><kbd className="bg-gray-100 px-1 rounded">Ctrl+Z</kbd> Undo</span>
              <span><kbd className="bg-gray-100 px-1 rounded">Ctrl+C</kbd> Copy</span>
              <span><kbd className="bg-gray-100 px-1 rounded">Ctrl+V</kbd> Paste</span>
              <span><kbd className="bg-gray-100 px-1 rounded">Del</kbd> Delete</span>
              <span><kbd className="bg-gray-100 px-1 rounded">Shift</kbd> Multi-select</span>
              <span><kbd className="bg-gray-100 px-1 rounded">Scroll</kbd> Zoom</span>
            </div>
          </Panel>
        </ReactFlow>

        {/* Right panel: Config or History or Variables */}
        {showHistory && (
          <HistoryPanel flowId={flowId} onClose={() => setShowHistory(false)} onRestore={(nodes, edges) => { setNodes(nodes); setEdges(edges); setShowHistory(false); }} />
        )}
        {showVars && (
          <VarsPanel flowId={flowId} onClose={() => setShowVars(false)} />
        )}
        {!showHistory && !showVars && selectedNode && (
          <ConfigPanel
            node={selectedNode as { id: string; type: string; data: Record<string, unknown> }}
            onChange={onNodeDataChange}
            onClose={() => setSelectedNode(null)}
          />
        )}
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><History className="w-4 h-4 text-primary" /> Version History</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-2">
        {!data?.length && <p className="text-xs text-gray-400 text-center py-8">No saved versions yet. Auto-saves appear here.</p>}
        {data?.map(snap => (
          <div key={snap.version} className="border rounded-lg p-2.5 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700">v{snap.version}</span>
              <span className="text-[10px] text-gray-400">{new Date(snap.savedAt).toLocaleTimeString()}</span>
            </div>
            <p className="text-[10px] text-gray-500 mb-1.5">{snap.nodes?.length ?? 0} nodes · {snap.edges?.length ?? 0} connections</p>
            <button
              onClick={() => onRestore(snap.nodes, snap.edges)}
              className="text-[10px] text-primary hover:underline font-medium"
            >
              Restore this version
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Variables panel ────────────────────────────────────────────────────────────
function VarsPanel({ onClose }: { flowId: string; onClose: () => void }) {
  const [vars, setVars] = useState([
    { name: 'contact.name', type: 'string', defaultValue: '' },
    { name: 'contact.phone', type: 'string', defaultValue: '' },
  ]);
  const [newName, setNewName] = useState('');

  return (
    <div className="w-64 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Variable className="w-4 h-4 text-primary" /> Variables</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2">
        <p className="text-[10px] text-gray-500">Use <code className="bg-gray-100 px-1 rounded">{'{{variable.name}}'}</code> in messages.</p>
        {vars.map((v, i) => (
          <div key={i} className="border rounded-lg p-2 space-y-1">
            <div className="flex items-center justify-between">
              <code className="text-xs font-mono text-primary">{`{{${v.name}}}`}</code>
              <button onClick={() => setVars(vs => vs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
            </div>
            <select className="w-full text-xs border rounded px-1.5 py-1 outline-none bg-white" value={v.type} onChange={e => setVars(vs => vs.map((vv, j) => j === i ? { ...vv, type: e.target.value } : vv))}>
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
            </select>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-gray-100">
        <div className="flex gap-1.5">
          <input className="flex-1 text-xs border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" value={newName} onChange={e => setNewName(e.target.value)} placeholder="variable.name" onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { setVars(vs => [...vs, { name: newName.trim(), type: 'string', defaultValue: '' }]); setNewName(''); } }} />
          <button onClick={() => { if (newName.trim()) { setVars(vs => [...vs, { name: newName.trim(), type: 'string', defaultValue: '' }]); setNewName(''); } }} className="px-2 bg-primary text-white text-xs rounded-lg">Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 gap-4">
      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-gray-300 flex items-center justify-center">
        <FileJson className="w-8 h-8 text-gray-300" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-gray-700">No flow selected</p>
        <p className="text-sm text-gray-400 mt-1">Create a new chatbot flow or select one from the list</p>
      </div>
      <button onClick={onCreate} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 shadow-sm">
        <Plus className="w-4 h-4" /> Create Flow
      </button>
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────
export default function Chatbot() {
  const qc = useQueryClient();
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);

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
      toast.success('Flow created');
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

  // NodeSidebar's onAddNode when a canvas is active
  const [pendingNodeType, setPendingNodeType] = useState<string | null>(null);
  useEffect(() => { if (pendingNodeType) setPendingNodeType(null); }, [pendingNodeType]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
        onCreate={() => createMutation.mutate()}
        onDelete={id => deleteMutation.mutate(id)}
      />

      {/* Middle: node sidebar + canvas */}
      {activeFlowId ? (
        <ReactFlowProvider>
          <div className="flex flex-1 min-w-0 overflow-hidden">
            <NodeSidebar onAddNode={type => setPendingNodeType(type)} />
            <FlowCanvasWithAddNode flowId={activeFlowId} pendingNodeType={pendingNodeType} />
          </div>
        </ReactFlowProvider>
      ) : (
        <EmptyState onCreate={() => createMutation.mutate()} />
      )}
    </div>
  );
}

// Wrapper to bridge pendingNodeType from parent into the canvas
function FlowCanvasWithAddNode({ flowId, pendingNodeType }: { flowId: string; pendingNodeType: string | null }) {
  return <FlowCanvas flowId={flowId} />;
}
