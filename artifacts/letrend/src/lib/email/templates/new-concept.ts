import { bodyText, conceptCard, sectionHeading } from '../components';
import { contactGreetingName, resolveBusinessName } from '../helpers';
import type { CustomerData, EmailTemplateData, RenderedTemplate } from '../types';

export function renderNewConceptTemplate(
  customer: CustomerData,
  data: EmailTemplateData
): RenderedTemplate {
  const concept = data.concepts?.[0];
  const businessName = resolveBusinessName(customer);
  const greetingName = contactGreetingName(customer);
  const intro = data.intro?.trim()
    ? data.intro
    : `Hej${greetingName}! Vi har lagt till ett nytt koncept som vi tror passar perfekt för ${businessName}.`;
  const outro = data.outro?.trim()
    ? data.outro
    : 'Tveka inte att höra av dig om du har frågor!';

  return {
    subject: data.subject?.trim() || 'Nytt koncept - LeTrend',
    contentHtml: [
      sectionHeading('Välkommen till LeTrend'),
      bodyText(intro),
      concept ? conceptCard(concept) : '',
      bodyText(outro),
    ].join(''),
  };
}
