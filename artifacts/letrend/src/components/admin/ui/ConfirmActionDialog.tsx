'use client';

import { Modal, Button, Text, Group } from '@mantine/core';
import { SHELL_COPY } from '@/lib/admin/copy/shell-strings';

export default function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Avbryt',
  onConfirm,
  pending = false,
  tone = 'danger',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={title}
      centered
    >
      <Text size="sm" mb="lg">
        {description}
      </Text>
      <Group justify="flex-end">
        <Button variant="subtle" onClick={() => onOpenChange(false)} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          color={tone === 'danger' ? 'red' : 'blue'}
          onClick={onConfirm}
          loading={pending}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
