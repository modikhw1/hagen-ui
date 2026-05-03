import { bodyText, conceptCard, sectionHeading } from '../components';
import type { CustomerData, EmailTemplateData, RenderedTemplate } from '../types';

export function renderCustomTemplate(
  _customer: CustomerData,
  data: EmailTemplateData
): RenderedTemplate {
  const concepts = data.concepts || [];
  const subject = data.subject?.trim() || 'LeTrend';

  return {
    subject,
    contentHtml: [
      sectionHeading(subject),
      data.intro?.trim() ? bodyText(data.intro, 'left') : '',
      concepts.map((concept, index) => conceptCard(concept, concepts.length > 1 ? index + 1 : undefined)).join(''),
      data.outro?.trim() ? bodyText(data.outro, 'left') : '',
    ].join(''),
  };
}
