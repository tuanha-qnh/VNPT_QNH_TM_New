
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Unit, Role, KPIRecord, KPIDefinition } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from 'recharts';
import { Database, RefreshCw, Settings as SettingsIcon, Users, CheckCircle, PieChart as PieChartIcon, AlertOctagon, Download, Filter, Zap, Loader2, Table, Import, CheckSquare, Edit3, Trash2, Plus, X, Save } from 'lucide-react';
import * as XLSX from 'xlsx';
import { dbClient } from '../utils/firebaseClient';

const SORT_ORDER = [
    'VNPT Hạ Long', 
    'VNPT Uông Bí', 
    'VNPT Cẩm Phả', 
    'VNPT Tiên Yên', 
    'VNPT Móng Cái', 
    'VNPT Bãi Cháy', 
    'VNPT Đông Triều', 
    'VNPT Vân Đôn - Cô Tô'
];

interface KPIProps {
  users: User[];
  units: Unit[];
  currentUser: User;
  mode: 'personal' | 'group';
  kpiDefinitions: KPIDefinition[];
  onRefresh: () => void;
}

// Helper function to process Google Sheet URL
const processGoogleSheetUrl = (url: string) => {
    let finalUrl = url.trim();
    if (finalUrl.includes('output=csv') || finalUrl.includes('export?format=csv')) {
        return finalUrl;
    }
    if (finalUrl.includes('/edit')) {
        return finalUrl.split('/edit')[0] + '/export?format=csv';
    }
    if (finalUrl.endsWith('/')) {
        return finalUrl + 'export?format=csv';
    }
    return finalUrl + '/export?format=csv';
};

