/**
 * Email utilities using Resend
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Use Resend's default domain until letrend.se DNS is verified
// After DNS propagates, change to: 'LeTrend <noreply@letrend.se>'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'LeTrend <onboarding@resend.dev>';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured - skipping email');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
        text: text || subject,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export async function sendPaymentConfirmation(
  email: string,
  customerName: string,
  planName: string,
  amount: number,
  currency: string
): Promise<boolean> {
  const formattedAmount = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1A1612; }
    .container { max-width: 500px; margin: 0 auto; padding: 40px 20px; }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo-circle { display: inline-block; width: 48px; height: 48px; background: #6B4423; border-radius: 50%; line-height: 48px; color: #FAF8F5; font-family: Georgia, serif; font-style: italic; }
    .card { background: #FAF8F5; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    .success { color: #22863A; font-size: 24px; margin-bottom: 8px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .details { background: #FFFFFF; border-radius: 8px; padding: 20px; margin-top: 20px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .label { color: #6B5B4F; }
    .value { font-weight: 600; }
    .footer { text-align: center; font-size: 14px; color: #6B5B4F; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <span class="logo-circle">Le</span>
    </div>

    <div class="card">
      <div class="success">✓</div>
      <h1>Tack för din betalning!</h1>
      <p>Hej ${customerName || 'där'},</p>
      <p>Din betalning har genomförts och ditt avtal är nu aktivt.</p>

      <div class="details">
        <div class="row">
          <span class="label">Paket</span>
          <span class="value">${planName}</span>
        </div>
        <div class="row">
          <span class="label">Belopp</span>
          <span class="value">${formattedAmount}/mån</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Har du frågor? Kontakta oss på <a href="mailto:kontakt@letrend.se" style="color: #6B4423;">kontakt@letrend.se</a></p>
      <p style="color: #A89080;">LeTrend AB</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to: email,
    subject: `Betalningsbekräftelse - ${planName}`,
    html,
    text: `Tack för din betalning! Ditt ${planName}-paket (${formattedAmount}/mån) är nu aktivt.`,
  });
}
