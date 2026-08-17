// components/node-canvas/theme.ts
//
// Vorrex's palette. Canvas background stays dark (a workflow graph needs a
// low-noise backdrop so wires and node cards read clearly — every builder
// in this space, n8n/Zapier/Make/Retool, does the same), but every accent
// is a saturated, high-contrast color instead of the old single muted gold
// — each node category gets its own bright identity, and buttons/links use
// a vivid violet primary instead of a "safe" neutral.

export const theme = {
  canvasBg: "#0A0A12",
  dotColor: "#242438",
  panelBg: "#12121C",
  cardBg: "#15151F",
  cardBgHover: "#1C1C2A",
  border: "#27273B",
  borderStrong: "#3A3A56",
  text: "#F5F5FA",
  textMuted: "#9C9CBE",
  textFaint: "#6B6B8C",

  // Primary brand accent — used for the main CTA button, links, focus rings.
  accent: "#8B5CFF",
  accentSoft: "rgba(139, 92, 255, 0.18)",

  danger: "#FF5C7A",
  dangerSoft: "rgba(255, 92, 122, 0.14)",
  success: "#2EE6A6",
  successSoft: "rgba(46, 230, 166, 0.14)",
  warning: "#FFB020",
  warningSoft: "rgba(255, 176, 32, 0.14)",

  // Per-category node accents — each saturated enough to read at a glance.
  triggerAccent: "#2EE6A6", // bright emerald
  coreAccent: "#5B8CFF", // bright azure
  aiAccent: "#FF4FA3", // hot pink/magenta
  integrationAccent: "#FFA53E", // bright amber/orange
};

export const categoryAccent: Record<string, string> = {
  trigger: theme.triggerAccent,
  core: theme.coreAccent,
  ai: theme.aiAccent,
  integration: theme.integrationAccent,
};
