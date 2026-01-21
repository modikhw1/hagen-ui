import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, type, userEmail } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email krävs' }, { status: 400 });
    }

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: 'hej@letrend.se',
      subject: `Ny förfrågan: ${type === 'custom_solution' ? 'Skräddarsydd lösning' : 'Kontakt'}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="width: 48px; height: 48px; background: #6B4423; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-family: Georgia, serif; font-style: italic; font-size: 16px; color: #FAF8F5;">Le</span>
            </div>
          </div>

          <h1 style="font-size: 22px; color: #1A1612; text-align: center; margin-bottom: 24px;">
            Ny förfrågan: ${type === 'custom_solution' ? 'Skräddarsydd lösning' : 'Kontakt'}
          </h1>

          <div style="background: #FAF8F5; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #7D6E5D; font-size: 14px; width: 100px;">Namn</td>
                <td style="padding: 8px 0; color: #1A1612; font-size: 14px; font-weight: 500;">${name || '-'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #7D6E5D; font-size: 14px;">E-post</td>
                <td style="padding: 8px 0; color: #1A1612; font-size: 14px; font-weight: 500;">
                  <a href="mailto:${email}" style="color: #6B4423; text-decoration: none;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #7D6E5D; font-size: 14px;">Telefon</td>
                <td style="padding: 8px 0; color: #1A1612; font-size: 14px; font-weight: 500;">
                  ${phone ? `<a href="tel:${phone}" style="color: #6B4423; text-decoration: none;">${phone}</a>` : '-'}
                </td>
              </tr>
              ${userEmail ? `
              <tr>
                <td style="padding: 8px 0; color: #7D6E5D; font-size: 14px;">Konto</td>
                <td style="padding: 8px 0; color: #1A1612; font-size: 14px; font-weight: 500;">${userEmail}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <div style="text-align: center;">
            <a href="mailto:${email}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(145deg, #6B4423, #4A2F18); color: #FAF8F5; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Svara kunden →
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #E8E0D8; margin: 32px 0;">

          <p style="color: #A89080; font-size: 12px; text-align: center;">
            LeTrend · Skickat ${new Date().toLocaleString('sv-SE')}
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Kunde inte skicka meddelandet' },
      { status: 500 }
    );
  }
}
