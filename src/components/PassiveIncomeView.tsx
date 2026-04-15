import React, { useState, useMemo, useEffect, useContext } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Target,
  Info,
  ArrowUpRight,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  DollarSign,
  Briefcase,
  ChevronRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { Portfolio, Asset } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '../lib/utils';
import { getAssetsByUser } from '../lib/api';
import { AuthContext } from '../context';

interface PassiveIncomeViewProps {
  portfolios: Portfolio[];
}

export function PassiveIncomeView({ portfolios }: PassiveIncomeViewProps) {
  const authContext = useContext(AuthContext);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projectionYears, setProjectionYears] = useState(10);
  const [reinvestRate, setReinvestRate] = useState(100); // % of dividends reinvested

  useEffect(() => {
    if (!authContext?.user) {
      setAssets([]);
      return;
    }

    const loadAssets = async () => {
      try {
        const assetsData = await getAssetsByUser(authContext.user.id);
        setAssets(assetsData.map((a: any) => ({
          id: a.id,
          portfolioId: a.portfolioId,
          symbol: a.symbol,
          name: a.name,
          quantity: parseFloat(a.quantity),
          purchasePrice: parseFloat(a.purchasePrice),
          type: a.type,
          currentPrice: a.currentPrice ? parseFloat(a.currentPrice) : undefined,
          dividendYield: a.dividendYield,
          dividendGrowth5Y: a.dividendGrowth5Y,
          dividendGrowth10Y: a.dividendGrowth10Y,
        } as Asset)));
      } catch (error) {
        console.error("Assets fetch error in Passive Income view:", error);
      }
    };

    loadAssets();
  }, [authContext?.user]);

  const stats = useMemo(() => {
    const dividendAssets = assets.filter(a => (a.dividendYield || 0) > 0);
    
    const annualIncome = dividendAssets.reduce((sum, a) => {
      const price = a.currentPrice ?? a.purchasePrice;
      return sum + (price * a.quantity * (a.dividendYield || 0));
    }, 0);

    const totalValue = assets.reduce((sum, a) => sum + (a.currentPrice ?? a.purchasePrice) * a.quantity, 0);
    const portfolioYield = totalValue > 0 ? (annualIncome / totalValue) * 100 : 0;

    // Weighted average dividend growth
    const totalDivIncome = annualIncome;
    const weightedGrowth = totalDivIncome > 0 ? dividendAssets.reduce((sum, a) => {
      const price = a.currentPrice ?? a.purchasePrice;
      const assetIncome = price * a.quantity * (a.dividendYield || 0);
      const growth = a.dividendGrowth5Y || a.dividendGrowth10Y || 0;
      return sum + (assetIncome * growth);
    }, 0) / totalDivIncome : 0;

    const monthlyIncome = annualIncome / 12;
    const totalGoal = portfolios.reduce((sum, p) => sum + (p.monthlyGoal || 0), 0) || 5000; // Default goal if none set
    const progress = (monthlyIncome / totalGoal) * 100;

    return {
      annualIncome,
      monthlyIncome,
      portfolioYield,
      weightedGrowth: weightedGrowth * 100,
      totalGoal,
      progress,
      totalValue,
      dividendAssetsCount: dividendAssets.length
    };
  }, [assets, portfolios]);

  const projectionData = useMemo(() => {
    const data = [];
    let currentAnnualIncome = stats.annualIncome;
    let currentPortfolioValue = stats.totalValue;
    const growthRate = stats.weightedGrowth / 100;
    const yieldRate = stats.portfolioYield / 100;

    for (let i = 0; i <= projectionYears; i++) {
      data.push({
        year: i,
        income: currentAnnualIncome,
        monthly: currentAnnualIncome / 12,
        value: currentPortfolioValue
      });

      // Next year calculations
      const dividendsReceived = currentAnnualIncome;
      const reinvestedAmount = dividendsReceived * (reinvestRate / 100);
      
      // Portfolio value grows by reinvestment + capital appreciation (assumed 5% for simplicity)
      currentPortfolioValue = currentPortfolioValue * 1.05 + reinvestedAmount;
      
      // Income grows by dividend growth rate + yield from reinvested dividends
      currentAnnualIncome = currentAnnualIncome * (1 + growthRate) + (reinvestedAmount * yieldRate);
    }
    return data;
  }, [stats, projectionYears, reinvestRate]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
            <TrendingUp className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pasif Gelir & Finansal Özgürlük</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Temettü verimi ve büyümesi ile gelecek projeksiyonu</p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          {[5, 10, 20, 30].map(y => (
            <button
              key={y}
              onClick={() => setProjectionYears(y)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                projectionYears === y 
                  ? "bg-indigo-600 text-white shadow-md" 
                  : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              {y} Yıl
            </button>
          ))}
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center">
              <DollarSign className="text-emerald-600 dark:text-emerald-400 w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aylık Pasif Gelir</span>
          </div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.monthlyIncome)}</h3>
          <p className="text-xs text-slate-400 mt-2">Yıllık: {formatCurrency(stats.annualIncome)}</p>
        </Card>

        <Card className="p-6 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center">
              <PieChartIcon className="text-blue-600 dark:text-blue-400 w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Portföy Verimi</span>
          </div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">%{stats.portfolioYield.toFixed(2)}</h3>
          <p className="text-xs text-slate-400 mt-2">{stats.dividendAssetsCount} Temettü Varlığı</p>
        </Card>

        <Card className="p-6 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center">
              <ArrowUpRight className="text-purple-600 dark:text-purple-400 w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Temettü Büyümesi</span>
          </div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">%{stats.weightedGrowth.toFixed(2)}</h3>
          <p className="text-xs text-slate-400 mt-2">Ağırlıklı Ortalama (5Y/10Y)</p>
        </Card>

        <Card className="p-6 border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center">
                <Target className="text-indigo-600 dark:text-indigo-400 w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Özgürlük Oranı</span>
            </div>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-1 rounded-lg">
              %{stats.progress.toFixed(1)}
            </span>
          </div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalGoal)}</h3>
          <div className="mt-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-indigo-600 h-full transition-all duration-1000" 
              style={{ width: `${Math.min(stats.progress, 100)}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Projection Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-6 border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <LineChartIcon className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900 dark:text-white">Gelir Projeksiyonu</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-600" />
                <span className="text-xs text-slate-500">Aylık Gelir</span>
              </div>
              <div className="flex items-center gap-4 ml-4">
                <label className="text-xs text-slate-400">Yeniden Yatırım: %{reinvestRate}</label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={reinvestRate} 
                  onChange={(e) => setReinvestRate(parseInt(e.target.value))}
                  className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="year" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  label={{ value: 'Yıl', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 10 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(val) => `₺${(val/1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: 'none', 
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Aylık Gelir']}
                  labelFormatter={(label) => `${label}. Yıl`}
                />
                <Area 
                  type="monotone" 
                  dataKey="monthly" 
                  stroke="#4f46e5" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorIncome)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 border-slate-100 dark:border-slate-800 h-full">
            <h3 className="font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-600" />
              En Yüksek Verimli Varlıklar
            </h3>
            <div className="space-y-4">
              {assets
                .filter(a => (a.dividendYield || 0) > 0)
                .sort((a, b) => (b.dividendYield || 0) - (a.dividendYield || 0))
                .slice(0, 6)
                .map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center font-bold text-[10px] text-indigo-600 shadow-sm">
                        {asset.symbol.substring(0, 3)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{asset.symbol}</p>
                        <p className="text-[10px] text-slate-400">%{((asset.dividendYield || 0) * 100).toFixed(2)} Verim</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-emerald-600">
                        {formatCurrency(((asset.currentPrice ?? asset.purchasePrice) * asset.quantity * (asset.dividendYield || 0)) / 12)}
                      </p>
                      <p className="text-[9px] text-slate-400">Aylık</p>
                    </div>
                  </div>
                ))}
            </div>
            {assets.filter(a => (a.dividendYield || 0) > 0).length === 0 && (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400 italic text-sm text-center">
                <Info className="w-8 h-8 mb-2 opacity-20" />
                Henüz temettü verisi olan<br/>varlık bulunmuyor.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Detailed Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-6 border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-indigo-600" />
            Finansal Özgürlük Analizi
          </h3>
          <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>
              Şu anki aylık pasif geliriniz <strong>{formatCurrency(stats.monthlyIncome)}</strong>. 
              Hedeflediğiniz <strong>{formatCurrency(stats.totalGoal)}</strong> tutarına ulaşmak için yolun 
              <strong> %{stats.progress.toFixed(1)}</strong> kısmını tamamladınız.
            </p>
            <p>
              Portföyünüzün ağırlıklı temettü büyüme oranı <strong>%{stats.weightedGrowth.toFixed(2)}</strong>. 
              Bu oran, şirketlerinizin her yıl temettülerini ne kadar artırdığını gösterir.
            </p>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
              <p className="text-indigo-900 dark:text-indigo-300 font-medium">
                İpucu: Temettü büyüme oranı enflasyonun üzerindeyse, alım gücünüz zamanla artacaktır.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Gelecek Tahmini
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 border-b border-slate-50 dark:border-slate-800">
              <span className="text-sm text-slate-500">5 Yıl Sonra (Tahmini)</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(projectionData[Math.min(5, projectionYears)]?.monthly || 0)} / Ay</span>
            </div>
            <div className="flex justify-between items-center p-3 border-b border-slate-50 dark:border-slate-800">
              <span className="text-sm text-slate-500">10 Yıl Sonra (Tahmini)</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(projectionData[Math.min(10, projectionYears)]?.monthly || 0)} / Ay</span>
            </div>
            <div className="flex justify-between items-center p-3">
              <span className="text-sm text-slate-500">Hedefe Kalan Süre</span>
              <span className="font-bold text-indigo-600">
                {projectionData.find(d => d.monthly >= stats.totalGoal)?.year ?? '>30'} Yıl
              </span>
            </div>
            <p className="text-[10px] text-slate-400 italic mt-4">
              * Bu hesaplamalar temettü büyümesi ve yeniden yatırım varsayımlarına dayanmaktadır. Piyasa koşulları değişkenlik gösterebilir.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
