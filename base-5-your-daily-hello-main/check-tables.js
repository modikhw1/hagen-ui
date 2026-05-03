const https = require('https');

const options = {
  hostname: 'fllzlpecwwabwgfbnxfu.supabase.co',
  path: '/rest/v1/customer_profiles?select=*',
  method: 'GET',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NjcyMDYsImV4cCI6MjA4MzU0MzIwNn0.-jWFoXZlUQR0jc4n0fssz8H0bEMWuxfgwgIyjntnC1w',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHpscGVjd3dhYndnZmJueGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NjcyMDYsImV4cCI6MjA4MzU0MzIwNn0.-jWFoXZlUQR0jc4n0fssz8H0bEMWuxfgwgIyjntnC1w'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(data); });
});

req.on('error', (e) => { console.error(e); });
req.end();
