import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fllzlpecwwabwgfbnxfu.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4';

const supabase = createClient(supabaseUrl, serviceKey);

async function createTestUser() {
  const email = 'test@letrend.se';
  const password = 'Test1234!';
  const businessName = 'Test Company';

  console.log('Creating test user:', email);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      business_name: businessName
    }
  });

  if (error) {
    console.error('Error creating user:', error.message);
    process.exit(1);
  }

  console.log('User created successfully!');
  console.log('User ID:', data.user.id);
  console.log('Email:', data.user.email);

  // Also create profile record
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: data.user.id,
      email: email,
      business_name: businessName,
      social_links: {},
      tone: [],
      has_paid: false,
      has_concepts: false,
      is_admin: false
    });

  if (profileError) {
    console.error('Error creating profile:', profileError.message);
  } else {
    console.log('Profile created successfully!');
  }
}

createTestUser();
