'use client';

import {
  Field,
  Label,
  Metric,
  ModeButton,
  PricingPicker,
  Section,
} from '@/components/admin/_primitives';

function ThemePreview({
  title,
  theme,
}: {
  title: string;
  theme?: 'dark';
}) {
  return (
    <div
      data-admin-theme={theme}
      className="rounded-xl border border-border bg-background p-5 shadow-sm"
    >
      <div className="mb-4 text-sm font-semibold text-foreground">{title}</div>

      <div className="grid gap-5">
        <Section title="Section">
          <div className="rounded-md border border-border bg-card p-4 text-sm text-foreground">
            Sektionens innehåll använder samma density som admindetaljerna.
          </div>
        </Section>

        <Section title="Field + Label">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Standardfält">
              <input
                defaultValue="Cafe Ros"
                className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none"
              />
            </Field>
            <Field label="Disabled" hint="Disabled state för inputs">
              <input
                defaultValue="Ej redigerbar"
                disabled
                className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground opacity-50 outline-none"
              />
            </Field>
          </div>
          <Label>Fristående etikett</Label>
        </Section>

        <Section title="Metric">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="MRR" value="12 900 kr" />
            <Metric label="Hover" value="Hovera korten runtom" className="transition-colors hover:bg-accent/30" />
            <Metric label="Disabled visual" value="N/A" className="opacity-50" />
          </div>
        </Section>

        <Section title="ModeButton">
          <div className="grid gap-3 sm:grid-cols-3">
            <ModeButton active title="Aktiv" description="Vald state" />
            <ModeButton
              active={false}
              title="Hover"
              description="Hovera för att se state"
            />
            <ModeButton
              active={false}
              disabled
              title="Disabled"
              description="Inte klickbar"
            />
          </div>
        </Section>

        <Section title="PricingPicker">
          <div className="grid gap-3 sm:grid-cols-3">
            <PricingPicker active title="Fast pris" description="Aktiv state" />
            <PricingPicker
              active={false}
              title="Ej satt än"
              description="Hovera för state"
            />
            <PricingPicker
              active={false}
              disabled
              title="Disabled"
              description="Inte valbar"
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

export default function AdminPrimitivesStyleguidePage() {
  return (
    <main className="space-y-6 px-6 py-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Admin Primitives</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Intern preview för tokens och delade admin-primitiver.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ThemePreview title="Light" />
        <ThemePreview title="Dark" theme="dark" />
      </div>
    </main>
  );
}
