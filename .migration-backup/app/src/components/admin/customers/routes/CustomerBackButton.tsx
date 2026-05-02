'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CustomerBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        const referrerOk =
          typeof document !== 'undefined' &&
          document.referrer.startsWith(window.location.origin) &&
          new URL(document.referrer).pathname.startsWith('/admin/customers');

        if (referrerOk) {
          router.back();
          return;
        }

        router.push('/admin/customers');
      }}
      className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Tillbaka till kunder
    </button>
  );
}
