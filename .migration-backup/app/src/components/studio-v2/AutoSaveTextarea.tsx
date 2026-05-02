'use client';

import { useEffect, useRef, useState } from 'react';

interface AutoSaveTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void | Promise<void>;
  rows?: number;
  placeholder?: string;
}

export function AutoSaveTextarea({
  value,
  onChange,
  onSave,
  rows = 3,
  placeholder,
}: AutoSaveTextareaProps) {
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const scheduleSave = (nextValue: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      void onSave(nextValue);
    }, 700);
  };

  return (
    <textarea
      value={localValue}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => {
        const nextValue = event.target.value;
        setLocalValue(nextValue);
        onChange(nextValue);
        scheduleSave(nextValue);
      }}
      onBlur={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        void onSave(localValue);
      }}
      style={{
        width: '100%',
        resize: 'vertical',
        borderRadius: 10,
        border: '1px solid rgba(74,47,24,0.12)',
        padding: '10px 12px',
        fontSize: 13,
        lineHeight: 1.6,
        color: '#4A4239',
        background: '#fff',
        boxSizing: 'border-box',
      }}
    />
  );
}
