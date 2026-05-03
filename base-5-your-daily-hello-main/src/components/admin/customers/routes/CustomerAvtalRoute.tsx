'use client';

import { useState } from 'react';
import {
  Accordion,
  Card,
  CopyButton,
  Group,
  Stack,
  Text,
  Tooltip,
  ActionIcon,
  Badge,
  Divider,
} from '@mantine/core';
import { IconCheck, IconCopy, IconSettings } from '@tabler/icons-react';

import {
  CustomerBillingRoute,
  type CustomerBillingRouteProps,
} from '@/components/admin/customers/routes/CustomerBillingRoute';
import {
  CustomerOrganisationRoute,
  type CustomerOrganisationRouteProps,
} from '@/components/admin/customers/routes/CustomerOrganisationRoute';
import TikTokProfileSection from '@/components/admin/customers/sections/TikTokProfileSection';

export interface CustomerAvtalRouteProps {
  customerId: string;
  organisation: CustomerOrganisationRouteProps['initialData'];
  billing: CustomerBillingRouteProps;
  ops: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    tiktok_handle: string | null;
    environment_warning?: string | null;
  };
}

function CopyableId({ label, value }: { label: string; value: string | null }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text size="xs" c="dimmed" fw={500} tt="uppercase">
        {label}
      </Text>
      {value ? (
        <Group gap={4} wrap="nowrap">
          <Text
            size="xs"
            ff="monospace"
            style={{ wordBreak: 'break-all' }}
          >
            {value}
          </Text>
          <CopyButton value={value} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Kopierad' : 'Kopiera'} withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color={copied ? 'green' : 'gray'}
                  onClick={copy}
                  aria-label={`Kopiera ${label}`}
                >
                  {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      ) : (
        <Text size="xs" c="dimmed" fs="italic">
          —
        </Text>
      )}
    </Group>
  );
}

function OpsAccordion({
  customerId,
  ops,
}: {
  customerId: string;
  ops: CustomerAvtalRouteProps['ops'];
}) {
  return (
    <Card withBorder padding={0} radius="md">
      <Accordion variant="default" chevronPosition="right">
        <Accordion.Item value="ops" style={{ border: 'none' }}>
          <Accordion.Control icon={<IconSettings size={16} />}>
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Text size="sm" fw={600}>
                Ops &amp; teknisk metadata
              </Text>
              {ops.environment_warning && (
                <Badge color="yellow" variant="light" size="sm">
                  {ops.environment_warning}
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                Identifierare och syncstatus. Behövs sällan i det dagliga
                arbetet — synk förväntas bara fungera.
              </Text>
              <Divider />
              <Stack gap="sm">
                <CopyableId
                  label="Stripe customer"
                  value={ops.stripe_customer_id}
                />
                <CopyableId
                  label="Stripe subscription"
                  value={ops.stripe_subscription_id}
                />
                <CopyableId
                  label="TikTok handle"
                  value={ops.tiktok_handle ? `@${ops.tiktok_handle.replace('@', '')}` : null}
                />
              </Stack>
              <Divider />
              <TikTokProfileSection customerId={customerId} />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Card>
  );
}

export function CustomerAvtalRoute({
  customerId,
  organisation,
  billing,
  ops,
}: CustomerAvtalRouteProps) {
  const [activeSection] = useState<'organisation' | 'billing'>('organisation');
  // activeSection reserved for future deep-link behaviour; sections render together.
  void activeSection;

  return (
    <Stack gap="xl">
      <section aria-labelledby="avtal-organisation-heading">
        <Text
          id="avtal-organisation-heading"
          size="xs"
          c="dimmed"
          tt="uppercase"
          fw={700}
          mb="xs"
        >
          Företag &amp; kontakt
        </Text>
        <CustomerOrganisationRoute
          customerId={customerId}
          initialData={organisation}
        />
      </section>

      <section aria-labelledby="avtal-billing-heading">
        <Text
          id="avtal-billing-heading"
          size="xs"
          c="dimmed"
          tt="uppercase"
          fw={700}
          mb="xs"
        >
          Abonnemang &amp; fakturor
        </Text>
        <CustomerBillingRoute {...billing} />
      </section>

      <section aria-labelledby="avtal-ops-heading">
        <Text
          id="avtal-ops-heading"
          size="xs"
          c="dimmed"
          tt="uppercase"
          fw={700}
          mb="xs"
        >
          Ops
        </Text>
        <OpsAccordion customerId={customerId} ops={ops} />
      </section>
    </Stack>
  );
}
