import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { getStockPrice, getCryptoPrice, getTefasPrice, syncAllTefasPrices } from "./services/finance.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use("/api/*", (req, res, next) => {
    console.log(`[API DEBUG] ${req.method} ${req.originalUrl}`);
    next();
  });

  // API Rotaları
  app.get("/api/price/stock/:symbol", async (req, res) => {
    const { symbol } = req.params;
    console.log(`[API] Stock request for: ${symbol}`);
    if (!symbol) return res.status(400).json({ error: "Symbol is required" });

    try {
      const data = await getStockPrice(symbol);
      res.json(data);
    } catch (error) {
      console.error(`Error fetching stock price for ${symbol}:`, error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to fetch stock price" });
    }
  });

  app.get("/api/price/crypto/:symbol", async (req, res) => {
    const { symbol } = req.params;
    try {
      const data = await getCryptoPrice(symbol);
      res.json(data);
    } catch (error) {
      console.error(`Error fetching crypto price for ${symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch crypto price" });
    }
  });

  app.get("/api/price/tefas/:symbol", async (req, res) => {
    const { symbol } = req.params;
    const type = (req.query.type as string) || 'YAT';
    console.log(`[API] TEFAS request for: ${symbol} (${type})`);
    
    try {
      const price = await getTefasPrice(symbol, type);
      res.json({ price });
    } catch (error) {
      console.error(`Error fetching TEFAS price for ${symbol}:`, error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to fetch TEFAS price" });
    }
  });

  app.get("/api/tefas/sync", async (req, res) => {
    try {
      console.log("[API] Starting TEFAS sync...");
      const result = await syncAllTefasPrices();
      res.json(result);
    } catch (error) {
      console.error("[API] TEFAS sync failed:", error);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // Catch-all for /api to ensure JSON response
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
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
    console.log(`[SERVER] Running on http://localhost:${PORT}`);
    console.log(`[SERVER] NODE_ENV: ${process.env.NODE_ENV}`);
    
    // Initial sync
    setTimeout(() => {
      console.log("[SERVER] Triggering initial TEFAS sync...");
      syncAllTefasPrices().catch(err => console.error("[SERVER] Initial sync failed:", err));
    }, 5000);
  });
}

startServer().catch(err => {
  console.error("[SERVER] Failed to start:", err);
});
