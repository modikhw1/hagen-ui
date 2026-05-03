import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

loadEnv({ path: '.env.local', quiet: true });

const appUrl = process.env.BASE_URL || 'http://localhost:3000';
const auditEmail = process.env.AUDIT_USER_EMAIL || process.env.TEST_USER_EMAIL || 'dev@letrend.se';
const auditLimit = Number(process.env.AUDIT_LIMIT || 40);
const auditAll = process.env.AUDIT_ALL_CUSTOMERS === '1';
const forcedCustomerIds = (process.env.AUDIT_CUSTOMER_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const outputDir = process.env.AUDIT_OUTPUT_DIR || 'audit-output';
const routes = [
  { name: 'overview', suffix: '' },
  { name: 'billing', suffix: '/billing' },
  { name: 'pulse', suffix: '/pulse' },
  { name: 'organisation', suffix: '/organisation' },
];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function assertServerReachable() {
  try {
    const response = await fetch(appUrl, { redirect: 'manual' });
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(`Dev server is not reachable at ${appUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function login(page, supabase) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: auditEmail,
    options: { redirectTo: `${appUrl}/auth/callback` },
  });

  if (error || !data.properties?.action_link) {
    throw new Error(`Could not generate audit login link for ${auditEmail}: ${error?.message || 'missing link'}`);
  }

  await page.goto(data.properties.action_link, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByRole('heading', { name: /Klart/i }).waitFor({ timeout: 30_000 });
  await page.goto(`${appUrl}/admin`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
}

async function loadCustomers(supabase) {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('id,business_name,status,stripe_customer_id,stripe_subscription_id,invited_at,created_at')
    .order('created_at', { ascending: false })
    .limit(auditAll ? 500 : Math.max(auditLimit, 80));

  if (error) throw new Error(`Could not load customer profiles: ${error.message}`);

  const forced = [];
  if (forcedCustomerIds.length > 0) {
    const forcedResult = await supabase
      .from('customer_profiles')
      .select('id,business_name,status,stripe_customer_id,stripe_subscription_id,invited_at,created_at')
      .in('id', forcedCustomerIds);
    if (forcedResult.error) throw new Error(`Could not load forced customers: ${forcedResult.error.message}`);
    forced.push(...(forcedResult.data || []));
  }

  if (auditAll) {
    const byId = new Map();
    for (const customer of [...forced, ...(data || [])]) byId.set(customer.id, customer);
    return [...byId.values()].slice(0, auditLimit);
  }

  const byKey = new Map();
  for (const customer of forced) byKey.set(`forced:${customer.id}`, customer);
  for (const customer of data || []) {
    const key = [
      customer.status || 'unknown',
      customer.stripe_customer_id ? 'stripe' : 'no-stripe',
      customer.stripe_subscription_id ? 'subscription' : 'no-subscription',
      customer.invited_at ? 'invited' : 'not-invited',
    ].join(':');
    if (!byKey.has(key)) byKey.set(key, customer);
  }

  return [...byKey.values()].slice(0, auditLimit);
}

function shouldIgnoreConsoleError(text) {
  return (
    text.includes('AuthSessionMissingError') ||
    text.includes('Profile query timeout') ||
    text.includes('Error fetching customer concepts')
  );
}

async function collectUiSymptoms(page) {
  const patterns = [
    'Autentisering misslyckades',
    'Unauthorized',
    'Cannot read properties',
    'Fel vid laddning',
    'HTTP 500',
    'HTTP 502',
    'No such customer',
  ];
  const symptoms = [];
  for (const pattern of patterns) {
    const count = await page.getByText(pattern).count().catch(() => 0);
    if (count > 0) symptoms.push({ pattern, count });
  }
  return symptoms;
}

async function auditRoute(page, customer, route) {
  const localFindings = [];
  const responses = [];
  const pageErrors = [];
  const consoleErrors = [];

  const onPageError = (error) => pageErrors.push(error.message);
  const onConsole = (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!shouldIgnoreConsoleError(text)) consoleErrors.push(text);
  };
  const onResponse = async (response) => {
    const url = response.url();
    if (!url.includes('/api/admin/') || response.status() < 400) return;
    let body = '';
    try {
      body = (await response.text()).slice(0, 700);
    } catch {
      body = '<unreadable>';
    }
    responses.push({ status: response.status(), url, body });
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('response', onResponse);

  const url = `${appUrl}/admin/customers/${customer.id}${route.suffix}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    if (!currentUrl.includes(`/admin/customers/${customer.id}`)) {
      localFindings.push({
        type: 'navigation',
        severity: 'high',
        message: `Expected customer route but ended at ${currentUrl}`,
      });
    }

    for (const error of pageErrors) {
      localFindings.push({ type: 'pageerror', severity: 'high', message: error });
    }
    for (const error of consoleErrors) {
      localFindings.push({ type: 'console.error', severity: 'medium', message: error.slice(0, 700) });
    }
    for (const response of responses) {
      localFindings.push({
        type: 'api',
        severity: response.status >= 500 ? 'high' : 'medium',
        message: `${response.status} ${response.url}`,
        details: response.body,
      });
    }
    for (const symptom of await collectUiSymptoms(page)) {
      localFindings.push({
        type: 'ui-text',
        severity: symptom.pattern === 'Fel vid laddning' ? 'medium' : 'high',
        message: `${symptom.pattern} (${symptom.count})`,
      });
    }
  } catch (error) {
    localFindings.push({
      type: 'runtime',
      severity: 'high',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('response', onResponse);
  }

  return {
    route: route.name,
    url,
    findings: localFindings,
  };
}

function markdownReport(report) {
  const lines = [
    '# Admin Customer Runtime Audit',
    '',
    `- Time: ${report.generated_at}`,
    `- Base URL: ${report.base_url}`,
    `- User: ${report.audit_email}`,
    `- Customers audited: ${report.customers.length}`,
    `- Routes per customer: ${routes.map((route) => route.name).join(', ')}`,
    `- Findings: ${report.findings.length}`,
    '',
  ];

  if (report.findings.length === 0) {
    lines.push('No findings.');
    return lines.join('\n');
  }

  for (const finding of report.findings) {
    lines.push(
      `## ${finding.severity.toUpperCase()} ${finding.customer.business_name || finding.customer.id} / ${finding.route}`,
      '',
      `- Customer ID: ${finding.customer.id}`,
      `- Status: ${finding.customer.status || 'unknown'}`,
      `- Stripe customer: ${finding.customer.stripe_customer_id || 'none'}`,
      `- Subscription: ${finding.customer.stripe_subscription_id || 'none'}`,
      `- Type: ${finding.type}`,
      `- Message: ${finding.message}`,
    );
    if (finding.details) lines.push(`- Details: \`${finding.details.replaceAll('`', "'")}\``);
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  await assertServerReachable();
  const supabase = adminClient();
  const customers = await loadCustomers(supabase);
  if (customers.length === 0) throw new Error('No customers found for audit');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page, supabase);

  const routeResults = [];
  const findings = [];
  for (const customer of customers) {
    for (const route of routes) {
      const result = await auditRoute(page, customer, route);
      routeResults.push({ customer_id: customer.id, route: result.route, finding_count: result.findings.length });
      for (const finding of result.findings) {
        findings.push({ ...finding, route: result.route, url: result.url, customer });
      }
    }
  }

  await browser.close();

  const report = {
    generated_at: new Date().toISOString(),
    base_url: appUrl,
    audit_email: auditEmail,
    customers,
    route_results: routeResults,
    findings,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'admin-customer-runtime-audit.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outputDir, 'admin-customer-runtime-audit.md'), markdownReport(report));

  console.log(JSON.stringify({
    customers: customers.length,
    routeChecks: routeResults.length,
    findings: findings.length,
    output: outputDir,
  }, null, 2));

  if (findings.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
