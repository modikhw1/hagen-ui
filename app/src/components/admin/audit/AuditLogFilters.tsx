'use client';

import { AlertTriangle, Clock3, Database, FilterX, User } from 'lucide-react';
import { AdminField } from '@/components/admin/shared/AdminField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTeamLite } from '@/hooks/admin/useTeamLite';

type Props = {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  viewerEmail?: string | null;
  onlyErrors?: boolean;
  billingOnly?: boolean;
  actors: string[];
  actions: string[];
  entities: string[];
  onChange: (updates: Record<string, string | null>) => void;
};

function dateInputValue(value?: string) {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function latest24hIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export function AuditLogFilters({
  actor,
  action,
  entity,
  from,
  to,
  viewerEmail,
  onlyErrors = false,
  billingOnly = false,
  actors,
  actions,
  entities,
  onChange,
}: Props) {
  const { data: adminMembers = [] } = useTeamLite('admin');
  const hasActiveFilters = Boolean(
    actor || action || entity || from || to || onlyErrors || billingOnly,
  );
  const actorSuggestions = Array.from(
    new Set([
      ...actors,
      ...adminMembers.map((member) => member.email).filter((item): item is string => Boolean(item)),
    ]),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ from: latest24hIso(), to: nowIso() })}
        >
          <Clock3 className="h-4 w-4" />
          Senaste 24 h
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!viewerEmail}
          onClick={() => onChange({ actor: viewerEmail ?? null })}
        >
          <User className="h-4 w-4" />
          Mina mutationer
        </Button>
        <Button
          type="button"
          variant={onlyErrors ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => onChange({ onlyErrors: onlyErrors ? null : '1' })}
        >
          <AlertTriangle className="h-4 w-4" />
          Endast errors
        </Button>
        <Button
          type="button"
          variant={billingOnly ? 'secondary' : 'outline'}
          size="sm"
          onClick={() =>
            onChange({
              billingOnly: billingOnly ? null : '1',
              entity: billingOnly ? entity ?? null : null,
            })
          }
        >
          <Database className="h-4 w-4" />
          Bara billing
        </Button>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                actor: null,
                action: null,
                entity: null,
                from: null,
                to: null,
                onlyErrors: null,
                billingOnly: null,
              })
            }
          >
            <FilterX className="h-4 w-4" />
            Rensa filter
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <AdminField label="Aktör" htmlFor="audit-filter-actor">
          <div>
            <Input
              id="audit-filter-actor"
              value={actor ?? ''}
              list="audit-filter-actors"
              onChange={(event) => onChange({ actor: event.target.value || null })}
              placeholder="Filtrera aktör"
            />
            <datalist id="audit-filter-actors">
              {actorSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
        </AdminField>

        <AdminField label="Action" htmlFor="audit-filter-action">
          <Select
            value={action ?? '__all__'}
            onValueChange={(next) => onChange({ action: next === '__all__' ? null : next })}
          >
            <SelectTrigger id="audit-filter-action">
              <SelectValue placeholder="Alla actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alla actions</SelectItem>
              {actions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AdminField>

        <AdminField label="Entitet" htmlFor="audit-filter-entity">
          <Select
            value={entity ?? '__all__'}
            onValueChange={(next) => onChange({ entity: next === '__all__' ? null : next })}
          >
            <SelectTrigger id="audit-filter-entity">
              <SelectValue placeholder="Alla entiteter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alla entiteter</SelectItem>
              {entities.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AdminField>

        <AdminField label="Från" htmlFor="audit-filter-from">
          <Input
            id="audit-filter-from"
            type="date"
            value={dateInputValue(from)}
            onChange={(event) => onChange({ from: event.target.value || null })}
          />
        </AdminField>

        <AdminField label="Till" htmlFor="audit-filter-to">
          <Input
            id="audit-filter-to"
            type="date"
            value={dateInputValue(to)}
            onChange={(event) => onChange({ to: event.target.value || null })}
          />
        </AdminField>
      </div>
    </section>
  );
}
