
import { getTefasPrice, getUsdTryRate } from "./services/finance.ts";

async function test() {
  console.log("Testing TEFAS AVR fetch...");
  try {
    const priceUsd = await getTefasPrice("AVR");
    const rate = await getUsdTryRate();
    
    if (priceUsd) {
      const priceTry = priceUsd * rate;
      console.log("-----------------------------------");
      console.log(`Symbol: AVR`);
      console.log(`Price (TRY): ${priceTry.toFixed(4)}`);
      console.log(`Price (USD): ${priceUsd.toFixed(4)}`);
      console.log(`USDTRY Rate: ${rate}`);
      console.log("-----------------------------------");
    } else {
      console.log("Failed to fetch price for AVR.");
    }
  } catch (e) {
    console.error("Test failed:", e);
  }
}

test();
