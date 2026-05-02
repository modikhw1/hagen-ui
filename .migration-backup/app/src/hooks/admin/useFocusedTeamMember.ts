'use client';

import { useEffect } from 'react';

export function useFocusedTeamMember(focusedMemberId: string | null, isLoading: boolean) {
  useEffect(() => {
    if (!focusedMemberId || isLoading) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-team-member-id="${focusedMemberId}"]`,
      );
      if (!element) {
        return;
      }

      element.classList.add('animate-[pulse_1.5s_ease-out_1]', 'outline', 'outline-2', 'outline-primary/40');
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      window.setTimeout(() => {
        element.classList.remove(
          'animate-[pulse_1.5s_ease-out_1]',
          'outline',
          'outline-2',
          'outline-primary/40',
        );
      }, 1800);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedMemberId, isLoading]);
}
