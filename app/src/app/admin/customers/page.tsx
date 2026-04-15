"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { fetchAndCacheClient, readClientCache } from "@/lib/client-cache";
import InviteCustomerWizard, {
  InviteWizardValues,
} from "@/components/admin/billing/InviteCustomerWizard";
import DiscountModal from "@/components/admin/billing/DiscountModal";
import PendingInvoiceItemsSection from "@/components/admin/billing/PendingInvoiceItemsSection";
import CreateManualInvoiceModal from "@/components/admin/billing/CreateManualInvoiceModal";
import {
  calculateFirstInvoice,
  inferFirstInvoiceBehavior,
} from "@/lib/billing/first-invoice";
import {
  LeTrendColors,
  LeTrendTypography,
  LeTrendRadius,
} from "@/styles/letrend-design-system";

interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  phone?: string | null;
  customer_contact_name?: string | null;
  account_manager?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  monthly_price: number;
  subscription_interval?: "month" | "quarter" | "year" | null;
  pricing_status?: "fixed" | "unknown" | null;
  contract_start_date?: string | null;
  billing_day_of_month?: number | null;
  first_invoice_behavior?: "prorated" | "full" | "free_until_anchor" | null;
  discount_type?: "none" | "percent" | "amount" | "free_months" | null;
  discount_value?: number | null;
  discount_duration_months?: number | null;
  discount_start_date?: string | null;
  discount_end_date?: string | null;
  upcoming_monthly_price?: number | null;
  upcoming_price_effective_date?: string | null;
  status: "pending" | "active" | "archived" | "invited" | "agreed";
  created_at: string;
  next_invoice_date?: string;
}

interface ContractEditState {
  subscription_interval: "month" | "quarter" | "year";
  pricing_status: "fixed" | "unknown";
  monthly_price: number;
  contract_start_date: string;
  billing_day_of_month: number;
  waive_days_until_billing: boolean;
  upcoming_monthly_price: number;
  upcoming_price_effective_date: string;
}

interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  color?: string;
}

interface Stats {
  mrr: number;
  activeCustomers: number;
  pendingCount: number;
}

interface AdminDashboardCachePayload {
  customers: CustomerProfile[];
  teamMembers: TeamMember[];
  stats: Stats;
}

interface InvoiceSummary {
  id: string;
  status: string;
  due_date?: string | null;
  created_at: string;
  total?: number | null;
  amount_due?: number | null;
}

const ADMIN_DASHBOARD_CACHE_KEY = "admin:dashboard:v1";
const ADMIN_DASHBOARD_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_DASHBOARD_CACHE_MAX_STALE_MS = 10 * 60_000;
const ADMIN_CUSTOMER_INVOICES_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_CUSTOMER_INVOICES_CACHE_MAX_STALE_MS = 10 * 60_000;
const PAGE_SIZE = 20;

const todayYmd = () => new Date().toISOString().split("T")[0];

const buildContractEditForm = (
  customer: CustomerProfile,
): ContractEditState => ({
  subscription_interval: customer.subscription_interval || "month",
  pricing_status:
    customer.pricing_status ||
    (customer.monthly_price > 0 ? "fixed" : "unknown"),
  monthly_price: Number(customer.monthly_price) || 0,
  contract_start_date: customer.contract_start_date || todayYmd(),
  billing_day_of_month: Math.max(
    1,
    Math.min(28, Number(customer.billing_day_of_month) || 25),
  ),
  waive_days_until_billing:
    customer.first_invoice_behavior === "free_until_anchor",
  upcoming_monthly_price: Number(customer.upcoming_monthly_price) || 0,
  upcoming_price_effective_date: customer.upcoming_price_effective_date || "",
});

const calculateStats = (profiles: CustomerProfile[]): Stats => {
  const active = profiles.filter(
    (profile) => profile.status === "active" || profile.status === "agreed",
  );
  const pending = profiles.filter(
    (profile) => profile.status === "pending" || profile.status === "invited",
  );

  return {
    mrr: active.reduce((sum, profile) => sum + (profile.monthly_price || 0), 0),
    activeCustomers: active.length,
    pendingCount: pending.length,
  };
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 0,
  });

const formatIntervalLabel = (
  interval?:
    | CustomerProfile["subscription_interval"]
    | ContractEditState["subscription_interval"],
) => {
  switch (interval) {
    case "quarter":
      return "Kvartal";
    case "year":
      return "Ar";
    default:
      return "Manad";
  }
};

const buildDiscountSummary = (customer: CustomerProfile) => {
  if (!customer.discount_type || customer.discount_type === "none")
    return "Ingen aktiv rabatt";
  if (customer.discount_type === "percent")
    return `${customer.discount_value || 0}% rabatt`;
  if (customer.discount_type === "amount")
    return `${formatCurrency(customer.discount_value || 0)} rabatt`;
  const months =
    customer.discount_value || customer.discount_duration_months || 0;
  return `${months} fria manader`;
};

