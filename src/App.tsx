import { useState, useEffect, useContext, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import Papa from 'papaparse';
import { AuthContext, ThemeContext } from './context';
import { 
  getUser,
  createUser,
  getPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  getAssetsByUser,
  getAssetsByPortfolio,
  createAsset,
  updateAsset,
  deleteAsset,
  signInWithGoogle,
  signOut,
  getCurrentUserId,
  getAuthToken,
  User as APIUser,
  Portfolio as APIPortfolio,
  Asset as APIAsset
} from './lib/api';
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
  Target,
  Pencil,
  Search,
  Filter,
  Download,
  Settings as SettingsIcon,
  Check,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { UserProfile, Portfolio, Asset } from './types';
import { fetchStockPrice, fetchCryptoPrice, fetchTefasPrice, fetchPriceHistory } from './services/finance';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';
import { Treemap } from './components/dashboard/Treemap';
import { Navbar } from './components/Navbar';
import { Settings } from './components/Settings';
import { GovernmentContributionView } from './components/GovernmentContributionView';
import { PassiveIncomeView } from './components/PassiveIncomeView';
import { AddPortfolioModal } from './components/modals/AddPortfolioModal';

// --- Constants ---

// --- Services ---

// --- Components ---

function Sparkline({ symbol, type }: { symbol: string; type: string }) {
  const [data, setData] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setError(false);
    fetchPriceHistory(symbol, type)
      .then(res => {
        if (res && res.length >= 1) {
          setData(res);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
  }, [symbol, type]);

  useEffect(() => {
    if (!svgRef.current || data.length < 1) return;

    const width = 80;
    const height = 30;
    const margin = 2;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const x = d3.scaleLinear()
      .domain([0, Math.max(1, data.length - 1)])
      .range([margin, width - margin]);

    const min = d3.min(data as number[]) || 0;
    const max = d3.max(data as number[]) || 0;
    // Ensure we have a visible range even for flat lines
    const domain = min === max ? [min * 0.99, max * 1.01] : [min, max];

    const y = d3.scaleLinear()
      .domain(domain)
      .range([height - margin, margin]);

    const line = d3.line<number>()
      .x((_, i) => x(i))
      .y(d => y(d))
      .curve(data.length > 2 ? d3.curveBasis : d3.curveLinear);

    const isUp = data.length >= 2 ? data[data.length - 1] >= data[0] : true;
    const color = isUp ? '#10b981' : '#ef4444';

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("d", line);

  }, [data]);

  if (error) return <div className="w-20 h-[30px] flex items-center justify-center text-[10px] text-slate-300 italic">N/A</div>;
  if (data.length < 1) return <div className="w-20 h-[30px] bg-slate-100 dark:bg-slate-800/50 rounded animate-pulse" />;

  return <svg ref={svgRef} width="80" height="30" className="overflow-visible" />;
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
      transformHeader: (header) => header.trim().toLowerCase().replace(/['"]/g, ''),
      complete: (results) => {
        try {
          console.log('[CSV] Parsing complete', { rows: results.data.length, headers: results.meta.fields });
          
          const importedAssets: Omit<Asset, 'id' | 'portfolioId'>[] = results.data.map((row: any, index: number) => {
            console.log(`[CSV] Row ${index}:`, row);
            
            // Get value by checking multiple possible column names
            const getVal = (keys: string[]): string => {
              for (const key of keys) {
                const value = row[key.toLowerCase()] || row[key];
                if (value) return String(value);
              }
              return '';
            };

            const symbol = getVal(['holding', 'symbol', 'ticker']).replace(/,/g, '').trim();
            const name = getVal(['holdings name', 'name', 'holdings\' name']).trim();
            const sharesStr = getVal(['shares', 'quantity', 'units']).replace(/,/g, '');
            const shares = parseFloat(sharesStr) || 0;
            const costBasisStr = getVal(['cost basis', 'cost', 'total cost']).replace(/,/g, '');
            const costBasis = parseFloat(costBasisStr) || 0;
            const category = getVal(['category', 'type', 'asset type']).toLowerCase();
            
            if (!symbol || shares <= 0) {
              console.warn(`[CSV] Skipping row ${index}: invalid data`);
              return null;
            }
            
            let type: Asset['type'] = 'Stock';
            let tefasType: Asset['tefasType'] = undefined;

            if (category.includes('crypto') || category.includes('bitcoin') || category.includes('ethereum')) {
              type = 'Crypto';
            } else if (category.includes('commodity') || category.includes('gold') || category.includes('silver')) {
              type = 'Commodity';
            } else if (category.includes('cash') || category.includes('money')) {
              type = 'Cash';
            } else if (category.includes('bes') || category.includes('katkı') || category.includes('devlet') || category.includes('pension')) {
              type = 'GovernmentContribution';
              tefasType = 'EMK';
            } else if (category.includes('fund') || category.includes('fon') || category.includes('mutual')) {
              type = 'Fund';
              tefasType = 'YAT';
            }

            const purchasePrice = shares > 0 ? costBasis / shares : 0;
            const dividendYieldStr = getVal(['dividend yield', 'yield', 'temettü', 'verim']).replace(/%/g, '').replace(/,/g, '');
            const dividendYield = parseFloat(dividendYieldStr) / 100 || 0;

            return {
              symbol: symbol.toUpperCase(),
              name: name || symbol.toUpperCase(),
              quantity: shares,
              purchasePrice: purchasePrice,
              purchaseCurrency: 'USD' as const,
              type: type,
              tefasType: tefasType,
              dividendYield: dividendYield > 0 ? dividendYield : undefined
            };
          }).filter((asset): asset is NonNullable<typeof asset> => asset !== null && asset.quantity > 0);

          console.log('[CSV] Valid assets:', importedAssets.length);

          if (importedAssets.length === 0) {
            throw new Error("No valid assets found in CSV. Expected columns: Holding/Symbol, Shares/Quantity, Cost Basis");
          }

          onImport(importedAssets);
          setFile(null);
          onClose();
        } catch (err: any) {
          console.error('[CSV] Parse error:', err);
          setError(err.message || "Failed to parse CSV");
        } finally {
          setIsProcessing(false);
        }
      },
      error: (err) => {
        console.error('[CSV] Papa error:', err);
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
          Upload a CSV file containing your holdings. We'll automatically map Symbol, Name, Shares, Cost Basis, and Dividend Yield.
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

function AddAssetModal({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (asset: Omit<Asset, 'id' | 'portfolioId'>) => void }) {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [dividendYield, setDividendYield] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [type, setType] = useState<Asset['type']>('Stock');
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
    setIsFetching(false);
    setFetchError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchPrice = async (isAutoRefresh = false) => {
      if (symbol.length < 2) return;
      
      if (!isAutoRefresh) {
        setIsFetching(true);
        setFetchError(null);
      }
      
      let fetchedPrice: number | null = null;
      try {
        if (type === 'Crypto') {
          fetchedPrice = await fetchCryptoPrice(symbol);
        } else if (type === 'Stock') {
          const result = await fetchStockPrice(symbol);
          if (result) fetchedPrice = result.price;
        } else if (type === 'Fund' || type === 'GovernmentContribution') {
          fetchedPrice = await fetchTefasPrice(symbol);
        }

        if (fetchedPrice) {
          setCurrentPrice(fetchedPrice);
          if (!isAutoRefresh) {
            setPrice(fetchedPrice.toString());
          }
        } else if (!isAutoRefresh) {
          setCurrentPrice(null);
          if (type === 'Fund' || type === 'GovernmentContribution') {
            setFetchError('TEFAS verisi veritabanında bulunamadı. Bir sonraki senkronizasyonda eklenecektir.');
          } else {
            setFetchError('Price not found. Check symbol and type.');
          }
        }
      } catch (e) {
        if (!isAutoRefresh) setFetchError('Failed to fetch price.');
      } finally {
        if (!isAutoRefresh) setIsFetching(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchPrice();
      // Start interval after initial fetch
      intervalId = setInterval(() => fetchPrice(true), 60000);
    }, 1000);

    return () => {
      clearTimeout(debounceTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [symbol, type]);

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
                autoComplete="off"
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
                <option value="GovernmentContribution">Devlet Katkısı Fonu</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          {type === 'GovernmentContribution' && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl">
              <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">Info</p>
              <p className="text-xs text-rose-600 dark:text-rose-400">
                Devlet Katkısı fonları veritabanı üzerinden otomatik olarak sorgulanır.
              </p>
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
                autoComplete="off"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Purchase Price (USD)</label>
                {currentPrice !== null && (
                  <button 
                    type="button"
                    onClick={() => setPrice(currentPrice.toString())}
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-colors"
                    title="Copy live price to purchase price"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Live: {formatCurrency(currentPrice)}
                  </button>
                )}
              </div>
              <input 
                type="number" 
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                autoComplete="off"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>

          {(type === 'Stock' || type === 'Fund') && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Annual Dividend Yield (%)</label>
                <span className="text-[10px] text-slate-400 italic">Manual entry</span>
              </div>
              <input 
                type="number" 
                value={dividendYield}
                onChange={(e) => setDividendYield(e.target.value)}
                placeholder="e.g. 4.5"
                autoComplete="off"
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
                tefasType: (type === 'Fund' || type === 'GovernmentContribution') ? (type === 'GovernmentContribution' ? 'EMK' : 'YAT') : undefined,
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

function EditAssetModal({ isOpen, onClose, onEdit, asset }: { isOpen: boolean; onClose: () => void; onEdit: (assetId: string, updates: Partial<Asset>) => void; asset: Asset | null }) {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [dividendYield, setDividendYield] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [type, setType] = useState<Asset['type']>('Stock');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (asset) {
      setSymbol(asset.symbol);
      setQuantity(asset.quantity.toString());
      setPrice(asset.purchasePrice.toString());
      setDividendYield(asset.dividendYield ? (asset.dividendYield * 100).toString() : '');
      setCurrentPrice(asset.currentPrice || null);
      setType(asset.type);
    }
  }, [asset]);

  const totalAmount = parseFloat(quantity) * parseFloat(price);

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchPrice = async (isAutoRefresh = false) => {
      if (symbol.length < 2) return;
      if (symbol === asset?.symbol && !isAutoRefresh) return; // Don't re-fetch initial symbol unless it's auto-refresh
      
      if (!isAutoRefresh) {
        setIsFetching(true);
        setFetchError(null);
      }
      
      let fetchedPrice: number | null = null;
      try {
        if (type === 'Crypto') {
          fetchedPrice = await fetchCryptoPrice(symbol);
        } else if (type === 'Stock') {
          const result = await fetchStockPrice(symbol);
          if (result) fetchedPrice = result.price;
        } else if (type === 'Fund' || type === 'GovernmentContribution') {
          fetchedPrice = await fetchTefasPrice(symbol);
        }

        if (fetchedPrice) {
          setCurrentPrice(fetchedPrice);
          if (!isAutoRefresh) {
            setPrice(fetchedPrice.toString());
          }
        } else if (!isAutoRefresh) {
          setCurrentPrice(null);
          if (type === 'Fund' || type === 'GovernmentContribution') {
            setFetchError('TEFAS verisi veritabanında bulunamadı. Bir sonraki senkronizasyonda eklenecektir.');
          } else {
            setFetchError('Price not found. Check symbol and type.');
          }
        }
      } catch (e) {
        if (!isAutoRefresh) setFetchError('Failed to fetch price.');
      } finally {
        if (!isAutoRefresh) setIsFetching(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchPrice();
      // Start interval after initial fetch
      intervalId = setInterval(() => fetchPrice(true), 60000);
    }, 1000);

    return () => {
      clearTimeout(debounceTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [symbol, type, asset?.symbol]);

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Asset</h3>
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
                autoComplete="off"
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
                <option value="GovernmentContribution">Devlet Katkısı Fonu</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          {type === 'GovernmentContribution' && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl">
              <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">Info</p>
              <p className="text-xs text-rose-600 dark:text-rose-400">
                Devlet Katkısı fonları veritabanı üzerinden otomatik olarak sorgulanır.
              </p>
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
                autoComplete="off"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Purchase Price (USD)</label>
                {currentPrice !== null && (
                  <button 
                    type="button"
                    onClick={() => setPrice(currentPrice.toString())}
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-colors"
                    title="Copy live price to purchase price"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Live: {formatCurrency(currentPrice)}
                  </button>
                )}
              </div>
              <input 
                type="number" 
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                autoComplete="off"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>

          {(type === 'Stock' || type === 'Fund') && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Annual Dividend Yield (%)</label>
                <span className="text-[10px] text-slate-400 italic">Manual entry</span>
              </div>
              <input 
                type="number" 
                value={dividendYield}
                onChange={(e) => setDividendYield(e.target.value)}
                placeholder="e.g. 4.5"
                autoComplete="off"
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
              onEdit(asset.id, {
                symbol,
                name: symbol,
                quantity: parseFloat(quantity),
                purchasePrice: parseFloat(price),
                type,
                tefasType: (type === 'Fund' || type === 'GovernmentContribution') ? (type === 'GovernmentContribution' ? 'EMK' : 'YAT') : undefined,
                dividendYield: dividendYield ? parseFloat(dividendYield) / 100 : undefined
              });
              handleClose();
            }}
            disabled={!symbol || !quantity || !price}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Dashboard({ view, portfolios, setView }: { view: 'dashboard' | 'assets' | 'settings'; portfolios: Portfolio[]; setView: (v: 'dashboard' | 'assets' | 'settings') => void }) {
  const authContext = useContext(AuthContext);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>('all');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [isEditAssetOpen, setIsEditAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (portfolios.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId('all');
    }
  }, [portfolios, selectedPortfolioId]);

  useEffect(() => {
    if (!selectedPortfolioId || !authContext?.user) {
      setAssets([]);
      return;
    }

    const loadAssets = async () => {
      try {
        const assetsData = selectedPortfolioId === 'all'
          ? await getAssetsByUser(authContext.user.id)
          : await getAssetsByPortfolio(selectedPortfolioId);
        
        // Convert numeric strings to numbers
        setAssets(assetsData.map((a: any) => ({
          id: a.id,
          portfolioId: a.portfolioId,
          ownerId: a.ownerId,
          symbol: a.symbol,
          name: a.name,
          quantity: parseFloat(a.quantity || '0'),
          purchasePrice: parseFloat(a.purchasePrice || '0'),
          purchaseCurrency: a.purchaseCurrency,
          type: a.type,
          tefasType: a.tefasType,
          currentPrice: a.currentPrice ? parseFloat(a.currentPrice) : undefined,
          dividendYield: a.dividendYield,
          dividendGrowth5Y: a.dividendGrowth5Y,
          dividendGrowth10Y: a.dividendGrowth10Y,
          createdAt: a.createdAt,
        } as Asset)));
      } catch (error) {
        console.error("Assets fetch error:", error);
      }
    };

    loadAssets();

    // TODO: Enable realtime after fixing subscription issue
    // const subscription = selectedPortfolioId === 'all'
    //   ? subscribeToPortfolios(authContext.user.id, () => loadAssets())
    //   : subscribeToAssets(selectedPortfolioId, () => loadAssets());

    // return () => {
    //   subscription.unsubscribe();
    // };
  }, [selectedPortfolioId, authContext?.user]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; count: number } | null>(null);

  const handleRefreshPrices = async () => {
    if (assets.length === 0 || !selectedPortfolioId || isRefreshingPrices) return;
    
    setIsRefreshingPrices(true);
    try {
      // Process assets in sequence to avoid rate limits
      for (const asset of assets) {
        try {
          let price = null;
          let dividendYield = asset.dividendYield;
          let dividendGrowth5Y = asset.dividendGrowth5Y;
          let dividendGrowth10Y = asset.dividendGrowth10Y;

          if (asset.type === 'Stock') {
            const result = await fetchStockPrice(asset.symbol);
            if (result) {
              price = result.price;
              if (result.dividendYield !== undefined) dividendYield = result.dividendYield;
              if (result.dividendGrowth5Y !== undefined) dividendGrowth5Y = result.dividendGrowth5Y;
              if (result.dividendGrowth10Y !== undefined) dividendGrowth10Y = result.dividendGrowth10Y;
            }
          } else if (asset.type === 'Crypto') {
            price = await fetchCryptoPrice(asset.symbol);
          } else if (asset.type === 'Fund' || asset.type === 'GovernmentContribution') {
            price = await fetchTefasPrice(asset.symbol);
          }

          const updates: any = {};
          if (price !== null && price !== asset.currentPrice) updates.currentPrice = price;
          if (dividendYield !== undefined && dividendYield !== asset.dividendYield) updates.dividendYield = dividendYield;
          if (dividendGrowth5Y !== undefined && dividendGrowth5Y !== asset.dividendGrowth5Y) updates.dividendGrowth5Y = dividendGrowth5Y;
          if (dividendGrowth10Y !== undefined && dividendGrowth10Y !== asset.dividendGrowth10Y) updates.dividendGrowth10Y = dividendGrowth10Y;

          if (Object.keys(updates).length > 0) {
            await updateAsset(asset.id, updates);
          }
          
          // Small delay between assets
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.error(`Error updating ${asset.symbol}:`, e);
        }
      }
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  const handleSyncTefas = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/tefas/sync');
      const result = await response.json();
      setSyncResult(result);
      setTimeout(() => setSyncResult(null), 5000);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (assets.length === 0 || !selectedPortfolioId) return;
    
    // Auto-refresh prices every 30 minutes, or once when portfolio changes
    handleRefreshPrices();
    
    const interval = setInterval(handleRefreshPrices, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedPortfolioId]); // Only re-run when portfolio changes

  const handleAddAsset = async (assetData: Omit<Asset, 'id' | 'portfolioId'>) => {
    if (!selectedPortfolioId || !authContext?.user) return;
    try {
      // Fetch initial price immediately
      let initialPrice: number | null = null;
      let initialDividendYield = assetData.dividendYield || null;
      let initialDividendGrowth5Y = assetData.dividendGrowth5Y || null;
      let initialDividendGrowth10Y = assetData.dividendGrowth10Y || null;

      try {
        if (assetData.type === 'Stock') {
          const res = await fetchStockPrice(assetData.symbol);
          if (res) {
            initialPrice = res.price;
            if (res.dividendYield !== undefined) {
              initialDividendYield = res.dividendYield;
            }
            if (res.dividendGrowth5Y !== undefined) {
              initialDividendGrowth5Y = res.dividendGrowth5Y;
            }
            if (res.dividendGrowth10Y !== undefined) {
              initialDividendGrowth10Y = res.dividendGrowth10Y;
            }
          }
        } else if (assetData.type === 'Crypto') {
          initialPrice = await fetchCryptoPrice(assetData.symbol);
        } else if (assetData.type === 'Fund' || assetData.type === 'GovernmentContribution') {
          initialPrice = await fetchTefasPrice(assetData.symbol);
        }
      } catch (e) {
        console.error("Initial price fetch failed:", e);
      }

      const dataToSave = {
        portfolioId: selectedPortfolioId,
        ownerId: authContext.user.id,
        symbol: assetData.symbol,
        name: assetData.name,
        quantity: assetData.quantity,
        purchasePrice: assetData.purchasePrice,
        purchaseCurrency: assetData.purchaseCurrency || 'USD',
        type: assetData.type,
        tefasType: assetData.tefasType,
        currentPrice: initialPrice,
        dividendYield: initialDividendYield,
        dividendGrowth5Y: initialDividendGrowth5Y,
        dividendGrowth10Y: initialDividendGrowth10Y,
      };

      const newAsset = await createAsset(dataToSave);
      
      // Add new asset to state
      setAssets(prev => [...prev, {
        id: newAsset.id,
        portfolioId: newAsset.portfolioId,
        ownerId: newAsset.ownerId,
        symbol: newAsset.symbol,
        name: newAsset.name,
        quantity: parseFloat(String(newAsset.quantity || 0)),
        purchasePrice: parseFloat(String(newAsset.purchasePrice || 0)),
        purchaseCurrency: newAsset.purchaseCurrency,
        type: newAsset.type,
        tefasType: newAsset.tefasType,
        currentPrice: newAsset.currentPrice ? parseFloat(String(newAsset.currentPrice)) : undefined,
        dividendYield: newAsset.dividendYield,
        dividendGrowth5Y: newAsset.dividendGrowth5Y,
        dividendGrowth10Y: newAsset.dividendGrowth10Y,
        createdAt: newAsset.createdAt,
      } as Asset]);
    } catch (err) {
      console.error("Error adding asset:", err);
    }
  };

  const handleEditAsset = async (assetId: string, updates: Partial<Asset>) => {
    if (!selectedPortfolioId || !authContext?.user) return;
    try {
      const updated = await updateAsset(assetId, updates as any);
      
      // Update asset in state
      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, ...updated, quantity: parseFloat(String(updated.quantity || a.quantity)), purchasePrice: parseFloat(String(updated.purchasePrice || a.purchasePrice)) } : a
      ));
    } catch (err) {
      console.error("Error editing asset:", err);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!selectedPortfolioId) return;
    try {
      await deleteAsset(assetId);
      
      // Remove asset from state
      setAssets(prev => prev.filter(a => a.id !== assetId));
    } catch (err) {
      console.error("Error deleting asset:", err);
    }
  };

  const handleDeleteAllAssets = async () => {
    if (!selectedPortfolioId || assets.length === 0) return;
    try {
      for (const asset of assets) {
        await deleteAsset(asset.id);
      }
    } catch (err) {
      console.error("Error deleting all assets:", err);
    }
  };

  const handleImportAssets = async (importedAssets: Omit<Asset, 'id' | 'portfolioId'>[]) => {
    if (!selectedPortfolioId || !authContext?.user) return;
    
    try {
      // Process imports in batches or sequence to fetch initial prices
      for (const asset of importedAssets) {
        let initialPrice: number | null = null;
        let initialDividendYield = asset.dividendYield || null;
        let initialDividendGrowth5Y = asset.dividendGrowth5Y || null;
        let initialDividendGrowth10Y = asset.dividendGrowth10Y || null;

        try {
          if (asset.type === 'Stock') {
            const res = await fetchStockPrice(asset.symbol);
            if (res) {
              initialPrice = res.price;
              if (res.dividendYield !== undefined) initialDividendYield = res.dividendYield;
              if (res.dividendGrowth5Y !== undefined) initialDividendGrowth5Y = res.dividendGrowth5Y;
              if (res.dividendGrowth10Y !== undefined) initialDividendGrowth10Y = res.dividendGrowth10Y;
            }
          } else if (asset.type === 'Crypto') {
            initialPrice = await fetchCryptoPrice(asset.symbol);
          } else if (asset.type === 'Fund' || asset.type === 'GovernmentContribution') {
            initialPrice = await fetchTefasPrice(asset.symbol);
          }
        } catch (e) {
          console.error(`Initial price fetch failed for ${asset.symbol}:`, e);
        }

        const dataToSave = {
          portfolioId: selectedPortfolioId,
          ownerId: authContext.user.id,
          symbol: asset.symbol,
          name: asset.name,
          quantity: asset.quantity,
          purchasePrice: asset.purchasePrice,
          purchaseCurrency: asset.purchaseCurrency || 'USD',
          type: asset.type,
          tefasType: asset.tefasType,
          currentPrice: initialPrice,
          dividendYield: initialDividendYield,
          dividendGrowth5Y: initialDividendGrowth5Y,
          dividendGrowth10Y: initialDividendGrowth10Y,
        };

        const newAsset = await createAsset(dataToSave);
        
        // Add each imported asset to state immediately
        setAssets(prev => [...prev, {
          id: newAsset.id,
          portfolioId: newAsset.portfolioId,
          ownerId: newAsset.ownerId,
          symbol: newAsset.symbol,
          name: newAsset.name,
          quantity: parseFloat(String(newAsset.quantity || 0)),
          purchasePrice: parseFloat(String(newAsset.purchasePrice || 0)),
          purchaseCurrency: newAsset.purchaseCurrency,
          type: newAsset.type,
          tefasType: newAsset.tefasType,
          currentPrice: newAsset.currentPrice ? parseFloat(String(newAsset.currentPrice)) : undefined,
          dividendYield: newAsset.dividendYield,
          dividendGrowth5Y: newAsset.dividendGrowth5Y,
          dividendGrowth10Y: newAsset.dividendGrowth10Y,
          createdAt: newAsset.createdAt,
        } as Asset]);
        
        // Small delay between imports
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('[IMPORT] Successfully imported', importedAssets.length, 'assets');
    } catch (err) {
      console.error("Error importing assets:", err);
      throw err;
    }
  };

  const calculateVestingPercentage = (birthDate?: string, besEntryDate?: string) => {
    if (!besEntryDate) return 0;

    const now = new Date();
    const entryDate = new Date(besEntryDate);
    const yearsInSystem = (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

    let age = 0;
    if (birthDate) {
      const bDate = new Date(birthDate);
      age = (now.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    }

    if (yearsInSystem >= 10 && age >= 56) return 100;
    if (yearsInSystem >= 10) return 60;
    if (yearsInSystem >= 6) return 35;
    if (yearsInSystem >= 3) return 15;
    return 0;
  };

  const vestingPercent = useMemo(() => {
    return calculateVestingPercentage(authContext?.profile?.birthDate, authContext?.profile?.besEntryDate);
  }, [authContext?.profile?.birthDate, authContext?.profile?.besEntryDate]);

  const getAssetVestingPercent = (asset: Asset) => {
    if (asset.type !== 'GovernmentContribution') return 100;
    const p = portfolios.find(p => p.id === asset.portfolioId);
    if (!p) return 0;
    return calculateVestingPercentage(p.birthDate, p.besEntryDate);
  };

  const calculateTotalValue = () => {
    return assets.reduce((total, asset) => {
      const price = asset.currentPrice ?? asset.purchasePrice;
      let value = price * asset.quantity;
      
      if (asset.type === 'GovernmentContribution') {
        const vPercent = getAssetVestingPercent(asset);
        value = value * (vPercent / 100);
      }
      
      return total + value;
    }, 0);
  };

  const calculateAnnualDividends = () => {
    return assets.reduce((total, asset) => {
      const price = asset.currentPrice ?? asset.purchasePrice;
      const yield_ = asset.dividendYield || 0;
      let value = price * asset.quantity * yield_;
      
      if (asset.type === 'GovernmentContribution') {
        const vPercent = getAssetVestingPercent(asset);
        value = value * (vPercent / 100);
      }
      
      return total + value;
    }, 0);
  };

  const calculateTotalCost = () => {
    return assets.reduce((total, asset) => {
      let value = asset.purchasePrice * asset.quantity;
      
      if (asset.type === 'GovernmentContribution') {
        const vPercent = getAssetVestingPercent(asset);
        value = value * (vPercent / 100);
      }
      
      return total + value;
    }, 0);
  };

  const totalValue = calculateTotalValue();
  const totalCost = calculateTotalCost();
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
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

  const allocationData = useMemo(() => {
    const totals = assets.reduce((acc: Record<string, number>, asset) => {
      const price = asset.currentPrice ?? asset.purchasePrice;
      let value = price * asset.quantity;
      
      if (asset.type === 'GovernmentContribution') {
        const vPercent = getAssetVestingPercent(asset);
        value = value * (vPercent / 100);
      }
      
      const type = asset.type;
      acc[type] = (acc[type] || 0) + value;
      return acc;
    }, {} as Record<string, number>);

    const typeLabels: Record<string, string> = {
      'Stock': 'Stocks',
      'Crypto': 'Crypto',
      'Commodity': 'Commodities',
      'Fund': 'Funds',
      'GovernmentContribution': 'Devlet Katkısı',
      'Cash': 'Cash'
    };

    const typeColors: Record<string, string> = {
      'Stock': '#4f46e5',
      'Crypto': '#f59e0b',
      'Commodity': '#10b981',
      'Fund': '#8b5cf6',
      'GovernmentContribution': '#e11d48',
      'Cash': '#64748b'
    };

    return Object.entries(totals).map(([type, value]: [string, number]) => ({
      name: typeLabels[type] || type,
      value,
      percentage: (totalValue as number) > 0 ? (value / (totalValue as number)) * 100 : 0,
      color: typeColors[type] || '#94a3b8'
    })).sort((a, b) => (b.value as number) - (a.value as number));
  }, [assets, totalValue]);

  const treemapData = useMemo(() => {
    interface AggregatedAsset {
      symbol: string;
      totalCurrentValue: number;
      totalCostValue: number;
    }
    const aggregated = assets.reduce((acc: Record<string, AggregatedAsset>, asset) => {
      const symbol = asset.symbol;
      const price = asset.currentPrice ?? asset.purchasePrice;
      let currentValue = price * asset.quantity;
      let costValue = asset.purchasePrice * asset.quantity;

      if (asset.type === 'GovernmentContribution') {
        const vPercent = getAssetVestingPercent(asset);
        currentValue = currentValue * (vPercent / 100);
        costValue = costValue * (vPercent / 100);
      }

      if (!acc[symbol]) {
        acc[symbol] = {
          symbol,
          totalCurrentValue: 0,
          totalCostValue: 0,
        };
      }

      acc[symbol].totalCurrentValue += currentValue;
      acc[symbol].totalCostValue += costValue;
      return acc;
    }, {} as Record<string, AggregatedAsset>);

    return Object.values(aggregated).map((item: AggregatedAsset) => {
      const gainLossPercent = item.totalCostValue > 0 
        ? ((item.totalCurrentValue - item.totalCostValue) / item.totalCostValue) * 100 
        : 0;

      let color = '#64748b';
      if (gainLossPercent > 0) {
        const intensity = Math.min(gainLossPercent / 20, 1);
        color = d3.interpolateRgb('#10b981', '#064e3b')(intensity);
      } else if (gainLossPercent < 0) {
        const intensity = Math.min(Math.abs(gainLossPercent) / 20, 1);
        color = d3.interpolateRgb('#ef4444', '#7f1d1d')(intensity);
      }

      return {
        name: item.symbol,
        value: item.totalCurrentValue,
        percentage: gainLossPercent,
        color: color
      };
    });
  }, [assets]);

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
              onClick={handleSyncTefas}
              disabled={isSyncing}
              className={cn(
                "p-2.5 rounded-xl transition-all border flex items-center gap-2",
                isSyncing 
                  ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-400 border-indigo-100 dark:border-indigo-900/30" 
                  : "bg-white dark:bg-slate-900 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border-slate-200 dark:border-slate-800"
              )}
              title="Sync TEFAS Prices"
            >
              <RefreshCw className={cn("w-5 h-5", isSyncing && "animate-spin")} />
              <span className="text-sm font-bold hidden sm:inline">
                {isSyncing ? 'Syncing...' : 'Sync TEFAS'}
              </span>
            </button>
          </div>
        </div>

        {syncResult && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-4 rounded-2xl border flex items-center justify-between",
              syncResult.success 
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800 text-rose-700 dark:text-rose-400"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                syncResult.success ? "bg-emerald-100 dark:bg-emerald-800" : "bg-rose-100 dark:bg-rose-800"
              )}>
                {syncResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
              <div>
                <p className="font-bold text-sm">{syncResult.success ? 'Sync Successful' : 'Sync Failed'}</p>
                <p className="text-xs opacity-80">
                  {syncResult.success 
                    ? `Successfully updated ${syncResult.count} fund prices in the database.`
                    : 'There was an error syncing prices from TEFAS.'}
                </p>
              </div>
            </div>
            <button onClick={() => setSyncResult(null)} className="p-1 hover:bg-black/5 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {selectedPortfolio ? (
          <>
            {view === 'dashboard' ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        totalGainLoss >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-rose-50 dark:bg-rose-900/20"
                      )}>
                        <ArrowUpRight className={cn(
                          "w-5 h-5",
                          totalGainLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        )} />
                      </div>
                      <span className={cn(
                        "text-xs font-bold px-2 py-1 rounded-lg",
                        totalGainLoss >= 0 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : "text-rose-600 bg-rose-50 dark:bg-rose-900/20"
                      )}>
                        {totalGainLoss >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Profit/Loss</p>
                    <h3 className={cn(
                      "text-3xl font-bold mt-1",
                      totalGainLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}>
                      {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)}
                    </h3>
                    <p className="text-xs text-slate-400 mt-2">Cost: {formatCurrency(totalCost)}</p>
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

                {/* Allocation & Treemap */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors h-full">
                      <div className="flex items-center gap-2 mb-6">
                        <PieChart className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-bold text-slate-900 dark:text-white">Asset Allocation</h3>
                      </div>
                      <div className="space-y-4">
                        {allocationData.map((item) => (
                          <div key={item.name} className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                {item.name}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">{item.percentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="h-full transition-all duration-1000" 
                                style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                              />
                            </div>
                            <div className="text-[10px] text-slate-400 text-right">
                              {formatCurrency(item.value)}
                            </div>
                          </div>
                        ))}
                        {allocationData.length === 0 && (
                          <div className="h-40 flex items-center justify-center text-slate-400 italic text-sm">
                            No data available
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <Treemap data={treemapData} />
                  </div>
                </div>
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
                    <button 
                      onClick={handleRefreshPrices}
                      disabled={isRefreshingPrices || assets.length === 0}
                      className={cn(
                        "p-2 rounded-xl transition-all border flex items-center gap-2",
                        isRefreshingPrices 
                          ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-400 border-indigo-100 dark:border-indigo-900/30" 
                          : "text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900/30"
                      )}
                      title="Refresh all prices"
                    >
                      <RefreshCw className={cn("w-5 h-5", isRefreshingPrices && "animate-spin")} />
                      {isRefreshingPrices && <span className="text-xs font-medium hidden sm:inline">Updating...</span>}
                    </button>
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
                        <th className="px-6 py-4">Div. Yield</th>
                        <th className="px-6 py-4">5Y Growth</th>
                        <th className="px-6 py-4">10Y Growth</th>
                        <th className="px-6 py-4">Quantity</th>
                        <th className="px-6 py-4">Purchase Price</th>
                        <th className="px-6 py-4">Current Value</th>
                        <th className="px-6 py-4">Gain/Loss</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {filteredAssets.map((asset) => {
                        const costBasisRaw = asset.purchasePrice * asset.quantity;
                        const currentValueRaw = (asset.currentPrice ?? asset.purchasePrice) * asset.quantity;
                        
                        let costBasis = costBasisRaw;
                        let currentValue = currentValueRaw;
                        
                        const vPercent = getAssetVestingPercent(asset);
                        if (asset.type === 'GovernmentContribution') {
                          costBasis = costBasisRaw * (vPercent / 100);
                          currentValue = currentValueRaw * (vPercent / 100);
                        }

                        const gainLoss = (asset.currentPrice !== undefined && asset.currentPrice !== null) ? currentValue - costBasis : 0;
                        const gainLossPercent = (asset.currentPrice !== undefined && asset.currentPrice !== null) ? ((currentValue - costBasis) / costBasis) * 100 : 0;

                        return (
                          <tr key={asset.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900 dark:text-white">{asset.symbol}</span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">{asset.name}</span>
                                </div>
                                <div className="hidden md:block">
                                  <Sparkline symbol={asset.symbol} type={asset.type} />
                                </div>
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
                                  asset.type === 'GovernmentContribution' ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" :
                                  "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                )}>
                                  {asset.type === 'GovernmentContribution' ? 'Devlet Katkısı' : asset.type}
                                </span>
                                {asset.type === 'GovernmentContribution' && (
                                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                                    Vested: {getAssetVestingPercent(asset)}%
                                  </span>
                                )}
                                {(asset.type === 'Fund' || asset.type === 'GovernmentContribution') && (asset.tefasType || asset.type === 'GovernmentContribution') && (
                                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 ml-1">
                                    ({(asset.type === 'GovernmentContribution' || asset.tefasType === 'EMK') ? 'Emeklilik' : asset.tefasType === 'YAT' ? 'Yatırım' : 'BYF'})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {asset.dividendYield ? (
                                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg">
                                  {(asset.dividendYield * 100).toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {asset.dividendGrowth5Y ? (
                                <span className={cn(
                                  "text-xs font-bold",
                                  asset.dividendGrowth5Y > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                )}>
                                  {asset.dividendGrowth5Y > 0 ? '+' : ''}{(asset.dividendGrowth5Y * 100).toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {asset.dividendGrowth10Y ? (
                                <span className={cn(
                                  "text-xs font-bold",
                                  asset.dividendGrowth10Y > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                )}>
                                  {asset.dividendGrowth10Y > 0 ? '+' : ''}{(asset.dividendGrowth10Y * 100).toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
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
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    setEditingAsset(asset);
                                    setIsEditAssetOpen(true);
                                  }}
                                  className="p-2 text-slate-300 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                  title="Edit asset"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteAsset(asset.id)}
                                  className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                  title="Delete asset"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredAssets.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 italic">
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
              onClick={() => setView('settings')}
              className="mt-8 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-none"
            >
              Go to Settings to Create Portfolio
            </button>
          </div>
        )}
      </div>

      {selectedPortfolioId && (
        <>
          <AddAssetModal 
            isOpen={isAddAssetOpen} 
            onClose={() => setIsAddAssetOpen(false)} 
            onAdd={handleAddAsset}
          />
          <EditAssetModal
            isOpen={isEditAssetOpen}
            onClose={() => {
              setIsEditAssetOpen(false);
              setEditingAsset(null);
            }}
            onEdit={handleEditAsset}
            asset={editingAsset}
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
            onClick={() => signInWithGoogle()}
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
          { icon: UserIcon, title: "Multi-User", desc: "Securely manage your own data with Supabase Authentication." }
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
  console.log("[APP] Rendering...");
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'assets' | 'settings' | 'bes' | 'passive-income'>('dashboard');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
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
    const token = getAuthToken();
    const userId = getCurrentUserId();
    
    if (token && userId) {
      // Verify token is still valid by fetching user
      getUser(userId).then((userProfile) => {
        if (userProfile) {
          setUser({ id: userId, email: userProfile.email });
          setProfile({
            uid: userId,
            email: userProfile.email,
            displayName: userProfile.displayName || userProfile.email,
            baseCurrency: userProfile.baseCurrency || 'USD',
          } as UserProfile);
          // Set view to dashboard after successful login
          setView('dashboard');
        } else {
          // Token invalid - clear storage
          localStorage.removeItem('authToken');
          localStorage.removeItem('userId');
        }
        setLoading(false);
      }).catch((err) => {
        console.error('[AUTH] Token verification failed:', err);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userId');
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setPortfolios([]);
      return;
    }

    const loadPortfolios = async () => {
      try {
        console.log('[DEBUG] Loading portfolios for user:', user.id);
        const portfoliosData = await getPortfolios(user.id);
        console.log('[DEBUG] Portfolios fetched:', portfoliosData);
        setPortfolios(portfoliosData.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          ownerId: p.ownerId,
          createdAt: p.createdAt,
          monthlyGoal: p.monthlyGoal,
          birthDate: p.birthDate,
          besEntryDate: p.besEntryDate,
        } as Portfolio)));
      } catch (error) {
        console.error("Portfolios fetch error:", error);
      }
    };

    loadPortfolios();
  }, [user]);

  const handleAddPortfolio = async (name: string, description: string, monthlyGoal: number, birthDate?: string, besEntryDate?: string) => {
    if (!user) return;
    try {
      const newPortfolio = await createPortfolio({
        ownerId: user.id,
        name,
        description,
      });
      
      // Add new portfolio to state immediately
      setPortfolios(prev => [...prev, {
        id: newPortfolio.id,
        name: newPortfolio.name,
        description: newPortfolio.description || '',
        ownerId: newPortfolio.ownerId,
        createdAt: newPortfolio.createdAt,
        monthlyGoal: newPortfolio.monthlyGoal,
        birthDate: newPortfolio.birthDate,
        besEntryDate: newPortfolio.besEntryDate,
      } as Portfolio]);
      
      console.log('[PORTFOLIO] Added successfully:', newPortfolio);
    } catch (err) {
      console.error("Error adding portfolio:", err);
    }
  };

  const handleUpdatePortfolio = async (id: string, updates: Partial<Portfolio>) => {
    if (!user) return;
    try {
      const updated = await updatePortfolio(id, {
        name: updates.name,
        description: updates.description
      });
      
      // Update portfolio in state
      setPortfolios(prev => prev.map(p => 
        p.id === id ? { ...p, ...updated } : p
      ));
    } catch (err) {
      console.error("Error updating portfolio:", err);
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    if (!user) return;
    try {
      await deletePortfolio(id);
      
      // Remove portfolio from state
      setPortfolios(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error("Error deleting portfolio:", err);
    }
  };

  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      // Profile updates not yet implemented in Supabase helper
      console.log("Profile updates not yet implemented:", updates);
      setProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      console.error("Error updating profile:", err);
    }
  };

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
            {user ? (
              view === 'settings' ? (
                <Settings 
                  profile={profile}
                  onUpdateProfile={handleUpdateProfile}
                  portfolios={portfolios} 
                  onAddPortfolio={handleAddPortfolio} 
                  onUpdatePortfolio={handleUpdatePortfolio}
                  onDeletePortfolio={handleDeletePortfolio} 
                />
              ) : view === 'bes' ? (
                <GovernmentContributionView 
                  portfolios={portfolios}
                  onUpdatePortfolio={handleUpdatePortfolio}
                />
              ) : view === 'passive-income' ? (
                <PassiveIncomeView 
                  portfolios={portfolios}
                />
              ) : (
                <Dashboard view={view} portfolios={portfolios} setView={setView} />
              )
            ) : (
              <LandingPage />
            )}
          </main>
        </div>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

