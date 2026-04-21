'use client';

import Image from 'next/image';

type AdminAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
};

const sizeClass = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
} as const;

const imageSize = {
  sm: 24,
  md: 32,
  lg: 40,
} as const;

export default function AdminAvatar({
  name,
  avatarUrl,
  size = 'md',
}: AdminAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={imageSize[size]}
        height={imageSize[size]}
        className={`${sizeClass[size]} shrink-0 rounded-full border border-border object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass[size]} flex shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-semibold text-foreground`}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
