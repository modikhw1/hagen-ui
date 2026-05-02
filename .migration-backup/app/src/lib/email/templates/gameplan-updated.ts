import { bodyText, conceptCard, gamePlanHighlight, sectionHeading } from '../components';
import { contactGreetingName, resolveBusinessName } from '../helpers';
import type { CustomerData, EmailTemplateData, RenderedTemplate } from '../types';

export function renderGameplanUpdatedTemplate(
  customer: CustomerData,
  data: EmailTemplateData
): RenderedTemplate {
  const concepts = data.concepts || [];
  const businessName = resolveBusinessName(customer);
  const greetingName = contactGreetingName(customer);
  const intro = data.intro?.trim()
    ? data.intro
    : `Hej${greetingName}! Din Game Plan för ${businessName} har uppdaterats.`;
  const outro = data.outro?.trim()
    ? data.outro
    : 'Tveka inte att höra av dig om du har frågor!';

  return {
    subject: data.subject?.trim() || `Uppdaterad Game Plan för ${businessName} - LeTrend`,
    ctaLabel: 'Se din Game Plan',
    contentHtml: [
      sectionHeading('Din Game Plan har uppdaterats'),
      bodyText(intro),
      data.gameplan?.title ? gamePlanHighlight(data.gameplan.title, data.gameplan.description) : '',
      concepts.length > 0 ? bodyText('Relaterade koncept:', 'left') : '',
      concepts.map((concept, index) => conceptCard(concept, index + 1)).join(''),
      bodyText(outro),
    ].join(''),
  };
}
