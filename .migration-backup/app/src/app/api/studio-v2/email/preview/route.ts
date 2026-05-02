import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import { hydrateEmailPayload } from '@/lib/email/service';

export const POST = withAuth(async (request) => {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON payload' }, { status: 400 });
  }

  try {
    const hydrated = await hydrateEmailPayload(requestBody);
    return NextResponse.json({
      subject: hydrated.rendered.subject,
      html: hydrated.rendered.html,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid payload' }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview email' },
      { status: 500 }
    );
  }
}, ['admin', 'content_manager']);
