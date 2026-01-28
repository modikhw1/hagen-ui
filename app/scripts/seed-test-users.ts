/**
 * Seed Test Users Script
 *
 * Skapar testanvändare med olika states i Supabase
 * Kör med: npx tsx scripts/seed-test-users.ts
 *
 * VIKTIGT: Kräver SUPABASE_SERVICE_ROLE_KEY i .env.local
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from '../e2e/fixtures/test-users';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function seedTestUsers() {
  console.log('🌱 Seeding test users...\n');

  for (const [name, user] of Object.entries(TEST_USERS)) {
    console.log(`Creating ${name}: ${user.email}`);

    try {
      // 1. Check if user exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === user.email);

      let userId: string;

      if (existingUser) {
        console.log(`  ⚠️  User already exists, updating profile...`);
        userId = existingUser.id;
      } else {
        // 2. Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
        });

        if (authError) {
          console.error(`  ❌ Auth error: ${authError.message}`);
          continue;
        }

        userId = authData.user!.id;
        console.log(`  ✅ Auth user created: ${userId}`);
      }

      // 3. Upsert profile with test state
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: user.email,
          business_name: user.profile.business_name,
          has_paid: user.profile.has_paid,
          subscription_status: user.profile.subscription_status,
          subscription_id: user.profile.subscription_id,
          is_admin: user.profile.is_admin,
        });

      if (profileError) {
        console.error(`  ❌ Profile error: ${profileError.message}`);
        continue;
      }

      console.log(`  ✅ Profile updated`);
      console.log(`     - has_paid: ${user.profile.has_paid}`);
      console.log(`     - subscription_status: ${user.profile.subscription_status}`);
      console.log(`     - is_admin: ${user.profile.is_admin}`);
      console.log('');

    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
    }
  }

  console.log('✅ Done seeding test users!');
  console.log('\nTest credentials:');
  console.log('Password for all users: TestPass123!');
}

// Run if called directly
seedTestUsers().catch(console.error);
