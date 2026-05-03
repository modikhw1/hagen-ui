import { SettingsForm } from '@/components/admin/settings/SettingsForm';
import { ServicePricingEditor } from '@/components/admin/settings/ServicePricingEditor';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsForm />
      <ServicePricingEditor />
    </div>
  );
}
