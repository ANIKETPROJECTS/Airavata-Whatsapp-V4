/** Editor panel for a single flow component's settings */

import { Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import type { FlowComponent, FlowOption } from '../../types/flow';

interface Props {
  comp: FlowComponent;
  index: number;
  total: number;
  onChange: (updated: FlowComponent) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export default function ComponentEditor({ comp, index, total, onChange, onRemove, onMoveUp, onMoveDown }: Props) {
  const isTextField = ['TextHeading', 'TextSubheading', 'TextBody'].includes(comp.type);
  const isInputField = ['TextInput', 'TextArea', 'Dropdown', 'RadioButtonsGroup', 'CheckboxGroup', 'DatePicker'].includes(comp.type);
  const hasOptions = ['Dropdown', 'RadioButtonsGroup', 'CheckboxGroup'].includes(comp.type);

  function set(patch: Partial<FlowComponent>) {
    onChange({ ...comp, ...patch });
  }

  function addOption() {
    const opts = comp.options ?? [];
    set({ options: [...opts, { id: String(Date.now()), title: '' }] });
  }

  function updateOption(i: number, title: string) {
    const opts = (comp.options ?? []).map((o, idx) => idx === i ? { ...o, title } : o);
    set({ options: opts });
  }

  function removeOption(i: number) {
    set({ options: (comp.options ?? []).filter((_, idx) => idx !== i) });
  }

  const typeLabel: Record<string, string> = {
    TextHeading: 'Heading',
    TextSubheading: 'Subheading',
    TextBody: 'Body Text',
    TextInput: 'Text Input',
    TextArea: 'Text Area',
    Dropdown: 'Dropdown',
    RadioButtonsGroup: 'Radio Buttons',
    CheckboxGroup: 'Checkboxes',
    DatePicker: 'Date Picker',
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
        <span className="text-xs font-semibold text-gray-600 flex-1">{typeLabel[comp.type] ?? comp.type}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            <ChevronUp className="w-3 h-3 text-gray-500" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            <ChevronDown className="w-3 h-3 text-gray-500" />
          </button>
          <button onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="px-3 py-3 space-y-2.5">
        {/* Text content for heading/body */}
        {isTextField && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Text</label>
            {comp.type === 'TextBody' ? (
              <textarea
                rows={2}
                value={comp.text ?? ''}
                onChange={e => set({ text: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder="Enter text..."
              />
            ) : (
              <input
                type="text"
                value={comp.text ?? ''}
                onChange={e => set({ text: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter text..."
              />
            )}
          </div>
        )}

        {/* Label for input fields */}
        {isInputField && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Label</label>
            <input
              type="text"
              value={comp.label ?? ''}
              onChange={e => set({ label: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Field label..."
            />
          </div>
        )}

        {/* Field name for input fields */}
        {isInputField && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              Field Name <span className="text-gray-400 font-normal">(used in submission data)</span>
            </label>
            <input
              type="text"
              value={comp.name ?? ''}
              onChange={e => set({ name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              placeholder="field_name"
            />
          </div>
        )}

        {/* Input type for TextInput */}
        {comp.type === 'TextInput' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Input Type</label>
            <select
              value={comp.inputType ?? 'text'}
              onChange={e => set({ inputType: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="passcode">Passcode</option>
            </select>
          </div>
        )}

        {/* Required toggle */}
        {isInputField && (
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => set({ required: !comp.required })}
              className={`w-8 h-4 rounded-full transition-colors ${comp.required ? 'bg-primary' : 'bg-gray-200'} relative cursor-pointer`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${comp.required ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-[11px] text-gray-600">Required field</span>
          </label>
        )}

        {/* Options for dropdown/radio/checkbox */}
        {hasOptions && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Options</label>
            <div className="space-y-1.5">
              {(comp.options ?? []).map((opt: FlowOption, i: number) => (
                <div key={opt.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={opt.title}
                    onChange={e => updateOption(i, e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={`Option ${i + 1}`}
                  />
                  <button
                    onClick={() => removeOption(i)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={addOption}
                className="text-[11px] text-primary font-medium hover:underline"
              >
                + Add option
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
