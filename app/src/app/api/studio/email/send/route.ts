import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { withAuth } from '@/lib/auth/api-auth';
import { logEmailSent } from '@/lib/activity/logger';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'LeTrend <hej@letrend.se>';

// LeTrend email design - warm brown/beige theme
function buildCustomEmailHtml(
  subject: string,
  intro: string,
  outro: string,
  customer: { business_name: string; contact_name?: string; id?: string },
  concepts?: Array<{ id: string; headline: string; headline_sv?: string; matchPercentage: number; whyItWorks?: string }>,
  dashboardUrl: string = 'https://hagen.se/m'
) {
  const conceptsHtml = concepts && concepts.length > 0 ? concepts.map((c, i) => `
    <div style="background: #FAF8F5; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #E8E0D8;">
      <div style="font-family: Georgia, serif; font-size: 18px; color: #1A1612; margin-bottom: 8px;">
        ${c.headline_sv || c.headline}
      </div>
      ${c.whyItWorks ? `<p style="color: #5D4D3D; font-size: 14px; margin: 0 0 12px; line-height: 1.5;">${c.whyItWorks}</p>` : ''}
      <span style="display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">
        ${c.matchPercentage}% matchning
      </span>
    </div>
  `).join('') : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FAF8F5;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #FAF8F5;">
    <!-- Top gradient -->
    <div style="height: 4px; background: linear-gradient(90deg, #6B4423 0%, #8B5A2B 50%, #6B4423 100%);"></div>
    
    <!-- Header -->
    <div style="padding: 40px 32px 24px; text-align: center;">
      <h1 style="font-family: Georgia, serif; font-size: 28px; font-weight: 400; color: #1A1612; margin: 0;">LeTrend</h1>
    </div>
    
    <!-- Decorative -->
    <div style="text-align: center; padding: 0 32px;">
      <span style="color: #C4A77D; font-size: 14px; letter-spacing: 4px;">✦ · ✦ · ✦</span>
    </div>
    
    <!-- Content -->
    <div style="padding: 32px 40px;">
      <h1 style="font-family: Georgia, serif; font-size: 24px; font-weight: 400; color: #1A1612; text-align: center; margin: 0 0 20px; line-height: 1.3;">
        ${subject}
      </h1>
      
      <div style="white-space: pre-wrap; color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 0 0 24px;">
${intro}
      </div>
      
      ${conceptsHtml}
      
      <div style="white-space: pre-wrap; color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 24px 0 0;">
${outro}
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${dashboardUrl}" style="display: inline-block; padding: 16px 40px; background: #6B4423; color: #FAF8F5; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px;">
          Se mina koncept
        </a>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="padding: 24px 32px 32px; text-align: center; border-top: 1px solid #E8E0D8; margin: 0 32px;">
      <a href="https://letrend.se" style="color: #6B4423; font-size: 13px; text-decoration: none; font-weight: 500;">letrend.se</a>
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * POST /api/studio/email/send
 * Send email to customer
 */
export const POST = withAuth(
  async (request: NextRequest, user) => {
    try {
      if (!resend) {
        return NextResponse.json({ error: 'Resend not configured' }, { status: 500 });
      }

      const body = await request.json();
    const { 
      customer_id,
      email_type,
      to_email,
      subject,
      intro,
      outro,
      concepts,
      customContent,
    } = body;

    if (!to_email) {
      return NextResponse.json({ error: 'to_email required' }, { status: 400 });
    }

    // Get customer data if customer_id provided
    let customer = { business_name: '', contact_email: to_email, contact_name: '', id: '' };

    if (customer_id) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data } = await supabase
        .from('customer_profiles')
        .select('business_name, contact_email, customer_contact_name, contact_name, id')
        .eq('id', customer_id)
        .single();
      
      if (data) {
        customer = data;
      }
    }

    // Determine the correct URL based on environment
    const isProduction = process.env.NEXT_PUBLIC_ENV === 'production' || !process.env.NEXT_PUBLIC_ENV;
    const dashboardUrl = isProduction 
      ? `https://letrend.se?customer=${customer.id}`
      : `http://localhost:3000?customer=${customer.id}`;

    let html: string;
    let finalSubject: string;

    if (customContent && subject) {
      // Replace placeholders
      finalSubject = subject
        .replace('{{business_name}}', customer.business_name || 'er verksamhet')
        .replace('{{count}}', String(concepts?.length || 0));
      
      const processedIntro = (intro || '')
        .replace('{{business_name}}', customer.business_name || 'er verksamhet')
        .replace('{{count}}', String(concepts?.length || 0));
      
      const processedOutro = outro || '';
      
      html = buildCustomEmailHtml(finalSubject, processedIntro, processedOutro, customer, concepts, dashboardUrl);
    } else {
      // Use default template with proper subject lines
      const { buildEmailContent } = await import('@/lib/email/templates');
      const result = buildEmailContent(email_type, customer, { concepts }, dashboardUrl);
      finalSubject = result.subject;
      html = result.html;
    }

    // Send email
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to: to_email,
      subject: finalSubject,
      html,
    });

    // Log activity
    if (customer_id && customer.business_name) {
      await logEmailSent(
        user.id,
        user.email || 'unknown',
        customer_id,
        email_type || 'custom',
        concepts?.length || 0
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Email sent',
      email_id: data.data?.id
    });

  } catch (error: any) {
    console.error('[email/send] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
},
  ['admin', 'content_manager'] // Allow both admins and content managers to send emails
);

/**
 * GET /api/studio/email/templates
 * Get available email templates
 */
export async function GET() {
  return NextResponse.json({
    templates: [
      { id: 'new_concept', name: 'Nytt koncept', icon: '' },
      { id: 'new_concepts', name: 'Nya koncept', icon: '' },
      { id: 'gameplan_updated', name: 'Game Plan uppdaterad', icon: '' },
      { id: 'weekly_summary', name: 'Veckosammanfattning', icon: '' },
    ]
  });
}
