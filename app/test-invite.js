const https = require('https');

// First, create a customer profile
const createProfileData = JSON.stringify({
  business_name: 'Test Temp Company',
  contact_email: 'testtemp123@nodejs.uk',
  monthly_price: 499,
  contacts: [{ name: 'Test User', email: 'testtemp123@nodejs.uk', phone: '123456789' }],
  game_plan: { title: 'Test Plan', description: 'Testing', goals: [], contentThemes: [], targetAudience: '', postingFrequency: '' }
});

const createProfileReq = https.request({
  hostname: 'fllzlpecwwabwgfbnxfu.supabase.co',
  path: '/rest/v1/customer_profiles',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4',
    'Prefer': 'return=representation'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { 
    console.log('Profile created:');
    console.log(data);
  });
});

createProfileReq.on('error', (e) => { console.error('Error:', e.message); });
createProfileReq.write(createProfileData);
createProfileReq.end();
