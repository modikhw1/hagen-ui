'use client';

import Image from 'next/image';

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

const imageSize = {
  sm: 24,
  md: 32,
  lg: 40,
} as const;

export default function AdminAvatar({
  name,
  avatarUrl,
  size = 'md',
  fallbackColor,
}: AdminAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass[size]} shrink-0 rounded-full border border-border object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass[size]} flex shrink-0 items-center justify-center rounded-full border border-black/5 font-extrabold text-white`}
      style={{ 
        backgroundColor: fallbackColor || '#94a3b8',
        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
      }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
