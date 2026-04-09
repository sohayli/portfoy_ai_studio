import { useState, useEffect, useContext, useRef } from 'react';
import * as d3 from 'd3';
import Papa from 'papaparse';
import { AuthContext, ThemeContext } from './context';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  db, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  collection,
  collectionGroup,
  query,
  where,
  onSnapshot,
  deleteDoc
} from './lib/firebase';
import { cn, formatCurrency, formatNumber } from './lib/utils';
import { 
  Plus, 
  TrendingUp, 
  Wallet, 
  PieChart, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  RefreshCw,
  Trash2,
  Moon,
  Sun,
  LayoutDashboard,
  Layers,
  FileUp,
  AlertCircle,
  CheckCircle2,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { UserProfile, Portfolio, Asset } from './types';

// --- Constants ---

// --- Services ---

const fetchStockPrice = async (symbol: string): Promise<{ price: number; name: string } | null> => {
  try {
    const response = await fetch(`/api/price/stock/${symbol}`);
    if (!response.ok) throw new Error('Failed to fetch');
    return await response.json();
  } catch (error) {
    console.error(`Error fetching stock price for ${symbol}:`, error);
    return null;
  }
};

const fetchCryptoPrice = async (symbol: string): Promise<number | null> => {
  try {
    const response = await fetch(`/api/price/crypto/${symbol}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.price;
  } catch (error) {
    console.error(`Error fetching crypto price for ${symbol}:`, error);
    return null;
  }
};

const fetchTefasPrice = async (symbol: string, type?: string): Promise<number | null> => {
  try {
    const url = type ? `/api/price/tefas/${symbol}?type=${type}` : `/api/price/tefas/${symbol}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data.price;
  } catch (error) {
    console.error(`Error fetching TEFAS price for ${symbol}:`, error);
    return null;
  }
};

// --- Components ---

function Treemap({ data }: { data: { name: string; value: number; color: string }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = 400;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const root = d3.hierarchy({ children: data } as any)
      .sum((d: any) => d.value)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.treemap()
      .size([width, height])
      .padding(2)
      .round(true)(root);

    const leaf = svg.selectAll("g")
      .data(root.leaves())
      .join("g")
      .attr("transform", (d: any) => `translate(${d.x0},${d.y0})`);

    leaf.append("rect")
      .attr("width", (d: any) => d.x1 - d.x0)
      .attr("height", (d: any) => d.y1 - d.y0)
      .attr("fill", (d: any) => d.data.color)
      .attr("rx", 4)
      .attr("opacity", 0.8)
      .on("mouseenter", function() { d3.select(this).attr("opacity", 1); })
      .on("mouseleave", function() { d3.select(this).attr("opacity", 0.8); });

    leaf.append("text")
      .attr("x", 5)
      .attr("y", 15)
      .attr("fill", "white")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text((d: any) => (d.x1 - d.x0 > 40 && d.y1 - d.y0 > 20) ? (d.data as any).name : "");

    leaf.append("text")
      .attr("x", 5)
      .attr("y", 30)
      .attr("fill", "white")
      .attr("font-size", "10px")
      .attr("opacity", 0.8)
      .text((d: any) => (d.x1 - d.x0 > 60 && d.y1 - d.y0 > 40) ? formatCurrency((d.data as any).value) : "");

  }, [data]);

  return (
    <div ref={containerRef} className="w-full bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-indigo-600" />
        <h3 className="font-bold text-slate-900 dark:text-white">Asset Allocation</h3>
      </div>
      {data.length > 0 ? (
        <svg ref={svgRef} width="100%" height="400" className="rounded-lg overflow-hidden" />
      ) : (
        <div className="h-[400px] flex items-center justify-center text-slate-400 italic">
          No data to visualize
        </div>
      )}
    </div>
  );
}

function CSVImportModal({ isOpen, onClose, onImport }: { isOpen: boolean; onClose: () => void; onImport: (assets: Omit<Asset, 'id' | 'portfolioId'>[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: any) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleImport = () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const importedAssets: Omit<Asset, 'id' | 'portfolioId'>[] = results.data.map((row: any) => {
            // Mapping logic based on the provided CSV format
            // Headers often have extra quotes or commas in the user's example
            const getVal = (keys: string[]) => {
              for (const key of keys) {
                const foundKey = Object.keys(row).find(k => k.toLowerCase().includes(key.toLowerCase()));
                if (foundKey) return row[foundKey];
              }
              return '';
            };

            const symbol = getVal(['Holding']).replace(/,/g, '').trim();
            const name = getVal(['Holdings\' name', 'Name']).trim();
            const shares = parseFloat(getVal(['Shares', 'Quantity']).replace(/,/g, '')) || 0;
            const costBasis = parseFloat(getVal(['Cost basis']).replace(/,/g, '')) || 0;
            const category = getVal(['Category']).toLowerCase();
            
            let type: Asset['type'] = 'Stock';
            if (category.includes('crypto')) type = 'Crypto';
            else if (category.includes('commodity') || category.includes('gold')) type = 'Commodity';
            else if (category.includes('cash')) type = 'Cash';

            const purchasePrice = shares > 0 ? costBasis / shares : 0;

            return {
              symbol: symbol || 'UNKNOWN',
              name: name || symbol || 'Unknown Asset',
              quantity: shares,
              purchasePrice: purchasePrice,
              purchaseCurrency: 'USD' as const,
              type: type
            };
          }).filter(asset => asset.quantity > 0);

          if (importedAssets.length === 0) {
            throw new Error("No valid assets found in CSV. Please check the format.");
          }

          onImport(importedAssets);
          setFile(null);
          onClose();
        } catch (err: any) {
          setError(err.message || "Failed to parse CSV. Please ensure it matches the expected format.");
        } finally {
          setIsProcessing(false);
        }
      },
      error: (err) => {
        setError("Error reading file: " + err.message);
        setIsProcessing(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
            <FileUp className="text-indigo-600 dark:text-indigo-400 w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Import from CSV</h3>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Upload a CSV file containing your holdings. We'll automatically map Symbol, Name, Shares, and Cost Basis.
        </p>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer relative">
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <FileUp className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {file ? file.name : "Click to select or drag CSV file"}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleImport}
            disabled={!file || isProcessing}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Import
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DeleteAllAssetsModal({ isOpen, onClose, onConfirm }: { isOpen: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <div className="flex items-center gap-3 mb-4 text-rose-600">
          <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/30 rounded-xl flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold">Delete All Assets?</h3>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          This action will permanently delete all assets in the current portfolio. This cannot be undone.
        </p>

        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-bold"
          >
            Delete All
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Navbar({ user, profile, currentView, setView }: { user: any; profile: UserProfile | null; currentView: string; setView: (v: 'dashboard' | 'assets') => void }) {
  const theme = useContext(ThemeContext);

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">FinTrack</span>
            </div>

            {user && (
              <div className="hidden md:flex items-center gap-1">
                <button
                  onClick={() => setView('dashboard')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    currentView === 'dashboard' 
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setView('assets')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    currentView === 'assets' 
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Assets
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={theme?.toggleTheme}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title="Toggle Theme"
            >
              {theme?.isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{user.displayName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.baseCurrency || 'USD'}</p>
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => signInWithPopup(auth, googleProvider)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function AddPortfolioModal({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (name: string, desc: string, goal: number) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [goal, setGoal] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create New Portfolio</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Portfolio Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Retirement"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monthly Passive Income Goal (USD)</label>
            <input 
              type="number" 
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. 1000"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What is this portfolio for?"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none transition-colors"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onAdd(name, desc, parseFloat(goal) || 0);
              setName('');
              setDesc('');
              setGoal('');
              onClose();
            }}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AddAssetModal({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (asset: Omit<Asset, 'id' | 'portfolioId'>) => void }) {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [dividendYield, setDividendYield] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [type, setType] = useState<Asset['type']>('Stock');
  const [tefasType, setTefasType] = useState<'YAT' | 'EMK' | 'BYF'>('YAT');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const totalAmount = parseFloat(quantity) * parseFloat(price);

  const resetForm = () => {
    setSymbol('');
    setQuantity('');
    setPrice('');
    setDividendYield('');
    setCurrentPrice(null);
    setType('Stock');
    setTefasType('YAT');
    setIsFetching(false);
    setFetchError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (symbol.length >= 2) {
        setIsFetching(true);
        setFetchError(null);
        let fetchedPrice: number | null = null;
        
        try {
          if (type === 'Crypto') {
            fetchedPrice = await fetchCryptoPrice(symbol);
          } else if (type === 'Stock') {
            const result = await fetchStockPrice(symbol);
            if (result) fetchedPrice = result.price;
          } else if (type === 'Fund') {
            fetchedPrice = await fetchTefasPrice(symbol, tefasType);
          }

          if (fetchedPrice) {
            setCurrentPrice(fetchedPrice);
            if (!price) {
              setPrice(fetchedPrice.toString());
            }
          } else {
            setCurrentPrice(null);
            setFetchError('Price not found. Check symbol and type.');
          }
        } catch (e) {
          setFetchError('Failed to fetch price.');
        }
        setIsFetching(false);
      } else {
        setCurrentPrice(null);
        setFetchError(null);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [symbol, type, price]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Asset</h3>
          {isFetching && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Fetching price...
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Symbol</label>
              <input 
                type="text" 
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL, BTC..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
              <select 
                value={type}
                onChange={(e) => setType(e.target.value as Asset['type'])}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              >
                <option value="Stock">Stock</option>
                <option value="Crypto">Crypto</option>
                <option value="Commodity">Commodity</option>
                <option value="Fund">Fund (TEFAS)</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          {type === 'Fund' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fund Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['YAT', 'EMK', 'BYF'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTefasType(t)}
                    className={cn(
                      "px-3 py-2 text-xs font-bold rounded-lg border transition-all",
                      tefasType === t
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400"
                    )}
                  >
                    {t === 'YAT' ? 'Yatırım' : t === 'EMK' ? 'Emeklilik' : 'BYF'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantity</label>
              <input 
                type="number" 
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Purchase Price (USD)</label>
                {currentPrice !== null && (
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                    Live: {formatCurrency(currentPrice)}
                  </span>
                )}
              </div>
              <input 
                type="number" 
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>

          {(type === 'Stock' || type === 'Fund') && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Annual Dividend Yield (%)</label>
              <input 
                type="number" 
                value={dividendYield}
                onChange={(e) => setDividendYield(e.target.value)}
                placeholder="e.g. 4.5"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
          )}

          {!isNaN(totalAmount) && totalAmount > 0 && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400">Total Amount</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</span>
            </div>
          )}

          {fetchError && (
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30">
              <AlertCircle className="w-3 h-3" />
              {fetchError}
            </div>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <button 
            onClick={handleClose}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onAdd({
                symbol,
                name: symbol,
                quantity: parseFloat(quantity),
                purchasePrice: parseFloat(price),
                purchaseCurrency: 'USD',
                type,
                tefasType: type === 'Fund' ? tefasType : undefined,
                dividendYield: dividendYield ? parseFloat(dividendYield) / 100 : undefined
              });
              handleClose();
            }}
            disabled={!symbol || !quantity || !price}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Add Asset
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Dashboard({ view }: { view: 'dashboard' | 'assets' }) {
  const authContext = useContext(AuthContext);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>('all');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authContext?.user) return;

    const q = query(collection(db, 'portfolios'), where('ownerId', '==', authContext.user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Portfolio));
      setPortfolios(pData);
      if (pData.length > 0 && !selectedPortfolioId) {
        setSelectedPortfolioId(pData[0].id);
      }
    }, (error) => {
      console.error("Portfolios snapshot error:", error);
    });

    return () => unsubscribe();
  }, [authContext?.user]);

  useEffect(() => {
    if (!selectedPortfolioId || !authContext?.user) {
      setAssets([]);
      return;
    }

    const q = selectedPortfolioId === 'all'
      ? query(collectionGroup(db, 'assets'), where('ownerId', '==', authContext.user.uid))
      : query(
          collection(db, `portfolios/${selectedPortfolioId}/assets`),
          where('ownerId', '==', authContext.user.uid)
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset)));
    }, (error) => {
      console.error("Assets snapshot error:", error);
    });

    return () => unsubscribe();
  }, [selectedPortfolioId, authContext?.user]);

  useEffect(() => {
    if (assets.length === 0) return;

    const interval = setInterval(async () => {
      const updatedAssets = await Promise.all(assets.map(async (asset) => {
        let currentPrice = asset.currentPrice;
        
        try {
          if (asset.type === 'Stock') {
            const result = await fetchStockPrice(asset.symbol);
            if (result) currentPrice = result.price;
          } else if (asset.type === 'Crypto') {
            currentPrice = await fetchCryptoPrice(asset.symbol);
          } else if (asset.type === 'Fund') {
            currentPrice = await fetchTefasPrice(asset.symbol, asset.tefasType);
          }
        } catch (e) {
          console.error(`Error updating price for ${asset.symbol}:`, e);
        }

        return { ...asset, currentPrice };
      }));

      const hasChanged = JSON.stringify(updatedAssets) !== JSON.stringify(assets);
      if (hasChanged) {
        setAssets(updatedAssets);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [assets]);

  const handleAddPortfolio = async (name: string, description: string, monthlyGoal: number) => {
    if (!authContext?.user) return;
    try {
      const newDocRef = doc(collection(db, 'portfolios'));
      await setDoc(newDocRef, {
        id: newDocRef.id,
        name,
        description,
        monthlyGoal,
        ownerId: authContext.user.uid,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error adding portfolio:", err);
    }
  };

  const handleAddAsset = async (assetData: Omit<Asset, 'id' | 'portfolioId'>) => {
    if (!selectedPortfolioId || !authContext?.user) return;
    try {
      const newDocRef = doc(collection(db, `portfolios/${selectedPortfolioId}/assets`));
      await setDoc(newDocRef, {
        ...assetData,
        id: newDocRef.id,
        portfolioId: selectedPortfolioId,
        ownerId: authContext.user.uid,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error adding asset:", err);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!selectedPortfolioId) return;
    try {
      await deleteDoc(doc(db, `portfolios/${selectedPortfolioId}/assets`, assetId));
    } catch (err) {
      console.error("Error deleting asset:", err);
    }
  };

  const handleDeleteAllAssets = async () => {
    if (!selectedPortfolioId || assets.length === 0) return;
    try {
      const promises = assets.map(asset => 
        deleteDoc(doc(db, `portfolios/${selectedPortfolioId}/assets`, asset.id))
      );
      await Promise.all(promises);
    } catch (err) {
      console.error("Error deleting all assets:", err);
    }
  };

  const handleImportAssets = async (importedAssets: Omit<Asset, 'id' | 'portfolioId'>[]) => {
    if (!selectedPortfolioId || !authContext?.user) return;
    
    try {
      const promises = importedAssets.map(asset => {
        const newDocRef = doc(collection(db, `portfolios/${selectedPortfolioId}/assets`));
        return setDoc(newDocRef, {
          ...asset,
          id: newDocRef.id,
          portfolioId: selectedPortfolioId,
          ownerId: authContext.user.uid,
          createdAt: serverTimestamp()
        });
      });
      
      await Promise.all(promises);
    } catch (err) {
      console.error("Error importing assets:", err);
    }
  };

  const calculateTotalValue = () => {
    return assets.reduce((total, asset) => {
      return total + (asset.purchasePrice * asset.quantity);
    }, 0);
  };

  const calculateAnnualDividends = () => {
    return assets.reduce((total, asset) => {
      const price = asset.currentPrice || asset.purchasePrice;
      const yield_ = asset.dividendYield || 0;
      return total + (price * asset.quantity * yield_);
    }, 0);
  };

  const totalValue = calculateTotalValue();
  const annualDividends = calculateAnnualDividends();
  const monthlyDividends = annualDividends / 12;
  
  const selectedPortfolio = selectedPortfolioId === 'all' 
    ? { name: 'All Portfolios', id: 'all', monthlyGoal: portfolios.reduce((acc, p) => acc + (p.monthlyGoal || 0), 0) } 
    : portfolios.find(p => p.id === selectedPortfolioId);

  const monthlyGoal = selectedPortfolio?.monthlyGoal || 0;
  const goalProgress = monthlyGoal > 0 ? (monthlyDividends / monthlyGoal) * 100 : 0;

  const filteredAssets = assets.filter(asset => 
    asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    asset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const treemapData = assets.map(asset => {
    const colors = {
      'Stock': '#4f46e5', // Indigo
      'Crypto': '#f59e0b', // Amber
      'Commodity': '#10b981', // Emerald
      'Fund': '#9333ea', // Purple
      'Cash': '#64748b' // Slate
    };

    return {
      name: asset.symbol,
      value: asset.purchasePrice * asset.quantity,
      color: colors[asset.type] || '#4f46e5'
    };
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        
        {/* Header with Dropdown */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
              <LayoutDashboard className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Portfolio Overview</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Manage and track your global assets</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={selectedPortfolioId || ''}
                onChange={(e) => setSelectedPortfolioId(e.target.value)}
                className="appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white px-4 py-2.5 pr-10 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer min-w-[200px]"
              >
                <option value="all">All Portfolios</option>
                {portfolios.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <button 
              onClick={() => setIsAddPortfolioOpen(true)}
              className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 dark:shadow-none"
              title="Add New Portfolio"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {selectedPortfolio ? (
          <>
            {view === 'dashboard' ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center">
                        <TrendingUp className="text-emerald-600 dark:text-emerald-400 w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">Live</span>
                    </div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Value</p>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(totalValue)}</h3>
                    <p className="text-xs text-slate-400 mt-2">Converted to USD</p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center">
                        <RefreshCw className="text-indigo-600 dark:text-indigo-400 w-5 h-5" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Monthly Dividend</p>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(monthlyDividends)}</h3>
                    <p className="text-xs text-slate-400 mt-2">{formatCurrency(annualDividends)} / year</p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center">
                        <Target className="text-purple-600 dark:text-purple-400 w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-lg">
                        {goalProgress.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Passive Income Goal</p>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(monthlyGoal)}</h3>
                    <div className="mt-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-purple-600 h-full transition-all duration-1000" 
                        style={{ width: `${Math.min(goalProgress, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Treemap Visualization */}
                <Treemap data={treemapData} />
              </>
            ) : (
              /* Assets Table View */
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-slate-900 dark:text-white">Detailed Holdings</h3>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 sm:flex-none">
                      <input 
                        type="text"
                        placeholder="Search assets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full sm:w-64 pl-4 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <button 
                      onClick={() => setIsAddAssetOpen(true)}
                      disabled={selectedPortfolioId === 'all'}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={selectedPortfolioId === 'all' ? "Select a specific portfolio to add assets" : "Add Asset"}
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                    <button 
                      onClick={() => setIsCSVImportOpen(true)}
                      disabled={selectedPortfolioId === 'all'}
                      className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={selectedPortfolioId === 'all' ? "Select a specific portfolio to import assets" : "Import CSV"}
                    >
                      <FileUp className="w-5 h-5" />
                    </button>
                    {assets.length > 0 && (
                      <button 
                        onClick={() => setIsDeleteAllOpen(true)}
                        disabled={selectedPortfolioId === 'all'}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors border border-rose-100 dark:border-rose-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={selectedPortfolioId === 'all' ? "Select a specific portfolio to delete all assets" : "Delete All Assets"}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                        <th className="px-6 py-4">Asset</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Quantity</th>
                        <th className="px-6 py-4">Purchase Price</th>
                        <th className="px-6 py-4">Current Value</th>
                        <th className="px-6 py-4">Gain/Loss</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {filteredAssets.map((asset) => {
                        const costBasis = asset.purchasePrice * asset.quantity;
                        const currentValue = (asset.currentPrice || asset.purchasePrice) * asset.quantity;
                        const gainLoss = asset.currentPrice ? (asset.currentPrice - asset.purchasePrice) * asset.quantity : 0;
                        const gainLossPercent = asset.currentPrice ? ((asset.currentPrice - asset.purchasePrice) / asset.purchasePrice) * 100 : 0;

                        return (
                          <tr key={asset.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 dark:text-white">{asset.symbol}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{asset.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <span className={cn(
                                  "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider w-fit",
                                  asset.type === 'Stock' ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" :
                                  asset.type === 'Crypto' ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                                  asset.type === 'Commodity' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
                                  asset.type === 'Fund' ? "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" :
                                  "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                )}>
                                  {asset.type}
                                </span>
                                {asset.type === 'Fund' && asset.tefasType && (
                                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 ml-1">
                                    ({asset.tefasType === 'YAT' ? 'Yatırım' : asset.tefasType === 'EMK' ? 'Emeklilik' : 'BYF'})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">
                              {formatNumber(asset.quantity)}
                            </td>
                            <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                              {formatCurrency(asset.purchasePrice, 'USD')}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                              <div className="flex flex-col">
                                <span>{formatCurrency(currentValue)}</span>
                                {asset.currentPrice && (
                                  <span className="text-[10px] font-medium text-slate-400">
                                    @ {formatCurrency(asset.currentPrice)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {asset.currentPrice ? (
                                <div className="flex flex-col">
                                  <span className={cn(
                                    "font-bold",
                                    gainLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                  )}>
                                    {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] font-medium",
                                    gainLoss >= 0 ? "text-emerald-500/70" : "text-rose-500/70"
                                  )}>
                                    {gainLoss >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Awaiting price...</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleDeleteAsset(asset.id)}
                                className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredAssets.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 italic">
                            {searchQuery ? "No assets match your search." : "No assets in this portfolio. Click \"Add Asset\" to get started."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-96 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 rounded-[2rem] border border-dashed border-slate-300 dark:border-slate-800 p-8 transition-colors">
            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-6">
              <Wallet className="text-slate-300 dark:text-slate-600 w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Start Your Journey</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto">
              Create your first portfolio to start tracking your investments in USD with real-time price data.
            </p>
            <button 
              onClick={() => setIsAddPortfolioOpen(true)}
              className="mt-8 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-none"
            >
              Create My First Portfolio
            </button>
          </div>
        )}
      </div>

      <AddPortfolioModal 
        isOpen={isAddPortfolioOpen} 
        onClose={() => setIsAddPortfolioOpen(false)} 
        onAdd={handleAddPortfolio} 
      />
      
      {selectedPortfolioId && (
        <>
          <AddAssetModal 
            isOpen={isAddAssetOpen} 
            onClose={() => setIsAddAssetOpen(false)} 
            onAdd={handleAddAsset}
          />
          <CSVImportModal
            isOpen={isCSVImportOpen}
            onClose={() => setIsCSVImportOpen(false)}
            onImport={handleImportAssets}
          />
          <DeleteAllAssetsModal
            isOpen={isDeleteAllOpen}
            onClose={() => setIsDeleteAllOpen(false)}
            onConfirm={handleDeleteAllAssets}
          />
        </>
      )}
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 transition-colors">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl text-center space-y-8"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-widest">
          <RefreshCw className="w-3 h-3" />
          Real-time USD Tracking
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[0.9]">
          Track your wealth <br />
          <span className="text-indigo-600 dark:text-indigo-500">without borders.</span>
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
          FinTrack provides real-time USD tracking for all your global investments, from stocks to crypto.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button 
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2"
          >
            Get Started Free
            <ArrowUpRight className="w-5 h-5" />
          </button>
          <button className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-lg text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 transition-all">
            Learn More
          </button>
        </div>
      </motion.div>
      
      <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full">
        {[
          { icon: Wallet, title: "Multi-Portfolio", desc: "Organize assets into sub-portfolios like Retirement or Kids Fund." },
          { icon: RefreshCw, title: "Live Prices", desc: "Get real-time price updates for stocks, crypto, and funds." },
          { icon: UserIcon, title: "Multi-User", desc: "Securely manage your own data with Firebase Authentication." }
        ].map((feature, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4">
              <feature.icon className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{feature.title}</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'assets'>('dashboard');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user) {
        // Check if profile exists
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            baseCurrency: 'USD',
          };
          await setDoc(doc(db, 'users', user.uid), {
            ...newProfile,
            createdAt: serverTimestamp()
          });
          setProfile(newProfile);
        } else {
          setProfile(userDoc.data() as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">Loading FinTrack...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      <ThemeContext.Provider value={{ isDark, toggleTheme }}>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900 selection:text-indigo-900 dark:selection:text-indigo-100 transition-colors">
          <Navbar user={user} profile={profile} currentView={view} setView={setView} />
          <main>
            {user ? <Dashboard view={view} /> : <LandingPage />}
          </main>
        </div>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

