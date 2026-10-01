/** Phone mockup preview of a WhatsApp Flow screen */

import { useEffect, useRef, useState } from 'react';
import type { FlowScreen, FlowComponent } from '../../types/flow';
import { DevicePreviewFrame, type PreviewDevice } from '../DevicePreview';

interface Props {
  screen: FlowScreen | null;
  flowName: string;
  device: PreviewDevice;
}

export default function PhonePreview({ screen, flowName, device }: Props) {
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const previewArea = previewAreaRef.current;
    const previewContent = previewContentRef.current;
    if (!previewArea || !previewContent) return;

    const fitPreview = () => {
      const availableHeight = previewArea.clientHeight;
      const availableWidth = previewArea.clientWidth;
      const contentHeight = previewContent.offsetHeight;
      const contentWidth = previewContent.offsetWidth;
      if (!availableHeight || !availableWidth || !contentHeight || !contentWidth) return;
      setPreviewScale(Math.min(1, availableHeight / contentHeight, availableWidth / contentWidth));
    };
    const observer = new ResizeObserver(fitPreview);
    observer.observe(previewArea);
    observer.observe(previewContent);
    fitPreview();

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flow-phone-preview flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-2">
      <div ref={previewAreaRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-x-0 top-0 flex justify-center">
          <div
            ref={previewContentRef}
            className="flex w-max flex-col items-center"
            style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center' }}
          >
            <DevicePreviewFrame device={device} screenWidth={300}>
              <div className="flex h-full min-h-0 w-full flex-col bg-[#efeae2]">
                {/* WhatsApp-style header */}
                <div className="flex h-14 shrink-0 items-center gap-3 bg-[#075E54] px-3 shadow-sm">
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
                <div className="flex min-h-0 flex-1 flex-col bg-white">
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
                  <div className="shrink-0 px-4 pb-4 pt-2 border-t border-gray-100">
                    <button className="w-full py-2.5 bg-[#00a884] text-white text-xs font-semibold rounded-lg">
                      {screen?.isTerminal ? 'Submit' : 'Next'}
                    </button>
                  </div>
                </div>
              </div>
            </DevicePreviewFrame>
          </div>
        </div>
      </div>
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
    case 'TextCaption':
      return <p className="text-[9px] leading-snug text-gray-500">{comp.text || 'Caption text'}</p>;
    case 'TextInput':
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label || 'Text field'}{comp.required && <span className="text-red-400"> *</span>}</p>
          <div className="border border-gray-200 rounded px-2 py-1.5 text-[10px] text-gray-400 bg-gray-50">
            {comp.inputType === 'email' ? 'name@example.com'
              : comp.inputType === 'phone' ? '+1 555 000 0000'
                : comp.inputType === 'password' || comp.inputType === 'passcode' ? '••••••••'
                  : comp.inputType === 'number' ? 'Enter a number'
                    : 'Enter text...'}
          </div>
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
    case 'OptIn':
      return (
        <div className="space-y-1.5">
          <div className="flex items-start gap-2 text-[10px] text-gray-700">
            <input type="checkbox" checked={false} readOnly aria-label={comp.label || 'Consent'} className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{comp.label || 'I agree'}{comp.required && <span className="text-red-500"> *</span>}</span>
          </div>
          {comp.url && (
            <a href={comp.url} target="_blank" rel="noreferrer" className="ml-5 text-[9px] font-medium text-blue-700 underline">
              Read more
            </a>
          )}
        </div>
      );
    case 'PhotoPicker':
      return (
        <div>
          <p className="mb-1 text-[10px] text-gray-500">
            {comp.label || 'Upload a photo'}{comp.required && <span className="text-red-400"> *</span>}
          </p>
          {comp.description && <p className="mb-1.5 text-[9px] leading-snug text-gray-500">{comp.description}</p>}
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2.5 text-[9px] text-gray-600">
            <span aria-hidden="true">📷</span>
            <span>{comp.photoSource === 'camera' ? 'Take a photo' : comp.photoSource === 'gallery' ? 'Choose from photos' : 'Take or choose a photo'}</span>
          </div>
          <p className="mt-1 text-[8px] text-gray-400">
            Up to {comp.maxUploadedFiles ?? 1} photo{(comp.maxUploadedFiles ?? 1) === 1 ? '' : 's'} · {Math.max(1, Math.round((comp.maxFileSizeKb ?? 25600) / 1024))} MB max
          </p>
        </div>
      );
    case 'DocumentPicker': {
      const mimeTypes = comp.allowedMimeTypes ?? [];
      const fileTypeLabel = mimeTypes.length === 0 ? 'Any supported file'
        : mimeTypes.length === 1 && mimeTypes[0] === 'application/pdf' ? 'PDF only'
          : mimeTypes.every(type => type.startsWith('image/')) ? 'JPEG or PNG images'
            : 'Selected document types';
      return (
        <div>
          <p className="mb-1 text-[10px] text-gray-500">
            {comp.label || 'Upload a document'}{comp.required && <span className="text-red-400"> *</span>}
          </p>
          {comp.description && <p className="mb-1.5 text-[9px] leading-snug text-gray-500">{comp.description}</p>}
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2.5 text-[9px] text-gray-600">
            <span aria-hidden="true">📄</span>
            <span>Choose a file</span>
          </div>
          <p className="mt-1 text-[8px] text-gray-400">
            {fileTypeLabel} · up to {comp.maxUploadedFiles ?? 1} file{(comp.maxUploadedFiles ?? 1) === 1 ? '' : 's'} · {Math.max(1, Math.round((comp.maxFileSizeKb ?? 25600) / 1024))} MB max
          </p>
        </div>
      );
    }
    case 'Image':
      return comp.src ? (
        <img
          src={comp.src}
          alt={comp.altText ?? ''}
          className="max-h-40 w-full rounded-md"
          style={{ objectFit: comp.scaleType === 'cover' ? 'cover' : 'contain' }}
        />
      ) : (
        <div
          role="img"
          aria-label={comp.altText || 'Image not selected'}
          className="flex min-h-16 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 text-center text-[9px] text-gray-400"
        >
          Add an image to preview it here
        </div>
      );
    case 'EmbeddedLink':
      return (
        <a
          href={comp.url || undefined}
          target={comp.url ? '_blank' : undefined}
          rel={comp.url ? 'noreferrer' : undefined}
          className="text-[10px] font-medium text-blue-700 underline"
        >
          {comp.text || 'Read more'}
        </a>
      );
    default:
      return null;
  }
}
