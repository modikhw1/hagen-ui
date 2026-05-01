'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

type Props = {
  initials: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onCleared?: () => void;
  fallbackColor?: string; // hex
  uploadFn: (file: File) => Promise<{ url: string }>;
};

export function AvatarUpload({
  initials,
  currentUrl,
  onUploaded,
  onCleared,
  fallbackColor = '#4f46e5',
  uploadFn,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [urlInput, setUrlInput] = useState(currentUrl ?? '');

  const handleFile = async (file: File) => {
    setError(null);
    if (!/^image\//.test(file.type)) return setError('Endast bildfiler stöds.');
    if (file.size > 4 * 1024 * 1024) return setError('Max 4 MB.');

    setUploading(true);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    try {
      const { url } = await uploadFn(file);
      onUploaded(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uppladdning misslyckades.');
      setPreview(currentUrl ?? null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className="group relative flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-border bg-secondary/20 p-4 hover:border-primary/40 hover:bg-secondary/40 transition-colors"
      >
        {preview ? (
          <img src={preview} alt="" className="h-16 w-16 rounded-full object-cover shadow-sm" />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold shadow-inner"
            style={{ backgroundColor: fallbackColor, color: '#fff' }}
          >
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {uploading ? 'Laddar upp...' : 'Klicka eller dra hit en bild'}
          </div>
          <div className="text-xs text-muted-foreground truncate">PNG, JPG eller WebP · max 4 MB</div>
        </div>
        <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {error ? <div className="text-xs text-status-danger-fg">{error}</div> : null}

      <details open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
          Använd URL istället
        </summary>
        <div className="mt-2 flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setPreview(urlInput);
              onUploaded(urlInput);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Använd
          </button>
        </div>
      </details>
    </div>
  );
}
