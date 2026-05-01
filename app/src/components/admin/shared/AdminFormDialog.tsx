'use client';

import type { ReactNode } from 'react';
import { Modal, Text, Box, Alert, Button, Group } from '@mantine/core';
import { AlertCircle, AlertTriangle } from 'lucide-react';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface AdminFormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: Size;
  children: ReactNode;
  footer: ReactNode;
  error?: string | null;
  warning?: string | null;
  loading?: boolean;
}

export function AdminFormDialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  error,
  warning,
  loading,
}: AdminFormDialogProps) {
  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={title}
      size={size}
      padding={0}
      centered
      withCloseButton={!loading}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      <Box p="md">
        {description && (
          <Text size="sm" color="dimmed" mb="md">
            {description}
          </Text>
        )}

        <Box>
          {children}
          {error && (
            <Alert icon={<AlertCircle size={16} />} title="Fel" color="red" mt="md">
              {error}
            </Alert>
          )}
          {warning && (
            <Alert icon={<AlertTriangle size={16} />} title="Varning" color="yellow" mt="md">
              {warning}
            </Alert>
          )}
        </Box>
      </Box>

      <Box
        p="md"
        style={(theme) => ({
          borderTop: `1px solid ${theme.colors.gray[2]}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: theme.spacing.sm,
        })}
      >
        {footer}
      </Box>
    </Modal>
  );
}
