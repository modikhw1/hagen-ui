/**
 * Email Templates for LeTrend Studio
 * LeTrend design language: warm brown/beige, serif headings, elegant
 */

import type { TranslatedConcept } from '../conceptLoader';

export type EmailType = 'new_concept' | 'new_concepts' | 'gameplan_updated' | 'weekly_summary';

interface ConceptData {
  id: string;
  headline: string;
  headline_sv?: string;
  matchPercentage: number;
  whyItWorks?: string;
  whyItWorks_sv?: string;
  url?: string;
}

interface GamePlanData {
  title?: string;
  description?: string;
  goals?: string[];
}

interface CustomerData {
  business_name: string;
  contact_email: string;
  contact_name?: string;
  id?: string;
}

const DEFAULT_URL = 'https://letrend.se';

export function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil(diff / oneWeek);
}

function numberToSwedish(n: number): string {
  if (n === 0) return 'noll';
  if (n === 1) return 'ett';
  if (n === 2) return 'två';
  if (n === 3) return 'tre';
  if (n === 4) return 'fyra';
  if (n === 5) return 'fem';
  if (n === 6) return 'sex';
  if (n === 7) return 'sju';
  if (n === 8) return 'åtta';
  if (n === 9) return 'nio';
  if (n === 10) return 'tio';
  return String(n);
}

export function buildEmailContent(
  type: EmailType,
  customer: CustomerData,
  data?: { concepts?: ConceptData[]; gameplan?: GamePlanData; notes?: string },
  dashboardUrl?: string
): { subject: string; html: string; text: string } {
  const url = dashboardUrl || DEFAULT_URL;
  const concepts = data?.concepts || [];
  const contactName = customer.contact_name ? ` ${customer.contact_name}` : '';
  const businessName = customer.business_name || 'er verksamhet';

  let subject = '';
  let contentHtml = '';

  switch (type) {
    case 'new_concept': {
      const concept = concepts[0];
      subject = 'Nytt koncept - LeTrend';
      contentHtml = `
        <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 400; color: #1A1612; text-align: center; margin: 0 0 20px; line-height: 1.3;">Välkommen till LeTrend</h1>
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 0 0 32px;">Hej${contactName}! Vi har lagt till ett nytt koncept som vi tror passar perfekt för ${businessName}.</p>
        ${concept ? `
        <div style="background: #FAF8F5; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #E8E0D8;">
          <div style="font-family: Georgia, serif; font-size: 18px; color: #1A1612; margin-bottom: 8px;">${concept.headline_sv || concept.headline}</div>
          ${concept.whyItWorks ? `<p style="color: #5D4D3D; font-size: 14px; margin: 0 0 12px; line-height: 1.5;">${concept.whyItWorks}</p>` : ''}
          <span style="display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">${concept.matchPercentage}% matchning</span>
        </div>` : ''}
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 24px 0 32px;">Tveka inte att höra av dig om du har frågor!</p>`;
      break;
    }

    case 'new_concepts': {
      const count = concepts.length;
      const countText = numberToSwedish(count);
      subject = `${countText.charAt(0).toUpperCase() + countText.slice(1)} nya koncept - LeTrend`;
      contentHtml = `
        <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 400; color: #1A1612; text-align: center; margin: 0 0 20px; line-height: 1.3;">Nya koncept har lagts till</h1>
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 0 0 32px;">Hej${contactName}! Vi har lagt till ${count} nya koncept för ${businessName}.</p>
        ${concepts.map((c, i) => `
        <div style="background: #FAF8F5; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #E8E0D8;">
          <div style="font-family: Georgia, serif; font-size: 18px; color: #1A1612; margin-bottom: 8px;">${i + 1}. ${c.headline_sv || c.headline}</div>
          ${c.whyItWorks ? `<p style="color: #5D4D3D; font-size: 14px; margin: 0 0 12px; line-height: 1.5;">${c.whyItWorks}</p>` : ''}
          <span style="display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">${c.matchPercentage}% matchning</span>
        </div>`).join('')}
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 24px 0 32px;">Tveka inte att höra av dig om du har frågor!</p>`;
      break;
    }

    case 'gameplan_updated': {
      subject = `Uppdaterad gameplan för ${businessName} - LeTrend`;
      contentHtml = `
        <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 400; color: #1A1612; text-align: center; margin: 0 0 20px; line-height: 1.3;">Din Game Plan har uppdaterats</h1>
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 0 0 32px;">Hej${contactName}! Din Game Plan för ${businessName} har uppdaterats.</p>
        ${data?.gameplan?.title ? `
        <div style="background: #FAF8F5; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #E8E0D8;">
          <div style="font-family: Georgia, serif; font-size: 18px; color: #1A1612; margin-bottom: 8px;">${data.gameplan.title}</div>
          ${data.gameplan.description ? `<p style="color: #5D4D3D; font-size: 14px; margin: 0;">${data.gameplan.description}</p>` : ''}
        </div>` : ''}
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 24px 0 32px;">Tveka inte att höra av dig om du har frågor!</p>`;
      break;
    }

    case 'weekly_summary': {
      const weekNum = getWeekNumber();
      subject = `Veckouppdatering - LeTrend`;
      contentHtml = `
        <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 400; color: #1A1612; text-align: center; margin: 0 0 20px; line-height: 1.3;">Vecka ${weekNum} som gick</h1>
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 0 0 32px;">Hej${contactName}! Här är en sammanfattning av veckan för ${businessName}.</p>
        <div style="display: flex; gap: 16px; margin: 20px 0;">
          <div style="flex: 1; background: #FAF8F5; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #E8E0D8;">
            <div style="font-size: 32px; font-weight: 700; color: #10b981;">${concepts.length}</div>
            <div style="color: #5D4D3D; font-size: 14px;">Nya koncept</div>
          </div>
        </div>
        <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 24px 0 32px;">Tack för ett bra samarbete!</p>`;
      break;
    }

    default:
      contentHtml = '<p>Innehåll...</p>';
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FAF8F5;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #FAF8F5;">
    <div style="height: 4px; background: linear-gradient(90deg, #6B4423 0%, #8B5A2B 50%, #6B4423 100%);"></div>
    <div style="padding: 40px 32px 24px; text-align: center;">
      <h1 style="font-family: Georgia, serif; font-size: 28px; font-weight: 400; color: #1A1612; margin: 0;">LeTrend</h1>
    </div>
    <div style="text-align: center; padding: 0 32px;">
      <span style="color: #C4A77D; font-size: 14px; letter-spacing: 4px;">✦ · ✦ · ✦</span>
    </div>
    <div style="padding: 32px 40px;">
      ${contentHtml}
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${url}" style="display: inline-block; padding: 16px 40px; background: #6B4423; color: #FAF8F5; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px;">Se mina koncept</a>
      </div>
    </div>
    <div style="padding: 24px 32px 32px; text-align: center; border-top: 1px solid #E8E0D8; margin: 0 32px;">
      <a href="https://letrend.se" style="color: #6B4423; font-size: 13px; text-decoration: none; font-weight: 500;">letrend.se</a>
    </div>
  </div>
</body></html>`;

  return { subject, html, text: subject };
}
