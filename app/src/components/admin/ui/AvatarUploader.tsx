'use client';

import { useRef, useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/admin/api-client';

type AvatarUploadResponse = {
  path: string;
  url: string;
};

type Props = {
  name: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
};

export function AvatarUploader({
  name,
  value,
  onChange,
  disabled = false,
  hint,
  error,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setLocalError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await apiClient.post<AvatarUploadResponse>(
        '/api/admin/team/upload-avatar',
        formData,
      );
      onChange(response.url);
    } catch (uploadError) {
      setLocalError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Kunde inte ladda upp profilbilden.',
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
        >
          <AdminAvatar name={name || 'Ny teammedlem'} avatarUrl={value || null} size="lg" />
        </button>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">
            {name || 'Ny teammedlem'}
          </div>
          <div className="text-xs text-muted-foreground">
            {hint || 'Ladda upp avatar direkt till teamets bildlager.'}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Laddar upp...' : 'Ladda upp'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUrlField((current) => !current)}
              disabled={disabled}
            >
              <Link2 className="h-4 w-4" />
              {showUrlField ? 'Dölj URL-fält' : 'Ange URL manuellt'}
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleUpload(file);
          }
        }}
      />

      {showUrlField ? (
        <Input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://..."
          disabled={disabled}
        />
      ) : null}

      {localError || error ? (
        <div className="text-xs text-destructive">{localError || error}</div>
      ) : null}
    </div>
  );
}
