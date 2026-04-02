import type { Section } from '@/types/studio-v2';

type StudioShellNavItem = {
  href: string;
  label: string;
  kind: 'primary' | 'utility';
};

type StudioWorkspaceSectionItem = {
  key: Section;
  label: string;
  short_label: string;
  description: string;
};

export const STUDIO_SHELL_NAV_ITEMS: StudioShellNavItem[] = [
  { href: '/studio/customers', label: 'Kundarbete', kind: 'primary' },
  { href: '/studio/concepts', label: 'Konceptbibliotek', kind: 'primary' },
  { href: '/studio/upload', label: 'Upload', kind: 'utility' },
  { href: '/studio/invoices', label: 'Fakturor', kind: 'utility' },
];

export const STUDIO_WORKSPACE_SECTIONS: StudioWorkspaceSectionItem[] = [
  {
    key: 'gameplan',
    label: 'Game Plan och Notes',
    short_label: 'Game Plan',
    description: 'Strategi, brief och löpande notes till kunden.',
  },
  {
    key: 'koncept',
    label: 'Konceptarbete',
    short_label: 'Koncept',
    description: 'Tilldelade koncept, redigering och handoff.',
  },
  {
    key: 'feed',
    label: 'Feedplan',
    short_label: 'Feedplan',
    description: 'Placeringar i planen, timing och tidigare historik.',
  },
  {
    key: 'kommunikation',
    label: 'Kommunikation',
    short_label: 'Kommunikation',
    description: 'Mailutkast, skickhistorik och kundkontakt.',
  },
  {
    key: 'demo',
    label: 'Demo',
    short_label: 'Demo',
    description: 'Förbered demo och importera historik.',
  },
];

export function getStudioWorkspaceSection(value: string | null | undefined): Section {
  return STUDIO_WORKSPACE_SECTIONS.some((section) => section.key === value)
    ? (value as Section)
    : 'gameplan';
}

export function getStudioWorkspaceSectionMeta(section: Section): StudioWorkspaceSectionItem {
  return (
    STUDIO_WORKSPACE_SECTIONS.find((item) => item.key === section) ??
    STUDIO_WORKSPACE_SECTIONS[0]
  );
}

export function buildStudioWorkspaceHref(customerId: string, section?: Section): string {
  if (!section || section === 'gameplan') {
    return `/studio/customers/${customerId}`;
  }

  return `/studio/customers/${customerId}?section=${section}`;
}
