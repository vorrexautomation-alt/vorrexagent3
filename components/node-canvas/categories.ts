export const NODE_CATEGORIES = [
  { name: "Core", icon: "⚙", description: "Foundational flow control, data, files, and utility nodes", order: 1 },
  { name: "Triggers", icon: "⚡", description: "Start workflows from events, schedules, and entry points", order: 2 },
  { name: "AI & LangChain", icon: "✦", description: "Agents, models, embeddings, vector stores, memory, and tools", order: 3, children: ["Agents", "Chat Models", "Embeddings", "Vector Stores", "Memory", "Tools", "Chains & Retrievers"] },
  { name: "Communication", icon: "◌", description: "Email, chat, messaging, and notification services", order: 4 },
  { name: "Productivity", icon: "▦", description: "Sheets, docs, tasks, calendars, and project tools", order: 5 },
  { name: "Marketing & CRM", icon: "↗", description: "CRM, marketing, forms, sales, and customer support", order: 6 },
  { name: "Databases", icon: "▤", description: "SQL, NoSQL, search, and vector databases", order: 7 },
  { name: "Storage & Files", icon: "▱", description: "Cloud storage, files, PDFs, binary, and media", order: 8 },
  { name: "Developer & DevOps", icon: "⌘", description: "APIs, Git, servers, infrastructure, and automation", order: 9 },
  { name: "Finance & Payments", icon: "$", description: "Payments, invoicing, accounting, and finance", order: 10 },
  { name: "Other", icon: "□", description: "Community and niche integrations", order: 11 },
] as const;

export type NodeCategoryName = (typeof NODE_CATEGORIES)[number]["name"];
