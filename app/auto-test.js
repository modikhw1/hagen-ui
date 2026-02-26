const https = require('https');

// Create a new test customer profile
const createData = JSON.stringify({
  business_name: 'Auto Test Company',
  contact_email: 'autotest_letrend123@maildrop.cc',
  monthly_price: 499,
  contacts: [{ name: 'Auto Test', email: 'autotest_letrend123@maildrop.cc', phone: '' }]
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
  res.on('end', () => { 
    console.log('Created profile:');
    const profile = JSON.parse(data);
    console.log('ID:', profile[0]?.id);
    
    // Now call the invite API
    const http = require('http');
    
    const inviteData = JSON.stringify({
      action: 'send_invite',
      contact_email: 'autotest_letrend123@maildrop.cc',
      business_name: 'Auto Test Company'
    });

    const inviteReq = http.request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/admin/customers/${profile[0]?.id}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(inviteData)
      }
    }, (inviteRes) => {
      let inviteResult = '';
      inviteRes.on('data', (chunk) => { inviteResult += chunk; });
      inviteRes.on('end', () => {
        console.log('Invite result:');
        console.log(inviteResult);
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
