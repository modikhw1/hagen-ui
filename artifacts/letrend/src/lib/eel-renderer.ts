import type { CmTag, FeedSlot } from '@/types/studio-v2';

interface SlotCenter {
  x: number;
  y: number;
}

interface EelGradient {
  id: string;
  fromColor: string;
  toColor: string;
}

export function calculateSlotCenters(container: HTMLDivElement): SlotCenter[] {
  const rect = container.getBoundingClientRect();
  return Array.from(container.querySelectorAll('[data-slot-index]')).map((node) => {
    const slotRect = node.getBoundingClientRect();
    return {
      x: slotRect.left - rect.left + slotRect.width / 2,
      y: slotRect.top - rect.top + slotRect.height / 2,
    };
  });
}

export function buildCurvePath(centers: SlotCenter[]): string {
  if (centers.length === 0) return '';
  if (centers.length === 1) return `M ${centers[0].x} ${centers[0].y}`;

  let path = `M ${centers[0].x} ${centers[0].y}`;
  for (let index = 1; index < centers.length; index += 1) {
    const previous = centers[index - 1];
    const current = centers[index];
    const midX = (previous.x + current.x) / 2;
    path += ` C ${midX} ${previous.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

export function buildSegmentPaths(centers: SlotCenter[]): string[] {
  const segments: string[] = [];
  for (let index = 1; index < centers.length; index += 1) {
    const previous = centers[index - 1];
    const current = centers[index];
    const midX = (previous.x + current.x) / 2;
    segments.push(`M ${previous.x} ${previous.y} C ${midX} ${previous.y}, ${midX} ${current.y}, ${current.x} ${current.y}`);
  }
  return segments;
}

export function buildGradients(slotMap: FeedSlot[], tags: CmTag[]): EelGradient[] {
  return slotMap.map((slot, index) => {
    const firstTag = slot.concept?.markers.tags[0];
    const tagColor = tags.find((tag) => tag.name === firstTag)?.color;
    return {
      id: `eel-gradient-${index}`,
      fromColor: tagColor || '#C4B5A0',
      toColor: '#EFE7DE',
    };
  });
}

export function updateGradientPositions(
  gradients: EelGradient[],
  centers: SlotCenter[]
): Array<
  EelGradient & {
    attrs: { x1: number; y1: number; x2: number; y2: number };
  }
> {
  return gradients.map((gradient, index) => {
    const start = centers[Math.max(0, index - 1)] || centers[0] || { x: 0, y: 0 };
    const end = centers[Math.min(index, centers.length - 1)] || start;
    return {
      ...gradient,
      attrs: {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      },
    };
  });
}
