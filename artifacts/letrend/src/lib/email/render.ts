import { wrapInLayout } from './layout';
import { DEFAULT_EMAIL_URL, htmlToText } from './helpers';
import type {
  CustomerData,
  EmailRenderOptions,
  EmailTemplateData,
  EmailTemplateResult,
  EmailType,
  RenderedTemplate,
} from './types';
import { renderCustomTemplate } from './templates/custom';
import { renderGameplanSummaryTemplate } from './templates/gameplan-summary';
import { renderGameplanUpdatedTemplate } from './templates/gameplan-updated';
import { renderNewConceptTemplate } from './templates/new-concept';
import { renderNewConceptsTemplate } from './templates/new-concepts';
import { renderWeeklySummaryTemplate } from './templates/weekly-summary';

function renderTemplate(
  type: EmailType,
  customer: CustomerData,
  data: EmailTemplateData
): RenderedTemplate {
  switch (type) {
    case 'new_concept':
      return renderNewConceptTemplate(customer, data);
    case 'new_concepts':
      return renderNewConceptsTemplate(customer, data);
    case 'gameplan_updated':
      return renderGameplanUpdatedTemplate(customer, data);
    case 'gameplan_summary':
      return renderGameplanSummaryTemplate(customer, data);
    case 'weekly_summary':
      return renderWeeklySummaryTemplate(customer, data);
    case 'custom':
    default:
      return renderCustomTemplate(customer, data);
  }
}

export function buildEmailContent(
  type: EmailType,
  customer: CustomerData,
  data: EmailTemplateData = {},
  options?: string | EmailRenderOptions
): EmailTemplateResult {
  const normalizedOptions: EmailRenderOptions =
    typeof options === 'string'
      ? { dashboardUrl: options }
      : options || {};
  const rendered = renderTemplate(type, customer, data);
  const ctaLabel = normalizedOptions.ctaLabel || rendered.ctaLabel || 'Se mina koncept';
  const dashboardUrl = normalizedOptions.dashboardUrl || DEFAULT_EMAIL_URL;
  const html = wrapInLayout(rendered.contentHtml, dashboardUrl, ctaLabel);

  return {
    subject: rendered.subject,
    html,
    text: htmlToText(html),
  };
}
