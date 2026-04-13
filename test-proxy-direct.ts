
async function testProxy() {
  const API_KEY = 'tefas_7x9K2mP4qR8vN3wL6yT1cB5aD0fE';
  const symbol = 'AVR';
  const url = `http://62.171.147.85:3000/api/tefas/batch?funds=${symbol}&apikey=${API_KEY}`;
  
  console.log(`Testing Proxy GET: ${url}`);
  try {
    const response = await fetch(url);
    console.log(`Status: ${response.status}`);
    const text = await response.text();
    console.log(`Response: ${text}`);
  } catch (e) {
    console.error(`Proxy test failed: ${e}`);
  }
}
testProxy();
