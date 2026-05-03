'use client';

import type { PropsWithChildren } from 'react';

interface SidePanelProps extends PropsWithChildren {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export function SidePanel({ isOpen, onClose, title, children }: SidePanelProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(26,22,18,0.28)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, border: 'none', background: 'transparent' }}
      />
      <div
        style={{
          position: 'relative',
          width: 'min(560px, 100vw)',
          height: '100%',
          background: '#FAF8F5',
          boxShadow: '-18px 0 40px rgba(26,22,18,0.14)',
          padding: 24,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#4A2F18' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: 24, color: '#7D6E5D', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
