import 'dotenv/config';
import { db, fundPrices } from '../src/lib/db';
import { getUsdTryRate } from './finance';

const TEFAS_BASE_URL = 'https://www.tefas.gov.tr';
const TEFAS_API_URL = 'https://www.tefas.gov.tr/TefasDataApi/api';

interface TefasFund {
  FonKodu: string;
  FonFiyat: string;
  FonAd: string;
  FonTipi: string;
  Tarih: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: any = {}, maxRetries = 3): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': TEFAS_BASE_URL,
          'Origin': TEFAS_BASE_URL,
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Cache-Control': 'no-cache',
          ...options.headers,
        },
      });

      if (response.ok) {
        return await response.json();
      }

      console.warn(`[TEFAS SCRAPER] Attempt ${attempt + 1} failed: HTTP ${response.status}`);
      
      if (response.status === 403 || response.status === 429) {
        const waitTime = (attempt + 1) * 5000;
        console.log(`[TEFAS SCRAPER] Rate limited. Waiting ${waitTime}ms...`);
        await delay(waitTime);
      }
    } catch (error) {
      console.warn(`[TEFAS SCRAPER] Attempt ${attempt + 1} error:`, error instanceof Error ? error.message : String(error));
      
      if (attempt < maxRetries - 1) {
        await delay(2000);
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} retries`);
}

export async function scrapeAllTefasFunds(): Promise<{ success: boolean; total: number; updated: number; failed: number }> {
  console.log('[TEFAS SCRAPER] Starting daily fund price scrape...');
  console.log('[TEFAS SCRAPER] Time:', new Date().toISOString());

  const startTime = Date.now();
  let totalFunds = 0;
  let updatedFunds = 0;
  let failedFunds = 0;

  try {
    const knownFundCodes = [
      'AVR', 'AFA', 'BYF', 'EMK', 'KBA', 'SBF', 'YKB', 'ZBF',
      'AEF', 'AFF', 'AGF', 'AHF', 'AJF', 'AKF', 'ALF', 'AMF',
      'ANF', 'AOF', 'APF', 'AQF', 'ARF', 'ASF', 'ATF', 'AUF',
      'AVF', 'AWF', 'AXF', 'AYF', 'AZF', 'BAF', 'BBF', 'BCF',
      'BDF', 'BEF', 'BFF', 'BGF', 'BHF', 'BIF', 'BJF', 'BKf',
    ];

    console.log(`[TEFAS SCRAPER] Fetching ${knownFundCodes.length} known fund codes...`);

    for (const fundCode of knownFundCodes) {
      try {
        await delay(1000 + Math.random() * 2000);

        console.log(`[TEFAS SCRAPER] Fetching ${fundCode}...`);

        const fundData = await fetchWithRetry(
          `${TEFAS_API_URL}/FonAnalizData`,
          {
            method: 'POST',
            body: JSON.stringify({ FonKodu: fundCode }),
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
            },
          },
          2
        );

        if (fundData && fundData.FonFiyat) {
          const priceTRY = parseFloat(fundData.FonFiyat.replace(',', '.'));
          const fundName = fundData.FonAd || `${fundCode} Fonu`;
          const fundType = fundData.FonTipi || 'YAT';
          const date = fundData.Tarih || new Date().toISOString().split('T')[0];

          if (priceTRY > 0) {
            await db.insert(fundPrices)
              .values({
                symbol: fundCode,
                price: String(priceTRY),
                name: fundName,
                fundType: fundType,
                date: date,
                source: 'tefas-scraper',
              })
              .onConflictDoUpdate({
                target: fundPrices.symbol,
                set: {
                  price: String(priceTRY),
                  name: fundName,
                  fundType: fundType,
                  date: date,
                  updatedAt: new Date(),
                },
              });

            updatedFunds++;
            console.log(`[TEFAS SCRAPER] ✅ ${fundCode}: ${priceTRY} TRY - ${fundName}`);
          } else {
            failedFunds++;
            console.warn(`[TEFAS SCRAPER] ⚠️ ${fundCode}: Invalid price ${priceTRY}`);
          }
        } else {
          failedFunds++;
          console.warn(`[TEFAS SCRAPER] ⚠️ ${fundCode}: No data received`);
        }

        totalFunds++;
      } catch (error) {
        failedFunds++;
        totalFunds++;
        console.error(`[TEFAS SCRAPER] ❌ ${fundCode} failed:`, error instanceof Error ? error.message : String(error));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('[TEFAS SCRAPER] ================================');
    console.log(`[TEFAS SCRAPER] Scrape completed in ${duration}s`);
    console.log(`[TEFAS SCRAPER] Total: ${totalFunds} funds`);
    console.log(`[TEFAS SCRAPER] Updated: ${updatedFunds} funds`);
    console.log(`[TEFAS SCRAPER] Failed: ${failedFunds} funds`);
    console.log('[TEFAS SCRAPER] ================================');

    return {
      success: true,
      total: totalFunds,
      updated: updatedFunds,
      failed: failedFunds,
    };
  } catch (error) {
    console.error('[TEFAS SCRAPER] Fatal error:', error);
    return {
      success: false,
      total: totalFunds,
      updated: updatedFunds,
      failed: failedFunds,
    };
  }
}

export async function scrapeSingleFund(symbol: string): Promise<number | null> {
  try {
    console.log(`[TEFAS SCRAPER] Fetching single fund: ${symbol}`);

    const fundData = await fetchWithRetry(
      `${TEFAS_API_URL}/FonAnalizData`,
      {
        method: 'POST',
        body: JSON.stringify({ FonKodu: symbol.toUpperCase() }),
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
        },
      },
      3
    );

    if (fundData && fundData.FonFiyat) {
      const priceTRY = parseFloat(fundData.FonFiyat.replace(',', '.'));
      const fundName = fundData.FonAd || `${symbol} Fonu`;
      const fundType = fundData.FonTipi || 'YAT';
      const date = fundData.Tarih || new Date().toISOString().split('T')[0];

      if (priceTRY > 0) {
        await db.insert(fundPrices)
          .values({
            symbol: symbol.toUpperCase(),
            price: String(priceTRY),
            name: fundName,
            fundType: fundType,
            date: date,
            source: 'tefas-scraper',
          })
          .onConflictDoUpdate({
            target: fundPrices.symbol,
            set: {
              price: String(priceTRY),
              name: fundName,
              fundType: fundType,
              date: date,
              updatedAt: new Date(),
            },
          });

        console.log(`[TEFAS SCRAPER] ✅ ${symbol}: ${priceTRY} TRY saved to database`);
        
        const rate = await getUsdTryRate();
        return priceTRY / rate;
      }
    }

    return null;
  } catch (error) {
    console.error(`[TEFAS SCRAPER] ❌ Failed to fetch ${symbol}:`, error);
    return null;
  }
}

export async function getTefasPriceFromDB(symbol: string): Promise<number | null> {
  try {
    // Get latest price by date (most recent)
    const result = await db.select()
      .from(fundPrices)
      .where(eq(fundPrices.symbol, symbol.toUpperCase()))
      .orderBy(desc(fundPrices.date))
      .limit(1);

    if (result.length > 0) {
      // Return USD price directly from database
      const priceUsd = parseFloat(result[0].priceUsd || '0');
      
      if (priceUsd > 0) {
        console.log(`[TEFAS DB] ${symbol}: ${priceUsd} USD (latest date: ${result[0].date})`);
        return priceUsd;
      }
      
      // Fallback: Convert TRY to USD if price_usd not available
      const priceTRY = parseFloat(result[0].price || '0');
      if (priceTRY > 0) {
        const rate = await getUsdTryRate();
        console.log(`[TEFAS DB] ${symbol}: ${priceTRY} TRY → ${priceTRY / rate} USD (converted)`);
        return priceTRY / rate;
      }
    }

    return null;
  } catch (error) {
    console.error(`[TEFAS DB] Error fetching ${symbol}:`, error);
    return null;
  }
}

import { eq, desc } from 'drizzle-orm';