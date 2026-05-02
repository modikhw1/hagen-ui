// app/src/components/admin/customers/CustomersFilters.tsx

'use client';

import { Search } from 'lucide-react';
import { TextInput, Button } from '@mantine/core';
import type { CustomerListParams, CustomerListFilter } from '@/lib/admin/customers/list.types';

interface CustomersFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSubmitSearch: () => void;
  filter: CustomerListFilter;
  onFilterChange: (value: CustomerListFilter) => void;
  isPending: boolean;
}

const FILTER_OPTIONS: { key: CustomerListFilter; label: string }[] = [
  { key: 'all',      label: 'Alla' },
  { key: 'active',   label: 'Aktiva' },
  { key: 'pending',  label: 'Väntande' },
  { key: 'paused',   label: 'Pausade' },
  { key: 'archived', label: 'Arkiv' },
];

export function CustomersFilters({
  searchInput,
  onSearchInputChange,
  onSubmitSearch,
  filter,
  onFilterChange,
  isPending,
}: CustomersFiltersProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitSearch();
        }}
        className="relative min-w-[280px] max-w-sm flex-1"
      >
        <TextInput
          placeholder="Sök företag, CM eller e-post..."
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          leftSection={<Search size={14} className="text-muted-foreground" />}
          styles={{
            input: {
              height: '32px',
              fontSize: '13px',
              borderRadius: '6px',
            }
          }}
        />
      </form>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        <Button.Group>
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              variant={filter === opt.key ? 'filled' : 'outline'}
              size="xs"
              color={filter === opt.key ? 'blue' : 'gray'}
              onClick={() => onFilterChange(opt.key)}
              styles={(theme) => ({
                root: {
                  height: '32px',
                  paddingLeft: '16px',
                  paddingRight: '16px',
                  fontWeight: 600,
                  fontSize: '12px',
                  backgroundColor: filter === opt.key ? undefined : 'white',
                  borderColor: theme.colors.gray[3],
                  color: filter === opt.key ? 'white' : theme.colors.gray[7],
                  '&:hover': {
                    backgroundColor: filter === opt.key ? undefined : theme.colors.gray[0],
                  }
                }
              })}
            >
              {opt.label}
            </Button>
          ))}
        </Button.Group>
      </div>
      
      {isPending && (
        <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground animate-pulse ml-auto">
          Laddar...
        </span>
      )}
    </div>
  );
}
