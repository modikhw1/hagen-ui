import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminActionContext } from '../types';
import { handleActivate } from '../activate';
import { handleArchiveCustomer } from '../archive';
import { handleCancelSubscription } from '../cancel-subscription';
import { handleChangeAccountManager } from '../change-account-manager';
import { handleChangeSubscriptionPrice } from '../change-subscription-price';
import { handlePauseSubscription } from '../pause-subscription';
import { handleReactivate } from '../reactivate';
import { handleResendInvite } from '../resend-invite';
import { handleResumeSubscription } from '../resume-subscription';
import { handleSendInvite } from '../send-invite';
import { handleSendReminder } from '../send-reminder';
import { handleSetTemporaryCoverage } from '../set-temporary-coverage';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  recordAuditLog: vi.fn(),
  logCustomerInvited: vi.fn(),
  syncCustomerAssignmentFromProfile: vi.fn(),
  changeCustomerAssignment: vi.fn(),
  createCmAbsence: vi.fn(),
  syncOperationalSubscriptionState: vi.fn(),
  sendCustomerInvite: vi.fn(),
  ensureStripeSubscriptionForProfile: vi.fn(),
  upsertSubscriptionMirror: vi.fn(),
  archiveStripeCustomer: vi.fn(),
  cancelCustomerSubscription: vi.fn(),
  pauseCustomerSubscription: vi.fn(),
  resumeCustomerSubscription: vi.fn(),
  applySubscriptionPriceChange: vi.fn(),
  resolveAccountManagerAssignment: vi.fn(),
  deriveTikTokHandle: vi.fn(),
  toCanonicalTikTokProfileUrl: vi.fn(),
  requireAdminScope: vi.fn(),
}));

vi.mock('@/lib/admin/audit-log', () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

vi.mock('@/lib/activity/logger', () => ({
  logCustomerInvited: mocks.logCustomerInvited,
}));

vi.mock('@/lib/admin/cm-assignments', () => ({
  syncCustomerAssignmentFromProfile: mocks.syncCustomerAssignmentFromProfile,
  changeCustomerAssignment: mocks.changeCustomerAssignment,
}));

vi.mock('@/lib/admin/cm-absences', () => ({
  createCmAbsence: mocks.createCmAbsence,
}));

vi.mock('@/lib/admin/subscription-operational-sync', () => ({
  syncOperationalSubscriptionState: mocks.syncOperationalSubscriptionState,
}));

vi.mock('@/lib/customers/invite', () => ({
  sendCustomerInvite: mocks.sendCustomerInvite,
  ensureStripeSubscriptionForProfile: mocks.ensureStripeSubscriptionForProfile,
}));

vi.mock('@/lib/stripe/mirror', () => ({
  upsertSubscriptionMirror: mocks.upsertSubscriptionMirror,
}));

vi.mock('@/lib/stripe/dynamic-config', () => ({
  stripeEnvironment: 'test',
}));

vi.mock('@/lib/stripe/admin-billing', () => ({
  archiveStripeCustomer: mocks.archiveStripeCustomer,
  cancelCustomerSubscription: mocks.cancelCustomerSubscription,
  pauseCustomerSubscription: mocks.pauseCustomerSubscription,
  resumeCustomerSubscription: mocks.resumeCustomerSubscription,
  applySubscriptionPriceChange: mocks.applySubscriptionPriceChange,
}));

vi.mock('@/lib/studio/account-manager', () => ({
  resolveAccountManagerAssignment: mocks.resolveAccountManagerAssignment,
}));

vi.mock('@/lib/tiktok/profile', () => ({
  deriveTikTokHandle: mocks.deriveTikTokHandle,
  toCanonicalTikTokProfileUrl: mocks.toCanonicalTikTokProfileUrl,
}));

vi.mock('@/lib/url/public', () => ({
  getAppUrl: () => 'https://app.example.com',
}));

vi.mock('@/lib/auth/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/api-auth')>(
    '@/lib/auth/api-auth',
  );

  return {
    ...actual,
    requireAdminScope: mocks.requireAdminScope,
  };
});

const {
  recordAuditLog,
  sendCustomerInvite,
  cancelCustomerSubscription,
  pauseCustomerSubscription,
  resumeCustomerSubscription,
  applySubscriptionPriceChange,
  changeCustomerAssignment,
  archiveStripeCustomer,
  syncOperationalSubscriptionState,
  resolveAccountManagerAssignment,
  deriveTikTokHandle,
  toCanonicalTikTokProfileUrl,
  requireAdminScope,
} = mocks;

