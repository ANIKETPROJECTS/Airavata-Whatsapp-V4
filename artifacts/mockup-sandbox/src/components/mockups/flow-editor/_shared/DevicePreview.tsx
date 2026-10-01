import type { ReactNode } from 'react';

export type PreviewDevice = 'android' | 'ios';

export function DevicePreviewSelector({
  device,
  onChange,
}: {
  device: PreviewDevice;
  onChange: (device: PreviewDevice) => void;
}) {
  return (
    <div className="flex rounded-lg border bg-white p-0.5 shadow-sm" aria-label="Preview device">
      {(['android', 'ios'] as const).map(option => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          title={`Preview on ${option === 'ios' ? 'iOS' : 'Android'}`}
          aria-label={`Preview on ${option === 'ios' ? 'iOS' : 'Android'}`}
          aria-pressed={device === option}
          className={`flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
            device === option ? 'bg-slate-900 text-white shadow-md ring-1 ring-slate-900/10' : 'text-gray-600 hover:bg-slate-50'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-[10px] text-slate-900">
            {option === 'ios' ? '●' : '▣'}
          </span>
          <span>{option === 'ios' ? 'iOS' : 'Android'}</span>
        </button>
      ))}
    </div>
  );
}

export function DevicePreviewFrame({
  device,
  screenWidth = 300,
  children,
}: {
  device: PreviewDevice;
  screenWidth?: number;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative rounded-[42px] border-[9px] border-[#151922] bg-[#151922] p-[5px] shadow-xl ${
        device === 'ios' ? 'rounded-[42px]' : 'rounded-[32px]'
      }`}
      style={{ width: screenWidth + 28 }}
    >
      <div className="relative overflow-hidden rounded-[30px] bg-white" style={{ width: screenWidth, height: 610 }}>
        {device === 'ios' && <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#151922]" />}
        {children}
      </div>
      <div className="mx-auto mt-1 h-1 w-16 rounded-full bg-white/50" />
    </div>
  );
}