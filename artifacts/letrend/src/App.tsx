import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { Toaster } from "sonner";
import { useState, useEffect, Suspense } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { ObservabilityProvider } from "@/components/ObservabilityProvider";
import { ApiError } from "@/lib/admin/api-client";

import "@mantine/core/styles.css";

const AdminAuthShell = lazy(() => import("@/app/admin/layout"));
const StudioLayout = lazy(() => import("@/app/studio/layout"));

function AdminRoutes() {
  return (
    <AdminAuthShell>
      <Switch>
        <Route path="/admin" component={lazy(() => import("@/app/admin/page"))} />
        <Route path="/admin/customers" component={lazy(() => import("@/app/admin/customers/page"))} />
        <Route path="/admin/customers/:id" component={lazy(() => import("@/app/admin/customers/[id]/page"))} />
        <Route path="/admin/customers/:id/activity" component={lazy(() => import("@/app/admin/customers/[id]/activity/page"))} />
        <Route path="/admin/customers/:id/billing" component={lazy(() => import("@/app/admin/customers/[id]/billing/page"))} />
        <Route path="/admin/customers/:id/billing/:invoiceId" component={lazy(() => import("@/app/admin/customers/[id]/billing/[invoiceId]/page"))} />
        <Route path="/admin/customers/:id/billing/manual-invoice" component={lazy(() => import("@/app/admin/customers/[id]/billing/manual-invoice/page"))} />
        <Route path="/admin/customers/:id/contract" component={lazy(() => import("@/app/admin/customers/[id]/contract/page"))} />
        <Route path="/admin/customers/:id/operations" component={lazy(() => import("@/app/admin/customers/[id]/operations/page"))} />
        <Route path="/admin/customers/:id/organisation" component={lazy(() => import("@/app/admin/customers/[id]/organisation/page"))} />
        <Route path="/admin/customers/:id/pulse" component={lazy(() => import("@/app/admin/customers/[id]/pulse/page"))} />
        <Route path="/admin/customers/:id/subscription" component={lazy(() => import("@/app/admin/customers/[id]/subscription/page"))} />
        <Route path="/admin/customers/:id/subscription/price" component={lazy(() => import("@/app/admin/customers/[id]/subscription/price/page"))} />
        <Route path="/admin/customers/:id/avtal" component={lazy(() => import("@/app/admin/customers/[id]/avtal/page"))} />
        <Route path="/admin/customers/:id/team" component={lazy(() => import("@/app/admin/customers/[id]/team/page"))} />
        <Route path="/admin/customers/:id/team/change" component={lazy(() => import("@/app/admin/customers/[id]/team/change/page"))} />
        <Route path="/admin/billing" component={lazy(() => import("@/app/admin/billing/page"))} />
        <Route path="/admin/billing/health" component={lazy(() => import("@/app/admin/billing/health/page"))} />
        <Route path="/admin/billing/invoices" component={lazy(() => import("@/app/admin/billing/invoices/page"))} />
        <Route path="/admin/billing/subscriptions" component={lazy(() => import("@/app/admin/billing/subscriptions/page"))} />
        <Route path="/admin/audit-log" component={lazy(() => import("@/app/admin/(ops)/audit-log/page"))} />
        <Route path="/admin/payroll" component={lazy(() => import("@/app/admin/(ops)/payroll/page"))} />
        <Route path="/admin/settings" component={lazy(() => import("@/app/admin/(ops)/settings/page"))} />
        <Route path="/admin/demos" component={lazy(() => import("@/app/admin/demos/page"))} />
        <Route path="/admin/notifications" component={lazy(() => import("@/app/admin/notifications/page"))} />
        <Route path="/admin/team" component={lazy(() => import("@/app/admin/team/page"))} />
        <Route path="/admin/team/payroll" component={lazy(() => import("@/app/admin/team/payroll/page"))} />
      </Switch>
    </AdminAuthShell>
  );
}

