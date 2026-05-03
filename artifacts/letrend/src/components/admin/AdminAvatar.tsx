'use client';

import React from 'react';

type AdminAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  fallbackColor?: string;
};

const sizeClass = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
} as const;

export default function AdminAvatar({
  name,
  avatarUrl,
  size = 'md',
  fallbackColor,
}: AdminAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const [imgError, setImgError] = React.useState(false);

  const hasImage = Boolean(avatarUrl && avatarUrl.trim().length > 0 && !imgError);

  // Always render the initial as a stable, fixed-size box so the row never
  // shifts. If an avatar URL is present, layer the image on top — when it
  // finishes loading it simply covers the initial, no layout change.
  return (
    <div
      className={`${sizeClass[size]} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/5 font-extrabold text-primary-foreground`}
      style={{
        backgroundColor: fallbackColor || '#94a3b8',
        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
      }}
      aria-label={name}
    >
      <span aria-hidden="true">{initial}</span>
      {hasImage ? (
        <img
          src={avatarUrl!}
          alt=""
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : null}
    </div>
  );
}
