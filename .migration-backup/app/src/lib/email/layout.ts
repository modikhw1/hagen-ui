import { DEFAULT_EMAIL_URL, escapeHtml } from './helpers';

export function wrapInLayout(
  contentHtml: string,
  ctaUrl: string,
  ctaLabel = 'Se mina koncept'
): string {
  const safeCtaUrl = escapeHtml(ctaUrl || DEFAULT_EMAIL_URL);
  const safeCtaLabel = escapeHtml(ctaLabel);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 24px 16px; background: #FAF8F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <div style="max-width: 520px; margin: 0 auto; background: #FAF8F5;">
      <div style="height: 4px; background: linear-gradient(90deg, #6B4423 0%, #8B5A2B 50%, #6B4423 100%);"></div>
      <div style="padding: 40px 32px 24px; text-align: center;">
        <h1 style="margin: 0; font-family: Georgia, serif; font-size: 28px; font-weight: 400; color: #1A1612;">LeTrend</h1>
      </div>
      <div style="padding: 0 32px; text-align: center;">
        <span style="color: #C4A77D; font-size: 14px; letter-spacing: 4px;">✦ · ✦ · ✦</span>
      </div>
      <div style="padding: 32px 40px;">
        ${contentHtml}
      </div>
      <div style="text-align: center; margin: 0 40px 32px;">
        <a href="${safeCtaUrl}" style="display: inline-block; padding: 16px 40px; background: #6B4423; color: #FAF8F5; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px;">
          ${safeCtaLabel}
        </a>
      </div>
      <div style="padding: 24px 32px 32px; text-align: center; border-top: 1px solid #E8E0D8; margin: 0 32px;">
        <a href="https://letrend.se" style="color: #6B4423; font-size: 13px; text-decoration: none; font-weight: 500;">letrend.se</a>
      </div>
    </div>
  </body>
</html>`;
}
