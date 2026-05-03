'use server';

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function uploadCmAvatar(file: File): Promise<{ url: string }> {
  const admin = createSupabaseAdmin();
  
  // Supabase Storage bucket "team-avatars" (public read)
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `cm/${crypto.randomUUID()}.${ext}`;
  
  const { error } = await admin.storage.from('team-avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = admin.storage.from('team-avatars').getPublicUrl(path);
  return { url: data.publicUrl };
}
