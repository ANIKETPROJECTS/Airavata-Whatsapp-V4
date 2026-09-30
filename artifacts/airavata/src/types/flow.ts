export type ComponentType =
  | 'TextHeading'
  | 'TextSubheading'
  | 'TextBody'
  | 'TextCaption'
  | 'TextInput'
  | 'TextArea'
  | 'Dropdown'
  | 'RadioButtonsGroup'
  | 'CheckboxGroup'
  | 'DatePicker'
  | 'OptIn'
  | 'PhotoPicker'
  | 'DocumentPicker'
  | 'Image'
  | 'EmbeddedLink';

export type TextInputType = 'text' | 'number' | 'email' | 'phone' | 'password' | 'passcode';

export interface FlowOption {
  id: string;
  title: string;
}

export interface FlowComponent {
  type: ComponentType;
  text?: string;
  name?: string;
  label?: string;
  required?: boolean;
  options?: FlowOption[];
  inputType?: TextInputType;
  url?: string;
  description?: string;
  photoSource?: 'camera_gallery' | 'camera' | 'gallery';
  maxFileSizeKb?: number;
  maxUploadedFiles?: number;
  allowedMimeTypes?: string[];
  src?: string;
  altText?: string;
  scaleType?: 'contain' | 'cover';
}

export interface FlowScreen {
  id: string;
  title: string;
  isTerminal: boolean;
  nextScreenId?: string;
  components: FlowComponent[];
}

export interface Flow {
  id: string;
  name: string;
  categories: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
  metaFlowId?: string;
  endpointUri?: string;
  screens: FlowScreen[];
  createdAt: string;
  updatedAt: string;
}

export const FLOW_CATEGORIES = [
  { value: 'SIGN_UP', label: 'Sign up' },
  { value: 'SIGN_IN', label: 'Log in' },
  { value: 'APPOINTMENT_BOOKING', label: 'Appointment booking' },
  { value: 'LEAD_GENERATION', label: 'Lead generation' },
  { value: 'SHOPPING', label: 'Shopping' },
  { value: 'CONTACT_US', label: 'Contact us' },
  { value: 'CUSTOMER_SUPPORT', label: 'Customer support' },
  { value: 'SURVEY', label: 'Survey' },
  { value: 'OTHER', label: 'Other' },
] as const;

export interface ComponentPaletteItem {
  id: string;
  type: ComponentType;
  label: string;
  description: string;
  emoji: string;
  inputType?: TextInputType;
}

export interface ComponentCategory {
  id: string;
  title: string;
  description: string;
  emoji: string;
  items: ComponentPaletteItem[];
}

