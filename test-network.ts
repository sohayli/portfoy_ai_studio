
async function testNetwork() {
  console.log("Testing network access to google.com...");
  try {
    const response = await fetch("https://www.google.com");
    console.log(`Google response: ${response.status}`);
    
    console.log("Testing network access to proxy IP...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const proxyResponse = await fetch("http://62.171.147.85:3000/api/health", { signal: controller.signal });
      console.log(`Proxy health response: ${proxyResponse.status}`);
    } catch (e) {
      console.log(`Proxy health check failed: ${e}`);
    }
  } catch (e) {
    console.error("Network test failed:", e);
  }
}
testNetwork();
