'use client';

import { useEffect } from 'react';
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Modal,
  Button,
  TextInput,
  NumberInput,
  Stack,
  Group,
  Textarea,
} from '@mantine/core';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { AvatarUploader } from '@/components/admin/shared/AvatarUploader';

const Schema = z.object({
  name: z.string().min(2, 'Namn måste vara minst 2 tecken').max(120),
  email: z.string().email('Ogiltig e-post').max(200),
  phone: z.string().max(40).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  bio: z.string().max(500).optional().or(z.literal('')),
  avatar_url: z.string().url('Ange en giltig URL').optional().or(z.literal('')),
  commission_rate_pct: z.number().min(0, 'Minst 0 %').max(50, 'Max 50 %'),
  role: z.string(),
});

type FormValues = z.infer<typeof Schema>;

export interface CMEditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cmId: string;
  initialValues: FormValues;
}

export function CMEditProfileDialog({
  open,
  onOpenChange,
  cmId,
  initialValues,
}: CMEditProfileDialogProps) {
  const refresh = useAdminRefresh();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    if (open) {
      reset(initialValues);
    }
  }, [initialValues, open, reset]);
  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedAvatarUrl = useWatch({ control, name: 'avatar_url' }) ?? '';
  const watchedRole = useWatch({ control, name: 'role' }) ?? 'content_manager';
  const watchedCommissionRatePct =
    useWatch({ control, name: 'commission_rate_pct' }) ?? 0;

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      const res = await fetch(`/api/admin/team/${cmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          phone: values.phone || null,
          city: values.city || null,
          bio: values.bio || null,
          avatar_url: values.avatar_url || '',
          commission_rate_pct: values.role === 'admin' ? 0 : values.commission_rate_pct,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Kunde inte spara (${res.status})`);
        return;
      }

      toast.success('Profil uppdaterad.');
      onOpenChange(false);
      void refresh(['team', 'customers']);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    }
  };

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title="Redigera CM-profil"
      size="lg"
      centered
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
          <AvatarUploader
            name={watchedName}
            value={watchedAvatarUrl}
            onChange={(value) => setValue('avatar_url', value, { shouldDirty: true })}
            error={errors.avatar_url?.message ?? null}
          />

          <TextInput
            label="Namn"
            {...register('name')}
            error={errors.name?.message}
          />
          <TextInput
            label="E-post"
            type="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <Group grow align="start">
            <TextInput
              label="Telefon"
              {...register('phone')}
              error={errors.phone?.message}
            />
            <TextInput
              label="Ort"
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
          {watchedRole !== 'admin' ? (
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
          ) : null}

          <Group justify="flex-end" mt="xl">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Avbryt
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Spara
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
