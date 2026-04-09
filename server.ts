import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to get USD/TRY rate
  async function getUsdTryRate() {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X`);
      if (!response.ok) return 32.5; // Fallback rate
      const data: any = await response.json();
      return data.chart.result[0].meta.regularMarketPrice;
    } catch (e) {
      return 32.5; // Fallback
    }
  }

  // API Rotaları
  app.get("/api/price/stock/:symbol", async (req, res) => {
    const { symbol } = req.params;
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
      if (!response.ok) throw new Error('Failed to fetch from Yahoo');
      const data: any = await response.json();
      const quote = data.chart.result[0].meta;
      
      let price = quote.regularMarketPrice;
      
      // Borsa Istanbul stocks (.IS) are in TRY, convert to USD
      if (symbol.toUpperCase().endsWith('.IS')) {
        const rate = await getUsdTryRate();
        price = price / rate;
      }

      res.json({
        price: price,
        name: symbol
      });
    } catch (error) {
      console.error(`Error fetching stock price for ${symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch stock price" });
    }
  });

  app.get("/api/price/crypto/:symbol", async (req, res) => {
    const { symbol } = req.params;
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`);
      if (!response.ok) throw new Error('Failed to fetch from Binance');
      const data: any = await response.json();
      res.json({ price: parseFloat(data.price) });
    } catch (error) {
      console.error(`Error fetching crypto price for ${symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch crypto price" });
    }
  });

  app.get("/api/price/tefas/:symbol", async (req, res) => {
    const { symbol } = req.params;
    const { type } = req.query;
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // 30 days range to be safe

      const formatDate = (date: Date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${d}.${m}.${y}`;
      };

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      // 1. First, fetch the root page to get a session cookie (mimicking requests.session())
      const rootResponse = await fetch('https://fundturkey.com.tr', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
        }
      });
      
      const setCookies = (rootResponse.headers as any).getSetCookie ? (rootResponse.headers as any).getSetCookie() : [];
      let cookieHeader = '';
      if (setCookies.length > 0) {
        cookieHeader = setCookies.map((c: string) => c.split(';')[0].trim()).join('; ');
      } else {
        const rawCookie = rootResponse.headers.get('set-cookie');
        if (rawCookie) cookieHeader = rawCookie;
      }

      const fetchTefasData = async (fontip: string) => {
        const response = await fetch('https://fundturkey.com.tr/api/DB/BindHistoryInfo', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://fundturkey.com.tr',
            'Referer': 'https://fundturkey.com.tr/TarihselVeriler.aspx',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest',
            ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
          },
          body: new URLSearchParams({
            'fontip': fontip,
            'bastarih': startDateStr,
            'bittarih': endDateStr,
            'fonkod': symbol.toUpperCase()
          })
        });

        if (!response.ok) return null;
        
        const text = await response.text();
        if (!text || text.trim() === '') return null;
        
        try {
          const result = JSON.parse(text);
          const data = result?.data;
          if (data && Array.isArray(data) && data.length > 0) {
            // Sort by TARIH descending to ensure we get the latest
            data.sort((a: any, b: any) => parseInt(b.TARIH) - parseInt(a.TARIH));
            return data[0].FIYAT || null;
          }
          return null;
        } catch (e) {
          console.error(`Failed to parse TEFAS JSON for ${symbol} (${fontip}):`, text.substring(0, 100));
          return null;
        }
      };

      const processPrice = async (price: number | null) => {
        if (price) {
          const rate = await getUsdTryRate();
          return price / rate;
        }
        return null;
      };

      // If type is provided, only try that type
      if (type && ['YAT', 'EMK', 'BYF'].includes(type as string)) {
        const price = await fetchTefasData(type as string);
        const usdPrice = await processPrice(price);
        return res.json({ price: usdPrice });
      }

      // Try YAT
      let price = await fetchTefasData('YAT');
      if (price) return res.json({ price: await processPrice(price) });

      // Try EMK
      price = await fetchTefasData('EMK');
      if (price) return res.json({ price: await processPrice(price) });

      // Try BYF
      price = await fetchTefasData('BYF');
      if (price) return res.json({ price: await processPrice(price) });
      
      res.json({ price: null });
    } catch (error) {
      console.error(`Error crawling TEFAS price for ${symbol}:`, error);
      res.status(500).json({ error: "Failed to crawl TEFAS price" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
