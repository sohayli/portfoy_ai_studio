const API_BASE = 'http://localhost:3000/api';

const sampleFunds = [
  { symbol: 'AVR', price: 1.2345, name: 'AvivaSA Emeklilik ve Hayat A.Ş. AVR Fon', fundType: 'YAT', date: '2026-04-15' },
  { symbol: 'AFA', price: 2.5678, name: 'Anadolu Hayat Emeklilik A.Ş. AFA Fon', fundType: 'YAT', date: '2026-04-15' },
  { symbol: 'BYF', price: 0.9876, name: 'BES Fonu BYF', fundType: 'BYF', date: '2026-04-15' },
  { symbol: 'EMK', price: 1.4567, name: 'EMK Fonu', fundType: 'EMK', date: '2026-04-15' },
];

async function updateTefasFunds() {
  try {
    const response = await fetch(`${API_BASE}/tefas/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funds: sampleFunds }),
    });
    
    const result = await response.json();
    console.log('[TEFAS UPDATE] Result:', result);
    
    if (result.success) {
      console.log(`✅ Successfully updated ${result.updated} funds`);
      console.log(`❌ Failed: ${result.failed} funds`);
    }
    
    const allFunds = await fetch(`${API_BASE}/tefas/funds`).then(r => r.json());
    console.log('\n📊 All funds in database:');
    console.table(allFunds);
    
  } catch (error) {
    console.error('[ERROR]', error);
  }
}

updateTefasFunds();