const KPI: React.FC<KPIProps> = ({ users, units, currentUser, mode, kpiDefinitions, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'eval' | 'config'>('eval'); 
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [filterKey, setFilterKey] = useState<string>('');
  const [kpiRecords, setKpiRecords] = useState<KPIRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [dsConfig, setDsConfig] = useState<any>({ url: "", mapping: {} });
  const [isKpiDefModalOpen, setIsKpiDefModalOpen] = useState(false);
  const [isProcessingDef, setIsProcessingDef] = useState(false);
  const [editingKpiDef, setEditingKpiDef] = useState<Partial<KPIDefinition> | null>(null);

  const isAdmin = currentUser.username === 'admin';
  const myAccessibleUnits = currentUser.accessibleUnitIds || [currentUser.unitId];

  const currentModeKpiDefs = useMemo(() => kpiDefinitions.filter(d => d.type === mode || d.type === 'both'), [kpiDefinitions, mode]);
  
  useEffect(() => { if (currentModeKpiDefs.length > 0 && !filterKey) setFilterKey(currentModeKpiDefs[0].id); }, [currentModeKpiDefs, filterKey]);

  useEffect(() => {
    const loadConfig = async () => {
        const configId = `${mode}_${selectedMonth}`;
        const storedConfig = await dbClient.getById('kpi_configs', configId);
        setDsConfig(storedConfig ? { url: storedConfig.url, mapping: storedConfig.mapping || {} } : { url: "", mapping: {} });
    };
    if (activeTab === 'config' && isAdmin) loadConfig();
  }, [activeTab, selectedMonth, mode, isAdmin]);

  const handleSaveConfig = async () => {
      const configId = `${mode}_${selectedMonth}`;
      await dbClient.upsert('kpi_configs', configId, { period: selectedMonth, type: mode, url: dsConfig.url, mapping: dsConfig.mapping });
      alert(`Đã lưu cấu hình import cho tháng ${selectedMonth}!`);
  };

  const fetchKpis = useCallback(async () => {
    const all = await dbClient.getAll('kpis');
    const filtered = (all as KPIRecord[]).filter(r => {
      if (r.period !== selectedMonth || r.type !== mode) return false;
      if (currentUser.username === 'admin') return true;
      if (mode === 'group') {
          const unit = units.find(u => u.code === r.entityId);
          return unit && myAccessibleUnits.includes(unit.id);
      } else {
          const user = users.find(u => u.hrmCode === r.entityId);
          return user && (user.id === currentUser.id || myAccessibleUnits.includes(user.unitId));
      }
    });
    setKpiRecords(filtered);
  }, [selectedMonth, mode, currentUser, units, users, myAccessibleUnits]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  const handleReadData = async () => {
    if (!dsConfig.url) return; setIsReading(true);
    try {
      const finalUrl = processGoogleSheetUrl(dsConfig.url);
      const res = await fetch(finalUrl); 
      if (!res.ok) throw new Error("Không thể tải file (Kiểm tra quyền truy cập).");
      
      const csv = await res.text(); 
      if (csv.trim().toLowerCase().startsWith('<!doctype html')) throw new Error("Link không đúng định dạng CSV hoặc chưa Public.");
      
      const wb = XLSX.read(csv, { type: 'string' });
      const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (raw.length > 0) { setAvailableColumns(Object.keys(raw[0])); setRawRows(raw); alert(`Đã đọc tiêu đề cột. Thực hiện mapping.`); }
    } catch (e: any) { alert("Lỗi: " + e.message); } finally { setIsReading(false); }
  };

  const handleSync = async () => {
    if (!dsConfig.mapping.id) return alert("Vui lòng thiết lập cột Định danh!");
    setIsSyncing(true);
    try {
      let rowsToProcess = rawRows;
      if (rowsToProcess.length === 0) {
        const finalUrl = processGoogleSheetUrl(dsConfig.url);
        const res = await fetch(finalUrl);
        if (!res.ok) throw new Error("Không thể tải file.");
        
        const csv = await res.text();
        if (csv.trim().toLowerCase().startsWith('<!doctype html')) throw new Error("Link không đúng định dạng CSV.");
        
        const wb = XLSX.read(csv, { type: 'string' });
        rowsToProcess = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      }
      for (const row of rowsToProcess) {
        const entityId = String(row[dsConfig.mapping.id] || '').trim(); if (!entityId) continue;
        const targets: any = {};
        currentModeKpiDefs.forEach(def => {
          targets[def.id] = { target: Number(row[dsConfig.mapping[`${def.id}_t`]] || 0), actual: Number(row[dsConfig.mapping[`${def.id}_a`]] || 0) };
        });
        await dbClient.upsert('kpis', `${mode}_${selectedMonth}_${entityId}`, { period: selectedMonth, entityId, type: mode, targets });
      }
      fetchKpis(); alert(`Đã đồng bộ thành công ${rowsToProcess.length} dòng dữ liệu.`);
    } catch (e: any) { alert("Lỗi khi đồng bộ: " + e.message); } finally { setIsSyncing(false); }
  };

  const handleQuickSync = async () => {
      // Logic for Quick Sync from Eval Tab (Load config from DB then sync)
      const configId = `${mode}_${selectedMonth}`;
      const storedConfig = await dbClient.getById('kpi_configs', configId);
      
      if (!storedConfig || !storedConfig.url || !storedConfig.mapping?.id) {
          alert(`Chưa có cấu hình đồng bộ cho tháng ${selectedMonth}. Vui lòng sang tab Cấu hình (icon Bánh răng) để thiết lập.`);
          return;
      }

      setIsSyncing(true);
      try {
          const finalUrl = processGoogleSheetUrl(storedConfig.url);
          const res = await fetch(finalUrl);
          if (!res.ok) throw new Error("Không thể tải file (Lỗi mạng hoặc quyền truy cập).");
          
          const csv = await res.text();
          if (csv.trim().toLowerCase().startsWith('<!doctype html')) throw new Error("Link Google Sheet chưa được chia sẻ công khai (Public) hoặc sai định dạng.");
          
          const wb = XLSX.read(csv, { type: 'string' });
          const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
          
          for (const row of rows) {
            const entityId = String(row[storedConfig.mapping.id] || '').trim(); if (!entityId) continue;
            const targets: any = {};
            currentModeKpiDefs.forEach(def => {
              targets[def.id] = { 
                  target: Number(row[storedConfig.mapping[`${def.id}_t`]] || 0), 
                  actual: Number(row[storedConfig.mapping[`${def.id}_a`]] || 0) 
              };
            });
            await dbClient.upsert('kpis', `${mode}_${selectedMonth}_${entityId}`, { period: selectedMonth, entityId, type: mode, targets });
          }
          fetchKpis();
          alert(`Đã đồng bộ dữ liệu KPI ${mode === 'group' ? 'Tập thể' : 'Cá nhân'} tháng ${selectedMonth} thành công!`);
      } catch (e: any) {
          alert("Lỗi đồng bộ: " + e.message);
      } finally {
          setIsSyncing(false);
      }
  };

  const chartData = useMemo(() => {
    const data = kpiRecords.map(r => {
      const t = r.targets[filterKey] || { target: 0, actual: 0 };
      const name = mode === 'personal' ? (users.find(u => u.hrmCode === r.entityId)?.fullName || r.entityId) : (units.find(u => u.code === r.entityId)?.name || r.entityId);
      return { name, actual: t.actual, target: t.target, percent: t.target > 0 ? Math.round((t.actual / t.target) * 100) : 0 };
    });
    
    // Sort logic
    data.sort((a, b) => {
        if (mode === 'group') {
             const indexA = SORT_ORDER.indexOf(a.name);
             const indexB = SORT_ORDER.indexOf(b.name);
             
             if (indexA !== -1 && indexB !== -1) return indexA - indexB;
             if (indexA !== -1) return -1;
             if (indexB !== -1) return 1;
             return b.percent - a.percent;
        }
        return b.percent - a.percent;
    });

    const totalTarget = data.reduce((sum, item) => sum + item.target, 0);
    const totalActual = data.reduce((sum, item) => sum + item.actual, 0);
    const totalRow = { name: 'TỔNG CỘNG', target: totalTarget, actual: totalActual, percent: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0 };
    
    return [totalRow, ...data];
  }, [kpiRecords, filterKey, mode, users, units]);
  
  const handleSaveKpiDef = async () => {
    if (!editingKpiDef || !editingKpiDef.id || !editingKpiDef.name || !editingKpiDef.unit) return alert("Thông tin chỉ tiêu là bắt buộc.");
    setIsProcessingDef(true);
    await dbClient.upsert('kpi_definitions', editingKpiDef.id, editingKpiDef);
    setIsKpiDefModalOpen(false); onRefresh(); setIsProcessingDef(false);
  };
  
  const handleDeleteKpiDef = async (id: string) => {
    if (confirm(`Xóa vĩnh viễn KPI "${id}"?`)) { await dbClient.delete('kpi_definitions', id); onRefresh(); }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b pb-6">
        <div><h2 className="text-3xl font-black text-slate-800 tracking-tighter flex items-center gap-3">{mode==='group'?<PieChartIcon size={32}/>:<Users size={32}/>} KPI {mode==='group'?'TẬP THỂ':'CÁ NHÂN'}</h2><input type="month" className="border-2 rounded-2xl px-5 py-2 font-black text-sm bg-slate-50 outline-none mt-3" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}/></div>
        <div className="flex bg-slate-100 p-1.5 rounded-[20px] border"><button onClick={()=>setActiveTab('eval')} className={`px-8 py-2.5 rounded-2xl text-[10px] font-black uppercase ${activeTab==='eval'?'bg-white text-blue-600 shadow-sm':'text-slate-500'}`}>KẾT QUẢ</button>{isAdmin&&<button onClick={()=>setActiveTab('config')} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase ${activeTab==='config'?'bg-white text-blue-600 shadow-sm':'text-slate-500'}`}><SettingsIcon size={18}/></button>}</div>
      </div>
      {activeTab==='eval'?(
        <div className="bg-white rounded-[40px] shadow-sm border overflow-hidden">
            <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-black text-slate-800 text-xs uppercase flex items-center gap-4">BÁO CÁO THÁNG {selectedMonth}<select className="border-2 rounded-xl px-4 py-1.5 text-[10px] font-black text-blue-600 bg-white" value={filterKey} onChange={e=>setFilterKey(e.target.value)}>{currentModeKpiDefs.map(def=><option key={def.id} value={def.id}>{def.name}</option>)}</select></h3>
                <button onClick={handleQuickSync} disabled={isSyncing} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-200 transition-all border">
                    {isSyncing ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>} Đồng bộ dữ liệu
                </button>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="bg-slate-50 text-slate-400 font-black uppercase border-b"><tr><th className="p-5">Đối tượng</th><th className="p-5 text-right">Kế hoạch</th><th className="p-5 text-right">Thực hiện</th><th className="p-5 text-center">Tỷ lệ (%)</th></tr></thead><tbody className="divide-y font-bold">{chartData.map((item,idx)=>(<tr key={idx} className={`transition-all ${item.name==='TỔNG CỘNG'?'bg-blue-50 text-blue-700 font-black':'hover:bg-blue-50/30'}`}><td className="p-5 font-black">{item.name}</td><td className="p-5 text-right font-mono">{item.target.toLocaleString()}</td><td className="p-5 text-right font-mono">{item.actual.toLocaleString()}</td><td className="p-5 text-center"><span className={`px-3 py-1 rounded-lg text-[10px] font-black ${item.percent>=100?'bg-green-100 text-green-700':'bg-red-50 text-red-600'}`}>{item.percent}%</span></td></tr>))}</tbody></table></div>
        </div>
      ):(
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
            <div className="bg-white rounded-[48px] shadow-sm border p-12 space-y-8">
                <div className="flex items-center gap-6 border-b pb-8"><div className="bg-blue-600 p-5 rounded-[32px] text-white"><Database size={40}/></div><div><h3 className="text-2xl font-black uppercase">Cấu hình Import</h3><p className="text-xs font-bold uppercase mt-1">Mode: {mode} - Tháng: {selectedMonth}</p></div></div>
                <div className="space-y-10">
                    <div className="space-y-4"><label className="text-xs font-black uppercase block">1. Link CSV Google Sheet</label><div className="flex gap-4"><input className="flex-1 border-2 p-5 rounded-[24px] bg-slate-50 font-mono text-xs" value={dsConfig.url} onChange={e=>setDsConfig({...dsConfig,url:e.target.value})}/><button onClick={handleReadData} disabled={isReading||!dsConfig.url} className="bg-slate-800 text-white px-8 py-4 rounded-[20px] font-black text-xs uppercase">{isReading?<Loader2 className="animate-spin"/>:<Table size={18}/>} Đọc</button></div></div>
                    {availableColumns.length>0&&(<div className="bg-blue-50 p-10 rounded-[40px] border-2 border-blue-100 space-y-8"><h4 className="text-xs font-black uppercase flex items-center gap-3"><Filter size={18}/> 2. Ánh xạ trường</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 max-h-[400px] overflow-y-auto"><div className="md:col-span-2 space-y-2"><label className="text-[10px] font-black text-blue-400 uppercase">Định danh ({mode==='personal'?'HRM':'Đơn vị'})</label><select className="w-full border-2 p-4 rounded-2xl font-bold text-sm bg-white" value={dsConfig.mapping.id||""} onChange={e=>setDsConfig({...dsConfig,mapping:{...dsConfig.mapping,id:e.target.value}})}><option value="">-- Chọn cột --</option>{availableColumns.map(col=><option key={col} value={col}>{col}</option>)}</select></div>{currentModeKpiDefs.map(def=>(<React.Fragment key={def.id}><div className="space-y-2 bg-white/60 p-4 rounded-2xl"><label className="text-[9px] font-black text-blue-600 uppercase mb-2 block truncate">{def.name} (KH)</label><select className="w-full border p-2 rounded-xl text-xs font-bold" value={dsConfig.mapping[`${def.id}_t`]||""} onChange={e=>setDsConfig({...dsConfig,mapping:{...dsConfig.mapping,[`${def.id}_t`]:e.target.value}})}><option value="">-- Cột KH --</option>{availableColumns.map(col=><option key={col} value={col}>{col}</option>)}</select></div><div className="space-y-2 bg-white/60 p-4 rounded-2xl"><label className="text-[9px] font-black text-green-700 uppercase mb-2 block truncate">{def.name} (TH)</label><select className="w-full border p-2 rounded-xl text-xs font-bold" value={dsConfig.mapping[`${def.id}_a`]||""} onChange={e=>setDsConfig({...dsConfig,mapping:{...dsConfig.mapping,[`${def.id}_a`]:e.target.value}})}><option value="">-- Cột TH --</option>{availableColumns.map(col=><option key={col} value={col}>{col}</option>)}</select></div></React.Fragment>))}</div></div>)}
                    <div className="flex justify-end gap-5"><button onClick={handleSaveConfig} className="px-8 py-4 font-black text-slate-400 uppercase text-xs">Lưu cấu hình</button><button onClick={handleSync} disabled={isSyncing||!dsConfig.mapping.id} className="bg-blue-600 text-white px-12 py-5 rounded-[24px] font-black text-xs uppercase shadow-2xl flex items-center gap-2">{isSyncing?<Loader2 className="animate-spin" size={18}/>:<Import size={18}/>} Đồng bộ dữ liệu</button></div>
                </div>
            </div>
            <div className="bg-white rounded-[48px] shadow-sm border p-12 space-y-8"><div className="flex items-center gap-6 border-b pb-8"><div className="bg-green-600 p-5 rounded-[32px] text-white"><CheckSquare size={40}/></div><div><h3 className="text-2xl font-black uppercase">Quản lý bộ chỉ tiêu</h3><p className="text-xs font-bold uppercase mt-1">Mode: {mode}</p></div></div><div className="space-y-3 max-h-[600px] overflow-y-auto">{currentModeKpiDefs.map(def=>(<div key={def.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border group"><div><span className="font-bold">{def.name}</span><span className="ml-2 text-xs font-mono">({def.id} | {def.unit})</span></div><div className="flex gap-2 opacity-0 group-hover:opacity-100"><button onClick={()=>{setEditingKpiDef(def);setIsKpiDefModalOpen(true)}} className="p-2 hover:bg-white rounded-xl text-blue-600"><Edit3 size={16}/></button><button onClick={()=>handleDeleteKpiDef(def.id)} className="p-2 hover:bg-white rounded-xl text-red-500"><Trash2 size={16}/></button></div></div>))}</div><div className="text-center pt-4 border-t"><button onClick={()=>{setEditingKpiDef({id:'',name:'',type:mode,unit:'TB'});setIsKpiDefModalOpen(true)}} className="bg-green-50 text-green-700 px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 mx-auto hover:bg-green-100"><Plus size={16}/> Thêm chỉ tiêu mới</button></div></div>
        </div>
      )}
      {isKpiDefModalOpen&&editingKpiDef&&(<div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white rounded-[40px] w-full max-w-lg shadow-2xl border"><div className="p-8 border-b bg-slate-50/50 flex justify-between items-center"><h3 className="text-xl font-black uppercase tracking-tight">{editingKpiDef.id&&kpiDefinitions.some(d=>d.id===editingKpiDef.id)?'CẬP NHẬT CHỈ TIÊU':'TẠO CHỈ TIÊU MỚI'}</h3><button onClick={()=>setIsKpiDefModalOpen(false)} className="p-2 hover:bg-red-50 text-slate-400 rounded-full"><X size={24}/></button></div><div className="p-10 space-y-6"><div className="space-y-1.5"><label className="text-[10px] font-black uppercase ml-1">Mã (Key)</label><input className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-mono text-xs disabled:opacity-50" value={editingKpiDef.id||''} onChange={e=>setEditingKpiDef({...editingKpiDef,id:e.target.value.toLowerCase().replace(/\s/g,'_')})} disabled={kpiDefinitions.some(d=>d.id===editingKpiDef.id)}/></div><div className="space-y-1.5"><label>Tên</label><input value={editingKpiDef.name||''} onChange={e=>setEditingKpiDef({...editingKpiDef,name:e.target.value})}/></div><div className="grid grid-cols-2 gap-5"><div className="space-y-1.5"><label>Đơn vị tính</label><input value={editingKpiDef.unit||''} onChange={e=>setEditingKpiDef({...editingKpiDef,unit:e.target.value})}/></div><div className="space-y-1.5"><label>Loại</label><select value={editingKpiDef.type} onChange={e=>setEditingKpiDef({...editingKpiDef,type:e.target.value as any})}><option value="group">Tập thể</option><option value="personal">Cá nhân</option><option value="both">Cả hai</option></select></div></div></div><div className="p-8 border-t bg-slate-50/50 flex justify-end gap-4"><button onClick={()=>setIsKpiDefModalOpen(false)} className="px-8 py-3 text-slate-400 font-black text-xs uppercase">Hủy</button><button onClick={handleSaveKpiDef} disabled={isProcessingDef} className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 flex items-center gap-2">{isProcessingDef?<Loader2 className="animate-spin" size={18}/>:<Save size={18}/>} LƯU</button></div></div></div>)}
    </div>
  );
};

export default KPI;