function createContext(overrides: Partial<AdminActionContext> = {}): AdminActionContext {
  return {
    id: 'customer-1',
    user: {
      id: 'user-1',
      email: 'admin@example.com',
      role: 'admin',
      is_admin: true,
      admin_roles: ['super_admin'],
    },
    supabaseAdmin: {
      from: vi.fn(),
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(),
        },
      },
    } as unknown as AdminActionContext['supabaseAdmin'],
    stripeClient: {
      customers: { update: vi.fn(), del: vi.fn(), create: vi.fn() },
      products: { del: vi.fn(), create: vi.fn() },
      prices: { create: vi.fn() },
      subscriptions: { create: vi.fn() },
    } as unknown as NonNullable<AdminActionContext['stripeClient']>,
    beforeProfile: {
      id: 'customer-1',
      business_name: 'Le Trend',
      contact_email: 'customer@example.com',
      status: 'pending',
      monthly_price: 1000,
      pricing_status: 'fixed',
      stripe_subscription_id: 'sub_123',
      stripe_customer_id: 'cus_123',
      paused_until: null,
      upcoming_monthly_price: null,
      upcoming_price_effective_date: null,
      invite_attempt_nonce: 0,
      agreed_at: null,
      account_manager_profile_id: 'cm-1',
      user_id: 'customer-user-1',
    } as AdminActionContext['beforeProfile'],
    ...overrides,
  };
}

function mockUpdateSelectSingle(data: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data, error: null });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select, single }));
  const update = vi.fn(() => ({ eq }));
  return { update, eq, select, single };
}

