/** Phone mockup preview of a WhatsApp Flow screen */

import type { FlowScreen, FlowComponent } from '../../types/flow';

interface Props {
  screen: FlowScreen | null;
  flowName: string;
}

export default function PhonePreview({ screen, flowName }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-6">
      {/* Phone shell */}
      <div className="relative w-[280px] bg-white rounded-[2.5rem] shadow-2xl border-4 border-gray-800 overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-800 rounded-b-xl z-10" />

        {/* WhatsApp-style header */}
        <div className="bg-[#075E54] pt-7 pb-3 px-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">
            A
          </div>
          <div>
            <p className="text-white text-xs font-semibold">{flowName || 'Airavata'}</p>
            <p className="text-green-200 text-[10px]">Business Account</p>
          </div>
          <button className="ml-auto text-white opacity-70">✕</button>
        </div>

        {/* Flow screen content */}
        <div className="bg-white min-h-[420px] flex flex-col">
          {/* Screen title bar */}
          <div className="bg-[#f0f2f5] px-4 py-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-700 truncate">
              {screen?.title || 'Screen'}
            </p>
          </div>

          {/* Components */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {!screen || screen.components.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-300">
                <p className="text-xs text-center">Add components to see the preview</p>
              </div>
            ) : (
              screen.components.map((comp, i) => (
                <PreviewComponent key={i} comp={comp} />
              ))
            )}
          </div>

          {/* Footer button */}
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            <button className="w-full py-2.5 bg-[#00a884] text-white text-xs font-semibold rounded-lg">
              {screen?.isTerminal ? 'Submit' : 'Next'}
            </button>
          </div>
        </div>

        {/* Home bar */}
        <div className="h-4 bg-white flex items-center justify-center">
          <div className="w-20 h-1 bg-gray-300 rounded-full" />
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">Live preview • WhatsApp Flow</p>
    </div>
  );
}

function PreviewComponent({ comp }: { comp: FlowComponent }) {
  switch (comp.type) {
    case 'TextHeading':
      return <p className="text-sm font-bold text-gray-900">{comp.text || 'Heading'}</p>;
    case 'TextSubheading':
      return <p className="text-xs font-semibold text-gray-700">{comp.text || 'Subheading'}</p>;
    case 'TextBody':
      return <p className="text-xs text-gray-600 leading-relaxed">{comp.text || 'Body text'}</p>;
    case 'TextInput':
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label || 'Text field'}{comp.required && <span className="text-red-400"> *</span>}</p>
          <div className="border border-gray-200 rounded px-2 py-1.5 text-[10px] text-gray-400 bg-gray-50">Enter text...</div>
        </div>
      );
    case 'TextArea':
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label || 'Text area'}{comp.required && <span className="text-red-400"> *</span>}</p>
          <div className="border border-gray-200 rounded px-2 py-2 text-[10px] text-gray-400 bg-gray-50 h-12">Enter text...</div>
        </div>
      );
    case 'Dropdown':
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label || 'Dropdown'}{comp.required && <span className="text-red-400"> *</span>}</p>
          <div className="border border-gray-200 rounded px-2 py-1.5 text-[10px] text-gray-400 bg-gray-50 flex justify-between">
            <span>Select an option</span><span>▾</span>
          </div>
        </div>
      );
    case 'RadioButtonsGroup':
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label || 'Select one'}{comp.required && <span className="text-red-400"> *</span>}</p>
          <div className="space-y-1">
            {(comp.options || [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }]).slice(0, 3).map(o => (
              <div key={o.id} className="flex items-center gap-2 text-[10px] text-gray-600">
                <div className="w-3 h-3 rounded-full border border-gray-300" />
                {o.title}
              </div>
            ))}
          </div>
        </div>
      );
    case 'CheckboxGroup':
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label || 'Select all that apply'}{comp.required && <span className="text-red-400"> *</span>}</p>
          <div className="space-y-1">
            {(comp.options || [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }]).slice(0, 3).map(o => (
              <div key={o.id} className="flex items-center gap-2 text-[10px] text-gray-600">
                <div className="w-3 h-3 rounded border border-gray-300" />
                {o.title}
              </div>
            ))}
          </div>
        </div>
      );
    case 'DatePicker':
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label || 'Date'}{comp.required && <span className="text-red-400"> *</span>}</p>
          <div className="border border-gray-200 rounded px-2 py-1.5 text-[10px] text-gray-400 bg-gray-50 flex justify-between">
            <span>DD/MM/YYYY</span><span>📅</span>
          </div>
        </div>
      );
    default:
      return null;
  }
}
