import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import {
  getAllowedPublicOrigins,
  getContactInbox,
  getMarketingUrl,
  getResendFromEmail,
} from '@/lib/url/public'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180),
  message: z.string().trim().min(10).max(5000),
  company: z.string().trim().max(180).optional().default(''),
  phone: z.string().trim().max(80).optional().default(''),
  honeypot: z.string().trim().max(200).optional().default(''),
})

function resolveCorsOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return getMarketingUrl()

  const normalized = origin.replace(/\/+$/, '')
  const allowedOrigins = getAllowedPublicOrigins()
  if (allowedOrigins.includes(normalized)) {
    return normalized
  }

  return getMarketingUrl()
}

function buildCorsHeaders(request: NextRequest) {
  return {
    'Access-Control-Allow-Origin': resolveCorsOrigin(request),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function buildContactHtml(input: z.infer<typeof contactSchema>) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
</head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FAF8F5;">
    <div style="height:4px;background:linear-gradient(90deg,#00D6F9 0%,#6B4423 100%);"></div>
    <div style="padding:32px 28px 20px;text-align:center;">
      <h1 style="margin:0;color:#1A1612;font-size:28px;font-weight:600;">Ny kontaktforfragan</h1>
      <p style="margin:10px 0 0;color:#5D4D3D;font-size:15px;line-height:1.6;">
        En ny forfragan kom in via letrend.se.
      </p>
    </div>
    <div style="padding:0 28px 28px;">
      <div style="background:#FFFFFF;border-radius:18px;padding:20px 18px;border:1px solid #E8E0D8;">
        <p style="margin:0 0 10px;color:#1A1612;font-size:14px;"><strong>Namn:</strong> ${input.name}</p>
        <p style="margin:0 0 10px;color:#1A1612;font-size:14px;"><strong>E-post:</strong> ${input.email}</p>
        ${input.company ? `<p style="margin:0 0 10px;color:#1A1612;font-size:14px;"><strong>Foretag:</strong> ${input.company}</p>` : ''}
        ${input.phone ? `<p style="margin:0 0 10px;color:#1A1612;font-size:14px;"><strong>Telefon:</strong> ${input.phone}</p>` : ''}
        <div style="margin-top:18px;padding-top:18px;border-top:1px solid #E8E0D8;">
          <p style="margin:0 0 8px;color:#5D4D3D;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Meddelande</p>
          <p style="margin:0;color:#1A1612;font-size:15px;line-height:1.7;white-space:pre-wrap;">${input.message}</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(request),
  })
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      ok: true,
      service: 'contact',
      accepts: ['POST', 'OPTIONS'],
      resendConfigured: Boolean(process.env.RESEND_API_KEY),
    },
    {
      status: 200,
      headers: {
        ...buildCorsHeaders(request),
        'Cache-Control': 'no-store',
      },
    }
  )
}

export async function POST(request: NextRequest) {
  const corsHeaders = buildCorsHeaders(request)

  if (!resend) {
    return NextResponse.json(
      { error: 'Resend is not configured' },
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }

  try {
    const rawBody = await request.json()
    const parsed = contactSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ogiltig kontaktforfragan', details: parsed.error.flatten() },
        {
          status: 400,
          headers: corsHeaders,
        }
      )
    }

    const payload = parsed.data

    if (payload.honeypot) {
      return NextResponse.json(
        { success: true },
        {
          status: 200,
          headers: corsHeaders,
        }
      )
    }

    const subject = payload.company
      ? `Ny kontaktforfragan fran ${payload.company}`
      : `Ny kontaktforfragan fran ${payload.name}`

    const result = await resend.emails.send({
      from: getResendFromEmail(),
      to: getContactInbox(),
      replyTo: payload.email,
      subject,
      html: buildContactHtml(payload),
      text: `Namn: ${payload.name}\nE-post: ${payload.email}\nForetag: ${payload.company || '-'}\nTelefon: ${payload.phone || '-'}\n\n${payload.message}`,
    })

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || 'Kunde inte skicka kontaktforfragan' },
        {
          status: 502,
          headers: corsHeaders,
        }
      )
    }

    return NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: corsHeaders,
      }
    )
  } catch (error) {
    console.error('[api/contact] Error:', error)
    return NextResponse.json(
      { error: 'Ett fel uppstod vid skickning av kontaktforfragan' },
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
}
