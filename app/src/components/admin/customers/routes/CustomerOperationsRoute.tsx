'use client';

import ContractSection from '@/components/admin/customers/sections/ContractSection';
import SubscriptionSection from '@/components/admin/customers/sections/SubscriptionSection';
import ContactSection from '@/components/admin/customers/sections/ContactSection';
import CmAssignmentSection from '@/components/admin/customers/sections/CmAssignmentSection';
import ContentQueueSection from '@/components/admin/customers/sections/ContentQueueSection';
import RiskActionsSection from '@/components/admin/customers/sections/RiskActionsSection';

export default function CustomerOperationsRoute({ customerId }: { customerId: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <div id="contract">
          <ContractSection customerId={customerId} />
        </div>
        <div id="subscription">
          <SubscriptionSection customerId={customerId} />
        </div>
        <div id="contact">
          <ContactSection customerId={customerId} />
        </div>
      </div>
      <div className="space-y-6">
        <div id="cm">
          <CmAssignmentSection customerId={customerId} />
        </div>
        <div id="content">
          <ContentQueueSection customerId={customerId} />
        </div>
        <RiskActionsSection customerId={customerId} />
      </div>
    </div>
  );
}
