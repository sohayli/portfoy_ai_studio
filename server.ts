import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from 'child_process';
import { promisify } from 'util';
import cron from 'node-cron';
import { getStockPrice, getCryptoPrice, getUsdTryRate, getHistoricalPrices } from "./services/finance.ts";
import { scrapeAllTefasFunds, scrapeSingleFund, getTefasPriceFromDB } from "./services/tefas-scraper.ts";
import { db, users, portfolios, assets, fundPrices } from "./src/lib/db.ts";
import { eq } from "drizzle-orm";
import jwt from 'jsonwebtoken';

const execAsync = promisify(exec);

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

// Admin middleware
async function adminMiddleware(req: any, res: any, next: any) {
  try {
    const userId = req.user.userId;
    
    console.log('[ADMIN MIDDLEWARE] Checking admin access for user:', userId);
    
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    console.log('[ADMIN MIDDLEWARE] User role:', user[0]?.role);
    
    if (!user.length || (user[0].role !== 'admin' && user[0].role !== 'superadmin')) {
      console.log('[ADMIN MIDDLEWARE] Access denied. Role:', user[0]?.role);
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    console.log('[ADMIN MIDDLEWARE] Access granted. Role:', user[0].role);
    req.user.role = user[0].role;
    next();
  } catch (error) {
    console.error('[ADMIN MIDDLEWARE] Error:', error);
    return res.status(500).json({ error: 'Failed to check admin status' });
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
      
      // Decode JWT to get picture URL (Google JWT includes picture claim)
      const jwtPayload = JSON.parse(Buffer.from(credential.split('.')[1], 'base64').toString());
      const pictureUrl = jwtPayload.picture || null;
      
      console.log('[AUTH] JWT decoded picture:', jwtPayload.picture);
      
      // Verify Google token
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      const googleUser = await response.json();
      
      console.log('[AUTH] Google user data:', {
        sub: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name,
        picture: pictureUrl,
      });
      
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
          avatarUrl: pictureUrl,
          baseCurrency: 'USD',
        }).returning();
      } else {
        // Update avatar if changed
        if (pictureUrl && user[0].avatarUrl !== pictureUrl) {
          user = await db.update(users)
            .set({ avatarUrl: pictureUrl, displayName: googleUser.name || user[0].displayName })
            .where(eq(users.id, userId))
            .returning();
        }
      }
      
      // Generate JWT
      const token = jwt.sign(
        { userId, email: googleUser.email, role: user[0].role || 'user' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      res.json({
        token,
        user: {
          id: userId,
          email: googleUser.email,
          displayName: user[0].displayName,
          avatarUrl: pictureUrl,
          role: user[0].role || 'user',
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
      const price = await getTefasPriceFromDB(symbol);
      
      if (price === null) {
        console.log(`[API] ${symbol} not in DB. Attempting live scrape...`);
        const scrapedPrice = await scrapeSingleFund(symbol);
        
        if (scrapedPrice !== null) {
          res.json({ price: scrapedPrice });
        } else {
          res.status(404).json({ error: `Fund ${symbol} not found` });
        }
      } else {
        res.json({ price });
      }
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

  app.get("/api/tefas/scrape", async (req, res) => {
    try {
      console.log("[API] Manual TEFAS scrape triggered via button...");
      
      const scriptPath = path.join(process.cwd(), 'scripts', 'tefas_daily_scraper_with_usd.py');
      
      // Execute Python scraper asynchronously
      const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`, { 
        timeout: 300000,
        maxBuffer: 1024 * 1024 * 10
      });
      
      console.log("[API] Scrape completed");
      
      // Parse output for stats
      const savedMatch = stdout.match(/Saved (\d+) funds/);
      const datesMatch = stdout.match(/Historical dates: (\d+) days/);
      const recordsMatch = stdout.match(/Total records: (\d+)/);
      const durationMatch = stdout.match(/Completed in ([\d.]+) seconds/);
      
      const saved = savedMatch ? parseInt(savedMatch[1]) : 0;
      const dates = datesMatch ? parseInt(datesMatch[1]) : 0;
      const records = recordsMatch ? parseInt(recordsMatch[1]) : 0;
      const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
      
      res.json({
        success: true,
        saved,
        dates,
        records,
        duration,
        message: `Successfully scraped ${saved} funds in ${duration}s`,
        output: stdout.slice(-500), // Last 500 chars
        stderr: stderr || null
      });
      
    } catch (error: any) {
      console.error("[API] TEFAS scrape failed:", error);
      
      res.status(500).json({ 
        success: false,
        error: "Scrape failed", 
        details: error.message,
        stderr: error.stderr || null,
        stdout: error.stdout ? error.stdout.slice(-500) : null
      });
    }
  });

  app.post("/api/tefas/bulk-update", async (req, res) => {
    try {
      const { funds } = req.body;
      
      if (!Array.isArray(funds)) {
        return res.status(400).json({ error: 'Invalid data format. Expected array of funds.' });
      }
      
      console.log(`[API] Bulk updating ${funds.length} TEFAS funds...`);
      
      let updated = 0;
      let failed = 0;
      
      for (const fund of funds) {
        try {
          const { symbol, price, name, fundType, date } = fund;
          
          if (!symbol || !price) {
            failed++;
            continue;
          }
          
          await db.insert(fundPrices)
            .values({
              symbol: symbol.toUpperCase(),
              price: String(price),
              name: name || null,
              fundType: fundType || null,
              date: date || new Date().toISOString().split('T')[0],
              source: 'tefas',
            })
            .onConflictDoUpdate({
              target: fundPrices.symbol,
              set: {
                price: String(price),
                name: name || null,
                fundType: fundType || null,
                date: date || new Date().toISOString().split('T')[0],
                updatedAt: new Date(),
              },
            });
          
          updated++;
        } catch (err) {
          console.error(`[TEFAS] Failed to update ${fund.symbol}:`, err);
          failed++;
        }
      }
      
      res.json({ 
        success: true, 
        updated, 
        failed,
        message: `Updated ${updated} funds, ${failed} failed` 
      });
    } catch (error) {
      console.error("[API] TEFAS bulk update failed:", error);
      res.status(500).json({ error: "Bulk update failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/tefas/funds", async (req, res) => {
    try {
      const allFunds = await db.select({
        symbol: fundPrices.symbol,
        price: fundPrices.price,
        priceUsd: fundPrices.priceUsd,
        name: fundPrices.name,
        fundType: fundPrices.fundType,
        date: fundPrices.date,
        source: fundPrices.source,
        updatedAt: fundPrices.updatedAt,
      }).from(fundPrices).orderBy(fundPrices.symbol);
      res.json(allFunds);
    } catch (error) {
      console.error("[API] Failed to fetch funds:", error);
      res.status(500).json({ error: "Failed to fetch funds" });
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

  // Admin API routes
  app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req: any, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      }).from(users);
      res.json(allUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/role", authMiddleware, adminMiddleware, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      
      if (!['user', 'admin', 'superadmin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      
      const result = await db.update(users)
        .set({ role })
        .where(eq(users.id, id))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(result[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  app.delete("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Prevent self-deletion
      if (id === req.user.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      
      const result = await db.delete(users).where(eq(users.id, id)).returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ success: true, deleted: result[0] });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (req: any, res) => {
    try {
      const userCount = await db.select().from(users);
      const portfolioCount = await db.select().from(portfolios);
      const assetCount = await db.select().from(assets);
      const fundCount = await db.select().from(fundPrices);
      
      res.json({
        users: userCount.length,
        portfolios: portfolioCount.length,
        assets: assetCount.length,
        funds: fundCount.length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
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

  // Setup TEFAS daily scrape cron job
  console.log('[CRON] Setting up TEFAS daily scrape job...');
  
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] ⏰ Daily TEFAS scrape triggered (09:00 Istanbul time)');
    try {
      const result = await scrapeAllTefasFunds();
      console.log(`[CRON] Scrape completed: ${result.updated}/${result.total} funds updated`);
    } catch (error) {
      console.error('[CRON] Daily scrape failed:', error);
    }
  }, {
    timezone: 'Europe/Istanbul',
  });

  cron.schedule('0 18 * * *', async () => {
    console.log('[CRON] ⏰ Evening TEFAS scrape triggered (18:00 Istanbul time)');
    try {
      const result = await scrapeAllTefasFunds();
      console.log(`[CRON] Scrape completed: ${result.updated}/${result.total} funds updated`);
    } catch (error) {
      console.error('[CRON] Evening scrape failed:', error);
    }
  }, {
    timezone: 'Europe/Istanbul',
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Running on http://localhost:${PORT}`);
    console.log(`[SERVER] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log('[SERVER] TEFAS cron jobs active: 09:00 and 18:00 Istanbul time');
    
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
