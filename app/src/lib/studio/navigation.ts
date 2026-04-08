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
  kind: 'primary' | 'utility';
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
    kind: 'primary',
  },
  {
    key: 'koncept',
    label: 'Konceptarbete',
    short_label: 'Koncept',
    description: 'Tilldelade koncept, redigering och handoff.',
    kind: 'primary',
  },
  {
    key: 'feed',
    label: 'Feedplan',
    short_label: 'Feedplan',
    description: 'Placeringar i planen, timing och tidigare historik.',
    kind: 'primary',
  },
  {
    key: 'kommunikation',
    label: 'Kommunikation',
    short_label: 'Kommunikation',
    description: 'Mailutkast, skickhistorik och kundkontakt.',
    kind: 'primary',
  },
  // DEMO TAB: not a short-term priority.
  // Feed plan (key: 'feed') is the primary planner surface.
  // TikTok history import is accessible directly from the Feed plan section.
  // Re-enable by uncommenting when demo prep is back in scope.
  // {
  //   key: 'demo',
  //   label: 'Demo',
  //   short_label: 'Demo',
  //   description: 'Förbered demo och importera historik.',
  //   kind: 'utility',
  // },
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
