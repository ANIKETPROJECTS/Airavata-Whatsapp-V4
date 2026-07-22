export type ComponentType =
  | 'TextHeading'
  | 'TextSubheading'
  | 'TextBody'
  | 'TextInput'
  | 'TextArea'
  | 'Dropdown'
  | 'RadioButtonsGroup'
  | 'CheckboxGroup'
  | 'DatePicker';

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
  inputType?: string;
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

export const COMPONENT_PALETTE = [
  { type: 'TextHeading' as ComponentType, label: 'Heading', description: 'Large title text', emoji: '📝' },
  { type: 'TextSubheading' as ComponentType, label: 'Subheading', description: 'Medium title text', emoji: '📄' },
  { type: 'TextBody' as ComponentType, label: 'Body Text', description: 'Paragraph / description', emoji: '📋' },
  { type: 'TextInput' as ComponentType, label: 'Text Input', description: 'Single-line text field', emoji: '✏️' },
  { type: 'TextArea' as ComponentType, label: 'Text Area', description: 'Multi-line text field', emoji: '📝' },
  { type: 'Dropdown' as ComponentType, label: 'Dropdown', description: 'Select from a list', emoji: '▾' },
  { type: 'RadioButtonsGroup' as ComponentType, label: 'Radio Buttons', description: 'Choose one option', emoji: '🔘' },
  { type: 'CheckboxGroup' as ComponentType, label: 'Checkboxes', description: 'Choose multiple options', emoji: '☑️' },
  { type: 'DatePicker' as ComponentType, label: 'Date Picker', description: 'Pick a date', emoji: '📅' },
] as const;

export function makeDefaultComponent(type: ComponentType): FlowComponent {
  const base: FlowComponent = { type, required: false };
  switch (type) {
    case 'TextHeading':
      return { ...base, text: 'New Heading' };
    case 'TextSubheading':
      return { ...base, text: 'Subheading' };
    case 'TextBody':
      return { ...base, text: 'Enter your text here.' };
    case 'TextInput':
      return { ...base, name: 'field_' + Date.now(), label: 'Text Field', required: true, inputType: 'text' };
    case 'TextArea':
      return { ...base, name: 'field_' + Date.now(), label: 'Text Area' };
    case 'Dropdown':
      return { ...base, name: 'field_' + Date.now(), label: 'Select Option', required: true, options: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] };
    case 'RadioButtonsGroup':
      return { ...base, name: 'field_' + Date.now(), label: 'Choose One', required: true, options: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] };
    case 'CheckboxGroup':
      return { ...base, name: 'field_' + Date.now(), label: 'Select All That Apply', options: [{ id: '1', title: 'Option 1' }, { id: '2', title: 'Option 2' }] };
    case 'DatePicker':
      return { ...base, name: 'field_' + Date.now(), label: 'Select Date' };
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
