import sharp from 'sharp';
import { NextResponse } from 'next/server';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const POST = withAuth(async (request, user) => {
  requireScope(user, 'team.write');

  const formData = await request.formData().catch(() => null);
  const fileEntry = formData?.get('file');

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Ingen bildfil skickades' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(fileEntry.type)) {
    return NextResponse.json(
      { error: 'Endast PNG, JPG och WebP stöds' },
      { status: 400 },
    );
  }

  if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'Bilden får vara högst 5 MB' },
      { status: 400 },
    );
  }

  const sourceBytes = Buffer.from(await fileEntry.arrayBuffer());
  const supabaseAdmin = createSupabaseAdmin();
  const path = `${user.id}/${crypto.randomUUID()}.webp`;

  let transformed: Buffer;
  try {
    transformed = await sharp(sourceBytes)
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 86 })
      .toBuffer();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Kunde inte bearbeta profilbilden',
      },
      { status: 400 },
    );
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from('team-avatars')
    .upload(path, transformed, {
      upsert: false,
      contentType: 'image/webp',
      cacheControl: '3600',
    });

  if (uploadError) {
    return NextResponse.json(
      { error: 'Kunde inte ladda upp profilbilden' },
      { status: 500 },
    );
  }

  const { data } = supabaseAdmin.storage.from('team-avatars').getPublicUrl(path);

  return NextResponse.json({
    path,
    url: data.publicUrl,
  });
}, ['admin']);
