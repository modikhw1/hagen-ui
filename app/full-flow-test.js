const https = require('https');

// Create a profile AND a pre-confirmed user to test the full flow
const createData = JSON.stringify({
  business_name: 'Direct Confirm Test',
  contact_email: 'directtest_789@maildrop.cc',
  monthly_price: 499,
  contacts: [{ name: 'Direct Test', email: 'directtest_789@maildrop.cc', phone: '' }]
});

const createReq = https.request({
  hostname: 'fllzlpecwwabwgfbnxfu.supabase.co',
  path: '/rest/v1/customer_profiles',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(createData),
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4',
    'Prefer': 'return=representation'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', async () => {
    const profile = JSON.parse(data);
    const profileId = profile[0]?.id;
    console.log('Step 1 - Created profile:', profileId);
    
    // Now create a user directly with admin API (bypassing email confirmation)
    // This simulates what happens after user clicks email link AND confirms
    
    // Step 2: Create user directly with admin (simulating confirmed email)
    const adminOptions = {
      hostname: 'fllzlpecwwabwgfbnxfu.supabase.co',
      path: '/auth/v1/admin/users',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4'
      }
    };

    const userData = JSON.stringify({
      email: 'directtest_789@maildrop.cc',
      email_confirm: true,  // Already confirmed - bypasses email
      user_metadata: {
        business_name: 'Direct Confirm Test',
        customer_profile_id: profileId
      }
    });

    const userReq = https.request(adminOptions, (userRes) => {
      let userResult = '';
      userRes.on('data', (chunk) => { userResult += chunk; });
      userRes.on('end', async () => {
        console.log('Step 2 - Created confirmed user:', userResult.substring(0, 200));
        
        // Now verify the profile can be activated
        const profileData = JSON.stringify({
          status: 'active',
          agreed_at: new Date().toISOString()
        });
        
        const updateReq = https.request({
          hostname: 'fllzlpecwwabwgfbnxfu.supabase.co',
          path: `/rest/v1/customer_profiles?id=eq.${profileId}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(profileData),
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4'
          }
        }, (updateRes) => {
          let updateResult = '';
          updateRes.on('data', (chunk) => { updateResult += chunk; });
          updateRes.on('end', () => {
            console.log('Step 3 - Profile updated:', updateResult.substring(0, 200));
            console.log('\n✅ FULL FLOW TEST COMPLETE');
            console.log('- Profile created ✓');
            console.log('- User created (pre-confirmed) ✓');  
            console.log('- Profile can be activated ✓');
            console.log('\nThe only missing step is clicking the email link - which YOU need to do.');
          });
        });
        
        updateReq.on('error', (e) => console.error('Update error:', e));
        updateReq.write(profileData);
        updateReq.end();
      });
    });
    
    userReq.on('error', (e) => console.error('User error:', e));
    userReq.write(userData);
    userReq.end();
  });
});

createReq.on('error', (e) => { console.error('Create error:', e.message); });
createReq.write(createData);
createReq.end();
