import type { ReactNode } from 'react';
import { OpsSubnav } from '@/components/admin/OpsSubnav';

export default function AdminOpsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <OpsSubnav />
      {children}
    </div>
  );
}
