import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronRight, Plus, PlusCircle, X } from 'lucide-react';
import type { ComponentPaletteItem, Flow, FlowComponent, FlowScreen } from './flow';
import { COMPONENT_CATEGORIES, makeDefaultComponent, makeNewScreen } from './flow';
import ComponentEditor from './ComponentEditor';
import PhonePreview from './PhonePreview';
import { DevicePreviewSelector, type PreviewDevice } from './DevicePreview';
import textInputPaletteIcon from '../../../../assets/flow-input-icons/text-input.png';
import emailPaletteIcon from '../../../../assets/flow-input-icons/email.png';
import phonePaletteIcon from '../../../../assets/flow-input-icons/phone.png';
import passwordPaletteIcon from '../../../../assets/flow-input-icons/password.png';

const MAX_SCREEN_COMPONENTS = 50;
const MAX_FLOW_INLINE_IMAGE_BYTES = 3_000_000;
const INPUT_FIELD_ICONS: Record<string, string> = {
  'text-input': textInputPaletteIcon,
  email: emailPaletteIcon,
  phone: phonePaletteIcon,
  password: passwordPaletteIcon,
};

function inlineImageBytes(src?: string) {
  const match = src?.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return 0;
  const data = match[1];
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(data.length * 3 / 4) - padding);
}

