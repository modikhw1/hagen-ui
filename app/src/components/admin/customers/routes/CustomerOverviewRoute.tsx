'use client';

import OperationalStatusSection from '@/components/admin/customers/sections/OperationalStatusSection';
import TikTokProfileSection from '@/components/admin/customers/sections/TikTokProfileSection';
import TikTokStatsSection from '@/components/admin/customers/sections/TikTokStatsSection';

export default function CustomerOverviewRoute({ customerId }: { customerId: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
      <div className="space-y-6">
        <TikTokStatsSection customerId={customerId} />
        <TikTokProfileSection customerId={customerId} />
      </div>
      <div className="space-y-6">
        <OperationalStatusSection customerId={customerId} />
      </div>
    </div>
  );
}
