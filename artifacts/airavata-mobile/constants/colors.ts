/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#17231d',
    tint: '#16a05a',

    // Core surfaces
    background: '#f7faf8',
    foreground: '#17231d',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#17231d',

    // Primary action color (buttons, links, active states)
    primary: '#16a05a',
    primaryForeground: '#ffffff',
    whatsappOutgoing: '#d9fdd3',
    whatsappIncoming: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#eaf5ee',
    secondaryForeground: '#183d29',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#edf2ef',
    mutedForeground: '#718078',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#eaf5ee',
    accentForeground: '#183d29',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#dce7e0',
    input: '#dce7e0',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
