import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { EMAIL_TEMPLATE_DEFINITIONS } from '@/lib/email/service';

export const GET = withAuth(async () => (
  NextResponse.json({
    templates: EMAIL_TEMPLATE_DEFINITIONS,
  })
), ['admin', 'content_manager']);
