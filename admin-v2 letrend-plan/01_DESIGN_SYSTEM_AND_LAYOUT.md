# Kapitel 01 — Designsystem & Layout

**Förutsättning:** Du har läst `00_README_AND_PRINCIPLES.md`.

**Outcome efter detta kapitel:** Originalrepot har samma färgpalett, typografi,
border-radius, sidebar, layout och komponentprimitiver som Lovable-prototypen.
Alla `letrend-design-system.ts`-imports från admin-vyer är borttagna eller
nedgraderade till en *värde-konstant* (för CM-avatar-färger som lagras i DB).

---

## 1.1 Tailwind-tokens (HSL CSS-variabler)

### Ändra `src/app/globals.css` (eller motsvarande root-CSS)

**Lägg till exakt detta `@layer base`-block.** Behåll övriga app-globaler,
men ta bort eventuella konkurrerande `:root`-variabler som överstyr dessa.

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* LeTrend brand – warm cream & brown palette (HSL, ingen hsl()-wrapper) */
    --background: 30 33% 97%;        /* #FAF8F5 */
    --foreground: 25 14% 9%;         /* #1A1612 */

    --card: 0 0% 100%;
    --card-foreground: 25 14% 9%;

    --popover: 0 0% 100%;
    --popover-foreground: 25 14% 9%;

    --primary: 24 53% 19%;           /* #4A2F18 */
    --primary-foreground: 30 33% 97%;

    --secondary: 28 16% 95%;         /* #F5F2EE */
    --secondary-foreground: 24 53% 19%;

    --muted: 28 16% 95%;
    --muted-foreground: 27 13% 55%;  /* #9D8E7D */

    --accent: 30 20% 92%;            /* #F0EBE4 */
    --accent-foreground: 24 53% 19%;

    --destructive: 0 70% 48%;        /* #C53030 */
    --destructive-foreground: 30 33% 97%;

    --success: 120 22% 46%;          /* #5A8F5A */
    --success-foreground: 30 33% 97%;

    --warning: 37 91% 55%;           /* #D97706 */
    --warning-foreground: 30 33% 97%;

    --info: 217 91% 60%;             /* #2563EB */
    --info-foreground: 30 33% 97%;

    --border: 24 53% 19% / 0.08;
    --border-strong: 24 53% 19% / 0.15;
    --input: 24 53% 19% / 0.08;
    --ring: 24 53% 19%;

    --radius: 8px;

    --sidebar-background: 28 16% 95%;
    --sidebar-foreground: 25 14% 9%;
    --sidebar-primary: 24 53% 19%;
    --sidebar-primary-foreground: 30 33% 97%;
    --sidebar-accent: 30 20% 92%;
    --sidebar-accent-foreground: 24 53% 19%;
    --sidebar-border: 24 53% 19% / 0.08;
    --sidebar-ring: 24 53% 19%;
  }

  * { @apply border-border; }

  body {
    @apply bg-background text-foreground;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  h1, h2, h3, h4, h5, h6 { font-family: Georgia, 'Times New Roman', serif; }
}
```

> **Notera HSL-formatet:** Värden är råa `H S% L%`-tripletter utan
> `hsl(...)`-wrapper. Tailwind wrappar via `hsl(var(--primary))` i config.
> Detta är exakt prototypens format — kopiera inte med `hsl()` runt.

### Ändra `tailwind.config.ts`

Ersätt hela `colors`-extend-blocket. Behåll `darkMode`, `content`, `plugins`.

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        heading: ["Georgia", "'Times New Roman'", "serif"],
        mono: ["'SF Mono'", "Monaco", "'Cascadia Code'", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

---

## 1.2 Ersätt `letrend-design-system.ts`

Originalet använder `LeTrendColors.brownDark` etc. överallt. Den filen
**ska finnas kvar** (många icke-admin platser kan referera den) men markera
den som **deprecated för admin-vyer**. Lägg överst:

```ts
// src/styles/letrend-design-system.ts
/**
 * @deprecated För admin-vyer: använd Tailwind-tokens (bg-primary,
 * text-foreground, border-border, etc.) via tailwind.config.ts.
 * Denna fil behålls bara för (a) icke-admin ytor som ännu inte migrerats,
 * och (b) DB-lagrade hex-färger som behöver matchas (t.ex. team_members.color).
 */
