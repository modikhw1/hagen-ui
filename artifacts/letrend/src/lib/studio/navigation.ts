import { Library, Users, type LucideIcon } from 'lucide-react';
import type { Section } from '@/types/studio-v2';

type StudioShellNavItem = {
  href: string;
  label: string;
  kind: 'primary' | 'utility';
  icon: LucideIcon;
};

type StudioWorkspaceSectionItem = {
  key: Section;
  label: string;
  short_label: string;
  description: string;
  kind: 'primary' | 'utility';
};

export const STUDIO_SHELL_NAV_ITEMS: StudioShellNavItem[] = [
  { href: '/studio/customers', label: 'Kundarbete', kind: 'primary', icon: Users },
  { href: '/studio/concepts', label: 'Konceptbibliotek', kind: 'primary', icon: Library },
];

export const STUDIO_WORKSPACE_SECTIONS: StudioWorkspaceSectionItem[] = [
  {
    key: 'kundarbete',
    label: 'Kundarbete',
    short_label: 'Kundarbete',
    description: 'Koncept, placering, redigering och handoff i en vy.',
    kind: 'primary',
  },
  {
    key: 'gameplan',
    label: 'Game Plan och Notes',
    short_label: 'Game Plan',
    description: 'Strategi, brief och löpande notes till kunden.',
    kind: 'primary',
  },
  {
    key: 'kommunikation',
    label: 'Kommunikation',
    short_label: 'Kommunikation',
    description: 'Mailutkast, skickhistorik och kundkontakt.',
    kind: 'primary',
  },
];

export function getStudioWorkspaceSection(value: string | null | undefined): Section {
  // Map legacy tab keys to the unified view
  if (value === 'koncept' || value === 'feed') return 'kundarbete';
  return STUDIO_WORKSPACE_SECTIONS.some((section) => section.key === value)
    ? (value as Section)
    : 'kundarbete';
}

export function getStudioWorkspaceSectionMeta(section: Section): StudioWorkspaceSectionItem {
  return (
    STUDIO_WORKSPACE_SECTIONS.find((item) => item.key === section) ??
    STUDIO_WORKSPACE_SECTIONS[0]
  );
}

export function buildStudioWorkspaceHref(customerId: string, section?: Section): string {
  if (!section || section === 'kundarbete' || section === 'koncept') {
    return `/studio/customers/${customerId}`;
  }

  return `/studio/customers/${customerId}?section=${section}`;
}
