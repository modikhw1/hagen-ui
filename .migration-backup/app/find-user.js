const https = require('https');

const options = {
  hostname: 'fllzlpecwwabwgfbnxfu.supabase.co',
  path: '/auth/v1/admin/users?email=ilike.%autotest%',
  method: 'GET',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk2NzIwNiwiZXhwIjoyMDgzNTQzMjA2fQ.xvlq_KEoeYAFWNgctfN-GRhuwFO9A2LB2Shoe-4Kms4'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { 
    console.log('Matching users:');
    const users = JSON.parse(data);
    users.users?.forEach(u => {
      console.log('- Email:', u.email);
      console.log('  invited_at:', u.invited_at);
      console.log('  confirmation_sent_at:', u.confirmation_sent_at);
      console.log('  email_confirmed_at:', u.email_confirmed_at);
    });
  });
});

req.on('error', (e) => { console.error('Error:', e.message); });
req.end();
