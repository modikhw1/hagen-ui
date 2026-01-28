/**
 * Test User Fixtures
 *
 * Definitioner av testanvändare med olika states
 * Används för att seeda databasen innan tester
 */

export interface TestUser {
  email: string;
  password: string;
  profile: {
    business_name: string;
    has_paid: boolean;
    subscription_status: string | null;
    subscription_id: string | null;
    is_admin: boolean;
  };
  stripe?: {
    hasCustomer: boolean;
    subscriptionStatus?: 'active' | 'incomplete' | 'past_due' | 'canceled' | 'trialing';
    hasOpenInvoice?: boolean;
  };
}

export const TEST_USERS: Record<string, TestUser> = {
  /**
   * Helt ny användare - ingen Stripe-koppling
   * Förväntat beteende: Ska se prisplaner
   */
  NEW_USER: {
    email: 'e2e-new-user@testmail.com',
    password: 'TestPass123!',
    profile: {
      business_name: 'Test New Business',
      has_paid: false,
      subscription_status: null,
      subscription_id: null,
      is_admin: false,
    },
  },

  /**
   * Aktiv prenumerant - betalar varje månad
   * Förväntat beteende: Ska se dashboard med koncept
   */
  ACTIVE_SUBSCRIBER: {
    email: 'e2e-active@testmail.com',
    password: 'TestPass123!',
    profile: {
      business_name: 'Test Active Business',
      has_paid: true,
      subscription_status: 'active',
      subscription_id: 'sub_test_active',
      is_admin: false,
    },
    stripe: {
      hasCustomer: true,
      subscriptionStatus: 'active',
    },
  },

  /**
   * Pending payment - subscription skapad men första fakturan ej betald
   * Förväntat beteende: Ska se agreement/betalningssida
   */
  PENDING_PAYMENT: {
    email: 'e2e-pending@testmail.com',
    password: 'TestPass123!',
    profile: {
      business_name: 'Test Pending Business',
      has_paid: false,
      subscription_status: 'pending_payment',
      subscription_id: 'sub_test_pending',
      is_admin: false,
    },
    stripe: {
      hasCustomer: true,
      subscriptionStatus: 'active', // Stripe visar active men invoice är open
      hasOpenInvoice: true,
    },
  },

  /**
   * Past due - missad betalning
   * Förväntat beteende: Ska se varning + betalningslänk
   */
  PAST_DUE: {
    email: 'e2e-pastdue@testmail.com',
    password: 'TestPass123!',
    profile: {
      business_name: 'Test Past Due Business',
      has_paid: false,
      subscription_status: 'past_due',
      subscription_id: 'sub_test_pastdue',
      is_admin: false,
    },
    stripe: {
      hasCustomer: true,
      subscriptionStatus: 'past_due',
    },
  },

  /**
   * Cancelled - avslutad prenumeration
   * Förväntat beteende: Ska kunna prenumerera igen
   */
  CANCELLED: {
    email: 'e2e-cancelled@testmail.com',
    password: 'TestPass123!',
    profile: {
      business_name: 'Test Cancelled Business',
      has_paid: false,
      subscription_status: 'canceled',
      subscription_id: 'sub_test_cancelled',
      is_admin: false,
    },
    stripe: {
      hasCustomer: true,
      subscriptionStatus: 'canceled',
    },
  },

  /**
   * Admin användare via is_admin flag
   * Förväntat beteende: Har access till /api/admin/*
   */
  ADMIN_FLAG: {
    email: 'e2e-admin@testmail.com',
    password: 'TestPass123!',
    profile: {
      business_name: 'Test Admin Business',
      has_paid: true,
      subscription_status: 'active',
      subscription_id: null,
      is_admin: true,
    },
  },

  /**
   * Admin användare via @letrend.se email
   * Förväntat beteende: Automatisk admin-access
   */
  ADMIN_EMAIL: {
    email: 'e2e-test@letrend.se',
    password: 'TestPass123!',
    profile: {
      business_name: 'LeTrend Test',
      has_paid: true,
      subscription_status: 'active',
      subscription_id: null,
      is_admin: false, // Ska ändå bli admin pga email
    },
  },

  /**
   * Trialing - på provperiod
   * Förväntat beteende: Ska se dashboard men med trial-banner
   */
  TRIALING: {
    email: 'e2e-trial@testmail.com',
    password: 'TestPass123!',
    profile: {
      business_name: 'Test Trial Business',
      has_paid: true,
      subscription_status: 'trialing',
      subscription_id: 'sub_test_trial',
      is_admin: false,
    },
    stripe: {
      hasCustomer: true,
      subscriptionStatus: 'trialing',
    },
  },
};

/**
 * Subscription status → Expected behavior mapping
 */
export const STATUS_EXPECTATIONS = {
  null: {
    route: '/pricing',
    canAccessDashboard: false,
    canAccessAdmin: false,
  },
  'active': {
    route: '/',
    canAccessDashboard: true,
    canAccessAdmin: false,
  },
  'pending_payment': {
    route: '/agreement',
    canAccessDashboard: false,
    canAccessAdmin: false,
  },
  'past_due': {
    route: '/agreement',
    canAccessDashboard: false,
    canAccessAdmin: false,
  },
  'canceled': {
    route: '/pricing',
    canAccessDashboard: false,
    canAccessAdmin: false,
  },
  'trialing': {
    route: '/',
    canAccessDashboard: true,
    canAccessAdmin: false,
  },
};