function mockSelectSingle(data: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data, error: null });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq, single }));
  return { select, eq, single };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('customer action handlers', () => {
  it('activates a customer profile', async () => {
    const updated = { id: 'customer-1', status: 'active', agreed_at: '2026-04-21T10:00:00Z' };
    const chain = mockUpdateSelectSingle(updated);
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ update: chain.update })) } as never,
    });

    const result = await handleActivate(ctx, { action: 'activate' });

    expect(result).toMatchObject({
      customer: expect.objectContaining({ status: 'active' }),
    });
    expect(recordAuditLog).toHaveBeenCalledOnce();
  });

  it('returns existing-account reminder state', async () => {
    const chain = mockSelectSingle({ id: 'customer-1' });
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ select: chain.select })) } as never,
    });

    const result = await handleSendReminder(ctx, { action: 'send_reminder' });

    expect(result).toMatchObject({ already_registered: true });
  });

  it('resends invite via shared invite helper', async () => {
    sendCustomerInvite.mockResolvedValue({
      ok: true,
      profile: { id: 'customer-1', status: 'invited' },
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });
    const ctx = createContext();

    const result = await handleResendInvite(ctx, { action: 'resend_invite' });

    expect(result).toMatchObject({
      success: true,
      message: 'Ny invite skickades.',
    });
    expect(sendCustomerInvite).toHaveBeenCalledOnce();
  });

  it('returns 404 when reactivation is attempted without a profile snapshot', async () => {
    const ctx = createContext({ beforeProfile: null });

    const result = await handleReactivate(ctx, { action: 'reactivate_archive' });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  it('returns 404 when temporary coverage is attempted without a profile snapshot', async () => {
    const ctx = createContext({ beforeProfile: null });

    const result = await handleSetTemporaryCoverage(ctx, {
      action: 'set_temporary_coverage',
      covering_cm_id: 'cm-2',
      starts_on: '2026-04-21',
      ends_on: '2026-04-22',
      note: null,
      compensation_mode: 'covering_cm',
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  it('cancels a subscription and records audit metadata', async () => {
    cancelCustomerSubscription.mockResolvedValue({ creditNote: { id: 'cn_123' } });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ update: vi.fn(() => ({ eq: updateEq })) })) } as never,
    });

    const result = await handleCancelSubscription(ctx, {
      action: 'cancel_subscription',
      mode: 'immediate',
      credit_amount_ore: null,
      invoice_id: null,
      memo: null,
    });

    expect(result).toMatchObject({ success: true });
    expect(cancelCustomerSubscription).toHaveBeenCalledOnce();
  });

  it('pauses a subscription and syncs operational state', async () => {
    pauseCustomerSubscription.mockResolvedValue({ id: 'sub_123', status: 'paused' });
    const profile = {
      id: 'customer-1',
      stripe_subscription_id: 'sub_123',
      paused_until: '2026-04-30',
      monthly_price: 1000,
      upcoming_monthly_price: null,
      upcoming_price_effective_date: null,
    };
    const chain = mockUpdateSelectSingle(profile);
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ update: chain.update })) } as never,
    });

    const result = await handlePauseSubscription(ctx, {
      action: 'pause_subscription',
      pause_until: '2026-04-30',
    });

    expect(result).toMatchObject({ success: true });
    expect(syncOperationalSubscriptionState).toHaveBeenCalledOnce();
  });

  it('resumes a subscription and clears paused state', async () => {
    resumeCustomerSubscription.mockResolvedValue({ id: 'sub_123', status: 'active' });
    const profile = {
      id: 'customer-1',
      stripe_subscription_id: 'sub_123',
      paused_until: null,
      monthly_price: 1000,
      upcoming_monthly_price: null,
      upcoming_price_effective_date: null,
    };
    const chain = mockUpdateSelectSingle(profile);
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ update: chain.update })) } as never,
    });

    const result = await handleResumeSubscription(ctx, { action: 'resume_subscription' });

    expect(result).toMatchObject({ success: true });
  });

  it('changes a subscription price and syncs profile state', async () => {
    applySubscriptionPriceChange.mockResolvedValue({
      effectiveDate: '2026-05-01',
      subscription: { id: 'sub_123' },
    });
    const profile = {
      id: 'customer-1',
      stripe_subscription_id: 'sub_123',
      paused_until: null,
      monthly_price: 2000,
      upcoming_monthly_price: null,
      upcoming_price_effective_date: null,
    };
    const chain = mockUpdateSelectSingle(profile);
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ update: chain.update })) } as never,
    });

    const result = await handleChangeSubscriptionPrice(ctx, {
      action: 'change_subscription_price',
      monthly_price: 2000,
      mode: 'now',
    });

    expect(result).toMatchObject({
      success: true,
      effective_date: '2026-05-01',
    });
  });

  it('changes account manager and returns assignment payload', async () => {
    changeCustomerAssignment.mockResolvedValue({
      status: 'scheduled',
      effectiveDate: '2026-05-01',
      nextCmId: 'cm-2',
    });
    const chain = mockSelectSingle({ id: 'customer-1', account_manager_profile_id: 'cm-2' });
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ select: chain.select })) } as never,
    });

    const result = await handleChangeAccountManager(ctx, {
      action: 'change_account_manager',
      cm_id: 'cm-2',
      effective_date: '2026-05-01',
      handover_note: null,
    });

    expect(result).toMatchObject({
      success: true,
      assignment: expect.objectContaining({ nextCmId: 'cm-2' }),
    });
  });

  it('rejects invalid TikTok input before provisioning invite side effects', async () => {
    resolveAccountManagerAssignment.mockResolvedValue({
      accountManager: 'CM A',
      accountManagerProfileId: 'cm-1',
    });
    toCanonicalTikTokProfileUrl.mockReturnValue(null);
    deriveTikTokHandle.mockReturnValue(null);
    const ctx = createContext();

    const result = await handleSendInvite(ctx, {
      action: 'send_invite',
      business_name: 'Le Trend',
      contact_email: 'customer@example.com',
      customer_contact_name: null,
      phone: null,
      tiktok_profile_url: 'not-valid',
      account_manager: 'CM A',
      monthly_price: 1000,
      pricing_status: 'fixed',
      contract_start_date: '2026-04-21',
      billing_day_of_month: 25,
      first_invoice_behavior: 'prorated',
      waive_days_until_billing: false,
      upcoming_monthly_price: null,
      upcoming_price_effective_date: null,
      subscription_interval: 'month',
      invoice_text: null,
      scope_items: [],
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });

  it('archives a customer and returns cleanup metadata', async () => {
    archiveStripeCustomer.mockResolvedValue({ deletedCustomer: true });
    const chain = mockUpdateSelectSingle({ id: 'customer-1', status: 'archived' });
    const ctx = createContext({
      supabaseAdmin: { from: vi.fn(() => ({ update: chain.update })) } as never,
    });

    const result = await handleArchiveCustomer(ctx);

    expect(requireAdminScope).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      success: true,
      message: 'Kunden arkiverades.',
    });
  });
});
