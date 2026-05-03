import { bodyText, conceptCard, sectionHeading } from '../components';
import { contactGreetingName, numberToSwedish, resolveBusinessName } from '../helpers';
import type { CustomerData, EmailTemplateData, RenderedTemplate } from '../types';

export function renderNewConceptsTemplate(
  customer: CustomerData,
  data: EmailTemplateData
): RenderedTemplate {
  const concepts = data.concepts || [];
  const count = concepts.length;
  const countText = numberToSwedish(count);
  const businessName = resolveBusinessName(customer);
  const greetingName = contactGreetingName(customer);
  const intro = data.intro?.trim()
    ? data.intro
    : `Hej${greetingName}! Vi har lagt till ${count} nya koncept för ${businessName}.`;
  const outro = data.outro?.trim()
    ? data.outro
    : 'Tveka inte att höra av dig om du har frågor!';

  return {
    subject: data.subject?.trim() || `${countText.charAt(0).toUpperCase() + countText.slice(1)} nya koncept - LeTrend`,
    contentHtml: [
      sectionHeading('Nya koncept har lagts till'),
      bodyText(intro),
      concepts.map((concept, index) => conceptCard(concept, index + 1)).join(''),
      bodyText(outro),
    ].join(''),
  };
}
