import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'LeTrend <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CONTACT_EMAIL = 'hej@letrend.se';

// POST - Send test email or payment confirmation
export const POST = withAuth(async (request: NextRequest, user) => {
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  // Payment confirmation email with LeTrend design
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 520px; margin: 0 auto; background: #FAF8F5;">
    <!-- Decorative top border -->
    <div style="height: 4px; background: linear-gradient(90deg, #6B4423 0%, #8B5A2B 50%, #6B4423 100%);"></div>
    
    <!-- Header with logo -->
    <div style="padding: 40px 32px 24px; text-align: center;">
      <div style="display: inline-block; width: 56px; height: 56px; background: linear-gradient(135deg, #6B4423 0%, #4A2F18 100%); border-radius: 16px; line-height: 56px; color: #FAF8F5; font-family: Georgia, serif; font-style: italic; font-size: 24px;">
        Le
      </div>
    </div>

    <!-- Decorative divider -->
    <div style="text-align: center; padding: 0 32px;">
      <span style="color: #C4A77D; font-size: 14px; letter-spacing: 4px;">✦ · ✦ · ✦</span>
    </div>

    <!-- Main content -->
    <div style="padding: 32px 40px;">
      <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 400; color: #1A1612; text-align: center; margin: 0 0 20px; line-height: 1.3;">
        Tack för din betalning!
      </h1>
      
      <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 0 0 32px;">
        Ditt avtal är nu aktivt. Du hittar din faktura och betalningshistorik i din dashboard.
      </p>

      <!-- Invoice details -->
      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E8E0D8;">
          <span style="color: #5D4D3D; font-size: 14px;">Faktura</span>
          <span style="color: #1A1612; font-weight: 600; font-size: 14px;">24-001</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E8E0D8;">
          <span style="color: #5D4D3D; font-size: 14px;">Belopp</span>
          <span style="color: #1A1612; font-weight: 600; font-size: 14px;">623 kr (inkl. moms)</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E8E0D8;">
          <span style="color: #5D4D3D; font-size: 14px;">Period</span>
          <span style="color: #1A1612; font-weight: 600; font-size: 14px;">Mars 2026</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0;">
          <span style="color: #5D4D3D; font-size: 14px;">Status</span>
          <span style="color: #2E7D32; font-weight: 600; font-size: 14px;">Betald ✓</span>
        </div>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/billing" style="display: inline-block; padding: 16px 40px; background: #6B4423; color: #FAF8F5; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px;">
          Se mina fakturor
        </a>
      </div>

      <p style="color: #A89080; font-size: 13px; text-align: center; line-height: 1.6; margin: 0;">
        eller <a href="${APP_URL}/billing" style="color: #6B4423; text-decoration: underline;">klicka här</a> för att se din faktura
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 24px 32px 32px; text-align: center; border-top: 1px solid #E8E0D8; margin: 0 32px;">
      <p style="margin: 0 0 8px;">
        <a href="mailto:${CONTACT_EMAIL}" style="color: #6B4423; font-size: 13px; text-decoration: none; font-weight: 500;">${CONTACT_EMAIL}</a>
      </p>
      <p style="color: #A89080; font-size: 13px; margin: 0;">LeTrend AB</p>
    </div>
  </div>
</body>
</html>
`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: 'Betalningsbekräftelse - LeTrend',
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Email sent to ${email}` });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}, ['admin']);