export const COMPONENT_CATEGORIES: ComponentCategory[] = [
  {
    id: 'input-fields',
    title: 'Input Fields',
    description: 'The customer fills these in',
    emoji: '📋',
    items: [
      { id: 'text-input', type: 'TextInput', inputType: 'text', label: 'Text Input', description: 'A short written answer', emoji: '✏️' },
      { id: 'email', type: 'TextInput', inputType: 'email', label: 'Email', description: 'An email address with format checking', emoji: '📧' },
      { id: 'phone', type: 'TextInput', inputType: 'phone', label: 'Phone', description: 'A phone number', emoji: '📞' },
      { id: 'password', type: 'TextInput', inputType: 'password', label: 'Password', description: 'A private, hidden text answer', emoji: '🔒' },
      { id: 'long-text', type: 'TextArea', label: 'Long Text', description: 'A longer, multi-line answer', emoji: '📝' },
      { id: 'radio-buttons', type: 'RadioButtonsGroup', label: 'Radio Buttons', description: 'Choose one answer', emoji: '🔘' },
      { id: 'checkboxes', type: 'CheckboxGroup', label: 'Checkboxes', description: 'Choose more than one answer', emoji: '☑️' },
      { id: 'dropdown', type: 'Dropdown', label: 'Dropdown', description: 'Choose from a compact list', emoji: '▾' },
      { id: 'date-picker', type: 'DatePicker', label: 'Date Picker', description: 'Choose a date', emoji: '📅' },
      { id: 'opt-in', type: 'OptIn', label: 'Opt-In Consent', description: 'Ask the customer to agree', emoji: '✅' },
      { id: 'photo-picker', type: 'PhotoPicker', label: 'Photo Upload', description: 'Add photos from camera or gallery', emoji: '📷' },
      { id: 'document-picker', type: 'DocumentPicker', label: 'Document Upload', description: 'Attach a supported file', emoji: '📄' },
    ],
  },
  {
    id: 'display-elements',
    title: 'Display Elements',
    description: 'Shown to the customer; no answer needed',
    emoji: '🎨',
    items: [
      { id: 'heading', type: 'TextHeading', label: 'H1 Heading', description: 'Large title at the top', emoji: 'H1' },
      { id: 'subheading', type: 'TextSubheading', label: 'H2 Subheading', description: 'Smaller section title', emoji: 'H2' },
      { id: 'body-text', type: 'TextBody', label: 'Body Text', description: 'Instructions or helpful details', emoji: '¶' },
      { id: 'caption', type: 'TextCaption', label: 'Caption', description: 'Small supporting text', emoji: 'Tt' },
      { id: 'image', type: 'Image', label: 'Image', description: 'Show a picture in the flow', emoji: '🖼️' },
      { id: 'embedded-link', type: 'EmbeddedLink', label: 'Embedded Link', description: 'Open a website from the flow', emoji: '🔗' },
    ],
  },
];

export function makeDefaultComponent(type: ComponentType, inputType: TextInputType = 'text'): FlowComponent {
  const base: FlowComponent = { type, required: false };
  switch (type) {
    case 'TextHeading':
      return { ...base, text: 'New heading' };
    case 'TextSubheading':
      return { ...base, text: 'Section title' };
    case 'TextBody':
      return { ...base, text: 'Enter your text here.' };
    case 'TextCaption':
      return { ...base, text: 'Add a short caption.' };
    case 'TextInput':
      return {
        ...base,
        name: 'field',
        label: inputType === 'email' ? 'Email address'
          : inputType === 'phone' ? 'Phone number'
            : inputType === 'password' ? 'Password'
              : 'Your answer',
        required: true,
        inputType,
      };
    case 'TextArea':
      return { ...base, name: 'field', label: 'Your answer' };
    case 'Dropdown':
      return { ...base, name: 'field', label: 'Choose an option', required: true, options: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] };
    case 'RadioButtonsGroup':
      return { ...base, name: 'field', label: 'Choose one', required: true, options: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] };
    case 'CheckboxGroup':
      return { ...base, name: 'field', label: 'Choose all that apply', options: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] };
    case 'DatePicker':
      return { ...base, name: 'field', label: 'Choose a date' };
    case 'OptIn':
      return { ...base, name: 'consent', label: 'I agree to the terms and conditions', required: true };
    case 'PhotoPicker':
      return {
        ...base,
        name: 'photo_upload',
        label: 'Upload a photo',
        description: 'Choose a photo or take a new one.',
        photoSource: 'camera_gallery',
        maxFileSizeKb: 25600,
        maxUploadedFiles: 1,
      };
    case 'DocumentPicker':
      return {
        ...base,
        name: 'document_upload',
        label: 'Upload a document',
        description: 'Choose a document from your device.',
        maxFileSizeKb: 25600,
        maxUploadedFiles: 1,
        allowedMimeTypes: [],
      };
    case 'Image':
      return { ...base, altText: '', scaleType: 'contain' };
    case 'EmbeddedLink':
      return { ...base, text: 'Read more', url: '' };
    default:
      return base;
  }
}

const SCREEN_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];

export function makeNewScreen(index: number): FlowScreen {
  const letter = SCREEN_LETTERS[index - 1] ?? String.fromCharCode(64 + index);
  return {
    id: `SCREEN_${letter}`,
    title: `Screen ${index}`,
    isTerminal: false,
    components: [],
  };
}
