import React, { useState, useMemo, useEffect, useContext } from 'react';
import { 
  Shield, 
  TrendingUp, 
  Calendar, 
  User as UserIcon,
  Info,
  Save,
  CheckCircle2
} from 'lucide-react';
import { Portfolio, Asset } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '../lib/utils';
import { getAssetsByUser } from '../lib/api';
import { AuthContext } from '../context';

interface GovernmentContributionViewProps {
  portfolios: Portfolio[];
  onUpdatePortfolio: (id: string, updates: Partial<Portfolio>) => void;
}

export function GovernmentContributionView({ portfolios, onUpdatePortfolio }: GovernmentContributionViewProps) {
  const authContext = useContext(AuthContext);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [tempBirthDate, setTempBirthDate] = useState('');
  const [tempBesEntryDate, setTempBesEntryDate] = useState('');
  const [saveStatus, setSaveStatus] = useState<Record<string, boolean>>({});

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
        } as Asset)));
      } catch (error) {
        console.error("Assets fetch error in BES view:", error);
      }
    };

    loadAssets();
  }, [authContext?.user]);

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

  const besData = useMemo(() => {
    return portfolios.map(p => {
      const portfolioAssets = assets.filter(a => a.portfolioId === p.id && a.type === 'GovernmentContribution');
      const totalRawValue = portfolioAssets.reduce((sum, a) => sum + (a.currentPrice ?? a.purchasePrice) * a.quantity, 0);
      const vestingPercent = calculateVestingPercentage(p.birthDate, p.besEntryDate);
      const vestedValue = totalRawValue * (vestingPercent / 100);

      return {
        ...p,
        assets: portfolioAssets,
        totalRawValue,
        vestingPercent,
        vestedValue,
        unvestedValue: totalRawValue - vestedValue
      };
    }).filter(p => p.assets.length > 0 || p.besEntryDate); // Show if has assets or dates set
  }, [portfolios, assets]);

  const totals = useMemo(() => {
    return besData.reduce((acc, p) => ({
      raw: acc.raw + p.totalRawValue,
      vested: acc.vested + p.vestedValue,
      unvested: acc.unvested + p.unvestedValue
    }), { raw: 0, vested: 0, unvested: 0 });
  }, [besData]);

  const handleSave = async (id: string) => {
    await onUpdatePortfolio(id, {
      birthDate: tempBirthDate || null as any,
      besEntryDate: tempBesEntryDate || null as any
    });
    setEditingPortfolioId(null);
    setSaveStatus({ ...saveStatus, [id]: true });
    setTimeout(() => {
      setSaveStatus(prev => ({ ...prev, [id]: false }));
    }, 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-200 dark:shadow-none">
          <Shield className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Devlet Katkısı (BES)</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Hakediş hesaplamaları ve portföy bazlı yönetim</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-slate-100 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Toplam Devlet Katkısı</p>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(totals.raw)}</h3>
          <p className="text-xs text-slate-400 mt-2">Tüm portföylerdeki toplam tutar</p>
        </Card>
        <Card className="p-6 border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/10">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Hakedilen Tutar</p>
          <h3 className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(totals.vested)}</h3>
          <p className="text-xs text-emerald-500/70 mt-2">Portföy değerine dahil edilen kısım</p>
        </Card>
        <Card className="p-6 border-rose-100 dark:border-rose-900/30 bg-rose-50/10">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider">Bekleyen Tutar</p>
          <h3 className="text-3xl font-bold text-rose-600 dark:text-rose-400 mt-1">{formatCurrency(totals.unvested)}</h3>
          <p className="text-xs text-rose-500/70 mt-2">Hakediş süresi sonunda alınabilecek kısım</p>
        </Card>
      </div>

      {/* Rules Info */}
      <Card className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30 flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-600 mt-0.5" />
        <div className="text-sm text-indigo-900 dark:text-indigo-300">
          <p className="font-bold mb-1">Hakediş Kuralları:</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div><span className="font-bold">0-3 Yıl:</span> %0</div>
            <div><span className="font-bold">3-6 Yıl:</span> %15</div>
            <div><span className="font-bold">6-10 Yıl:</span> %35</div>
            <div><span className="font-bold">10+ Yıl:</span> %60</div>
            <div><span className="font-bold">10 Yıl + 56 Yaş:</span> %100</div>
          </div>
        </div>
      </Card>

      {/* Portfolios List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Portföy Bazlı Detaylar</h3>
        {besData.map(p => (
          <Card key={p.id} className="overflow-hidden border-slate-200 dark:border-slate-800">
            <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
                  <UserIcon className="text-slate-600 dark:text-slate-400 w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-lg">{p.name}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{p.description || 'Açıklama yok'}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-8">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hakediş Oranı</p>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xl font-black",
                      p.vestingPercent === 100 ? "text-emerald-600" : 
                      p.vestingPercent > 0 ? "text-indigo-600" : "text-slate-400"
                    )}>
                      %{p.vestingPercent}
                    </span>
                    <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 transition-all duration-1000" 
                        style={{ width: `${p.vestingPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hakedilen / Toplam</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {formatCurrency(p.vestedValue)} <span className="text-slate-400 font-normal">/ {formatCurrency(p.totalRawValue)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {editingPortfolioId === p.id ? (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Doğum T.</label>
                        <input 
                          type="date"
                          value={tempBirthDate}
                          onChange={(e) => setTempBirthDate(e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Giriş T.</label>
                        <input 
                          type="date"
                          value={tempBesEntryDate}
                          onChange={(e) => setTempBesEntryDate(e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <button 
                        onClick={() => handleSave(p.id)}
                        className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors mt-4"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingPortfolioId(null)}
                        className="p-2 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mt-4"
                      >
                        İptal
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Bilgiler</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {p.birthDate ? new Date(p.birthDate).toLocaleDateString('tr-TR') : '-'} | {p.besEntryDate ? new Date(p.besEntryDate).toLocaleDateString('tr-TR') : '-'}
                        </p>
                      </div>
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => {
                          setEditingPortfolioId(p.id);
                          setTempBirthDate(p.birthDate || '');
                          setTempBesEntryDate(p.besEntryDate || '');
                        }}
                        className="flex items-center gap-2"
                      >
                        <Calendar className="w-4 h-4" />
                        Düzenle
                      </Button>
                      {saveStatus[p.id] && (
                        <span className="text-emerald-600 flex items-center gap-1 text-xs font-bold animate-pulse">
                          <CheckCircle2 className="w-3 h-3" /> Kaydedildi
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Assets sub-table */}
            <div className="bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 px-6 py-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-3 h-3 text-rose-600" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Portföydeki Devlet Katkısı Fonları</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {p.assets.map(asset => {
                  const val = (asset.currentPrice ?? asset.purchasePrice) * asset.quantity;
                  const vestedVal = val * (p.vestingPercent / 100);
                  return (
                    <div key={asset.id} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{asset.symbol}</span>
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded">%{p.vestingPercent}</span>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="text-[10px] text-slate-500">
                          {asset.quantity.toLocaleString()} Adet
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-900 dark:text-white">{formatCurrency(vestedVal)}</div>
                          <div className="text-[9px] text-slate-400">T: {formatCurrency(val)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {p.assets.length === 0 && (
                  <div className="col-span-full text-center py-4 text-xs text-slate-400 italic">
                    Bu portföyde henüz devlet katkısı fonu bulunmuyor.
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {besData.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-800">
            <Shield className="w-16 h-16 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Veri Bulunamadı</h3>
            <p className="text-slate-500 dark:text-slate-400">Devlet katkısı fonu içeren portföyünüz bulunmuyor.</p>
          </div>
        )}
      </div>
    </div>
  );
}
