'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface OnboardingData {
  businessName: string;
  pricePerMonth: number;
  interval: string;
  scopeItems: string[];
  invoiceText?: string;
  customerProfileId?: string;
  billingDayOfMonth?: number;
  contractStartDate?: string;
  firstInvoiceBehavior?: 'prorated' | 'full' | 'free_until_anchor';
  firstInvoiceAmount?: number;
  firstInvoiceText?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedData = localStorage.getItem('onboarding_data');
    let parsedData: Partial<OnboardingData> | null = null;

    if (storedData) {
      try {
        parsedData = JSON.parse(storedData) as Partial<OnboardingData>;
      } catch (e) {
        console.error('Failed to parse onboarding data:', e);
      }
    }

    const businessName = parsedData?.businessName || localStorage.getItem('onboarding_business_name') || '';
    const price = Number(parsedData?.pricePerMonth || localStorage.getItem('onboarding_price') || 0);
    const interval = parsedData?.interval || localStorage.getItem('onboarding_interval') || 'month';
    const scopeItemsRaw = parsedData?.scopeItems || localStorage.getItem('onboarding_scope_items');
    const customerProfileId = parsedData?.customerProfileId || localStorage.getItem('onboarding_customer_profile_id') || undefined;
    const firstInvoiceBehavior = (parsedData?.firstInvoiceBehavior || localStorage.getItem('onboarding_first_invoice_behavior') || 'prorated') as 'prorated' | 'full' | 'free_until_anchor';
    const contractStartDate = parsedData?.contractStartDate || localStorage.getItem('onboarding_contract_start_date') || undefined;
    const billingDayOfMonth = Number(parsedData?.billingDayOfMonth || localStorage.getItem('onboarding_billing_day_of_month') || 25);

    if (customerProfileId) {
      if (businessName) {
        const fallbackPreview = buildFirstInvoicePreview(price, contractStartDate, billingDayOfMonth, firstInvoiceBehavior);
        setData({
          businessName,
          pricePerMonth: price,
          interval,
          scopeItems: Array.isArray(scopeItemsRaw)
            ? scopeItemsRaw
            : scopeItemsRaw
              ? JSON.parse(scopeItemsRaw as string)
              : [],
          customerProfileId,
          firstInvoiceBehavior,
          contractStartDate,
          billingDayOfMonth,
          firstInvoiceAmount: fallbackPreview.amount,
          firstInvoiceText: fallbackPreview.text,
        });
      }

      void fetchCustomerProfile(customerProfileId);
      return;
    }

    if (businessName && price > 0) {
      const fallbackPreview = buildFirstInvoicePreview(price, contractStartDate, billingDayOfMonth, firstInvoiceBehavior);
      setData({
        businessName,
        pricePerMonth: price,
        interval,
        scopeItems: Array.isArray(scopeItemsRaw)
          ? scopeItemsRaw
          : scopeItemsRaw
            ? JSON.parse(scopeItemsRaw as string)
            : [],
        customerProfileId,
        firstInvoiceBehavior,
        contractStartDate,
        billingDayOfMonth,
        firstInvoiceAmount: fallbackPreview.amount,
        firstInvoiceText: fallbackPreview.text,
      });
    } else {
      setError('Ingen inbjudningsdata hittades');
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildFirstInvoicePreview = (
    pricePerMonth: number,
    contractStartDate?: string,
    billingDayOfMonth = 25,
    behavior: 'prorated' | 'full' | 'free_until_anchor' = 'prorated'
  ) => {
    if (!pricePerMonth || pricePerMonth <= 0) {
      return { amount: 0, text: 'Pris saknas. Första faktura beräknas när pris är satt.' };
    }

    if (behavior === 'full') {
      return { amount: pricePerMonth, text: 'Första faktura debiteras som full månadsavgift.' };
    }

    if (behavior === 'free_until_anchor') {
      return { amount: 0, text: 'Första delperioden är kostnadsfri fram till nästa faktureringsdag.' };
    }

    const start = contractStartDate ? new Date(`${contractStartDate}T00:00:00`) : new Date();
    const billingDay = Math.max(1, Math.min(28, Number(billingDayOfMonth) || 25));
    let anchorDate = new Date(start.getFullYear(), start.getMonth(), billingDay);
    if (anchorDate.getTime() <= start.getTime()) {
      anchorDate = new Date(start.getFullYear(), start.getMonth() + 1, billingDay);
    }

    const previousAnchor = new Date(anchorDate);
    previousAnchor.setMonth(previousAnchor.getMonth() - 1);
    const msPerDay = 1000 * 60 * 60 * 24;
    const cycleDays = Math.max(Math.round((anchorDate.getTime() - previousAnchor.getTime()) / msPerDay), 1);
    const billableDays = Math.max(Math.round((anchorDate.getTime() - start.getTime()) / msPerDay), 1);
    const amount = Math.round((pricePerMonth * billableDays) / cycleDays);

    return {
      amount,
      text: `Första faktura prorateras till dag ${billingDay}: ${billableDays}/${cycleDays} av månadspriset.`
    };
  };

  const fetchCustomerProfile = async (profileId: string) => {
    try {
      const res = await fetch(`/api/admin/customers/${profileId}`);
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to fetch customer profile');
      }

      if (!result.profile) {
        throw new Error('Kundprofil hittades inte');
      }

      const behavior = result.profile.first_invoice_behavior || 'prorated';
      const firstPreview = buildFirstInvoicePreview(
        result.profile.monthly_price || 0,
        result.profile.contract_start_date || undefined,
        result.profile.billing_day_of_month || 25,
        behavior
      );

      setData({
        businessName: result.profile.business_name,
        pricePerMonth: result.profile.monthly_price || 0,
        interval: result.profile.subscription_interval || 'month',
        scopeItems: result.profile.scope_items || [],
        invoiceText: result.profile.invoice_text,
        customerProfileId: profileId,
        billingDayOfMonth: result.profile.billing_day_of_month || 25,
        contractStartDate: result.profile.contract_start_date || undefined,
        firstInvoiceBehavior: behavior,
        firstInvoiceAmount: firstPreview.amount,
        firstInvoiceText: firstPreview.text,
      });
    } catch (e) {
      console.error('Failed to fetch customer profile:', e);

      const businessName = localStorage.getItem('onboarding_business_name');
      const price = Number(localStorage.getItem('onboarding_price') || 0);
      const interval = localStorage.getItem('onboarding_interval') || 'month';
      const email = localStorage.getItem('pending_agreement_email') || '';

      if ((!price || price <= 0) && email) {
        try {
          const agreementRes = await fetch(`/api/stripe/pending-agreement?email=${encodeURIComponent(email)}`);
          const agreementResult = await agreementRes.json();
          const agreement = agreementResult?.agreement as {
            customerName?: string;
            pricePerMonth?: number;
            scopeItems?: string[] | null;
            profileId?: string;
            contract_start_date?: string;
            billing_day_of_month?: number;
            first_invoice_behavior?: 'prorated' | 'full' | 'free_until_anchor';
          } | null;
          const agreementPrice = Number(agreement?.pricePerMonth || 0) / 100;

          if (agreement && agreementPrice > 0) {
            const behavior = agreement.first_invoice_behavior || 'prorated';
            const billingDay = agreement.billing_day_of_month || 25;
            const contractStartDate = agreement.contract_start_date || undefined;
            const firstPreview = buildFirstInvoicePreview(agreementPrice, contractStartDate, billingDay, behavior);
            const resolvedProfileId = agreement.profileId || profileId;

            if (agreement.profileId) {
              localStorage.setItem('onboarding_customer_profile_id', agreement.profileId);
            }
            localStorage.setItem('onboarding_price', String(agreementPrice));

            setData({
              businessName: agreement.customerName || businessName || 'Mitt foretag',
              pricePerMonth: agreementPrice,
              interval,
              scopeItems: Array.isArray(agreement.scopeItems) ? agreement.scopeItems : [],
              customerProfileId: resolvedProfileId,
              firstInvoiceBehavior: behavior,
              contractStartDate,
              billingDayOfMonth: billingDay,
              firstInvoiceAmount: firstPreview.amount,
              firstInvoiceText: firstPreview.text,
            });
            return;
          }
        } catch (agreementError) {
          console.error('Failed to recover onboarding data via pending agreement:', agreementError);
        }
      }

      if (businessName && price > 0) {
        const behavior = (localStorage.getItem('onboarding_first_invoice_behavior') || 'prorated') as 'prorated' | 'full' | 'free_until_anchor';
        const contractStartDate = localStorage.getItem('onboarding_contract_start_date') || undefined;
        const billingDay = Number(localStorage.getItem('onboarding_billing_day_of_month') || 25);
        const firstPreview = buildFirstInvoicePreview(price, contractStartDate, billingDay, behavior);
        setData({
          businessName,
          pricePerMonth: price,
          interval,
          scopeItems: [],
          customerProfileId: profileId,
          firstInvoiceBehavior: behavior,
          contractStartDate,
          billingDayOfMonth: billingDay,
          firstInvoiceAmount: firstPreview.amount,
          firstInvoiceText: firstPreview.text,
        });
      } else {
        setError('Kunde inte lasa inbjudningsdata');
      }
    } finally {
      setLoading(false);
    }
  };
  const handleGoToPayment = async () => {
    // Ensure all checkout data is in localStorage
    if (data) {
      localStorage.setItem('onboarding_price', String(data.pricePerMonth));
      localStorage.setItem('onboarding_business_name', data.businessName);
      localStorage.setItem('onboarding_interval', data.interval);
      if (data.scopeItems) {
        localStorage.setItem('onboarding_scope_items', JSON.stringify(data.scopeItems));
      }
      if (data.invoiceText) {
        localStorage.setItem('onboarding_invoice_text', data.invoiceText);
      }
      if (data.customerProfileId) {
        localStorage.setItem('onboarding_customer_profile_id', data.customerProfileId);
      }
      if (data.firstInvoiceBehavior) {
        localStorage.setItem('onboarding_first_invoice_behavior', data.firstInvoiceBehavior);
      }
      if (data.contractStartDate) {
        localStorage.setItem('onboarding_contract_start_date', data.contractStartDate);
      }
      if (typeof data.billingDayOfMonth === 'number') {
        localStorage.setItem('onboarding_billing_day_of_month', String(data.billingDayOfMonth));
      }
    }

    // Try to fetch actual price from Stripe as fallback
    const email = localStorage.getItem('pending_agreement_email');
    if (email) {
      try {
        const res = await fetch(`/api/stripe/pending-agreement?email=${encodeURIComponent(email)}`);
        const result = await res.json();
        if (result.agreement?.pricePerMonth) {
          localStorage.setItem('onboarding_price', String(result.agreement.pricePerMonth / 100));
          if (result.agreement.scopeItems) {
            localStorage.setItem('onboarding_scope_items', JSON.stringify(result.agreement.scopeItems));
          }
        }
      } catch (e) {
        console.error('Failed to fetch agreement:', e);
      }
    }

    // Go directly to embedded checkout for better UX
    localStorage.setItem('from_onboarding', 'true');
    router.push('/checkout');
  };

  const handleGoToDashboard = () => {
    // Clear onboarding data - user can pay later from dashboard
    localStorage.removeItem('onboarding_data');
    localStorage.removeItem('onboarding_business_name');
    localStorage.removeItem('onboarding_price');
    localStorage.removeItem('onboarding_interval');
    localStorage.removeItem('onboarding_scope_items');
    localStorage.removeItem('onboarding_customer_profile_id');
    localStorage.removeItem('onboarding_first_invoice_behavior');
    localStorage.removeItem('onboarding_contract_start_date');
    localStorage.removeItem('onboarding_billing_day_of_month');
    localStorage.removeItem('pending_agreement_email');
    router.push('/?onboarding=complete');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #E8E0D8',
          borderTopColor: '#6B4423',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '400px',
        }}>
          <p style={{ color: '#DC2626', marginBottom: '16px' }}>{error || 'Något gick fel'}</p>
          <button
            onClick={handleGoToDashboard}
            style={{
              padding: '12px 24px',
              background: '#2A1F1A',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Gå till startsidan
          </button>
        </div>
      </div>
    );
  }

  const price = data.pricePerMonth;
  const vat = price * 0.25;
  const total = price + vat;

  const priceDisplay = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(price);

  const vatDisplay = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(vat);

  const totalDisplay = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(total);

  const intervalText = data.interval === 'month' ? 'månad' : data.interval === 'quarter' ? 'kvartal' : 'år';
  const firstInvoiceAmount = typeof data.firstInvoiceAmount === 'number' ? data.firstInvoiceAmount : null;
  const firstInvoiceAmountDisplay = firstInvoiceAmount !== null
    ? new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
    }).format(firstInvoiceAmount)
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      padding: '40px 20px',
    }}>
      {/* Back button */}
      <div style={{ maxWidth: '500px', margin: '0 auto 20px' }}>
        <button
          onClick={() => router.push('/welcome')}
          style={{
            background: 'none',
            border: 'none',
            color: '#5D4D3D',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            padding: '8px 0',
          }}
        >
          <span>â†</span> Tillbaka
        </button>
      </div>

      <div style={{
        maxWidth: '500px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <span style={{ color: '#FAF8F5', fontSize: '28px', fontWeight: 'bold' }}>Le</span>
          </div>
          <h1 style={{ fontSize: '28px', color: '#1A1612', marginBottom: '8px', fontWeight: '700' }}>
            Välkommen till LeTrend!
          </h1>
          <p style={{ color: '#5D4D3D', fontSize: '16px' }}>
            Här är en sammanfattning av ditt avtal
          </p>
        </div>

        {/* Company Info */}
        <div style={{
          background: '#FAF8F5',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '14px', color: '#5D4D3D', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Din prenumeration
          </h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Företag</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{data.businessName}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#5D4D3D' }}>Period</span>
            <span style={{ color: '#1A1612', fontWeight: '600' }}>{intervalText}</span>
          </div>

          {/* Scope Items */}
          {data.scopeItems && data.scopeItems.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ color: '#5D4D3D', display: 'block', marginBottom: '8px' }}>Vad som ingår:</span>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {data.scopeItems.map((item, index) => (
                  <li key={index} style={{ color: '#1A1612', fontSize: '14px', marginBottom: '4px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom Invoice Text */}
          {data.invoiceText && (
            <div style={{ marginBottom: '12px', padding: '12px', background: 'white', borderRadius: '8px' }}>
              <span style={{ color: '#5D4D3D', fontSize: '12px' }}>Meddelande:</span>
              <p style={{ color: '#1A1612', fontSize: '14px', margin: '4px 0 0' }}>{data.invoiceText}</p>
            </div>
          )}

          <div style={{ 
            borderTop: '2px solid #E5E0DA', 
            paddingTop: '16px',
            marginTop: '8px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#5D4D3D' }}>Pris</span>
              <span style={{ color: '#1A1612' }}>{priceDisplay}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#5D4D3D' }}>Moms (25%)</span>
              <span style={{ color: '#1A1612' }}>{vatDisplay}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px dashed #E5E0DA',
            }}>
              <span style={{ color: '#1A1612', fontWeight: '700', fontSize: '16px' }}>Totalt</span>
              <span style={{ color: '#6B4423', fontWeight: '700', fontSize: '20px' }}>{totalDisplay}</span>
            </div>
          </div>

          {(data.firstInvoiceText || firstInvoiceAmountDisplay) && (
            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #E5E0DA',
            }}>
              <div style={{ color: '#5D4D3D', fontSize: '12px', marginBottom: '4px' }}>
                {data.firstInvoiceText || 'Första faktura beräknas enligt avtalet.'}
              </div>
              {firstInvoiceAmountDisplay && (
                <div style={{ color: '#1A1612', fontSize: '14px', fontWeight: 600 }}>
                  Första dragning (ex moms): {firstInvoiceAmountDisplay}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Note */}
        <div style={{ 
          background: '#FEF3C7', 
          borderRadius: '8px', 
          padding: '12px 16px',
          marginBottom: '24px',
        }}>
          <p style={{ color: '#92400E', fontSize: '13px', margin: 0 }}>
            💡 Du kan betala nu eller när du vill från din dashboard. Din tillgång aktiveras när betalningen är registrerad.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleGoToPayment}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
            }}
          >
            Gå till betalning
          </button>
          
          <button
            onClick={handleGoToDashboard}
            style={{
              width: '100%',
              padding: '14px',
              background: 'transparent',
              color: '#5D4D3D',
              border: '1px solid #E5E0DA',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Gå till dashboard (betala senare)
          </button>
        </div>
      </div>
    </div>
  );
}

