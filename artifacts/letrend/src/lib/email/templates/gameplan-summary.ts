import { bodyText, conceptCard, goalsBox, sectionHeading } from '../components';
import { contactGreetingName, resolveBusinessName } from '../helpers';
import type { CustomerData, EmailTemplateData, RenderedTemplate } from '../types';

export function renderGameplanSummaryTemplate(
  customer: CustomerData,
  data: EmailTemplateData
): RenderedTemplate {
  const concepts = (data.concepts || []).slice(0, 3);
  const goals = data.gameplan?.goals || [];
  const businessName = resolveBusinessName(customer);
  const greetingName = contactGreetingName(customer);
  const intro = data.intro?.trim()
    ? data.intro
    : `Hej${greetingName}! Vi har satt ihop en strategisk Game Plan för ${businessName}.`;
  const outro = data.outro?.trim()
    ? data.outro
    : 'Kika igenom och hör av dig med tankar - vi justerar gärna!';

  return {
    subject: data.subject?.trim() || 'Din nya Game Plan - LeTrend',
    ctaLabel: 'Se hela Game Plan',
    contentHtml: [
      sectionHeading('Din Game Plan är klar'),
      bodyText(intro),
      goals.length > 0 ? goalsBox(goals) : '',
      concepts.length > 0 ? bodyText('Vi har redan valt ut koncept som matchar strategin:') : '',
      concepts.map((concept, index) => conceptCard(concept, index + 1)).join(''),
      bodyText(outro),
    ].join(''),
  };
}
