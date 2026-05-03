'use client';

import { useState } from 'react';
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Modal,
  TextInput,
  Button,
  Text,
  Group,
  Stack,
  NumberInput,
  Textarea,
} from '@mantine/core';
import { AvatarUploader } from '@/components/admin/shared/AvatarUploader';
import { useCreateTeamMember } from '@/hooks/admin/useCreateTeamMember';

const Schema = z.object({
  name: z.string().min(2, 'Namn måste vara minst 2 tecken').max(120),
  email: z.string().email('Ogiltig e-post').max(200),
  phone: z.string().max(40).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  bio: z.string().max(500).optional().or(z.literal('')),
  avatar_url: z.string().url('Ange en giltig URL').optional().or(z.literal('')),
  commission_rate_pct: z.number().min(0, 'Minst 0 %').max(50, 'Max 50 %'),
});

type FormValues = z.infer<typeof Schema>;

export interface AddCMDialogProps {
  trigger?: React.ReactNode;
}

export function AddCMDialog({ trigger }: AddCMDialogProps) {
  const [open, setOpen] = useState(false);
  const createTeamMember = useCreateTeamMember();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      city: '',
      bio: '',
      avatar_url: '',
      commission_rate_pct: 20,
    },
  });
  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedAvatarUrl = useWatch({ control, name: 'avatar_url' }) ?? '';
  const watchedCommissionRatePct =
    useWatch({ control, name: 'commission_rate_pct' }) ?? 20;

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      const result = await createTeamMember.mutateAsync({
        role: 'content_manager',
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        city: values.city || undefined,
        bio: values.bio || undefined,
        avatar_url: values.avatar_url || undefined,
        commission_rate: values.commission_rate_pct / 100,
        sendInvite: true,
      });

      toast.success(
        result.warning
          ? `${values.name} skapades, men inbjudan behöver följas upp.`
          : `${values.name} har lagts till som CM.`,
      );
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)} className="inline-block">
        {trigger ?? <Button>+ Lägg till CM</Button>}
      </div>

      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={<Text fw={600} size="lg">Lägg till content manager</Text>}
        size="lg"
      >
        <Text size="sm" c="dimmed" mb="md">
          Skapar teammedlem och skickar inbjudan via e-post direkt.
        </Text>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack gap="md">
            <AvatarUploader
              name={watchedName}
              value={watchedAvatarUrl}
              onChange={(value) => setValue('avatar_url', value, { shouldDirty: true })}
              error={errors.avatar_url?.message ?? null}
            />

            <TextInput
              label="Fullständigt namn"
              placeholder="Anna Andersson"
              {...register('name')}
              error={errors.name?.message}
            />

            <TextInput
              label="E-post"
              type="email"
              placeholder="anna@letrend.se"
              {...register('email')}
              error={errors.email?.message}
            />

            <Group grow align="start">
              <TextInput
                label="Telefon"
                placeholder="070-123 45 67"
                {...register('phone')}
                error={errors.phone?.message}
              />
              <TextInput
                label="Ort"
                placeholder="Stockholm"
                {...register('city')}
                error={errors.city?.message}
              />
            </Group>

            <Textarea
              label="Bio"
              autosize
              minRows={3}
              maxRows={6}
              {...register('bio')}
              error={errors.bio?.message}
            />

            <NumberInput
              label="Kommission (%)"
              min={0}
              max={50}
              value={watchedCommissionRatePct}
              onChange={(value) =>
                setValue(
                  'commission_rate_pct',
                  typeof value === 'number' ? value : 0,
                  { shouldDirty: true },
                )
              }
              error={errors.commission_rate_pct?.message}
            />

            <Group justify="flex-end" mt="xl">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Avbryt
              </Button>
              <Button type="submit" loading={isSubmitting || createTeamMember.isPending}>
                Lägg till CM
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
