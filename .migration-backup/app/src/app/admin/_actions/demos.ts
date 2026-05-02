'use server';

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { syncCustomerHistory } from '@/lib/studio/sync-customer-history';
import { revalidateTag } from 'next/cache';

/**
 * Förbereder en "shadow profile" (prospect) i Studio för ett demo.
 * Detta gör att vi kan använda det riktiga Studio-flödet för att förbereda koncept
 * utan att kunden syns i den vanliga kundlistan.
 */
export async function prepareDemoStudioAction(demoId: string) {
  try {
    // 1. Kolla om vi redan har en kopplad profil
    const { data: demo, error: demoError } = await supabaseAdmin
      .from('demos')
      .select('*, converted_customer_id')
      .eq('id', demoId)
      .single();

    if (demoError || !demo) throw new Error('Demot hittades inte.');
    
    if (demo.converted_customer_id) {
      return { success: true, customerId: demo.converted_customer_id };
    }

    // 2. Skapa en ny kundprofil med status 'prospect'
    // Vi mappar fält från demos till customer_profiles
    
    // Säkerställ att vi inte skickar med en ogiltig foreign key
    let accountManagerId = demo.owner_admin_id;
    if (accountManagerId) {
      const { data: profileExists } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', accountManagerId)
        .maybeSingle();
      
      if (!profileExists) {
        accountManagerId = null;
      }
    }

    const { data: newProfile, error: profileError } = await supabaseAdmin
      .from('customer_profiles')
      .insert({
        business_name: demo.company_name,
        contact_email: demo.contact_email || 'demo@letrend.se',
        customer_contact_name: demo.contact_name,
        tiktok_handle: demo.tiktok_handle,
        tiktok_profile_pic_url: demo.tiktok_profile_pic_url,
        status: 'prospect', 
        expected_concepts_per_week: Math.min(Math.max(demo.proposed_concepts_per_week || 2, 0), 7),
        concepts_per_week: Math.min(Math.max(demo.proposed_concepts_per_week || 2, 0), 7),
        monthly_price: demo.proposed_price_ore ? demo.proposed_price_ore / 100 : 0,
        account_manager_profile_id: accountManagerId,
        first_invoice_behavior: 'full', 
        pricing_status: demo.proposed_price_ore ? 'fixed' : 'unknown',
        from_demo_id: demoId
      })
      .select('id')
      .single();

    if (profileError || !newProfile) {
      const msg = profileError?.message || 'Kunde inte skapa skugg-profil.';
      console.error('Error creating prospect profile:', profileError);
      return { success: false, error: msg };
    }

    // 3. Länka tillbaka till demot
    await supabaseAdmin
      .from('demos')
      .update({ converted_customer_id: newProfile.id })
      .eq('id', demoId);

    revalidateTag('admin:demos', 'max');
    
    return { success: true, customerId: newProfile.id };
  } catch (error) {
    console.error('prepareDemoStudioAction error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Okänt fel' };
  }
}