export default function AdminDashboard() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [stats, setStats] = useState<Stats>({
    mrr: 0,
    activeCustomers: 0,
    pendingCount: 0,
  });
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending"
  >("all");
  const [cmFilter, setCmFilter] = useState("all");
  const [sortField, setSortField] = useState<
    "created_at" | "business_name" | "monthly_price"
  >("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerProfile | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceSummary[]>(
    [],
  );
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [discountRemoving, setDiscountRemoving] = useState(false);
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState<
    string | null
  >(null);
  const [contractForm, setContractForm] = useState<ContractEditState | null>(
    null,
  );
  const [contractSaving, setContractSaving] = useState(false);

  const applyDashboardData = (payload: AdminDashboardCachePayload) => {
    setCustomers(payload.customers);
    setTeamMembers(payload.teamMembers);
    setStats(payload.stats);
  };

  const applyUpdatedCustomer = (profile: CustomerProfile) => {
    const mergedProfile = {
      ...(selectedCustomer?.id === profile.id ? selectedCustomer : {}),
      ...profile,
      next_invoice_date:
        profile.next_invoice_date ?? selectedCustomer?.next_invoice_date,
    };
    setSelectedCustomer(mergedProfile);
    setContractForm(buildContractEditForm(mergedProfile));
    void fetchData(true);
  };

  useEffect(() => {
    const cached = readClientCache<AdminDashboardCachePayload>(
      ADMIN_DASHBOARD_CACHE_KEY,
      {
        allowExpired: true,
        maxStaleMs: ADMIN_DASHBOARD_CACHE_MAX_STALE_MS,
      },
    );

    if (cached) {
      applyDashboardData(cached.value);
      setLoading(false);
      void fetchData(true);
      return;
    }

    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCustomer) {
      setContractForm(null);
      setCustomerInvoices([]);
      return;
    }

    setContractForm(buildContractEditForm(selectedCustomer));
    void fetchCustomerInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  const fetchCustomerInvoices = async (force = false) => {
    if (!selectedCustomer) return;

    const cacheKey = `admin:customer-invoices:${selectedCustomer.id}`;
    if (!force) {
      const cached = readClientCache<InvoiceSummary[]>(cacheKey, {
        allowExpired: true,
        maxStaleMs: ADMIN_CUSTOMER_INVOICES_CACHE_MAX_STALE_MS,
      });
      if (cached) {
        setCustomerInvoices(cached.value);
        setInvoicesLoading(false);
        void fetchCustomerInvoices(true);
        return;
      }
    }

    setInvoicesLoading(true);
    try {
      const invoices = await fetchAndCacheClient<InvoiceSummary[]>(
        cacheKey,
        async () => {
          const response = await fetch(
            `/api/admin/invoices?customerProfileId=${selectedCustomer.id}&limit=10`,
            { credentials: "include" },
          );
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Kunde inte ladda fakturor");
          }
          return payload.invoices || [];
        },
        ADMIN_CUSTOMER_INVOICES_CACHE_TTL_MS,
        { force },
      );
      setCustomerInvoices(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const fetchData = async (force = false) => {
    try {
      const payload = await fetchAndCacheClient<AdminDashboardCachePayload>(
        ADMIN_DASHBOARD_CACHE_KEY,
        async () => {
          const [profilesResult, teamResult, subscriptionsResponse] =
            await Promise.all([
              supabase
                .from("customer_profiles")
                .select("*")
                .order("created_at", { ascending: false }),
              supabase
                .from("team_members")
                .select("id, name, email, role, is_active, avatar_url, color")
                .eq("is_active", true)
                .order("name", { ascending: true }),
              fetch("/api/admin/subscriptions?status=active&limit=300", {
                credentials: "include",
              }),
            ]);

          if (profilesResult.error)
            throw new Error(profilesResult.error.message);
          if (teamResult.error) throw new Error(teamResult.error.message);

          const subscriptionPayload = await subscriptionsResponse.json();
          if (!subscriptionsResponse.ok) {
            throw new Error(
              subscriptionPayload.error || "Kunde inte ladda abonnemang",
            );
          }

          const nextInvoiceByProfileId = new Map(
            (subscriptionPayload.subscriptions || []).map(
              (subscription: {
                customer_profile_id?: string;
                current_period_end?: string;
              }) => [
                subscription.customer_profile_id,
                subscription.current_period_end,
              ],
            ),
          );
          const nextCustomers = (profilesResult.data || []).map((profile) => ({
            ...(profile as CustomerProfile),
            next_invoice_date:
              nextInvoiceByProfileId.get(profile.id) || undefined,
          }));

          return {
            customers: nextCustomers,
            teamMembers: (teamResult.data as TeamMember[]) || [],
            stats: calculateStats(nextCustomers),
          };
        },
        ADMIN_DASHBOARD_CACHE_TTL_MS,
        { force },
      );

      applyDashboardData(payload);
    } catch (error) {
      console.error("Error loading admin dashboard:", error);
    } finally {
      setLoading(false);
    }
  };
  const normalizeIdentifier = (value?: string | null) =>
    (value || "").trim().toLowerCase();

  const cmOptions = [
    { value: "all", label: "Alla CM" },
    ...teamMembers
      .map((member) => ({
        value: (member.email || member.name || "").trim(),
        label: member.name,
      }))
      .filter((member) => member.value),
  ];

  const getCMInfo = (identifier?: string | null) => {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return null;
    return (
      teamMembers.find(
        (member) =>
          normalizeIdentifier(member.email) === normalized ||
          normalizeIdentifier(member.name) === normalized,
      ) || null
    );
  };

  const sortCustomers = (list: CustomerProfile[]) =>
    [...list].sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      switch (sortField) {
        case "created_at":
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case "business_name":
          aValue = (a.business_name || "").toLowerCase();
          bValue = (b.business_name || "").toLowerCase();
          break;
        case "monthly_price":
          aValue = a.monthly_price || 0;
          bValue = b.monthly_price || 0;
          break;
      }

      if (aValue < bValue) return sortDir === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      !searchQuery ||
      customer.business_name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      customer.contact_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" &&
        (customer.status === "active" || customer.status === "agreed")) ||
      (statusFilter === "pending" &&
        (customer.status === "pending" || customer.status === "invited"));
    const matchesCm =
      cmFilter === "all" ||
      normalizeIdentifier(customer.account_manager) ===
        normalizeIdentifier(cmFilter);
    return matchesSearch && matchesStatus && matchesCm;
  });

  const sortedCustomers = sortCustomers(filteredCustomers);
  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / PAGE_SIZE));
  const paginatedCustomers = sortedCustomers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, cmFilter]);

  const handleSort = (
    field: "created_at" | "business_name" | "monthly_price",
  ) => {
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("desc");
  };

  const getStatusTone = (status: CustomerProfile["status"]) => {
    switch (status) {
      case "active":
      case "agreed":
        return { bg: "#d1fae5", text: "#065f46", label: "Aktiv" };
      case "pending":
        return { bg: "#fef3c7", text: "#92400e", label: "Vantar" };
      case "invited":
        return { bg: "#e0f2fe", text: "#0c4a6e", label: "Inbjuden" };
      case "archived":
        return { bg: "#f3f4f6", text: "#6b7280", label: "Arkiverad" };
      default:
        return { bg: "#f3f4f6", text: "#6b7280", label: status };
    }
  };

  const getStatusStep = (status: CustomerProfile["status"]) => {
    switch (status) {
      case "invited":
        return 1;
      case "pending":
        return 2;
      case "active":
      case "agreed":
        return 3;
      default:
        return 0;
    }
  };

  const formatDate = (dateString?: string | null) =>
    !dateString
      ? "-"
      : new Date(dateString).toLocaleDateString("sv-SE", {
          day: "numeric",
          month: "short",
        });
  const formatFullDate = (dateString?: string | null) =>
    !dateString
      ? "-"
      : new Date(dateString).toLocaleDateString("sv-SE", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

  const handleInvite = async (values: InviteWizardValues) => {
    if (!values.business_name.trim() || !values.contact_email.trim()) {
      alert("Fyll i foretagsnamn och e-post.");
      return;
    }
    if (values.pricing_status === "fixed" && values.monthly_price <= 0) {
      alert('Satt ett manadspris eller valj "Pris ej satt annu".');
      return;
    }

    const firstInvoiceBehavior = inferFirstInvoiceBehavior({
      startDate: values.contract_start_date,
      billingDay: values.billing_day_of_month,
      waiveDaysUntilBilling: values.waive_days_until_billing,
    });

    setInviteLoading(true);
    try {
      const createResponse = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          business_name: values.business_name.trim(),
          contact_email: values.contact_email.trim(),
          customer_contact_name: values.customer_contact_name.trim() || null,
          account_manager: values.account_manager || null,
          monthly_price:
            values.pricing_status === "fixed" ? values.monthly_price : 0,
          subscription_interval: values.subscription_interval,
        }),
      });
      const createPayload = await createResponse.json();
      if (!createResponse.ok)
        throw new Error(createPayload.error || "Kunde inte skapa kund");

      const newProfile = createPayload.profile as CustomerProfile | undefined;
      if (!newProfile?.id) throw new Error("Ingen kund returnerad");

      const inviteResponse = await fetch(
        `/api/admin/customers/${newProfile.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "send_invite",
            business_name: values.business_name.trim(),
            contact_email: values.contact_email.trim(),
            customer_contact_name: values.customer_contact_name.trim() || null,
            account_manager: values.account_manager || null,
            monthly_price:
              values.pricing_status === "fixed" ? values.monthly_price : 0,
            pricing_status: values.pricing_status,
            subscription_interval: values.subscription_interval,
            contract_start_date: values.contract_start_date,
            billing_day_of_month: values.billing_day_of_month,
            first_invoice_behavior: firstInvoiceBehavior,
          }),
        },
      );
      const invitePayload = await inviteResponse.json();
      if (!inviteResponse.ok)
        throw new Error(invitePayload.error || "Kunde inte skicka inbjudan");

      setShowInviteModal(false);
      alert(`Inbjudan skickad till ${values.contact_email.trim()}`);
      await fetchData(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okant fel";
      alert(`Kunde inte skicka inbjudan: ${message}`);
    } finally {
      setInviteLoading(false);
    }
  };
  const handleResendInvite = async (customer: CustomerProfile) => {
    if (!confirm(`Skicka ny inbjudan till ${customer.contact_email}?`)) return;

    const contractStartDate = customer.contract_start_date || todayYmd();
    const billingDay = Math.max(
      1,
      Math.min(28, Number(customer.billing_day_of_month) || 25),
    );
    const pricingStatus =
      customer.pricing_status ||
      (customer.monthly_price > 0 ? "fixed" : "unknown");
    const firstInvoiceBehavior = inferFirstInvoiceBehavior({
      startDate: contractStartDate,
      billingDay,
      waiveDaysUntilBilling:
        customer.first_invoice_behavior === "free_until_anchor",
    });

    setResendLoading(true);
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send_invite",
          business_name: customer.business_name,
          contact_email: customer.contact_email,
          customer_contact_name: customer.customer_contact_name,
          account_manager: customer.account_manager,
          monthly_price: pricingStatus === "fixed" ? customer.monthly_price : 0,
          pricing_status: pricingStatus,
          subscription_interval: customer.subscription_interval || "month",
          contract_start_date: contractStartDate,
          billing_day_of_month: billingDay,
          first_invoice_behavior: firstInvoiceBehavior,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Kunde inte skicka inbjudan");
      if (payload.profile)
        applyUpdatedCustomer(payload.profile as CustomerProfile);
      alert(`Ny inbjudan skickad till ${customer.contact_email}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okant fel";
      alert(`Kunde inte skicka inbjudan: ${message}`);
    } finally {
      setResendLoading(false);
    }
  };

  const handleSaveContractTerms = async () => {
    if (!selectedCustomer || !contractForm) return;
    if (
      contractForm.pricing_status === "fixed" &&
      contractForm.monthly_price <= 0
    ) {
      alert('Satt ett manadspris eller valj "Pris ej satt annu".');
      return;
    }
    if (
      contractForm.upcoming_monthly_price > 0 &&
      !contractForm.upcoming_price_effective_date
    ) {
      alert("Ange datum nar planerat pris ska borja galla.");
      return;
    }

    const firstInvoiceBehavior = inferFirstInvoiceBehavior({
      startDate: contractForm.contract_start_date,
      billingDay: contractForm.billing_day_of_month,
      waiveDaysUntilBilling: contractForm.waive_days_until_billing,
    });

    setContractSaving(true);
    try {
      const response = await fetch(
        `/api/admin/customers/${selectedCustomer.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            subscription_interval: contractForm.subscription_interval,
            pricing_status: contractForm.pricing_status,
            monthly_price:
              contractForm.pricing_status === "fixed"
                ? contractForm.monthly_price
                : 0,
            contract_start_date: contractForm.contract_start_date || null,
            billing_day_of_month: Math.max(
              1,
              Math.min(28, Number(contractForm.billing_day_of_month) || 25),
            ),
            first_invoice_behavior: firstInvoiceBehavior,
            upcoming_monthly_price:
              contractForm.upcoming_monthly_price > 0
                ? contractForm.upcoming_monthly_price
                : null,
            upcoming_price_effective_date:
              contractForm.upcoming_price_effective_date || null,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error || "Kunde inte spara avtalsinstallningar",
        );
      applyUpdatedCustomer(payload.profile as CustomerProfile);
      alert("Avtalsinstallningar sparade.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okant fel";
      alert(`Kunde inte spara avtalsinstallningar: ${message}`);
    } finally {
      setContractSaving(false);
    }
  };

  const handleArchive = async (customer: CustomerProfile) => {
    if (!confirm(`Vill du arkivera ${customer.business_name}?`)) return;
    try {
      const { error } = await supabase
        .from("customer_profiles")
        .update({ status: "archived" })
        .eq("id", customer.id);
      if (error) throw error;
      if (selectedCustomer?.id === customer.id)
        applyUpdatedCustomer({ ...selectedCustomer, status: "archived" });
      await fetchData(true);
      alert(`${customer.business_name} har arkiverats`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okant fel";
      alert(`Kunde inte arkivera: ${message}`);
    }
  };

  const handleDiscountApplied = (profile: Record<string, unknown>) => {
    applyUpdatedCustomer(profile as CustomerProfile);
    alert("Rabatt tillagd.");
  };

  const handleRemoveDiscount = async () => {
    if (!selectedCustomer) return;
    if (!confirm(`Ta bort aktiv rabatt for ${selectedCustomer.business_name}?`))
      return;
    setDiscountRemoving(true);
    try {
      const response = await fetch(
        `/api/admin/customers/${selectedCustomer.id}/discount`,
        { method: "DELETE", credentials: "include" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Kunde inte ta bort rabatt");
      applyUpdatedCustomer(payload.profile as CustomerProfile);
      alert("Rabatten togs bort.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okant fel";
      alert(`Kunde inte ta bort rabatt: ${message}`);
    } finally {
      setDiscountRemoving(false);
    }
  };

  const handleSubscriptionAction = async (
    action:
      | "pause_subscription"
      | "resume_subscription"
      | "cancel_subscription",
    label: string,
  ) => {
    if (!selectedCustomer) return;
    if (!confirm(`${label} for ${selectedCustomer.business_name}?`)) return;
    setSubscriptionActionLoading(action);
    try {
      const response = await fetch(
        `/api/admin/customers/${selectedCustomer.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || `Kunde inte ${label.toLowerCase()}`);
      alert(`${label} genomford.`);
      await fetchData(true);
      await fetchCustomerInvoices(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okant fel";
      alert(`Kunde inte genomfora atgarden: ${message}`);
    } finally {
      setSubscriptionActionLoading(null);
    }
  };

  const handleDelete = async (customer: CustomerProfile) => {
    if (
      !confirm(
        `Ar du saker pa att du vill ta bort ${customer.business_name}?\n\nDetta gar inte att aterstalla.`,
      )
    )
      return;
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Kunde inte ta bort kund");
      const cleanupSuffix = payload.cleanup
        ? ` Stripe cleanup: ${payload.cleanup}.`
        : "";
      alert(`${customer.business_name} har tagits bort.${cleanupSuffix}`);
      setSelectedCustomer(null);
      await fetchData(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okant fel";
      alert(`Kunde inte ta bort: ${message}`);
    }
  };

  const handleManualInvoiceCreated = async () => {
    await fetchCustomerInvoices(true);
    await fetchData(true);
    alert("Manuell faktura skapad.");
  };

  const contractPreview = contractForm
    ? calculateFirstInvoice({
        pricingStatus: contractForm.pricing_status,
        recurringPriceSek: contractForm.monthly_price,
        startDate: contractForm.contract_start_date,
        billingDay: contractForm.billing_day_of_month,
        waiveDaysUntilBilling: contractForm.waive_days_until_billing,
      })
    : null;

  if (loading) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: LeTrendColors.textMuted,
        }}
      >
        Laddar...
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1200px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "24px",
            fontWeight: 700,
            fontFamily: LeTrendTypography.fontFamily.heading,
            color: LeTrendColors.brownDark,
          }}
        >
          Kunder
        </h1>
        <button
          onClick={() => setShowInviteModal(true)}
          style={{
            background: LeTrendColors.brownDark,
            color: LeTrendColors.cream,
            padding: "10px 20px",
            borderRadius: LeTrendRadius.md,
            border: "none",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Bjud in kund
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: "32px",
          marginBottom: "24px",
          padding: "16px 20px",
          background: LeTrendColors.surface,
          borderRadius: LeTrendRadius.lg,
          border: `1px solid ${LeTrendColors.border}`,
        }}
      >
        <div>
          <span
            style={{
              fontSize: "13px",
              color: LeTrendColors.textMuted,
              marginRight: "8px",
            }}
          >
            MRR
          </span>
          <span
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: LeTrendColors.brownDark,
            }}
          >
            {stats.mrr.toLocaleString()} kr
          </span>
        </div>
        <div style={{ width: "1px", background: LeTrendColors.border }} />
        <div>
          <span
            style={{
              fontSize: "13px",
              color: LeTrendColors.textMuted,
              marginRight: "8px",
            }}
          >
            Aktiva
          </span>
          <span
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: LeTrendColors.success,
            }}
          >
            {stats.activeCustomers}
          </span>
        </div>
        <div style={{ width: "1px", background: LeTrendColors.border }} />
        <div>
          <span
            style={{
              fontSize: "13px",
              color: LeTrendColors.textMuted,
              marginRight: "8px",
            }}
          >
            Vantande
          </span>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#d97706" }}>
            {stats.pendingCount}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Sok kund..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          style={{
            padding: "10px 14px",
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.border}`,
            fontSize: "14px",
            minWidth: "220px",
            outline: "none",
            background: "#fff",
          }}
        />
        <select
          value={cmFilter}
          onChange={(event) => setCmFilter(event.target.value)}
          style={{
            padding: "10px 14px",
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.border}`,
            fontSize: "14px",
            background: "#fff",
          }}
        >
          {cmOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div
          style={{
            display: "flex",
            background: LeTrendColors.surface,
            borderRadius: LeTrendRadius.md,
            padding: "4px",
          }}
        >
          {[
            { key: "all", label: "Alla" },
            { key: "active", label: "Aktiva" },
            { key: "pending", label: "Vantande" },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() =>
                setStatusFilter(filter.key as "all" | "active" | "pending")
              }
              style={{
                padding: "8px 14px",
                borderRadius: LeTrendRadius.sm,
                border: "none",
                background:
                  statusFilter === filter.key ? "#fff" : "transparent",
                color:
                  statusFilter === filter.key
                    ? LeTrendColors.textPrimary
                    : LeTrendColors.textMuted,
                fontWeight: 500,
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: LeTrendRadius.lg,
          border: `1px solid ${LeTrendColors.border}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 140px",
            gap: "16px",
            padding: "12px 20px",
            background: LeTrendColors.surface,
            borderBottom: `1px solid ${LeTrendColors.border}`,
            fontSize: "12px",
            fontWeight: 600,
            color: LeTrendColors.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          <div
            onClick={() => handleSort("business_name")}
            style={{ cursor: "pointer" }}
          >
            Foretag{" "}
            {sortField === "business_name" && (sortDir === "asc" ? "?" : "?")}
          </div>
          <div>CM</div>
          <div
            onClick={() => handleSort("monthly_price")}
            style={{ cursor: "pointer" }}
          >
            Pris{" "}
            {sortField === "monthly_price" && (sortDir === "asc" ? "?" : "?")}
          </div>
          <div
            onClick={() => handleSort("created_at")}
            style={{ cursor: "pointer" }}
          >
            Tillagd{" "}
            {sortField === "created_at" && (sortDir === "asc" ? "?" : "?")}
          </div>
          <div>Status</div>
        </div>

        {paginatedCustomers.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: LeTrendColors.textMuted,
            }}
          >
            Inga kunder hittades.
          </div>
        ) : (
          paginatedCustomers.map((customer, index) => {
            const statusTone = getStatusTone(customer.status);
            return (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 140px",
                  gap: "16px",
                  padding: "14px 20px",
                  alignItems: "center",
                  cursor: "pointer",
                  borderBottom:
                    index < paginatedCustomers.length - 1
                      ? `1px solid ${LeTrendColors.border}`
                      : "none",
                  background: index % 2 === 0 ? "#fff" : LeTrendColors.surface,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: LeTrendColors.textPrimary,
                    }}
                  >
                    {customer.business_name}
                  </div>
                  <div
                    style={{ fontSize: "13px", color: LeTrendColors.textMuted }}
                  >
                    {customer.contact_email}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: LeTrendColors.textSecondary,
                  }}
                >
                  {getCMInfo(customer.account_manager)?.name ||
                    customer.account_manager ||
                    "-"}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: LeTrendColors.textPrimary,
                  }}
                >
                  {customer.pricing_status === "unknown"
                    ? "Pris ej satt"
                    : customer.monthly_price > 0
                      ? `${customer.monthly_price.toLocaleString()} kr`
                      : "-"}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: LeTrendColors.textSecondary,
                  }}
                >
                  {formatDate(customer.created_at)}
                </div>
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: statusTone.bg,
                      color: statusTone.text,
                    }}
                  >
                    {statusTone.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            marginTop: "20px",
          }}
        >
          <button
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            style={{
              padding: "8px 12px",
              borderRadius: LeTrendRadius.sm,
              border: `1px solid ${LeTrendColors.border}`,
              background: "#fff",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              opacity: currentPage === 1 ? 0.5 : 1,
            }}
          >
            Foregaende
          </button>
          <div style={{ fontSize: "13px", color: LeTrendColors.textMuted }}>
            Sida {currentPage} av {totalPages}
          </div>
          <button
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
            disabled={currentPage === totalPages}
            style={{
              padding: "8px 12px",
              borderRadius: LeTrendRadius.sm,
              border: `1px solid ${LeTrendColors.border}`,
              background: "#fff",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              opacity: currentPage === totalPages ? 0.5 : 1,
            }}
          >
            Nasta
          </button>
        </div>
      )}

      <InviteCustomerWizard
        open={showInviteModal}
        loading={inviteLoading}
        teamMembers={teamMembers}
        onClose={() => setShowInviteModal(false)}
        onSubmit={handleInvite}
      />

      {selectedCustomer && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "520px",
            maxWidth: "92vw",
            background: "#fff",
            boxShadow: "-8px 0 24px rgba(15, 23, 42, 0.15)",
            zIndex: 220,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "24px",
              borderBottom: `1px solid ${LeTrendColors.border}`,
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  fontFamily: LeTrendTypography.fontFamily.heading,
                  color: LeTrendColors.brownDark,
                  marginBottom: "4px",
                }}
              >
                {selectedCustomer.business_name}
              </div>
              <div style={{ fontSize: "14px", color: LeTrendColors.textMuted }}>
                {selectedCustomer.contact_email}
              </div>
            </div>
            <button
              onClick={() => setSelectedCustomer(null)}
              style={{
                border: "none",
                background: "transparent",
                color: LeTrendColors.textMuted,
                fontSize: "28px",
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: LeTrendColors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "12px",
                }}
              >
                Status
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  background: LeTrendColors.surface,
                  padding: "16px",
                  borderRadius: LeTrendRadius.md,
                }}
              >
                {[
                  { id: 1, label: "Inbjuden" },
                  { id: 2, label: "I gang" },
                  { id: 3, label: "Aktiv" },
                ].map((step) => {
                  const active =
                    getStatusStep(selectedCustomer.status) >= step.id;
                  return (
                    <div
                      key={step.id}
                      style={{
                        padding: "12px",
                        borderRadius: LeTrendRadius.md,
                        background: active ? "#ecfdf5" : "#fff",
                        border: `1px solid ${active ? "#10b981" : LeTrendColors.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          color: LeTrendColors.textMuted,
                          marginBottom: "4px",
                        }}
                      >
                        Steg {step.id}
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: LeTrendColors.textPrimary,
                        }}
                      >
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: LeTrendColors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "12px",
                }}
              >
                Kundinfo
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "14px",
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: LeTrendColors.textMuted,
                      }}
                    >
                      Kontaktperson
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: LeTrendColors.textPrimary,
                      }}
                    >
                      {selectedCustomer.customer_contact_name || "-"}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: LeTrendColors.textMuted,
                      }}
                    >
                      Telefon
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: LeTrendColors.textPrimary,
                      }}
                    >
                      {selectedCustomer.phone || "-"}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: LeTrendColors.textMuted,
                      }}
                    >
                      Account Manager
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: LeTrendColors.textPrimary,
                      }}
                    >
                      {getCMInfo(selectedCustomer.account_manager)?.name ||
                        selectedCustomer.account_manager ||
                        "-"}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: LeTrendColors.textMuted,
                      }}
                    >
                      Kund sedan
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: LeTrendColors.textPrimary,
                      }}
                    >
                      {formatFullDate(selectedCustomer.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: LeTrendColors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "12px",
                }}
              >
                Billingoversikt
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: LeTrendColors.textPrimary,
                  }}
                >
                  {selectedCustomer.pricing_status === "unknown"
                    ? "Pris ej satt annu"
                    : selectedCustomer.monthly_price > 0
                      ? `${selectedCustomer.monthly_price.toLocaleString()} kr / ${formatIntervalLabel(selectedCustomer.subscription_interval).toLowerCase()}`
                      : "Inget pris satt"}
                </div>
                <div
                  style={{ fontSize: "13px", color: LeTrendColors.textMuted }}
                >
                  Intervall:{" "}
                  {formatIntervalLabel(selectedCustomer.subscription_interval)}
                </div>
                <div
                  style={{ fontSize: "13px", color: LeTrendColors.textMuted }}
                >
                  Nasta ordinarie debitering:{" "}
                  {formatFullDate(selectedCustomer.next_invoice_date)}
                </div>
                <div
                  style={{ fontSize: "13px", color: LeTrendColors.textMuted }}
                >
                  Rabatt: {buildDiscountSummary(selectedCustomer)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: LeTrendColors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "12px",
                }}
              >
                Fakturahistorik
              </div>
              <div
                style={{
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  padding: "16px",
                }}
              >
                {invoicesLoading ? (
                  <div
                    style={{ fontSize: "13px", color: LeTrendColors.textMuted }}
                  >
                    Laddar...
                  </div>
                ) : customerInvoices.length === 0 ? (
                  <div
                    style={{ fontSize: "13px", color: LeTrendColors.textMuted }}
                  >
                    Inga fakturor hittades.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {customerInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "center",
                          padding: "12px",
                          borderRadius: LeTrendRadius.md,
                          background: "#fff",
                          border: `1px solid ${LeTrendColors.border}`,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: LeTrendColors.textPrimary,
                            }}
                          >
                            {formatDate(invoice.due_date || invoice.created_at)}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: LeTrendColors.textMuted,
                            }}
                          >
                            Status: {invoice.status}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: LeTrendColors.textSecondary,
                          }}
                        >
                          {typeof invoice.total === "number"
                            ? formatCurrency(invoice.total / 100)
                            : typeof invoice.amount_due === "number"
                              ? formatCurrency(invoice.amount_due / 100)
                              : "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {contractForm && (
              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: LeTrendColors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "12px",
                  }}
                >
                  Avtal och pris
                </div>
                <div
                  style={{
                    background: LeTrendColors.surface,
                    borderRadius: LeTrendRadius.md,
                    padding: "16px",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textMuted,
                          marginBottom: "4px",
                        }}
                      >
                        Prisstatus
                      </div>
                      <select
                        value={contractForm.pricing_status}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            pricing_status: e.target.value as
                              | "fixed"
                              | "unknown",
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: LeTrendRadius.md,
                          border: `1px solid ${LeTrendColors.border}`,
                          background: "#fff",
                        }}
                      >
                        <option value="fixed">Fast pris</option>
                        <option value="unknown">Pris ej satt annu</option>
                      </select>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textMuted,
                          marginBottom: "4px",
                        }}
                      >
                        Manadspris (kr)
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={contractForm.monthly_price}
                        disabled={contractForm.pricing_status === "unknown"}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            monthly_price: Math.max(
                              0,
                              Number(e.target.value) || 0,
                            ),
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: LeTrendRadius.md,
                          border: `1px solid ${LeTrendColors.border}`,
                          opacity:
                            contractForm.pricing_status === "unknown" ? 0.6 : 1,
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textMuted,
                          marginBottom: "4px",
                        }}
                      >
                        Faktureringsintervall
                      </div>
                      <select
                        value={contractForm.subscription_interval}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            subscription_interval: e.target
                              .value as ContractEditState["subscription_interval"],
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: LeTrendRadius.md,
                          border: `1px solid ${LeTrendColors.border}`,
                          background: "#fff",
                        }}
                      >
                        <option value="month">Manad</option>
                        <option value="quarter">Kvartal</option>
                        <option value="year">Ar</option>
                      </select>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textMuted,
                          marginBottom: "4px",
                        }}
                      >
                        Faktureringsdag (1-28)
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={contractForm.billing_day_of_month}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            billing_day_of_month: Math.max(
                              1,
                              Math.min(28, Number(e.target.value) || 25),
                            ),
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: LeTrendRadius.md,
                          border: `1px solid ${LeTrendColors.border}`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: LeTrendColors.textMuted,
                        marginBottom: "4px",
                      }}
                    >
                      Startdatum
                    </div>
                    <input
                      type="date"
                      value={contractForm.contract_start_date}
                      onChange={(e) =>
                        setContractForm({
                          ...contractForm,
                          contract_start_date: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: LeTrendRadius.md,
                        border: `1px solid ${LeTrendColors.border}`,
                      }}
                    />
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "12px",
                      borderRadius: LeTrendRadius.md,
                      background: "#fff7ed",
                      border: `1px solid ${LeTrendColors.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={contractForm.waive_days_until_billing}
                      onChange={(e) =>
                        setContractForm({
                          ...contractForm,
                          waive_days_until_billing: e.target.checked,
                        })
                      }
                      style={{ marginTop: "2px" }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: LeTrendColors.textPrimary,
                        }}
                      >
                        Bjud pa dagarna fram till nasta faktureringsdag
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textMuted,
                          marginTop: "4px",
                        }}
                      >
                        Ersatter separat first invoice behavior.
                      </div>
                    </div>
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textMuted,
                          marginBottom: "4px",
                        }}
                      >
                        Kommande pris (kr)
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={contractForm.upcoming_monthly_price}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            upcoming_monthly_price: Math.max(
                              0,
                              Number(e.target.value) || 0,
                            ),
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: LeTrendRadius.md,
                          border: `1px solid ${LeTrendColors.border}`,
                        }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textMuted,
                          marginBottom: "4px",
                        }}
                      >
                        Galler fran
                      </div>
                      <input
                        type="date"
                        value={contractForm.upcoming_price_effective_date}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            upcoming_price_effective_date: e.target.value,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: LeTrendRadius.md,
                          border: `1px solid ${LeTrendColors.border}`,
                        }}
                      />
                    </div>
                  </div>
                  {contractPreview && (
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: LeTrendRadius.md,
                        background: "#fff",
                        border: `1px solid ${LeTrendColors.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: LeTrendColors.textSecondary,
                        }}
                      >
                        {contractPreview.explanation}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: LeTrendColors.textPrimary,
                          marginTop: "6px",
                        }}
                      >
                        {contractPreview.amountSek !== null
                          ? `Forsta faktura: ${contractPreview.amountSek.toLocaleString()} kr`
                          : "Forsta faktura beraknas nar pris ar satt"}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={handleSaveContractTerms}
                      disabled={contractSaving}
                      style={{
                        padding: "10px 14px",
                        borderRadius: LeTrendRadius.md,
                        border: "none",
                        background: LeTrendColors.brownDark,
                        color: "#fff",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: contractSaving ? "not-allowed" : "pointer",
                        opacity: contractSaving ? 0.7 : 1,
                      }}
                    >
                      {contractSaving ? "Sparar..." : "Spara avtal"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: LeTrendColors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "12px",
                }}
              >
                Rabatt
              </div>
              <div
                style={{
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: LeTrendColors.textPrimary,
                  }}
                >
                  {buildDiscountSummary(selectedCustomer)}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "12px",
                  }}
                >
                  <button
                    onClick={() => setShowDiscountModal(true)}
                    disabled={!selectedCustomer.stripe_subscription_id}
                    style={{
                      padding: "10px 14px",
                      borderRadius: LeTrendRadius.md,
                      border: `1px solid ${LeTrendColors.border}`,
                      background: "#fff",
                      cursor: selectedCustomer.stripe_subscription_id
                        ? "pointer"
                        : "not-allowed",
                      opacity: selectedCustomer.stripe_subscription_id
                        ? 1
                        : 0.6,
                    }}
                  >
                    Lagg till rabatt
                  </button>
                  <button
                    onClick={() => void handleRemoveDiscount()}
                    disabled={
                      !selectedCustomer.stripe_subscription_id ||
                      selectedCustomer.discount_type === "none" ||
                      discountRemoving
                    }
                    style={{
                      padding: "10px 14px",
                      borderRadius: LeTrendRadius.md,
                      border: "1px solid #ef4444",
                      background: "#fff",
                      color: "#ef4444",
                      cursor:
                        !selectedCustomer.stripe_subscription_id ||
                        selectedCustomer.discount_type === "none" ||
                        discountRemoving
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        !selectedCustomer.stripe_subscription_id ||
                        selectedCustomer.discount_type === "none" ||
                        discountRemoving
                          ? 0.6
                          : 1,
                    }}
                  >
                    {discountRemoving ? "Tar bort..." : "Ta bort rabatt"}
                  </button>
                </div>
              </div>
            </div>

            {selectedCustomer.stripe_customer_id ? (
              <PendingInvoiceItemsSection customerId={selectedCustomer.id} />
            ) : (
              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: LeTrendColors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "12px",
                  }}
                >
                  Kommande fakturatillagg
                </div>
                <div
                  style={{
                    background: LeTrendColors.surface,
                    borderRadius: LeTrendRadius.md,
                    padding: "16px",
                    fontSize: "13px",
                    color: LeTrendColors.textMuted,
                  }}
                >
                  Fakturatillagg blir tillgangliga nar Stripe customer finns
                  skapad.
                </div>
              </div>
            )}

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: LeTrendColors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "12px",
                }}
              >
                Manuell faktura
              </div>
              <div
                style={{
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  padding: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div
                  style={{ fontSize: "13px", color: LeTrendColors.textMuted }}
                >
                  Skapa one-off-faktura utan att ga till Stripe Dashboard.
                </div>
                <button
                  onClick={() => setShowCreateInvoiceModal(true)}
                  disabled={!selectedCustomer.stripe_customer_id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: LeTrendRadius.md,
                    border: "none",
                    background: LeTrendColors.brownDark,
                    color: "#fff",
                    cursor: selectedCustomer.stripe_customer_id
                      ? "pointer"
                      : "not-allowed",
                    opacity: selectedCustomer.stripe_customer_id ? 1 : 0.6,
                  }}
                >
                  Skapa faktura
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: LeTrendColors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "12px",
                }}
              >
                Atgarder
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Link
                  href={`/studio/customers/${selectedCustomer.id}`}
                  style={{
                    display: "inline-block",
                    padding: "10px 16px",
                    background: LeTrendColors.brownDark,
                    color: LeTrendColors.cream,
                    borderRadius: LeTrendRadius.md,
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Redigera
                </Link>
                {(selectedCustomer.status === "invited" ||
                  selectedCustomer.status === "pending") && (
                  <button
                    onClick={() => void handleResendInvite(selectedCustomer)}
                    disabled={resendLoading}
                    style={{
                      padding: "10px 16px",
                      background: "#fff",
                      color: LeTrendColors.brownDark,
                      border: `1px solid ${LeTrendColors.brownDark}`,
                      borderRadius: LeTrendRadius.md,
                      cursor: resendLoading ? "not-allowed" : "pointer",
                      opacity: resendLoading ? 0.6 : 1,
                    }}
                  >
                    {resendLoading ? "Skickar..." : "Skicka inbjudan igen"}
                  </button>
                )}
                {selectedCustomer.stripe_subscription_id &&
                  selectedCustomer.status !== "archived" && (
                    <>
                      <button
                        onClick={() =>
                          void handleSubscriptionAction(
                            "pause_subscription",
                            "Pausa prenumeration",
                          )
                        }
                        disabled={subscriptionActionLoading !== null}
                        style={{
                          padding: "10px 16px",
                          background: "#fff",
                          color: LeTrendColors.textPrimary,
                          border: `1px solid ${LeTrendColors.border}`,
                          borderRadius: LeTrendRadius.md,
                          cursor: subscriptionActionLoading
                            ? "not-allowed"
                            : "pointer",
                          opacity: subscriptionActionLoading ? 0.6 : 1,
                        }}
                      >
                        {subscriptionActionLoading === "pause_subscription"
                          ? "Pausar..."
                          : "Pausa"}
                      </button>
                      <button
                        onClick={() =>
                          void handleSubscriptionAction(
                            "resume_subscription",
                            "Ateruppta prenumeration",
                          )
                        }
                        disabled={subscriptionActionLoading !== null}
                        style={{
                          padding: "10px 16px",
                          background: "#fff",
                          color: LeTrendColors.textPrimary,
                          border: `1px solid ${LeTrendColors.border}`,
                          borderRadius: LeTrendRadius.md,
                          cursor: subscriptionActionLoading
                            ? "not-allowed"
                            : "pointer",
                          opacity: subscriptionActionLoading ? 0.6 : 1,
                        }}
                      >
                        {subscriptionActionLoading === "resume_subscription"
                          ? "Aterupptar..."
                          : "Ateruppta"}
                      </button>
                      <button
                        onClick={() =>
                          void handleSubscriptionAction(
                            "cancel_subscription",
                            "Avsluta prenumeration",
                          )
                        }
                        disabled={subscriptionActionLoading !== null}
                        style={{
                          padding: "10px 16px",
                          background: "#fff",
                          color: "#ef4444",
                          border: "1px solid #ef4444",
                          borderRadius: LeTrendRadius.md,
                          cursor: subscriptionActionLoading
                            ? "not-allowed"
                            : "pointer",
                          opacity: subscriptionActionLoading ? 0.6 : 1,
                        }}
                      >
                        {subscriptionActionLoading === "cancel_subscription"
                          ? "Avslutar..."
                          : "Avsluta"}
                      </button>
                    </>
                  )}
                {selectedCustomer.status !== "archived" ? (
                  <button
                    onClick={() => void handleArchive(selectedCustomer)}
                    style={{
                      padding: "10px 16px",
                      background: "#fff",
                      color: "#666",
                      border: `1px solid ${LeTrendColors.border}`,
                      borderRadius: LeTrendRadius.md,
                      cursor: "pointer",
                    }}
                  >
                    Arkivera
                  </button>
                ) : (
                  <button
                    onClick={() => void handleDelete(selectedCustomer)}
                    style={{
                      padding: "10px 16px",
                      background: "#fff",
                      color: "#ef4444",
                      border: "1px solid #ef4444",
                      borderRadius: LeTrendRadius.md,
                      cursor: "pointer",
                    }}
                  >
                    Ta bort
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "24px",
              borderTop: `1px solid ${LeTrendColors.border}`,
            }}
          >
            <Link
              href={`/studio/customers/${selectedCustomer.id}`}
              style={{
                display: "block",
                textAlign: "center",
                background: LeTrendColors.brownDark,
                color: LeTrendColors.cream,
                padding: "12px",
                borderRadius: LeTrendRadius.md,
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Hantera kund
            </Link>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div
          onClick={() => setSelectedCustomer(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.2)",
            zIndex: 210,
          }}
        />
      )}

      <DiscountModal
        open={showDiscountModal}
        customerId={selectedCustomer?.id || null}
        customerName={selectedCustomer?.business_name || ""}
        onClose={() => setShowDiscountModal(false)}
        onApplied={handleDiscountApplied}
      />
      <CreateManualInvoiceModal
        open={showCreateInvoiceModal}
        customerId={selectedCustomer?.id || null}
        customerName={selectedCustomer?.business_name || ""}
        onClose={() => setShowCreateInvoiceModal(false)}
        onCreated={() => void handleManualInvoiceCreated()}
      />
    </div>
  );
}