function StudioRoutes() {
  return (
    <StudioLayout>
      <Switch>
        <Route path="/studio" component={lazy(() => import("@/app/studio/page"))} />
        <Route path="/studio/customers" component={lazy(() => import("@/app/studio/customers/page"))} />
        <Route path="/studio/customers/:id" component={lazy(() => import("@/app/studio/customers/[id]/page"))} />
        <Route path="/studio/concepts" component={lazy(() => import("@/app/studio/concepts/page"))} />
        <Route path="/studio/concepts/:id" component={lazy(() => import("@/app/studio/concepts/[id]/page"))} />
        <Route path="/studio/concepts/:id/edit" component={lazy(() => import("@/app/studio/concepts/[id]/edit/page"))} />
        <Route path="/studio/concepts/:id/review" component={lazy(() => import("@/app/studio/concepts/[id]/review/page"))} />
        <Route path="/studio/invoices" component={lazy(() => import("@/app/studio/invoices/page"))} />
      </Switch>
    </StudioLayout>
  );
}

function RouterInner() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");
  const isStudioRoute = location.startsWith("/studio");

  return (
    <AuthProvider>
      <ObservabilityProvider />
      {isAdminRoute ? (
        <AdminRoutes />
      ) : isStudioRoute ? (
        <StudioRoutes />
      ) : (
        <ProfileProvider>
          <AppRoutes />
        </ProfileProvider>
      )}
    </AuthProvider>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Switch>
        <Route path="/" component={RootPage} />
        <Route path="/login" component={lazy(() => import("@/app/login/page"))} />
        <Route path="/auth/callback" component={lazy(() => import("@/app/auth/callback/page"))} />
        <Route path="/onboarding" component={lazy(() => import("@/app/onboarding/page"))} />
        <Route path="/welcome" component={lazy(() => import("@/app/welcome/page"))} />
        <Route path="/agreement" component={lazy(() => import("@/app/agreement/page"))} />
        <Route path="/feed" component={lazy(() => import("@/app/feed/page"))} />
        <Route path="/billing" component={lazy(() => import("@/app/billing/page"))} />
        <Route path="/checkout" component={lazy(() => import("@/app/checkout/page"))} />
        <Route path="/checkout/complete" component={lazy(() => import("@/app/checkout/complete/page"))} />
        <Route path="/customer" component={lazy(() => import("@/app/customer/page"))} />
        <Route path="/concept/:id" component={lazy(() => import("@/app/concept/[id]/page"))} />
        <Route path="/d/:token" component={lazy(() => import("@/app/d/[token]/page"))} />
        <Route path="/demo/:customerId" component={lazy(() => import("@/app/demo/[customerId]/page"))} />
        <Route path="/invoice/:id" component={lazy(() => import("@/app/invoice/[id]/page"))} />

        <Route path="/m" component={lazy(() => import("@/app/m/MobileEntry"))} />
        <Route path="/m/feed" component={lazy(() => import("@/app/m/feed/page"))} />
        <Route path="/m/login" component={lazy(() => import("@/app/m/login/page"))} />
        <Route path="/m/legacy-demo" component={lazy(() => import("@/app/m/legacy-demo/page"))} />
        <Route path="/m/concept/:id" component={lazy(() => import("@/app/m/concept/[id]/page"))} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>...</div>
        <div style={{ color: "#7D6E5D", fontSize: 15 }}>Laddar...</div>
      </div>
    </div>
  );
}

function RootPage() {
  const { user, profile, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    const role = (profile as { role?: string } | null)?.role;
    if (role === "admin") {
      navigate("/admin");
    } else if (role === "content_manager") {
      navigate("/studio/customers");
    } else {
      navigate("/feed");
    }
  }, [loading, profile, user, navigate]);

  return <LoadingScreen />;
}

function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24, color: "#1A1612" }}>404 – Sidan hittades inte</h1>
        <a href="/" style={{ color: "#4A2F18", marginTop: 12, display: "block" }}>Gå till startsidan</a>
      </div>
    </div>
  );
}

function lazy(importFn: () => Promise<any>) {
  const LazyComponent = (props: object) => {
    const [Component, setComponent] = useState<React.ComponentType<unknown> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      importFn()
        .then((mod) => setComponent(() => mod.default))
        .catch((err) => {
          console.error("Lazy load error:", err);
          setError(err.message);
        });
    }, []);

    if (error) return <div style={{ padding: 20, color: "red" }}>Error loading page: {error}</div>;
    if (!Component) return <LoadingScreen />;
    return <Component {...props} />;
  };
  return LazyComponent;
}

function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: (failureCount, error) =>
              error instanceof ApiError
                ? error.status >= 500 && failureCount < 2
                : failureCount < 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4_000),
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Toaster richColors position="top-right" />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <RouterInner />
        </WouterRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

export default App;
