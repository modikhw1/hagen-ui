import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const POST = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const formData = await request.formData().catch(() => null);
  const fileEntry = formData?.get('file');

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Ingen bildfil skickades' }, { status: 400 });
  }

  if (!fileEntry.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Endast bildfiler stöds' }, { status: 400 });
  }

  if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'Bilden får vara högst 10 MB' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: customer, error: customerError } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('id', customerId)
    .single();

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
  }

  const extension = fileEntry.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `game-plan-references/${customerId}/${crypto.randomUUID()}.${safeExtension}`;
  const arrayBuffer = await fileEntry.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, fileBuffer, {
      upsert: false,
      contentType: fileEntry.type,
      cacheControl: '3600',
    });

  if (uploadError) {
    return NextResponse.json({ error: 'Kunde inte ladda upp bilden' }, { status: 500 });
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);

  return NextResponse.json({
    path,
    url: data.publicUrl,
  });
}, ['admin', 'content_manager']);
