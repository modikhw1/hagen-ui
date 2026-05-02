import { permanentRedirect } from 'next/navigation';

export default function Page() {
  permanentRedirect('/admin/billing?view=subscriptions');
}
