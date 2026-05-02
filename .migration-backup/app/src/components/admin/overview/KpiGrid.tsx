import { DollarSign, Send, TrendingUp, UserCheck } from 'lucide-react';
import KpiCard from '@/components/admin/ui/KpiCard';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';
import { formatSek } from '@/lib/admin/money';

export default function KpiGrid({
  metrics,
}: {
  metrics: OverviewDerivedPayload['metrics'];
}) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="MRR"
          value={metrics.revenueCard.value}
          delta={metrics.revenueCard.delta ? { 
            value: metrics.revenueCard.delta.text, 
            label: '30d',
            tone: metrics.revenueCard.delta.tone === 'success' ? 'success' : metrics.revenueCard.delta.tone === 'destructive' ? 'danger' : 'neutral'
          } : undefined}
          trend={metrics.revenueCard.trend}
          href="/admin/billing"
        />
        <KpiCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Kunder"
          value={metrics.activeCard.value}
          delta={metrics.activeCard.delta ? {
            value: metrics.activeCard.delta.text,
            label: 'aktiva',
            tone: metrics.activeCard.delta.tone === 'success' ? 'success' : 'neutral'
          } : undefined}
          trend={metrics.activeCard.trend}
          href="/admin/customers?filter=active"
        />
        <KpiCard 
          icon={<Send className="h-4 w-4" />} 
          label="Demos"
          value={metrics.demosCard.value}
          delta={metrics.demosCard.delta ? {
            value: metrics.demosCard.delta.text,
            label: 'besvarade',
            tone: 'success'
          } : undefined}
          trend={metrics.demosCard.trend}
          href="/admin/demos" 
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Utgifter"
          value={metrics.costsCard.value}
          delta={metrics.costsCard.delta ? {
            value: metrics.costsCard.delta.text,
            label: '30d',
            tone: metrics.costsCard.delta.tone === 'success' ? 'danger' : 'success' // Utgifter upp = danger
          } : undefined}
          trend={metrics.costsCard.trend}
          href="/admin/billing/health"
        />
      </div>
    </section>
  );
}
