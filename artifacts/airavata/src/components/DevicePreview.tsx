import type { ReactNode } from 'react';
import { AndroidMockup, IPhoneMockup } from 'react-device-mockup';
import androidIcon from '@assets/android_1788728822650.png';
import appleIcon from '@assets/apple-logo_(1)_1788728825558.png';

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
            device === option
              ? 'bg-slate-900 text-white shadow-md ring-1 ring-slate-900/10'
              : 'text-gray-600 hover:bg-slate-50'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white">
            <img
              src={option === 'ios' ? appleIcon : androidIcon}
              alt=""
              className="h-4 w-4 object-contain"
            />
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
  hideStatusBar = false,
  children,
}: {
  device: PreviewDevice;
  screenWidth?: number;
  hideStatusBar?: boolean;
  children: ReactNode;
}) {
  if (device === 'ios') {
    return (
      <IPhoneMockup
        screenWidth={screenWidth}
        screenType="island"
        hideStatusBar={hideStatusBar}
        frameColor="#151922"
        statusbarColor="#f8fafc"
        hideNavBar={false}
      >
        {children}
      </IPhoneMockup>
    );
  }

  return (
    <AndroidMockup
      screenWidth={screenWidth}
      frameColor="#151922"
      statusbarColor="#f8fafc"
      navBarColor="#f8fafc"
      navBar="swipe"
      hideNavBar={false}
    >
      {children}
    </AndroidMockup>
  );
}