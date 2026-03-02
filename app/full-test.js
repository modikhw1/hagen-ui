const https = require('https');

// Step 1: Create customer profile
const createData = JSON.stringify({
  business_name: 'Auto Full Test Company',
  contact_email: 'fulltest_letrend456@maildrop.cc',
  monthly_price: 999,
  contacts: [{ name: 'Full Test', email: 'fulltest_letrend456@maildrop.cc', phone: '' }]
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
    
    if (!profileId) {
      console.log('Failed to create profile');
      return;
    }

    // Step 2: Send invite via local API
    const http = require('http');
    
    const inviteData = JSON.stringify({
      action: 'send_invite',
      contact_email: 'fulltest_letrend456@maildrop.cc',
      business_name: 'Auto Full Test Company'
    });

    const inviteReq = http.request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/admin/customers/${profileId}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(inviteData)
      }
    }, (inviteRes) => {
      let inviteResult = '';
      inviteRes.on('data', (chunk) => { inviteResult += chunk; });
      inviteRes.on('end', () => {
        console.log('Step 2 - Invite sent:', inviteResult);
        console.log('>>> EMAIL SENT - Please click the link in the email to fulltest_letrend456@maildrop.cc');
        console.log('>>> Then run this script again with --verify flag to check result');
      });
    });

    inviteReq.on('error', (e) => { console.error('Invite error:', e.message); });
    inviteReq.write(inviteData);
    inviteReq.end();
  });
});

createReq.on('error', (e) => { console.error('Create error:', e.message); });
createReq.write(createData);
createReq.end();
