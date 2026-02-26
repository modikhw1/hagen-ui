const http = require('http');

const profileId = '323e07a1-972d-4bd5-9a35-ecdf4ad6c831';

// Call the invite API
const inviteData = JSON.stringify({
  action: 'send_invite',
  contact_email: 'testtemp123@nodejs.uk',
  business_name: 'Test Temp Company'
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
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { 
    console.log('Invite response:');
    console.log(data);
  });
});

inviteReq.on('error', (e) => { console.error('Error:', e.message); });
inviteReq.write(inviteData);
inviteReq.end();
