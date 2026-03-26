export interface Tag {
  id: string;
  name: string;
  color: string;
  darkColor: string;
  textColor: string;
  darkTextColor: string;
  group: "action" | "realestate" | "custom";
  isPredefined: boolean;
}

export const PREDEFINED_TAGS: Tag[] = [
  // Action
  { id: "urgent",          name: "Urgent",          color: "#fce8e6", darkColor: "#3b1f1e", textColor: "#c5221f", darkTextColor: "#f28b82", group: "action",      isPredefined: true },
  { id: "fyi",             name: "À lire",          color: "#f1f3f4", darkColor: "#2d2e30", textColor: "#5f6368", darkTextColor: "#9aa0a6", group: "action",      isPredefined: true },
  { id: "action-required", name: "Action Required", color: "#fef7e0", darkColor: "#3a2f00", textColor: "#b06000", darkTextColor: "#fdd663", group: "action",      isPredefined: true },
  // Source
  { id: "immo",            name: "Immo",            color: "#fff3e0", darkColor: "#3a2000", textColor: "#e65100", darkTextColor: "#ffb74d", group: "action",      isPredefined: true },
  // Real estate
  { id: "lead",            name: "Lead",            color: "#e6f4ea", darkColor: "#1e3a2f", textColor: "#137333", darkTextColor: "#81c995", group: "realestate", isPredefined: true },
  { id: "contrat",         name: "Contrat",         color: "#e8f0fe", darkColor: "#1a2744", textColor: "#1a73e8", darkTextColor: "#a8c7fa", group: "realestate", isPredefined: true },
  { id: "visite",          name: "Visite",          color: "#f3e8fd", darkColor: "#2a1a3a", textColor: "#7b1fa2", darkTextColor: "#ce93d8", group: "realestate", isPredefined: true },
  { id: "offre",           name: "Offre d'achat",   color: "#fef7e0", darkColor: "#3a2f00", textColor: "#b06000", darkTextColor: "#fdd663", group: "realestate", isPredefined: true },
  { id: "signature",       name: "Signature",       color: "#e6f4ea", darkColor: "#1e3a2f", textColor: "#137333", darkTextColor: "#81c995", group: "realestate", isPredefined: true },
  { id: "inspection",      name: "Inspection",      color: "#f1f3f4", darkColor: "#2d2e30", textColor: "#5f6368", darkTextColor: "#9aa0a6", group: "realestate", isPredefined: true },
  { id: "financement",     name: "Financement",     color: "#e8eaf6", darkColor: "#1a1f3d", textColor: "#3949ab", darkTextColor: "#9fa8da", group: "realestate", isPredefined: true },
  { id: "notaire",         name: "Notaire",         color: "#f1f3f4", darkColor: "#2d2e30", textColor: "#5f6368", darkTextColor: "#9aa0a6", group: "realestate", isPredefined: true },
  { id: "client",          name: "Client",          color: "#e0f7fa", darkColor: "#002d30", textColor: "#00695c", darkTextColor: "#80cbc4", group: "realestate", isPredefined: true },
];

export function getAllTags(customTags: Tag[] = []): Tag[] {
  return [...PREDEFINED_TAGS, ...customTags];
}

export function getTagById(id: string, customTags: Tag[] = []): Tag | undefined {
  return getAllTags(customTags).find((t) => t.id === id);
}
