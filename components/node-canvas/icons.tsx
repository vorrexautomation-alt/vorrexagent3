"use client";
// components/node-canvas/icons.tsx
//
// Icon rules (per spec):
//  - generic/logic/core nodes -> plain single-color outline icons (lucide-react)
//  - official third-party brand nodes -> real colored brand logos (react-icons)
//
// Everything is looked up by string key so nodeDefinitions.ts stays declarative.

import {
  Webhook,
  Clock,
  MousePointerClick,
  MessageSquare,
  GitBranch,
  Split,
  GitMerge,
  Repeat,
  Pencil,
  Code,
  Hourglass,
  CircleDashed,
  Ellipsis,
  Globe,
  Bot,
  Mail,
  Database,
  Plus,
  Trash2,
  Settings,
  Save,
  TriangleAlert,
  CircleCheck,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Link2,
  Copy,
  Filter,
  ListChecks,
  LayoutGrid,
  Sparkles,
  KeyRound,
  SlidersHorizontal,
  FileText,
  ShieldCheck,
  Phone,
  type LucideIcon,
} from "lucide-react";

import {
  SiTelegram,
  SiWhatsapp,
  SiInstagram,
  SiFacebook,
  SiNotion,
  SiAirtable,
  SiGmail,
  SiGooglesheets,
  SiPostgresql,
  SiMysql,
  SiDiscord,
  SiStripe,
} from "react-icons/si";
import { FaSlack } from "react-icons/fa";
import type { IconType } from "react-icons";

// ---- Outline (neutral, single-color) icon set -----------------------------
export const OUTLINE_ICONS: Record<string, LucideIcon> = {
  webhook: Webhook,
  clock: Clock,
  cursorClick: MousePointerClick,
  chat: MessageSquare,
  branch: GitBranch,
  split: Split,
  merge: GitMerge,
  loop: Repeat,
  pencil: Pencil,
  code: Code,
  wait: Hourglass,
  noop: CircleDashed,
  more: Ellipsis,
  globe: Globe,
  bot: Bot,
  mail: Mail,
  database: Database,
  filter: Filter,
  form: ListChecks,
  phone: Phone,
  sparkles: Sparkles,
  file: FileText,
  fileText: FileText,
  shield: ShieldCheck,
  table: LayoutGrid,
  image: FileText,
  terminal: Code,
  workflow: GitMerge,
  upload: Link2,
  git: Link2,
  html: FileText,
  calendar: Clock,
  list: ListChecks,
  rss: Globe,
  server: Database,
  check: CircleCheck,
  sort: SlidersHorizontal,
  spreadsheet: LayoutGrid,
  xml: FileText,
  notes: FileText,
  warning: TriangleAlert,
};

// Small UI-chrome icons used by the canvas itself (toolbar, panel, etc.)
export const UI_ICONS = {
  plus: Plus,
  trash: Trash2,
  settings: Settings,
  save: Save,
  warning: TriangleAlert,
  check: CircleCheck,
  close: X,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  search: Search,
  link: Link2,
  copy: Copy,
  grid: LayoutGrid,
  sparkles: Sparkles,
  key: KeyRound,
  sliders: SlidersHorizontal,
  notes: FileText,
  shield: ShieldCheck,
};

// ---- Brand (real logo, real color) icon set --------------------------------
// Colors are each brand's official mark color. react-icons/simple-icons
// renders with fill="currentColor", so we set CSS `color` to the brand hex.
export const BRAND_ICONS: Record<string, { Icon: IconType; color: string }> = {
  slack: { Icon: FaSlack, color: "#4A154B" },
  telegram: { Icon: SiTelegram, color: "#26A5E4" },
  whatsapp: { Icon: SiWhatsapp, color: "#25D366" },
  instagram: { Icon: SiInstagram, color: "#E4405F" },
  facebook: { Icon: SiFacebook, color: "#1877F2" },
  notion: { Icon: SiNotion, color: "#FFFFFF" },
  airtable: { Icon: SiAirtable, color: "#FFBF00" },
  gmail: { Icon: SiGmail, color: "#EA4335" },
  googleSheets: { Icon: SiGooglesheets, color: "#23A566" },
  postgres: { Icon: SiPostgresql, color: "#4169E1" },
  mysql: { Icon: SiMysql, color: "#4479A1" },
  discord: { Icon: SiDiscord, color: "#5865F2" },
  stripe: { Icon: SiStripe, color: "#635BFF" },
};

/** Renders a node's icon, dispatching to the outline or brand set per
 * the node's `iconKind`. Used by both the palette and the node card. */
export function NodeIcon({
  iconKey,
  kind,
  size = 16,
}: {
  iconKey: string;
  kind: "outline" | "brand";
  size?: number;
}) {
  if (kind === "brand") {
    const entry = BRAND_ICONS[iconKey];
    if (!entry) return null;
    const { Icon, color } = entry;
    // Notion's mark is black-on-transparent; on our dark theme we contain it
    // in a small white badge so it stays legible, matching how n8n and
    // other builders treat black-logo brands on dark canvases.
    if (iconKey === "notion") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: size + 6,
            height: size + 6,
            borderRadius: 4,
            background: "#FFFFFF",
          }}
        >
          <Icon size={size - 2} color="#000000" />
        </span>
      );
    }
    return <Icon size={size} color={color} />;
  }
  const Icon = OUTLINE_ICONS[iconKey];
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={1.75} />;
}