function StatusBadge({ status }: { status: Flow['status'] }) {
  const map = {
    DRAFT: 'bg-yellow-100 text-yellow-700',
    PUBLISHED: 'bg-green-100 text-green-700',
    DEPRECATED: 'bg-gray-100 text-gray-500',
  };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-none ${map[status]}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function FlowEditorWorkspace({ enhanced = false }: { enhanced?: boolean }) {
  const flow: Flow = {
    id: 'flow-service-request',
    name: 'Customer Service Request',
    categories: ['CUSTOMER_SUPPORT'],
    status: 'DRAFT',
    screens: [
      {
        id: 'SCREEN_A',
        title: 'Contact details',
        isTerminal: false,
        nextScreenId: 'SCREEN_B',
        components: [
          { type: 'TextHeading', text: 'How can we help?' },
          { type: 'TextBody', text: 'Share a few details and our team will get back to you shortly.' },
          { type: 'TextInput', inputType: 'text', name: 'full_name', label: 'Your full name', required: true },
          { type: 'TextInput', inputType: 'email', name: 'email_address', label: 'Email address', required: true },
          { type: 'Dropdown', name: 'request_type', label: 'What do you need help with?', required: true, options: [{ id: 'billing', title: 'Billing' }, { id: 'product', title: 'Product support' }, { id: 'other', title: 'Something else' }] },
        ],
      },
      {
        id: 'SCREEN_B',
        title: 'Request details',
        isTerminal: true,
        components: [
          { type: 'TextSubheading', text: 'Tell us a little more' },
          { type: 'TextArea', name: 'request_details', label: 'How can we help?', required: true },
          { type: 'OptIn', name: 'contact_consent', label: 'I agree to be contacted about this request', required: true },
        ],
      },
    ],
    createdAt: '2025-03-12T10:30:00.000Z',
    updatedAt: '2025-03-12T10:30:00.000Z',
  };
  const [screens, setScreens] = useState<FlowScreen[]>(flow.screens);
  const [activeScreenIdx, setActiveScreenIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('ios');
  const activeScreen = screens[activeScreenIdx] ?? null;
  const activeScreenIsTerminal = Boolean(activeScreen?.isTerminal) ||
    (!screens.some(screen => screen.isTerminal) && activeScreenIdx === screens.length - 1);

  function updateScreen(idx: number, patch: Partial<FlowScreen>) {
    setScreens(prev => prev.map((screen, i) => i === idx ? { ...screen, ...patch } : screen));
  }

  function addScreen() {
    const newScreen = { ...makeNewScreen(screens.length + 1), isTerminal: true };
    setScreens(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, isTerminal: false, nextScreenId: newScreen.id };
      }
      return [...updated, newScreen];
    });
    setActiveScreenIdx(screens.length);
  }

  function removeScreen(idx: number) {
    if (screens.length === 1) {
      toast.error('A flow must have at least one screen');
      return;
    }
    setScreens(prev => prev.filter((_, i) => i !== idx));
    setActiveScreenIdx(Math.min(idx, screens.length - 2));
  }

  function componentLimitReason(item: ComponentPaletteItem) {
    const components = activeScreen?.components ?? [];
    if (!activeScreen) return 'Choose a screen first.';
    if (components.length >= MAX_SCREEN_COMPONENTS) return `A screen can have up to ${MAX_SCREEN_COMPONENTS} components.`;
    if ((item.type === 'PhotoPicker' || item.type === 'DocumentPicker') &&
      components.some(comp => comp.type === 'PhotoPicker' || comp.type === 'DocumentPicker')) {
      return 'WhatsApp allows only one photo or document upload on each screen.';
    }
    if (item.type === 'OptIn' && components.filter(comp => comp.type === 'OptIn').length >= 5) return 'A screen can have up to five consent checkboxes.';
    if (item.type === 'EmbeddedLink' && components.filter(comp => comp.type === 'EmbeddedLink').length >= 2) return 'A screen can have up to two embedded links.';
    return null;
  }

  function addComponent(item: ComponentPaletteItem) {
    const reason = componentLimitReason(item);
    if (reason) {
      toast.error(reason);
      return;
    }
    const comp = makeDefaultComponent(item.type, item.inputType);
    if (comp.name) {
      const usedNames = new Set(screens.flatMap(screen => screen.components.map(existing => existing.name).filter(Boolean)));
      const baseName = comp.name;
      let candidate = baseName;
      let suffix = 2;
      while (usedNames.has(candidate)) candidate = `${baseName}_${suffix++}`;
      comp.name = candidate;
    }
    updateScreen(activeScreenIdx, { components: [...(activeScreen?.components ?? []), comp] });
  }

  function updateComponent(compIdx: number, updated: FlowComponent) {
    updateScreen(activeScreenIdx, { components: (activeScreen?.components ?? []).map((comp, i) => i === compIdx ? updated : comp) });
  }

  function removeComponent(compIdx: number) {
    updateScreen(activeScreenIdx, { components: (activeScreen?.components ?? []).filter((_, i) => i !== compIdx) });
  }

  function moveComponent(compIdx: number, dir: 'up' | 'down') {
    const components = [...(activeScreen?.components ?? [])];
    const targetIdx = dir === 'up' ? compIdx - 1 : compIdx + 1;
    if (targetIdx < 0 || targetIdx >= components.length) return;
    [components[compIdx], components[targetIdx]] = [components[targetIdx], components[compIdx]];
    updateScreen(activeScreenIdx, { components });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.resolve(screens);
      toast.success('Flow saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`flow-editor-workspace h-screen flex flex-col overflow-hidden ${enhanced ? 'flow-editor-enhanced' : ''}`}>
      <div className="h-14 bg-white border-b px-4 flex items-center shrink-0 shadow-sm z-10">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => toast.message('Back to flows')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <span className="font-semibold text-gray-900 text-sm">{flow.name}</span>
          <StatusBadge status={flow.status} />
          <button onClick={handleSave} disabled={saving} className="ml-1 flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 shadow-sm">
            <Check className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save Flow'}
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b bg-white">
        <div className="grid grid-cols-[13rem_15rem_minmax(0,1fr)] xl:grid-cols-[13rem_15rem_minmax(0,1fr)_360px] 2xl:grid-cols-[13rem_15rem_minmax(0,1fr)_400px]">
          <div className="flex min-w-0 items-start justify-between border-r px-3 py-1.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">Screens</h2>
            <button type="button" onClick={addScreen} aria-label="Add screen" title="Add screen" className="rounded p-1 hover:bg-gray-100"><PlusCircle className="h-4 w-4 text-primary" /></button>
          </div>
          <div className="flex min-w-0 items-start border-r px-3 py-1.5"><h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">Add a component</h2></div>
          <div className="flex min-w-0 flex-nowrap items-center justify-center gap-x-2 px-2 py-1.5">
            {activeScreen ? (
              <>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-xs font-medium text-gray-500">Title</span>
                  <input type="text" value={activeScreen.title} onChange={e => updateScreen(activeScreenIdx, { title: e.target.value })} className="w-32 min-w-0 max-w-full rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-xs font-medium text-gray-500">Next screen</span>
                  {activeScreen.isTerminal ? <span className="whitespace-nowrap text-xs font-medium text-green-600">Submit (final)</span> : (
                    <select value={activeScreen.nextScreenId ?? ''} onChange={e => updateScreen(activeScreenIdx, { nextScreenId: e.target.value })} className="w-32 min-w-0 max-w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">Select screen...</option>
                      {screens.filter((_, i) => i !== activeScreenIdx).map(screen => <option key={screen.id} value={screen.id}>{screen.title}</option>)}
                    </select>
                  )}
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap">
                  <div onClick={() => updateScreen(activeScreenIdx, { isTerminal: !activeScreen.isTerminal, nextScreenId: undefined })} className={`relative h-4 w-8 rounded-full transition-colors ${activeScreen.isTerminal ? 'bg-green-500' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${activeScreen.isTerminal ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-xs text-gray-600">Final screen</span>
                </label>
              </>
            ) : <span className="text-xs text-gray-400">Select a screen to edit</span>}
          </div>
          <div className="hidden min-w-0 items-start justify-between gap-1 border-l px-3 py-1.5 xl:flex">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">Preview</h2>
            <DevicePreviewSelector device={previewDevice} onChange={setPreviewDevice} />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="w-52 bg-white border-r flex flex-col shrink-0">
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {screens.map((screen, idx) => (
              <div key={screen.id} onClick={() => setActiveScreenIdx(idx)} className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${activeScreenIdx === idx ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-700'}`}>
                <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${activeScreenIdx === idx ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>{idx + 1}</div>
                <span className="text-xs font-medium flex-1 truncate">{screen.title}</span>
                {screen.isTerminal && <span className="text-[10px] text-green-600 font-semibold">END</span>}
                <button onClick={e => { e.stopPropagation(); removeScreen(idx); }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <div className="p-2 border-t">
            <button onClick={addScreen} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-primary font-medium border border-dashed border-primary/40 rounded-xl hover:bg-primary/5"><Plus className="w-3.5 h-3.5" /> Add Screen</button>
          </div>
        </div>

        <div className="flow-editor-center min-w-0 flex-1 flex flex-col overflow-hidden bg-gray-50">
          {activeScreen ? (
            <div className="flex min-w-0 flex-1 overflow-hidden">
              <div className="w-60 bg-white border-r flex flex-col shrink-0">
                <div className="flex-1 overflow-y-auto p-2">
                  {COMPONENT_CATEGORIES.map(category => (
                    <section key={category.id} className="mb-4 last:mb-1">
                      <div className="px-2 pb-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500"><span aria-hidden="true" className="mr-1.5">{category.emoji}</span>{category.title}</p>
                        {category.id !== 'input-fields' && (
                          <p className="mt-0.5 text-[9px] leading-snug text-gray-400">{category.description}</p>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {category.items.map(item => {
                          const disabledReason = componentLimitReason(item);
                          const paletteIcon = category.id === 'input-fields' ? INPUT_FIELD_ICONS[item.id] : undefined;
                          return <button key={item.id} type="button" onClick={() => addComponent(item)} disabled={Boolean(disabledReason)} title={disabledReason ?? (category.id === 'input-fields' ? undefined : item.description)} className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45">
                            {paletteIcon ? (
                              <img src={paletteIcon} alt="" aria-hidden="true" className="h-6 w-6 shrink-0 object-contain" />
                            ) : (
                              <span aria-hidden="true" className="w-6 shrink-0 text-center text-sm">{item.emoji}</span>
                            )}
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold leading-tight text-gray-700 group-hover:text-primary">{item.label}</p>
                              {category.id !== 'input-fields' && (
                                <p className="mt-0.5 text-[9px] leading-tight text-gray-400">{item.description}</p>
                              )}
                            </div>
                          </button>;
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div className="flow-editor-component-list min-w-0 flex-1 overflow-y-auto p-4 space-y-2">
                {activeScreen.components.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-300 gap-2"><PlusCircle className="w-8 h-8" /><p className="text-xs text-center text-gray-400">Click a component on the left to add it to this screen</p></div>
                ) : activeScreen.components.map((comp, compIdx) => (
                  <ComponentEditor
                    key={compIdx}
                    comp={comp}
                    index={compIdx}
                    total={activeScreen.components.length}
                    screenIsTerminal={activeScreenIsTerminal}
                    maxImageBytes={Math.max(0, MAX_FLOW_INLINE_IMAGE_BYTES - screens.reduce((totalBytes, screen, screenIdx) => totalBytes + screen.components.reduce((screenBytes, other, otherIdx) => screenBytes + (screenIdx === activeScreenIdx && otherIdx === compIdx ? 0 : inlineImageBytes(other.src)), 0), 0))}
                    onChange={updated => updateComponent(compIdx, updated)}
                    onRemove={() => removeComponent(compIdx)}
                    onMoveUp={() => moveComponent(compIdx, 'up')}
                    onMoveDown={() => moveComponent(compIdx, 'down')}
                  />
                ))}
              </div>
            </div>
          ) : <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a screen to edit</div>}
        </div>

        <div className="flow-editor-phone-panel hidden min-h-0 shrink-0 flex-col overflow-hidden overscroll-none border-l bg-white xl:flex xl:w-[360px] 2xl:w-[400px]">
          <PhonePreview screen={activeScreen} flowName={flow.name} device={previewDevice} />
        </div>
      </div>
    </div>
  );
}