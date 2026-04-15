import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { getStockPrice, getCryptoPrice, getTefasPrice, syncAllTefasPrices, getUsdTryRate, getHistoricalPrices } from "./services/finance.ts";
import { db, users, portfolios, assets, fundPrices } from "./src/lib/db.ts";
import { eq } from "drizzle-orm";
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '642674294207-agfrtso7m3pphppijaju0h9vhsq527sf.apps.googleusercontent.com';

// Auth middleware
function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

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

  // Auth endpoints
  app.post("/api/auth/google", async (req, res) => {
    try {
      const { credential } = req.body;
      
      if (!credential) {
        return res.status(400).json({ error: 'No credential provided' });
      }
      
      // Verify Google token
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      const googleUser = await response.json();
      
      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }
      
      // Check if email exists
      if (!googleUser.email) {
        return res.status(400).json({ error: 'No email in Google token' });
      }
      
      // Check audience (client ID)
      if (googleUser.aud !== GOOGLE_CLIENT_ID) {
        return res.status(401).json({ error: 'Invalid client ID' });
      }
      
      // Create or get user
      const userId = googleUser.sub; // Google user ID
      
      let user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (user.length === 0) {
        // Create new user
        user = await db.insert(users).values({
          id: userId,
          email: googleUser.email,
          displayName: googleUser.name || googleUser.email,
          baseCurrency: 'USD',
        }).returning();
      }
      
      // Generate JWT
      const token = jwt.sign(
        { userId, email: googleUser.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      res.json({
        token,
        user: {
          id: userId,
          email: googleUser.email,
          displayName: user[0].displayName,
        }
      });
    } catch (error) {
      console.error('[AUTH] Google login error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, req.user.userId)).limit(1);
      res.json(user[0] || null);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    // Client-side should delete token
    res.json({ success: true });
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
    console.log(`[API] TEFAS request for: ${symbol}`);
    
    try {
      const price = await getTefasPrice(symbol);
      res.json({ price });
    } catch (error) {
      console.error(`Error fetching TEFAS price for ${symbol}:`, error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to fetch TEFAS price" });
    }
  });

  app.get("/api/history/:type/:symbol", async (req, res) => {
    const { type, symbol } = req.params;
    try {
      const history = await getHistoricalPrices(symbol, type);
      res.json({ history });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/tefas/sync", async (req, res) => {
    try {
      console.log("[API] Starting TEFAS sync...");
      const result = await syncAllTefasPrices();
      res.json(result);
    } catch (error) {
      console.error("[API] TEFAS sync failed:", error);
      res.status(500).json({ error: "Sync failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Database API routes (protected)
  app.get("/api/users/:id", authMiddleware, async (req: any, res) => {
    try {
      if (req.params.id !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const result = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      res.json(result[0] || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/users", authMiddleware, async (req: any, res) => {
    try {
      const result = await db.insert(users).values({ ...req.body, id: req.user.userId }).returning();
      res.json(result[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.get("/api/portfolios/:userId", authMiddleware, async (req: any, res) => {
    try {
      if (req.params.userId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const result = await db.select().from(portfolios).where(eq(portfolios.ownerId, req.params.userId));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolios" });
    }
  });

  app.post("/api/portfolios", authMiddleware, async (req: any, res) => {
    try {
      const result = await db.insert(portfolios).values({ ...req.body, ownerId: req.user.userId }).returning();
      res.json(result[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to create portfolio" });
    }
  });

  app.put("/api/portfolios/:id", authMiddleware, async (req: any, res) => {
    try {
      // Check ownership
      const existing = await db.select().from(portfolios).where(eq(portfolios.id, req.params.id)).limit(1);
      if (existing.length === 0 || existing[0].ownerId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const result = await db.update(portfolios).set(req.body).where(eq(portfolios.id, req.params.id)).returning();
      res.json(result[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to update portfolio" });
    }
  });

  app.delete("/api/portfolios/:id", authMiddleware, async (req: any, res) => {
    try {
      // Check ownership
      const existing = await db.select().from(portfolios).where(eq(portfolios.id, req.params.id)).limit(1);
      if (existing.length === 0 || existing[0].ownerId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await db.delete(portfolios).where(eq(portfolios.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete portfolio" });
    }
  });

  app.get("/api/assets/user/:userId", authMiddleware, async (req: any, res) => {
    try {
      if (req.params.userId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const result = await db.select().from(assets).where(eq(assets.ownerId, req.params.userId));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.get("/api/assets/portfolio/:portfolioId", authMiddleware, async (req: any, res) => {
    try {
      // Check portfolio ownership
      const portfolio = await db.select().from(portfolios).where(eq(portfolios.id, req.params.portfolioId)).limit(1);
      if (portfolio.length === 0 || portfolio[0].ownerId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const result = await db.select().from(assets).where(eq(assets.portfolioId, req.params.portfolioId));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.post("/api/assets", authMiddleware, async (req: any, res) => {
    try {
      const result = await db.insert(assets).values({ ...req.body, ownerId: req.user.userId }).returning();
      res.json(result[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  app.put("/api/assets/:id", authMiddleware, async (req: any, res) => {
    try {
      // Check ownership
      const existing = await db.select().from(assets).where(eq(assets.id, req.params.id)).limit(1);
      if (existing.length === 0 || existing[0].ownerId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const result = await db.update(assets).set(req.body).where(eq(assets.id, req.params.id)).returning();
      res.json(result[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  app.delete("/api/assets/:id", authMiddleware, async (req: any, res) => {
    try {
      // Check ownership
      const existing = await db.select().from(assets).where(eq(assets.id, req.params.id)).limit(1);
      if (existing.length === 0 || existing[0].ownerId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await db.delete(assets).where(eq(assets.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete asset" });
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
    console.log(`[SERVER] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    
    // Health checks (non-blocking)
    if (process.env.NODE_ENV !== "production") {
      setTimeout(async () => {
        console.log("[HEALTH CHECK] Testing APIs...");
        try {
          const rate = await getUsdTryRate();
          console.log(`[HEALTH CHECK] USDTRY Rate: ${rate}`);
        } catch (e) {
          console.error("[HEALTH CHECK] Failed:", e);
        }
      }, 5000);
    }
  });
}

startServer().catch(err => {
  console.error("[SERVER] Failed to start:", err);
});
