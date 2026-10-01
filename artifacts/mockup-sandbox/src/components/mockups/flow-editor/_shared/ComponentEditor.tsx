/** Editor panel for a single flow component's settings */

import { useState, type ChangeEvent } from 'react';
import { Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import type { FlowComponent, FlowOption, TextInputType } from './flow';

interface Props {
  comp: FlowComponent;
  index: number;
  total: number;
  screenIsTerminal: boolean;
  maxImageBytes: number;
  onChange: (updated: FlowComponent) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const MAX_COMPONENT_IMAGE_BYTES = 1_000_000;
const DOCUMENT_TYPE_PRESETS = [
  { value: 'all', label: 'Any supported file', mimeTypes: [] },
  { value: 'pdf', label: 'PDF only', mimeTypes: ['application/pdf'] },
  { value: 'photos', label: 'Photos (JPEG or PNG)', mimeTypes: ['image/jpeg', 'image/png'] },
  {
    value: 'office',
    label: 'PDF, Word, or Excel',
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
];

function documentTypePreset(mimeTypes: string[] | undefined) {
  const sortedTypes = [...(mimeTypes ?? [])].sort().join(',');
  return DOCUMENT_TYPE_PRESETS.find(preset => [...preset.mimeTypes].sort().join(',') === sortedTypes)?.value ?? 'all';
}

export default function ComponentEditor({
  comp,
  index,
  total,
  screenIsTerminal,
  maxImageBytes,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  const [imageError, setImageError] = useState('');
  const [readingImage, setReadingImage] = useState(false);
  const isTextField = ['TextHeading', 'TextSubheading', 'TextBody', 'TextCaption', 'EmbeddedLink'].includes(comp.type);
  const isInputField = [
    'TextInput', 'TextArea', 'Dropdown', 'RadioButtonsGroup', 'CheckboxGroup', 'DatePicker',
    'OptIn', 'PhotoPicker', 'DocumentPicker',
  ].includes(comp.type);
  const hasOptions = ['Dropdown', 'RadioButtonsGroup', 'CheckboxGroup'].includes(comp.type);
  const isMediaPicker = comp.type === 'PhotoPicker' || comp.type === 'DocumentPicker';
  const imageUploadLimit = Math.min(MAX_COMPONENT_IMAGE_BYTES, Math.max(0, maxImageBytes));

  function set(patch: Partial<FlowComponent>) {
    onChange({ ...comp, ...patch });
  }

  function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setImageError('Choose a PNG or JPG image.');
      return;
    }
    if (file.size > imageUploadLimit) {
      setImageError(`This image is too large. Choose a file under ${Math.max(1, Math.floor(imageUploadLimit / 1024))} KB.`);
      return;
    }

    setImageError('');
    setReadingImage(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') set({ src: reader.result });
      else setImageError('Could not read this image. Please try another file.');
      setReadingImage(false);
    };
    reader.onerror = () => {
      setImageError('Could not read this image. Please try another file.');
      setReadingImage(false);
    };
    reader.readAsDataURL(file);
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
    TextHeading: 'H1 Heading',
    TextSubheading: 'H2 Subheading',
    TextBody: 'Body Text',
    TextCaption: 'Caption',
    TextInput: comp.inputType === 'email' ? 'Email'
      : comp.inputType === 'phone' ? 'Phone'
        : comp.inputType === 'password' ? 'Password'
          : comp.inputType === 'passcode' ? 'Passcode'
            : comp.inputType === 'number' ? 'Number Input'
              : 'Text Input',
    TextArea: 'Long Text',
    Dropdown: 'Dropdown',
    RadioButtonsGroup: 'Radio Buttons',
    CheckboxGroup: 'Checkboxes',
    DatePicker: 'Date Picker',
    OptIn: 'Opt-In Consent',
    PhotoPicker: 'Photo Upload',
    DocumentPicker: 'Document Upload',
    Image: 'Image',
    EmbeddedLink: 'Embedded Link',
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
        {/* Text shown to the customer */}
        {isTextField && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              {comp.type === 'EmbeddedLink' ? 'Link text' : 'Text'}
            </label>
            {comp.type === 'TextBody' ? (
              <textarea
                rows={3}
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
                maxLength={comp.type === 'EmbeddedLink' ? 25 : ['TextHeading', 'TextSubheading'].includes(comp.type) ? 80 : comp.type === 'TextCaption' ? 409 : undefined}
                placeholder={comp.type === 'EmbeddedLink' ? 'Read more' : 'Enter text...'}
              />
            )}
          </div>
        )}

        {/* Label for input fields */}
        {isInputField && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              {comp.type === 'OptIn' ? 'Consent statement' : 'Question or label'}
            </label>
            <input
              type="text"
              value={comp.label ?? ''}
              onChange={e => set({ label: e.target.value })}
              maxLength={comp.type === 'OptIn' ? 120 : comp.type === 'PhotoPicker' || comp.type === 'DocumentPicker' ? 80 : 80}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={comp.type === 'OptIn' ? 'I agree to...' : 'What should the customer answer?'}
            />
          </div>
        )}

        {/* Field name for input fields */}
        {isInputField && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              Answer name <span className="text-gray-400 font-normal">(used in response data)</span>
            </label>
            <input
              type="text"
              value={comp.name ?? ''}
              onChange={e => {
                const normalized = e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
                set({ name: normalized && !/^[a-z]/.test(normalized) ? `field_${normalized}` : normalized });
              }}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              placeholder="answer_name"
            />
          </div>
        )}

        {/* Input type for TextInput */}
        {comp.type === 'TextInput' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Input Type</label>
            <select
              value={comp.inputType ?? 'text'}
              onChange={e => set({ inputType: e.target.value as TextInputType })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="password">Password</option>
              <option value="passcode">Passcode</option>
            </select>
          </div>
        )}

        {(comp.type === 'OptIn' || comp.type === 'EmbeddedLink') && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              {comp.type === 'OptIn' ? 'Read-more website (optional)' : 'Website to open'}
            </label>
            <input
              type="url"
              value={comp.url ?? ''}
              onChange={e => set({ url: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="https://example.com"
            />
            {comp.type === 'OptIn' && (
              <p className="mt-1 text-[10px] text-gray-400">If added, WhatsApp shows a “Read more” link.</p>
            )}
          </div>
        )}

        {isMediaPicker && (
          <>
            {!screenIsTerminal && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
                Put this upload on the final screen. WhatsApp only sends uploaded files with the final answer.
              </p>
            )}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Short instructions (optional)</label>
              <textarea
                rows={2}
                maxLength={300}
                value={comp.description ?? ''}
                onChange={e => set({ description: e.target.value })}
                className="w-full resize-none text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Add a short hint..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Maximum size (MB)</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  step={1}
                  value={Math.max(1, Math.round((comp.maxFileSizeKb ?? 25600) / 1024))}
                  onChange={e => set({ maxFileSizeKb: Math.min(25600, Math.max(1, Number(e.target.value) * 1024)) })}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Maximum files</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={Math.min(10, Math.max(1, comp.maxUploadedFiles ?? 1))}
                  onChange={e => set({ maxUploadedFiles: Math.min(10, Math.max(1, Number(e.target.value))) })}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            {comp.type === 'PhotoPicker' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Where can customers choose photos from?</label>
                <select
                  value={comp.photoSource ?? 'camera_gallery'}
                  onChange={e => set({ photoSource: e.target.value as FlowComponent['photoSource'] })}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                >
                  <option value="camera_gallery">Camera or photo gallery</option>
                  <option value="camera">Camera only</option>
                  <option value="gallery">Photo gallery only</option>
                </select>
              </div>
            )}
            {comp.type === 'DocumentPicker' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Files to accept</label>
                <select
                  value={documentTypePreset(comp.allowedMimeTypes)}
                  onChange={e => set({
                    allowedMimeTypes: DOCUMENT_TYPE_PRESETS.find(preset => preset.value === e.target.value)?.mimeTypes ?? [],
                  })}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                >
                  {DOCUMENT_TYPE_PRESETS.map(preset => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {comp.type === 'Image' && (
          <>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Choose a PNG or JPG image</label>
              <input
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Choose a PNG or JPG image for this Flow screen"
                onChange={handleImageFileChange}
                disabled={readingImage || imageUploadLimit <= 0}
                className="block w-full text-[11px] text-gray-600 file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-2 file:py-1.5 file:text-[11px] file:font-medium hover:file:bg-gray-200 disabled:opacity-50"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                {readingImage
                  ? 'Reading image…'
                  : imageUploadLimit <= 0
                    ? 'The flow image limit is full. Remove or resize another image first.'
                    : `Up to ${Math.max(1, Math.floor(imageUploadLimit / 1024))} KB. The image is included in this flow.`}
              </p>
              {imageError && <p role="alert" className="mt-1 text-[10px] text-red-600">{imageError}</p>}
              {comp.src && (
                <div className="mt-2 flex items-start gap-2">
                  <img src={comp.src} alt={comp.altText ?? ''} className="h-16 w-24 rounded border object-contain bg-gray-50" />
                  <button type="button" onClick={() => set({ src: '' })} className="text-[10px] text-red-600 hover:underline">
                    Remove image
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Alternative text (accessibility)</label>
              <input
                type="text"
                maxLength={80}
                value={comp.altText ?? ''}
                onChange={e => set({ altText: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Describe the picture"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Fit the image</label>
              <select
                value={comp.scaleType ?? 'contain'}
                onChange={e => set({ scaleType: e.target.value as FlowComponent['scaleType'] })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              >
                <option value="contain">Show the whole image</option>
                <option value="cover">Fill and crop if needed</option>
              </select>
            </div>
          </>
        )}

        {/* Required toggle */}
        {isInputField && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(comp.required)}
              onChange={e => set({ required: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-[11px] text-gray-600">
              {comp.type === 'OptIn' ? 'Customer must agree' : isMediaPicker ? 'Upload is required' : 'Answer is required'}
            </span>
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
                    type="button"
                    onClick={() => removeOption(i)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                    aria-label={`Remove option ${i + 1}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
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
