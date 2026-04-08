'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { PRESET_TAG_COLORS, type CmTag } from '@/types/studio-v2';

interface TagManagerProps {
  tags: CmTag[];
  onClose: () => void;
  onTagsUpdated: () => Promise<void>;
}

export function TagManager({ tags, onClose, onTagsUpdated }: TagManagerProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PRESET_TAG_COLORS[0]);
  const [items, setItems] = useState(tags);

  useEffect(() => {
    setItems(tags);
  }, [tags]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(26,22,18,0.32)',
      }}
    >
      <div
        style={{
          width: 'min(560px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 60px rgba(26,22,18,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 20, color: '#4A2F18' }}>Manage tags</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New tag"
            style={{ flex: 1, borderRadius: 10, border: '1px solid rgba(74,47,24,0.12)', padding: '10px 12px' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(74,47,24,0.12)' }}>
            {PRESET_TAG_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value)}
                title={value}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: value,
                  border: color === value ? '2px solid #4A2F18' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                  outline: color === value ? '2px solid rgba(74,47,24,0.25)' : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              const trimmed = name.trim();
              if (!trimmed) return;
              const { data: userData } = await supabase.auth.getUser();
              const userId = userData.user?.id;
              if (!userId) return;
              await supabase.from('cm_tags').insert({ cm_id: userId, name: trimmed, color });
              setName('');
              await onTagsUpdated();
            }}
            style={{ border: 'none', borderRadius: 10, background: '#4A2F18', color: '#fff', padding: '10px 14px', fontWeight: 700 }}
          >
            Add
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((tag) => (
            <div key={tag.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: '#FAF8F5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: tag.color, display: 'inline-block' }} />
                <span>{tag.name}</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await supabase.from('cm_tags').delete().eq('id', tag.id);
                  await onTagsUpdated();
                }}
                style={{ border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, background: '#fff', color: '#ef4444', padding: '6px 10px', fontWeight: 700 }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
