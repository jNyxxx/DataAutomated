async function run() {
  const res = await fetch('http://localhost:8000/auth/token', {
    method: 'POST',
    body: 'username=test@example.com&password=testpass123!',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const { access_token } = await res.json();
  console.log('Token received');

  const res2 = await fetch('http://localhost:8000/api/data-sources', {
    method: 'POST',
    body: JSON.stringify({ source_type: 'typeform', credentials: { access_token: 'tfp_TEST' } }),
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` }
  });
  const data2 = await res2.json();
  console.log('Source created:', data2);

  const res3 = await fetch(`http://localhost:8000/api/data-sources/${data2.id}/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const data3 = await res3.json();
  console.log('Test result:', data3);
}

run();