export const LeTrendColors = {
  // ... behåll befintligt innehåll
} as const;
```

### Mappningstabell — sök & ersätt i admin-filer

Kör per fil (Ctrl+Shift+H i VS Code, regex på):

| Original (inline) | Ersätt med (Tailwind class) |
|---|---|
| `style={{ background: LeTrendColors.cream }}` | `className="bg-background"` |
| `style={{ background: LeTrendColors.surface }}` | `className="bg-secondary"` |
| `style={{ background: LeTrendColors.surfaceWarm }}` | `className="bg-accent"` |
| `style={{ background: '#fff' }}` | `className="bg-card"` |
| `style={{ color: LeTrendColors.brownDark }}` | `className="text-primary"` |
| `style={{ color: LeTrendColors.textPrimary }}` | `className="text-foreground"` |
| `style={{ color: LeTrendColors.textSecondary }}` | `className="text-foreground/80"` (sek text) |
| `style={{ color: LeTrendColors.textMuted }}` | `className="text-muted-foreground"` |
| `border: \`1px solid ${LeTrendColors.border}\`` | `className="border border-border"` |
| `borderRadius: '18px'` | `className="rounded-2xl"` (eller motsv.) |
| `borderRadius: LeTrendRadius.md` | `className="rounded-md"` |
| `boxShadow: LeTrendShadows.warmthCard` | `className="shadow-sm"` |
| `fontFamily: LeTrendTypography.fontFamily.heading` | `className="font-heading"` |
| `padding: '14px 16px'` | `className="px-4 py-3.5"` (närmsta Tailwind) |
| `display: 'grid', gridTemplateColumns: 'repeat(3, ...)'` | `className="grid grid-cols-3 gap-4"` |

**Regel:** Om en numerisk pixel inte mappar exakt till en Tailwind-klass,
välj närmsta (4px-rastret). Avvikelser ≤2px är OK.

### Exempel — full diff

**Före** (`src/app/admin/page.tsx`, prototypisk header):

```tsx
<div style={{
  borderRadius: '22px',
  padding: '28px',
  background: 'linear-gradient(135deg, rgba(74,47,24,0.98) 0%, rgba(107,68,35,0.94) 60%, rgba(139,105,20,0.90) 100%)',
  color: LeTrendColors.cream,
  boxShadow: '0 18px 40px rgba(74,47,24,0.18)'
}}>
  <h1 style={{ margin: 0, fontSize: '34px', fontFamily: LeTrendTypography.fontFamily.heading }}>
    Översikt
  </h1>
</div>
```

**Efter** (matchar prototypens minimal-stil):

```tsx
<div className="mb-8">
  <h1 className="text-2xl font-bold font-heading text-foreground">Översikt</h1>
  <p className="text-sm text-muted-foreground mt-1">Operativt tillstånd</p>
</div>
```

> **Designbeslut:** Prototypen har **inga gradient-headers**. Den lutar sig
> på en minimal, typografi-driven hierarki. Originalets stora gradient-pulse
> ska tas bort till förmån för rena `<h1>` + `<p>`. Detta är ett medvetet
> stilbyte, inte en oavsiktlig regression.

---

## 1.3 Admin-layout (sidebar)

Originalets `app/admin/layout.tsx` (se bundle 01) är komplex med
auth-gate och Stripe environment badge. Behåll auth-gating men byt ut
hela rendering-delen mot prototypens layout.

### Mål-layout

```
┌─────────┬───────────────────────────────┐
│         │                               │
│ LT Logo │      [Page content]           │
│  Admin  │                               │
│         │      max-w-[1080px]           │
│ Översikt│      p-8                      │
│ Kunder  │                               │
│ Billing │                               │
│ Team    │                               │
│         │                               │
│ admin   │                               │
│ [Log ut]│                               │
└─────────┴───────────────────────────────┘
  240px              flex-1
```

### Implementation

Skapa/ersätt `src/components/admin/AdminLayout.tsx` (separera från
`app/admin/layout.tsx` som blir auth-shellen):

```tsx
'use client';

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, CreditCard, UsersRound, LogOut,
} from "lucide-react";

const SIDEBAR_WIDTH = 240;

const navItems = [
  { href: "/admin", label: "Översikt", icon: LayoutDashboard, exact: true },
  { href: "/admin/customers", label: "Kunder", icon: Users },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/team", label: "Team", icon: UsersRound },
];

function SidebarLink({ href, label, icon: Icon, exact }: {
  href: string; label: string; icon: React.ElementType; exact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

export default function AdminLayout({ children, userEmail, onLogout }: {
  children: ReactNode;
  userEmail: string;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className="fixed top-0 left-0 h-screen bg-secondary border-r border-border flex flex-col z-50"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">LT</span>
            </div>
            <div>
              <div className="text-base font-semibold font-heading leading-tight text-foreground">
                LeTrend
              </div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Admin
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {navItems.map((item) => <SidebarLink key={item.href} {...item} />)}
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-2">
          <div className="px-3 py-2 rounded-md bg-accent/50">
            <div className="text-xs font-medium text-foreground truncate">admin</div>
            <div className="text-[11px] text-muted-foreground truncate">{userEmail}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logga ut</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-h-screen" style={{ marginLeft: SIDEBAR_WIDTH }}>
        <div className="p-8 max-w-[1080px]">{children}</div>
      </main>
    </div>
  );
}
```

