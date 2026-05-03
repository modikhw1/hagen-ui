'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Avatar, Box, Button, Card, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';

import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';

const Schema = z.object({
  business_name: z.string().min(1).max(200),
  customer_contact_name: z.string().max(200).optional().nullable(),
  contact_email: z.string().email().max(200),
  contact_phone: z.string().max(50).optional().nullable(),
  first_invoice_behavior: z.enum(['prorated', 'full', 'free_until_anchor']).default('prorated'),
  logo_url: z.string().url().max(500).optional().nullable(),
});

type FormInput = z.input<typeof Schema>;
type FormValues = z.output<typeof Schema>;
type FirstInvoiceBehavior = FormValues['first_invoice_behavior'];
type CustomerOrganisationInitialData = FormInput & {
  status?: string | null;
  tiktok_handle?: string | null;
  tiktok_profile_pic_url?: string | null;
};

export interface CustomerOrganisationRouteProps {
  customerId: string;
  initialData: CustomerOrganisationInitialData;
  hideFirstInvoiceBehavior?: boolean;
}

export function CustomerOrganisationRoute({
  customerId,
  initialData,
  hideFirstInvoiceBehavior = false,
}: CustomerOrganisationRouteProps) {
  const { mutateAsync, isPending } = useCustomerMutation(customerId, 'update_profile');
  const refresh = useAdminRefresh();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
    control,
    setValue,
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: initialData,
  });

  const firstInvoiceBehavior = useWatch({ control, name: 'first_invoice_behavior' });
  const logoUrl = useWatch({ control, name: 'logo_url' });

  useEffect(() => {
    reset(initialData);
  }, [initialData, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const { contact_phone, ...rest } = values;
      await mutateAsync({
        ...rest,
        phone: contact_phone || null,
      });
      toast.success('Uppgifter sparade.');
      await refresh([{ type: 'customer', customerId }]);
      reset(values);
    } catch {
      // Error handled in hook.
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Stack gap="lg">
        {initialData.status === 'prospect' ? (
          <Card
            withBorder
            padding="md"
            bg="blue.0"
            style={{ borderColor: 'var(--mantine-color-blue-3)' }}
          >
            <Group gap="md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <IconSparkles size={20} />
              </div>
              <div className="flex-1">
                <Text size="sm" fw={700} c="blue.9">
                  Shadow-profil (Demo)
                </Text>
                <Text size="xs" c="blue.7">
                  Denna profil används för att förbereda demos i Studio. Den är dold från den
                  vanliga kundlistan i Admin.
                </Text>
              </div>
            </Group>
          </Card>
        ) : null}

        <Card withBorder padding="md">
          <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
            <Text size="md" fw={600}>Företagsuppgifter</Text>
            <Avatar src={logoUrl} size={48} radius="md" alt="Logotyp" />
          </Group>
          <Stack gap="sm">
            <TextInput
              label="Företagsnamn"
              {...register('business_name')}
              error={errors.business_name?.message}
            />
            <TextInput
              label="Logotyp URL"
              placeholder="https://..."
              {...register('logo_url')}
              error={errors.logo_url?.message}
            />
          </Stack>
        </Card>

        {!hideFirstInvoiceBehavior ? (
          <Card withBorder padding="md">
            <Text size="md" fw={600} mb="md">Kontrakt & Debitering</Text>
            <Stack gap="md">
              <Select
                label="Beteende vid första fakturan"
                description="Hur ska kunden debiteras när de startar?"
                value={firstInvoiceBehavior ?? 'prorated'}
                onChange={(value) => {
                  if (!value) return;
                  setValue('first_invoice_behavior', value as FirstInvoiceBehavior, {
                    shouldDirty: true,
                  });
                }}
                data={[
                  { value: 'prorated', label: 'Pro-rata (debitera resterande dagar i månaden)' },
                  { value: 'full', label: 'Fullt belopp oavsett startdatum' },
                  { value: 'free_until_anchor', label: 'Gratis fram till nästa faktureringsdag' },
                ]}
              />
            </Stack>
          </Card>
        ) : null}

        <Card withBorder padding="md">
          <Text size="md" fw={600} mb="md">Kontaktperson</Text>
          <Stack gap="sm">
            <Group grow>
              <TextInput
                label="Namn"
                {...register('customer_contact_name')}
                error={errors.customer_contact_name?.message}
              />
              <TextInput
                label="Telefon"
                {...register('contact_phone')}
                error={errors.contact_phone?.message}
              />
            </Group>
            <TextInput
              label="E-post"
              type="email"
              {...register('contact_email')}
              error={errors.contact_email?.message}
            />
          </Stack>
        </Card>

        {isDirty ? (
          <Box
            style={{
              position: 'sticky',
              bottom: 0,
              backgroundColor: 'var(--mantine-color-body)',
              borderTop: '1px solid var(--mantine-color-gray-3)',
              margin: '0 -24px',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
              boxShadow: 'var(--mantine-shadow-lg)',
              zIndex: 10,
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => reset(initialData)}
              disabled={isPending}
            >
              Avbryt
            </Button>
            <Button type="submit" loading={isPending}>
              Spara ändringar
            </Button>
          </Box>
        ) : null}
      </Stack>
    </form>
  );
}