### Auth-shell `app/admin/layout.tsx`

```tsx
'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/lib/supabase/client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

export default function AdminAuthShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || profile?.role !== 'admin')) {
      router.replace('/login?redirect=/admin');
    }
  }, [loading, user, profile, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading || !user) {
    return <div className="p-10 text-sm text-muted-foreground">Laddar admin...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AdminLayout userEmail={user.email || 'admin'} onLogout={handleLogout}>
        {children}
      </AdminLayout>
    </QueryClientProvider>
  );
}
```

> **Notera:** `StripeEnvironmentBadge` flyttas in i `/admin/billing` →
> Health-tab istället för i sidebaren. Det är en operationell signal som
> hör hemma i billing-vyn, inte i navigeringen. Originalets
> sidebar-placering tas bort.

---

## 1.4 Delade UI-helpers

Skapa följande filer som används genomgående i kapitel 02–05:

### `src/lib/admin/labels.ts`

```ts
export const customerStatusConfig = (status: string) => {
  switch (status) {
    case "active":
    case "agreed":
      return { label: "Aktiv", className: "bg-success/10 text-success" };
    case "invited":
      return { label: "Inbjuden", className: "bg-info/10 text-info" };
    case "pending":
      return { label: "Väntande", className: "bg-warning/10 text-warning" };
    case "archived":
      return { label: "Arkiverad", className: "bg-muted text-muted-foreground" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground" };
  }
};

export const invoiceStatusConfig = (status: string) => {
  switch (status) {
    case "paid": return { label: "Betald", className: "bg-success/10 text-success" };
    case "open": return { label: "Obetald", className: "bg-warning/10 text-warning" };
    case "void": return { label: "Annullerad", className: "bg-muted text-muted-foreground" };
    case "draft": return { label: "Utkast", className: "bg-info/10 text-info" };
    case "uncollectible": return { label: "Oindrivbar", className: "bg-destructive/10 text-destructive" };
    default: return { label: status, className: "bg-muted text-muted-foreground" };
  }
};

export const subscriptionStatusConfig = (status: string) => {
  switch (status) {
    case "active": return { label: "Aktiv", className: "bg-success/10 text-success" };
    case "trialing": return { label: "Provperiod", className: "bg-info/10 text-info" };
    case "past_due": return { label: "Förfallen", className: "bg-destructive/10 text-destructive" };
    case "paused": return { label: "Pausad", className: "bg-warning/10 text-warning" };
    case "canceled": return { label: "Avslutad", className: "bg-muted text-muted-foreground" };
    case "incomplete": return { label: "Ofullständig", className: "bg-warning/10 text-warning" };
    default: return { label: status, className: "bg-muted text-muted-foreground" };
  }
};

export const intervalLabel = (i: string) =>
  i === "month" ? "/mån" : i === "quarter" ? "/kvartal" : i === "year" ? "/år" : "";

export const intervalLong = (i: string) =>
  i === "month" ? "Månadsvis" : i === "quarter" ? "Kvartalsvis" : i === "year" ? "Årsvis" : i;
```

### `src/lib/admin/money.ts` & `src/lib/admin/time.ts`

Som specificerade i `00_README` princip 7 och 8.

---

## 1.5 Acceptanskriterier för kapitel 01

Bocka av varje punkt **innan** du går vidare till kapitel 02.

- [ ] `globals.css` innehåller exakt HSL-variabel-blocket ovan.
- [ ] `tailwind.config.ts` är ersatt enligt mall — `npm run build` lyckas.
- [ ] `letrend-design-system.ts` har `@deprecated`-kommentar; ingen ny
      import av `LeTrendColors` läggs in i admin-filer härefter.
- [ ] `src/components/admin/AdminLayout.tsx` finns och renderar sidebar
      identiskt med prototypen (kontrollera mot
      `https://id-preview--f39022e0-ec0c-4be8-aee0-cbb5fe185872.lovable.app`).
- [ ] `app/admin/layout.tsx` är auth-shell med `<QueryClientProvider>`
      runt `<AdminLayout>`.
- [ ] `src/lib/admin/{labels,money,time}.ts` finns med exakt innehåll ovan.
- [ ] Inga TypeScript-fel: `npm run typecheck` (eller `tsc --noEmit`).
- [ ] Visuell jämförelse av tom `/admin`-sida: sidebarens bredd, logga,
      navigationsorder, font, färger matchar prototypen.

→ Fortsätt till `02_OVERVIEW_PAGE.md`.
