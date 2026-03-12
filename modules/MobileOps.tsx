
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { User, Unit } from '../types';
import { Smartphone, TrendingUp, Settings, Loader2, Table, Save, Import, RefreshCw, Briefcase, Award, ArrowUpRight, ArrowDownRight, TrendingDown, Filter, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { dbClient } from '../utils/firebaseClient';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, LabelList, CartesianGrid, Legend, ReferenceLine, Cell } from 'recharts';

interface MobileOpsConfig {
  id: string; 
  type: 'subscribers' | 'revenue' | 'productivity' | 'quality';
  period: string; 
  url: string;
  mapping?: {
    unitCodeCol?: string;
    targetCol?: string; 
    actualCol?: string; 
    g1Col?: string;
    g2Col?: string; 
    g3Col?: string; 
    g4Col?: string; 
    g1DiffCol?: string; 
    g2DiffCol?: string;
    g3DiffCol?: string;
    g4DiffCol?: string;
    // Quality Fields
    psslCol?: string;
    subProdCol?: string;
    revProdCol?: string;
  };
  targets?: {
      pssl?: number;
      subProd?: number;
      revProd?: number;
  }
}

interface MobileOpsProps {
  currentUser: User;
  units: Unit[];
  systemSettings: any;
  onRefresh: () => void;
}

interface MobileKpiViewProps {
    type: 'subscribers' | 'revenue';
    title: string;
    currentUser: User;
    units: Unit[];
    systemSettings: any;
    onRefreshParent: () => void;
}

interface ProductivityViewProps {
    currentUser: User;
    units: Unit[];
    systemSettings: any;
}

interface QualityViewProps {
    currentUser: User;
    units: Unit[];
    systemSettings: any;
}

interface MappingSelectProps {
    label: string;
    columns: string[];
    value: string;
    onChange: (value: string) => void;
}

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

// Helper to fetch and validate CSV
const fetchAndValidateCsv = async (url: string) => {
    const finalUrl = processGoogleSheetUrl(url);
    const res = await fetch(finalUrl);
    if (!res.ok) throw new Error("Không thể tải file (Lỗi mạng hoặc URL chưa Public).");
    
    const csv = await res.text();
    if (csv.trim().toLowerCase().startsWith('<!doctype html') || csv.includes('<html')) {
        throw new Error("Link không đúng định dạng CSV hoặc chưa được chia sẻ công khai (Public). Vui lòng kiểm tra lại quyền truy cập.");
    }
    return csv;
};

const MappingSelect: React.FC<MappingSelectProps> = ({label, columns, value, onChange}) => (
    <div>
        <label className="text-[10px] font-bold text-slate-500">{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full border p-2 rounded-md mt-1 text-xs">
            <option value="">-- Chọn cột --</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
    </div>
);

const MobileKpiView: React.FC<MobileKpiViewProps> = ({ type, title, currentUser, units, systemSettings, onRefreshParent }) => {
    const [activeTab, setActiveTab] = useState('eval');
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [config, setConfig] = useState<Partial<MobileOpsConfig>>({});
    const [importedData, setImportedData] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sheetColumns, setSheetColumns] = useState<string[]>([]);

    const isAdmin = currentUser.username === 'admin';

    const fetchData = useCallback(async () => {
        setIsLoadingData(true);
        const configId = `${type}_${selectedMonth}`;
        const dataId = `${type}_${selectedMonth}`;
        
        const [configData, importedResult] = await Promise.all([
            dbClient.getById('mobile_ops_configs', configId),
            dbClient.getById('mobile_ops_data', dataId)
        ]);

        setConfig(configData || { type, period: selectedMonth, url: '', mapping: {} });
        setImportedData(importedResult?.data || []);
        setIsLoadingData(false);
    }, [type, selectedMonth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const chartData = useMemo(() => {
        if (!config.mapping || !config.mapping.unitCodeCol || importedData.length === 0) return [];
        const { unitCodeCol, targetCol, actualCol } = config.mapping;
        
        const data = units
            .filter(u => u.level > 0)
            .map(unit => {
                const row = importedData.find(d => String(d[unitCodeCol!]) === String(unit.code));
                const target = Number(row?.[targetCol!] || 0);
                const actual = Number(row?.[actualCol!] || 0);
                const percent = target > 0 ? Math.round((actual / target) * 100) : 0;
                return {
                    name: unit.name,
                    target,
                    actual,
                    percent,
                };
            })
            .filter(d => d.target > 0 || d.actual > 0);

        return data.sort((a, b) => {
            const indexA = SORT_ORDER.indexOf(a.name);
            const indexB = SORT_ORDER.indexOf(b.name);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.name.localeCompare(b.name);
        });

    }, [units, importedData, config]);
    
    // Tự động phân tích dữ liệu
    const analysisText = useMemo(() => {
        if (chartData.length === 0) return null;
        
        const excellent = chartData.filter(d => d.percent >= 100).map(d => d.name);
        const near = chartData.filter(d => d.percent >= 90 && d.percent < 100).map(d => d.name);
        const bad = chartData.filter(d => d.percent < 90).map(d => d.name);
        
        return { excellent, near, bad };
    }, [chartData]);

    const barColors = type === 'revenue' 
        ? { percent: '#3B82F6', actual: '#F97316', label: '#000000' } 
        : { percent: '#EAB308', actual: '#0068FF', label: '#000000' };

    const handleReadSheet = async () => {
        if (!config.url) return alert("Vui lòng nhập URL Google Sheet.");
        setIsProcessing(true);
        try {
            const csv = await fetchAndValidateCsv(config.url);
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if (rows.length > 0) {
                setSheetColumns(Object.keys(rows[0]));
                alert("Đã đọc thành công các cột. Vui lòng ánh xạ.");
            } else {
                alert("File rỗng hoặc không có dữ liệu.");
            }
        } catch (e: any) {
            alert("Lỗi đọc file: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleSaveConfig = async () => {
        const configId = `${type}_${selectedMonth}`;
        await dbClient.upsert('mobile_ops_configs', configId, { ...config, id: configId, type, period: selectedMonth });
        alert("Đã lưu cấu hình!");
    };

    const handleSyncData = async () => {
        if (!config.url || !config.mapping?.unitCodeCol) return alert("Vui lòng nhập URL và ánh xạ cột Mã đơn vị.");
        setIsProcessing(true);
        try {
            const csv = await fetchAndValidateCsv(config.url);
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            
            const dataId = `${type}_${selectedMonth}`;
            await dbClient.upsert('mobile_ops_data', dataId, { data: rows });
            setImportedData(rows);
            alert(`Đồng bộ thành công ${rows.length} dòng dữ liệu.`);
            setActiveTab('eval');
        } catch (e: any) {
            alert("Lỗi đồng bộ dữ liệu: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleQuickSync = async () => {
        if (!isAdmin && !systemSettings?.allowKpiSync) {
            alert("Chức năng đồng bộ đang bị khóa bởi Quản trị viên.");
            return;
        }

        let targetMonth = new Date().toISOString().slice(0, 7);
        if (isAdmin) {
            const input = prompt("Nhập tháng muốn đồng bộ (YYYY-MM):", selectedMonth);
            if (!input) return;
            if (!/^\d{4}-\d{2}$/.test(input)) return alert("Tháng không hợp lệ.");
            targetMonth = input;
        }

        setIsProcessing(true);
        try {
            const configId = `${type}_${targetMonth}`;
            const configData = await dbClient.getById('mobile_ops_configs', configId);

            if (!configData || !configData.url || !configData.mapping?.unitCodeCol) {
                alert(`Không tìm thấy cấu hình đồng bộ cho tháng ${targetMonth}.`);
                setIsProcessing(false);
                return;
            }

            const csv = await fetchAndValidateCsv(configData.url);
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            
            const dataId = `${type}_${targetMonth}`;
            await dbClient.upsert('mobile_ops_data', dataId, { data: rows });
            
            alert(`Đồng bộ thành công dữ liệu tháng ${targetMonth}!`);
            
            if (targetMonth === selectedMonth) {
                fetchData();
            } else if (isAdmin) {
                setSelectedMonth(targetMonth);
            }

        } catch (e: any) {
            alert("Lỗi đồng bộ: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-[40px] shadow-sm border space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center border-b pb-4">
                <h3 className={`text-lg font-black tracking-tighter uppercase ${type === 'revenue' ? 'text-orange-600' : 'text-slate-800'}`}>{title}</h3>
                <div className="flex items-center gap-2">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border-2 rounded-xl px-2 py-1.5 font-bold text-[10px] bg-slate-50 outline-none w-28"/>
                    <button onClick={handleQuickSync} disabled={isProcessing} className="bg-slate-100 text-slate-600 p-1.5 rounded-xl border hover:bg-slate-200 transition-colors" title="Đồng bộ dữ liệu">
                        {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>}
                    </button>
                    {isAdmin && (
                        <div className="flex bg-slate-100 p-1 rounded-xl border ml-2">
                             <button onClick={() => setActiveTab('eval')} className={`p-1.5 rounded-lg text-[10px] font-black ${activeTab === 'eval' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`} title="Xem biểu đồ"><TrendingUp size={14}/></button>
                             <button onClick={() => setActiveTab('config')} className={`p-1.5 rounded-lg text-[10px] font-black ${activeTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`} title="Cấu hình"><Settings size={14}/></button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-[350px]">
                {activeTab === 'eval' ? (
                    isLoadingData ? <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={32}/></div> :
                    <div className="h-full w-full flex flex-col gap-4">
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 30, right: 0, left: 0, bottom: 5 }}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.5} />
                                    <XAxis dataKey="name" interval={0} tick={{ fontSize: 9, fontWeight: 'bold' }} angle={-45} textAnchor="end" height={80} />
                                    <YAxis yAxisId="left" tick={{fontSize: 10}} />
                                    <YAxis yAxisId="right" orientation="right" domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} tick={{fontSize: 10}} />
                                    
                                    <Tooltip content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl text-xs min-w-[180px] z-50">
                                                    <p className="font-black text-slate-800 text-sm mb-2 border-b pb-2">{label}</p>
                                                    <div className="flex justify-between items-center gap-4 mb-1">
                                                        <span className="text-slate-500 font-bold">Kế hoạch giao:</span>
                                                        <span className="font-black text-slate-700">{data.target.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-4 mb-1">
                                                        <span className="text-slate-500 font-bold">Kết quả thực hiện:</span>
                                                        <span className={`font-black ${type === 'revenue' ? 'text-orange-500' : 'text-blue-600'}`}>{data.actual.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-4">
                                                        <span className="text-slate-500 font-bold">Tỷ lệ thực hiện:</span>
                                                        <span className={`font-black ${type === 'revenue' ? 'text-blue-600' : 'text-yellow-600'}`}>{data.percent}%</span>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }} cursor={{fill: 'transparent'}} />

                                    <Legend verticalAlign="top" align="center" wrapperStyle={{ paddingBottom: '10px', fontWeight: 'bold', fontSize: '11px' }} formatter={(value) => <span style={{ color: '#000000' }}>{value}</span>} />
                                    <Bar yAxisId="right" dataKey="percent" fill={barColors.percent} name="Tỷ lệ thực hiện (%)"><LabelList dataKey="percent" position="top" formatter={(val: number) => val > 0 ? `${val}%` : ''} style={{ fontSize: '10px', fontWeight: 'bold', fill: '#000' }} /></Bar>
                                    <Bar yAxisId="left" dataKey="actual" fill={barColors.actual} name="Kết quả thực hiện"><LabelList dataKey="actual" position="top" formatter={(val: number) => val > 0 ? val.toLocaleString() : ''} style={{ fontSize: '10px', fontWeight: 'bold', fill: '#000' }} /></Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        {analysisText && (
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-2 text-xs md:text-sm">
                                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2 uppercase tracking-wide"><Briefcase size={16}/> Chuyên gia đánh giá ({selectedMonth}):</h4>
                                <ul className="space-y-1.5 list-none text-slate-600 leading-relaxed text-justify">
                                    {analysisText.excellent.length > 0 && (
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0"/>
                                            <span>
                                                <strong className="text-green-700">Làm rất tốt:</strong> Các đơn vị <strong className="text-slate-800">{analysisText.excellent.join(', ')}</strong> đã hoàn thành xuất sắc kế hoạch, tiếp tục duy trì đà tăng trưởng.
                                            </span>
                                        </li>
                                    )}
                                    {analysisText.near.length > 0 && (
                                        <li className="flex items-start gap-2">
                                            <TrendingUp size={16} className="text-blue-600 mt-0.5 shrink-0"/>
                                            <span>
                                                <strong className="text-blue-700">Sắp về đích:</strong> Các đơn vị <strong className="text-slate-800">{analysisText.near.join(', ')}</strong> đang bám sát mục tiêu, cần tập trung đẩy mạnh thêm một chút là hoàn thành kế hoạch.
                                            </span>
                                        </li>
                                    )}
                                    {analysisText.bad.length > 0 && (
                                        <li className="flex items-start gap-2">
                                            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0"/>
                                            <span>
                                                <strong className="text-red-600">Cần cố gắng:</strong> Các đơn vị <strong className="text-slate-800">{analysisText.bad.join(', ')}</strong> hiện đang thấp hơn mức kỳ vọng, cần có giải pháp đột phá để cải thiện kết quả.
                                            </span>
                                        </li>
                                    )}
                                    {chartData.length > 0 && analysisText.excellent.length === 0 && analysisText.near.length === 0 && (
                                        <li className="italic text-slate-500">Chưa có đơn vị nào đạt mức hoàn thành kế hoạch trong tháng này.</li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in p-6 bg-slate-50 rounded-2xl border h-full overflow-y-auto">
                        <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">1. Link Google Sheet (CSV)</label><div className="flex gap-2"><input value={config.url || ''} onChange={e => setConfig({...config, url: e.target.value})} className="w-full border-2 p-3 rounded-xl bg-white font-mono text-xs"/><button onClick={handleReadSheet} disabled={isProcessing} className="bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50">{isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Table size={14}/>} Đọc</button></div></div>
                        {sheetColumns.length > 0 && (<div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">2. Ánh xạ cột</label><div className="grid grid-cols-1 gap-4 bg-white p-4 rounded-xl border"><MappingSelect label="Cột Mã Đơn vị" columns={sheetColumns} value={config.mapping?.unitCodeCol || ''} onChange={(v: string) => setConfig({...config, mapping: {...config.mapping, unitCodeCol: v}})} /><MappingSelect label="Cột Kế hoạch" columns={sheetColumns} value={config.mapping?.targetCol || ''} onChange={(v: string) => setConfig({...config, mapping: {...config.mapping, targetCol: v}})} /><MappingSelect label="Cột Thực hiện" columns={sheetColumns} value={config.mapping?.actualCol || ''} onChange={(v: string) => setConfig({...config, mapping: {...config.mapping, actualCol: v}})} /></div></div>)}
                        <div className="flex justify-end gap-3 pt-4 border-t"><button onClick={handleSaveConfig} className="bg-slate-200 text-slate-700 px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2"><Save size={14}/> Lưu</button><button onClick={handleSyncData} disabled={isProcessing} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2"><Import size={14}/> Đồng bộ</button></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const QualityView: React.FC<QualityViewProps> = ({ currentUser, units, systemSettings }) => {
    const [activeTab, setActiveTab] = useState('eval');
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [config, setConfig] = useState<Partial<MobileOpsConfig>>({});
    const [importedData, setImportedData] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sheetColumns, setSheetColumns] = useState<string[]>([]);

    const isAdmin = currentUser.username === 'admin';

    // Defaults
    const TARGET_PSSL = config.targets?.pssl || 90;
    const TARGET_SUB = config.targets?.subProd || 35;
    const TARGET_REV = config.targets?.revProd || 13.5;

    const fetchData = useCallback(async () => {
        setIsLoadingData(true);
        const configId = `quality_${selectedMonth}`;
        const dataId = `quality_${selectedMonth}`;
        
        const [configData, importedResult] = await Promise.all([
            dbClient.getById('mobile_ops_configs', configId),
            dbClient.getById('mobile_ops_data', dataId)
        ]);

        setConfig(configData || { type: 'quality', period: selectedMonth, url: '', mapping: {}, targets: { pssl: 90, subProd: 35, revProd: 13.5 } });
        setImportedData(importedResult?.data || []);
        setIsLoadingData(false);
    }, [selectedMonth]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const processedData = useMemo(() => {
        if (!config.mapping?.unitCodeCol || importedData.length === 0) return { psslData: [], subData: [], revData: [], evaluation: '' };
        const { unitCodeCol, psslCol, subProdCol, revProdCol } = config.mapping;

        const baseData = units
            .filter(u => u.level > 0)
            .map(unit => {
                const row = importedData.find(d => String(d[unitCodeCol!]) === String(unit.code));
                return {
                    name: unit.name,
                    pssl: Number(row?.[psslCol!] || 0),
                    sub: Number(row?.[subProdCol!] || 0),
                    rev: Number(row?.[revProdCol!] || 0),
                };
            })
            .filter(d => d.pssl > 0 || d.sub > 0 || d.rev > 0);

        // Sort Descending for charts
        const psslData = [...baseData].sort((a,b) => b.pssl - a.pssl);
        const subData = [...baseData].sort((a,b) => b.sub - a.sub);
        const revData = [...baseData].sort((a,b) => b.rev - a.rev);

        // Evaluation Text Generation
        const failedPSSL = psslData.filter(d => d.pssl < TARGET_PSSL).map(d => d.name).join(", ");
        const failedSub = subData.filter(d => d.sub < TARGET_SUB).map(d => d.name).join(", ");
        const failedRev = revData.filter(d => d.rev < TARGET_REV).map(d => d.name).join(", ");
        const bestUnit = psslData.length > 0 ? psslData[0].name : "N/A";

        let evalText = `Dựa trên số liệu tháng ${selectedMonth}, đơn vị dẫn đầu về chất lượng PSSL là ${bestUnit}. `;
        if (failedPSSL) evalText += `\n- Các đơn vị chưa đạt mục tiêu PSSL (${TARGET_PSSL}%): ${failedPSSL}. `;
        else evalText += `\n- Tất cả các đơn vị đều đạt mục tiêu PSSL. `;
        
        if (failedSub) evalText += `\n- Về năng suất PTTB, các đơn vị cần cải thiện (dưới ${TARGET_SUB} TB): ${failedSub}. `;
        if (failedRev) evalText += `\n- Về năng suất Doanh thu, các đơn vị chưa đạt mốc ${TARGET_REV} Tr.đ gồm: ${failedRev}.`;

        return { psslData, subData, revData, evaluation: evalText };

    }, [units, importedData, config, TARGET_PSSL, TARGET_SUB, TARGET_REV, selectedMonth]);

    const handleReadSheet = async () => {
        if (!config.url) return alert("Vui lòng nhập URL Google Sheet.");
        setIsProcessing(true);
        try {
            const csv = await fetchAndValidateCsv(config.url);
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if (rows.length > 0) { setSheetColumns(Object.keys(rows[0])); alert("Đã đọc tiêu đề cột."); }
        } catch (e: any) { alert("Lỗi đọc file: " + e.message); } finally { setIsProcessing(false); }
    };

    const handleSaveConfig = async () => {
        const configId = `quality_${selectedMonth}`;
        await dbClient.upsert('mobile_ops_configs', configId, { ...config, id: configId, type: 'quality', period: selectedMonth });
        alert("Đã lưu cấu hình!");
    };

    const handleSyncData = async () => {
        if (!config.url || !config.mapping?.unitCodeCol) return alert("Chưa cấu hình ánh xạ.");
        setIsProcessing(true);
        try {
            const csv = await fetchAndValidateCsv(config.url);
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            await dbClient.upsert('mobile_ops_data', `quality_${selectedMonth}`, { data: rows });
            setImportedData(rows); alert(`Đồng bộ ${rows.length} dòng thành công.`); setActiveTab('eval');
        } catch (e: any) { alert("Lỗi: " + e.message); } finally { setIsProcessing(false); }
    };

    return (
        <div className="bg-white p-6 rounded-[40px] shadow-sm border space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center border-b pb-4">
                <h3 className="text-lg font-black tracking-tighter uppercase text-purple-700">Chất lượng kênh nội bộ</h3>
                <div className="flex items-center gap-2">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border-2 rounded-xl px-2 py-1.5 font-bold text-[10px] bg-slate-50 outline-none w-28"/>
                    {isAdmin && (<div className="flex bg-slate-100 p-1 rounded-xl border ml-2"><button onClick={() => setActiveTab('eval')} className={`p-1.5 rounded-lg text-[10px] ${activeTab === 'eval' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><TrendingUp size={14}/></button><button onClick={() => setActiveTab('config')} className={`p-1.5 rounded-lg text-[10px] ${activeTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Settings size={14}/></button></div>)}
                </div>
            </div>

            <div className="flex-1 min-h-[400px]">
                {activeTab === 'eval' ? (
                     isLoadingData ? <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-purple-600"/></div> :
                     <div className="flex flex-col gap-6 h-full">
                         {/* Charts Area */}
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-[300px]">
                             {/* Chart 1: PSSL Rate (Vertical) */}
                             <div className="bg-slate-50 rounded-2xl p-4 border flex flex-col h-full">
                                 <h4 className="text-xs font-black text-slate-700 mb-2 text-center uppercase">Tỷ lệ nhân viên PSSL</h4>
                                 <div className="flex-1 min-h-[250px]">
                                     <ResponsiveContainer width="100%" height="100%">
                                         <BarChart data={processedData.psslData} margin={{ top: 20, right: 5, left: -20, bottom: 5 }}>
                                             <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
                                             <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                                             <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                                             <Tooltip contentStyle={{fontSize: '10px'}} cursor={{fill: 'transparent'}} />
                                             <ReferenceLine y={TARGET_PSSL} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: `Mục tiêu: ${TARGET_PSSL}%`, fontSize: 9, fill: 'red' }} />
                                             <Bar dataKey="pssl" barSize={20} fill="#1359ea">
                                                <LabelList dataKey="pssl" position="top" fontSize={9} fontWeight="bold" formatter={(v:any)=>`${v}%`} />
                                             </Bar>
                                         </BarChart>
                                     </ResponsiveContainer>
                                 </div>
                             </div>

                             {/* Chart 2: Subscriber Productivity (Vertical) */}
                             <div className="bg-slate-50 rounded-2xl p-4 border flex flex-col h-full">
                                 <h4 className="text-xs font-black text-slate-700 mb-2 text-center uppercase">Năng suất PTTB BQ</h4>
                                 <div className="flex-1 min-h-[250px]">
                                     <ResponsiveContainer width="100%" height="100%">
                                         <BarChart data={processedData.subData} margin={{ top: 20, right: 5, left: -20, bottom: 5 }}>
                                             <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
                                             <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                                             <YAxis tick={{ fontSize: 10 }} />
                                             <Tooltip contentStyle={{fontSize: '10px'}} cursor={{fill: 'transparent'}} />
                                             <ReferenceLine y={TARGET_SUB} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: `Mục tiêu: ${TARGET_SUB}`, fontSize: 9, fill: 'red' }} />
                                             <Bar dataKey="sub" barSize={20}>
                                                 <LabelList dataKey="sub" position="top" fontSize={9} fontWeight="bold" />
                                                 {processedData.subData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.sub >= TARGET_SUB ? '#3b82f6' : '#f97316'} />
                                                ))}
                                             </Bar>
                                         </BarChart>
                                     </ResponsiveContainer>
                                 </div>
                             </div>

                             {/* Chart 3: Revenue Productivity (Vertical) */}
                             <div className="bg-slate-50 rounded-2xl p-4 border flex flex-col h-full">
                                 <h4 className="text-xs font-black text-slate-700 mb-2 text-center uppercase">Năng suất DT PTM BQ</h4>
                                 <div className="flex-1 min-h-[250px]">
                                     <ResponsiveContainer width="100%" height="100%">
                                         <BarChart data={processedData.revData} margin={{ top: 20, right: 5, left: -20, bottom: 5 }}>
                                             <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
                                             <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                                             <YAxis tick={{ fontSize: 10 }} />
                                             <Tooltip contentStyle={{fontSize: '10px'}} cursor={{fill: 'transparent'}} />
                                             <ReferenceLine y={TARGET_REV} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: `Mục tiêu: ${TARGET_REV}`, fontSize: 9, fill: 'red' }} />
                                             <Bar dataKey="rev" barSize={20}>
                                                 <LabelList dataKey="rev" position="top" fontSize={9} fontWeight="bold" />
                                                 {processedData.revData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.rev >= TARGET_REV ? '#8b5cf6' : '#f43f5e'} />
                                                ))}
                                             </Bar>
                                         </BarChart>
                                     </ResponsiveContainer>
                                 </div>
                             </div>
                         </div>
                         
                         {/* Analysis Text Area */}
                         <div className="bg-purple-50 rounded-2xl p-6 border border-purple-100 flex flex-col shrink-0">
                             <div className="flex items-center gap-2 text-purple-700 font-bold text-sm mb-4 border-b border-purple-200 pb-2">
                                 <ShieldCheck size={18}/> ĐÁNH GIÁ THỰC TRẠNG
                             </div>
                             <div className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line text-justify">
                                 {processedData.evaluation}
                             </div>
                             <div className="mt-4 pt-4 border-t border-purple-200">
                                 <h5 className="text-[10px] font-black uppercase text-slate-500 mb-2">Mục tiêu điều hành:</h5>
                                 <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-600">
                                     <div className="flex gap-2"><span>Tỷ lệ PSSL:</span> <span className="text-purple-700">{TARGET_PSSL}%</span></div>
                                     <div className="flex gap-2"><span>NS PTTB:</span> <span className="text-purple-700">{TARGET_SUB} TB</span></div>
                                     <div className="flex gap-2"><span>NS Doanh thu:</span> <span className="text-purple-700">{TARGET_REV} Tr.đ</span></div>
                                 </div>
                             </div>
                         </div>
                     </div>
                ) : (
                    <div className="space-y-6 animate-fade-in p-6 bg-slate-50 rounded-2xl border h-full overflow-y-auto">
                        <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">1. Link Google Sheet (CSV)</label><div className="flex gap-2"><input value={config.url || ''} onChange={e => setConfig({...config, url: e.target.value})} className="w-full border-2 p-3 rounded-xl bg-white font-mono text-xs"/><button onClick={handleReadSheet} disabled={isProcessing} className="bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50">{isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Table size={14}/>} Đọc</button></div></div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-4 col-span-2">
                                {sheetColumns.length > 0 && (<div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">2. Ánh xạ dữ liệu</label><div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border"><MappingSelect label="Cột Mã Đơn vị" columns={sheetColumns} value={config.mapping?.unitCodeCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, unitCodeCol: v}})} /><MappingSelect label="Cột Tỷ lệ PSSL (%)" columns={sheetColumns} value={config.mapping?.psslCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, psslCol: v}})} /><MappingSelect label="Cột NS PTTB (TB)" columns={sheetColumns} value={config.mapping?.subProdCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, subProdCol: v}})} /><MappingSelect label="Cột NS Doanh thu (Tr.đ)" columns={sheetColumns} value={config.mapping?.revProdCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, revProdCol: v}})} /></div></div>)}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-purple-600">3. Mục tiêu điều hành</label>
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-3">
                                    <div><label className="text-[10px] font-bold text-slate-500">Mục tiêu PSSL (%)</label><input type="number" className="w-full border p-2 rounded-md mt-1 font-bold text-sm" value={config.targets?.pssl || 90} onChange={e => setConfig({...config, targets: {...config.targets, pssl: Number(e.target.value)}})} /></div>
                                    <div><label className="text-[10px] font-bold text-slate-500">Mục tiêu NS PTTB</label><input type="number" className="w-full border p-2 rounded-md mt-1 font-bold text-sm" value={config.targets?.subProd || 35} onChange={e => setConfig({...config, targets: {...config.targets, subProd: Number(e.target.value)}})} /></div>
                                    <div><label className="text-[10px] font-bold text-slate-500">Mục tiêu NS Doanh thu</label><input type="number" className="w-full border p-2 rounded-md mt-1 font-bold text-sm" value={config.targets?.revProd || 13.5} onChange={e => setConfig({...config, targets: {...config.targets, revProd: Number(e.target.value)}})} /></div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t"><button onClick={handleSaveConfig} className="bg-slate-200 text-slate-700 px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2"><Save size={14}/> Lưu</button><button onClick={handleSyncData} disabled={isProcessing} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2"><Import size={14}/> Đồng bộ</button></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ProductivityView: React.FC<ProductivityViewProps> = ({ currentUser, units, systemSettings }) => {
    const [activeTab, setActiveTab] = useState('eval');
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [config, setConfig] = useState<Partial<MobileOpsConfig>>({});
    const [importedData, setImportedData] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sheetColumns, setSheetColumns] = useState<string[]>([]);
    const [analysisUnit, setAnalysisUnit] = useState('all');

    const isAdmin = currentUser.username === 'admin';

    const fetchData = useCallback(async () => {
        setIsLoadingData(true);
        const configId = `productivity_${selectedMonth}`;
        const dataId = `productivity_${selectedMonth}`;
        
        const [configData, importedResult] = await Promise.all([
            dbClient.getById('mobile_ops_configs', configId),
            dbClient.getById('mobile_ops_data', dataId)
        ]);

        setConfig(configData || { type: 'productivity', period: selectedMonth, url: '', mapping: {} });
        setImportedData(importedResult?.data || []);
        setIsLoadingData(false);
    }, [selectedMonth]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const { chartData, analysis } = useMemo(() => {
        if (!config.mapping || !config.mapping.unitCodeCol || importedData.length === 0) return { chartData: [], analysis: null };
        const { unitCodeCol, g1Col, g2Col, g3Col, g4Col, g1DiffCol, g2DiffCol, g3DiffCol, g4DiffCol } = config.mapping;
        
        const data = units
            .filter(u => u.level > 0)
            .map(unit => {
                const row = importedData.find(d => String(d[unitCodeCol!]) === String(unit.code));
                
                const g1 = Number(row?.[g1Col!] || 0); // < 5tr
                const g2 = Number(row?.[g2Col!] || 0); // 5-10tr
                const g3 = Number(row?.[g3Col!] || 0); // 10-15tr
                const g4 = Number(row?.[g4Col!] || 0); // > 15tr
                
                const g1Diff = g1DiffCol ? Number(row?.[g1DiffCol] || 0) : 0;
                const g2Diff = g2DiffCol ? Number(row?.[g2DiffCol] || 0) : 0;
                const g3Diff = g3DiffCol ? Number(row?.[g3DiffCol] || 0) : 0;
                const g4Diff = g4DiffCol ? Number(row?.[g4DiffCol] || 0) : 0;

                const total = g1 + g2 + g3 + g4;
                
                return {
                    name: unit.name,
                    code: unit.code,
                    id: unit.id,
                    g1, g2, g3, g4, 
                    g1Diff, g2Diff, g3Diff, g4Diff,
                    total,
                    g4Percent: total > 0 ? (g4 / total) * 100 : 0,
                    g1Percent: total > 0 ? (g1 / total) * 100 : 0
                };
            })
            .filter(d => d.total > 0);

        const sortedData = data.sort((a, b) => {
            const indexA = SORT_ORDER.indexOf(a.name);
            const indexB = SORT_ORDER.indexOf(b.name);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.name.localeCompare(b.name);
        });

        // Calculate Analysis based on Selection (analysisUnit)
        let trends = { g1: 0, g2: 0, g3: 0, g4: 0 };
        let mostImproved = { name: '...', val: 0 };
        let mostDeclined = { name: '...', val: 0 };
        let bestUnit = { name: '...', val: 0 };
        let scopeName = "TOÀN TỈNH";

        if (analysisUnit === 'all') {
            sortedData.forEach(d => {
                trends.g1 += d.g1Diff;
                trends.g2 += d.g2Diff;
                trends.g3 += d.g3Diff;
                trends.g4 += d.g4Diff;

                if (d.g4Diff > mostImproved.val) mostImproved = { name: d.name, val: d.g4Diff };
                if (d.g1Diff > mostDeclined.val) mostDeclined = { name: d.name, val: d.g1Diff };
                if (d.g4Percent > bestUnit.val) bestUnit = { name: d.name, val: d.g4Percent };
            });
        } else {
            const targetUnit = sortedData.find(d => d.id === analysisUnit);
            if (targetUnit) {
                scopeName = targetUnit.name.toUpperCase();
                trends = { g1: targetUnit.g1Diff, g2: targetUnit.g2Diff, g3: targetUnit.g3Diff, g4: targetUnit.g4Diff };
                // Local stats (not strictly needed for single unit view but keeping structure)
                mostImproved = { name: targetUnit.name, val: targetUnit.g4Diff };
                mostDeclined = { name: targetUnit.name, val: targetUnit.g1Diff };
                bestUnit = { name: targetUnit.name, val: targetUnit.g4Percent };
            }
        }

        return { 
            chartData: sortedData, 
            analysis: { 
                trends,
                improved: mostImproved,
                declined: mostDeclined,
                bestPercent: bestUnit,
                scopeName
            } 
        };
    }, [units, importedData, config, analysisUnit]);

    const handleReadSheet = async () => {
        if (!config.url) return alert("Vui lòng nhập URL Google Sheet.");
        setIsProcessing(true);
        try {
            const csv = await fetchAndValidateCsv(config.url);
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if (rows.length > 0) {
                setSheetColumns(Object.keys(rows[0]));
                alert("Đã đọc thành công các cột. Vui lòng ánh xạ.");
            } else { alert("File rỗng."); }
        } catch (e: any) { alert("Lỗi đọc file: " + e.message); } finally { setIsProcessing(false); }
    };

    const handleSaveConfig = async () => {
        const configId = `productivity_${selectedMonth}`;
        await dbClient.upsert('mobile_ops_configs', configId, { ...config, id: configId, type: 'productivity', period: selectedMonth });
        alert("Đã lưu cấu hình!");
    };

    const handleSyncData = async () => {
        if (!config.url || !config.mapping?.unitCodeCol) return alert("Chưa cấu hình ánh xạ.");
        setIsProcessing(true);
        try {
            const csv = await fetchAndValidateCsv(config.url);
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            
            const dataId = `productivity_${selectedMonth}`;
            await dbClient.upsert('mobile_ops_data', dataId, { data: rows });
            setImportedData(rows);
            alert(`Đồng bộ thành công ${rows.length} dòng.`);
            setActiveTab('eval');
        } catch (e: any) { alert("Lỗi: " + e.message); } finally { setIsProcessing(false); }
    };

    const handleQuickSync = async () => {
        if (!isAdmin && !systemSettings?.allowKpiSync) return alert("Bị khóa bởi Admin.");
        let targetMonth = selectedMonth;
        if (isAdmin) {
             const input = prompt("Nhập tháng (YYYY-MM):", selectedMonth);
             if(!input || !/^\d{4}-\d{2}$/.test(input)) return;
             targetMonth = input;
        }
        setIsProcessing(true);
        try {
             const configId = `productivity_${targetMonth}`;
             const configData = await dbClient.getById('mobile_ops_configs', configId);
             if (!configData?.url) return alert("Chưa có cấu hình.");
             
             const csv = await fetchAndValidateCsv(configData.url);
             const wb = XLSX.read(csv, {type:'string'});
             const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
             
             await dbClient.upsert('mobile_ops_data', `productivity_${targetMonth}`, {data:rows});
             alert("Đồng bộ xong!");
             if (targetMonth === selectedMonth) fetchData();
             else setSelectedMonth(targetMonth);
        } catch (e: any) { alert("Lỗi: " + e.message); } finally { setIsProcessing(false); }
    };
    
    // Custom label renderer for chart
    const renderLabel = (props: any, diffKey: string, isDark: boolean) => {
         const { x, y, width, height, value, payload } = props;
         if (!value) return null;
         
         const diff = payload && payload[diffKey] !== undefined ? payload[diffKey] : 0;
         const sign = diff > 0 ? '+' : '';
         const diffText = (diff !== 0 && !isNaN(diff)) ? `(${sign}${diff})` : '';
         
         // Aggressively show diff if width allows (> 30px), otherwise just value
         const text = (width > 30) ? `${value} ${diffText}` : `${value}`;

         return (
             <text x={x + width / 2} y={y + height / 2} fill={isDark ? "#FFFFFF" : "#000000"} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight="bold">
                 {text}
             </text>
         );
    };

    // Custom Tooltip for Chart
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const total = payload[0].payload.total || 0;
            return (
                <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl text-xs min-w-[200px] z-50">
                    <p className="font-black text-slate-800 text-sm mb-2 border-b pb-2">{label}</p>
                    {payload.slice().reverse().map((entry: any, index: number) => {
                        const dataKey = entry.dataKey;
                        const diffKey = dataKey + 'Diff';
                        const diff = entry.payload[diffKey];
                        const sign = diff > 0 ? '+' : '';
                        
                        // Percent Calculation
                        const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';

                        // Evaluation Logic
                        let evalText = "Ổn định";
                        let evalColor = "text-slate-500";
                        
                        if (diff !== 0) {
                            if (dataKey === 'g1') {
                                // G1: Increase is BAD, Decrease is GOOD
                                if (diff > 0) { evalText = "Tiêu cực (Tăng)"; evalColor = "text-red-500"; }
                                else { evalText = "Tích cực (Giảm)"; evalColor = "text-green-600"; }
                            } else {
                                // G2, G3, G4: Increase is GOOD, Decrease is BAD
                                if (diff > 0) { evalText = "Tích cực (Tăng)"; evalColor = "text-green-600"; }
                                else { evalText = "Tiêu cực (Giảm)"; evalColor = "text-red-500"; }
                            }
                        }

                        return (
                            <div key={index} className="mb-2 last:mb-0">
                                <div className="flex justify-between items-center gap-4">
                                    <span style={{ color: entry.color }} className="font-bold">{entry.name}:</span>
                                    <span className="font-black text-slate-700">
                                        {entry.value} NS <span className="text-[10px] text-slate-500 font-normal">({percentage}%)</span>
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] pl-2 mt-0.5">
                                    <span className="text-slate-400">Biến động:</span>
                                    <span className={`font-bold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                        {diff !== 0 ? `${sign}${diff}` : '-'}
                                    </span>
                                </div>
                                {diff !== 0 && (
                                    <div className={`text-[9px] text-right font-bold italic ${evalColor}`}>
                                        {evalText}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white p-6 rounded-[40px] shadow-sm border space-y-6 h-full flex flex-col">
             <div className="flex justify-between items-center border-b pb-4">
                <h3 className="text-lg font-black tracking-tighter uppercase text-green-700">Năng suất kênh nội bộ</h3>
                <div className="flex items-center gap-2">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border-2 rounded-xl px-2 py-1.5 font-bold text-[10px] bg-slate-50 outline-none w-28"/>
                    <button onClick={handleQuickSync} disabled={isProcessing} className="bg-slate-100 text-slate-600 p-1.5 rounded-xl border hover:bg-slate-200" title="Đồng bộ"><RefreshCw size={14}/></button>
                    {isAdmin && (<div className="flex bg-slate-100 p-1 rounded-xl border ml-2"><button onClick={() => setActiveTab('eval')} className={`p-1.5 rounded-lg text-[10px] ${activeTab === 'eval' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><TrendingUp size={14}/></button><button onClick={() => setActiveTab('config')} className={`p-1.5 rounded-lg text-[10px] ${activeTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Settings size={14}/></button></div>)}
                </div>
            </div>
            
            <div className="flex-1 min-h-[300px]">
                {activeTab === 'eval' ? (
                     isLoadingData ? <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-green-600"/></div> :
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                        <div className="lg:col-span-2 h-full flex flex-col">
                             <h4 className="text-sm font-bold text-center text-slate-500 mb-2 uppercase tracking-wider">Phân nhóm NVKD theo mức doanh thu PTM</h4>
                             <div className="flex-1 min-h-0">
                                 <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={chartData} stackOffset="expand" margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.5}/>
                                        <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{fontSize: 10}}/>
                                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fontWeight: 'bold' }} interval={0}/>
                                        <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}}/>
                                        <Legend iconSize={16} wrapperStyle={{fontSize: '14px', fontWeight: 'normal', paddingBottom: '20px', color: '#000000'}} formatter={(value) => <span style={{ color: '#000000' }}>{value}</span>}/>
                                        
                                        <Bar dataKey="g1" name="< 5tr" stackId="prod" fill="#e0412b" barSize={25}>
                                            <LabelList dataKey="g1" position="center" content={(props: any) => renderLabel(props, 'g1Diff', true)} />
                                        </Bar>
                                        <Bar dataKey="g2" name="5-10tr" stackId="prod" fill="#f97316" barSize={25}>
                                            <LabelList dataKey="g2" position="center" content={(props: any) => renderLabel(props, 'g2Diff', false)} />
                                        </Bar>
                                        <Bar dataKey="g3" name="10-15tr" stackId="prod" fill="#6395ff" barSize={25}>
                                            <LabelList dataKey="g3" position="center" content={(props: any) => renderLabel(props, 'g3Diff', true)} />
                                        </Bar>
                                        <Bar dataKey="g4" name="> 15tr" stackId="prod" fill="#63ff6e" barSize={25}>
                                            <LabelList dataKey="g4" position="center" content={(props: any) => renderLabel(props, 'g4Diff', false)} />
                                        </Bar>
                                    </BarChart>
                                 </ResponsiveContainer>
                             </div>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-6 border h-full overflow-y-auto">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-black uppercase text-slate-500 flex items-center gap-2"><Briefcase size={14}/> Đánh giá sơ bộ</h4>
                                <div className="flex items-center bg-white border rounded-lg px-2 py-1">
                                    <Filter size={10} className="text-slate-400 mr-1"/>
                                    <select 
                                        className="text-[10px] font-bold outline-none bg-transparent max-w-[100px]"
                                        value={analysisUnit}
                                        onChange={(e) => setAnalysisUnit(e.target.value)}
                                    >
                                        <option value="all">Toàn tỉnh</option>
                                        {chartData.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            {analysis && (
                                <div className="space-y-6">
                                    <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                                        <div className="flex items-center gap-2 text-blue-700 font-bold text-sm mb-3"><TrendingUp size={16}/> Phạm vi: {analysis.scopeName}</div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-xs text-slate-400 uppercase font-black">Nhóm {'>'} 15tr (G4)</div>
                                                <div className={`text-xl font-black flex items-center gap-1 ${analysis.trends.g4 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {analysis.trends.g4 >= 0 ? <ArrowUpRight size={20}/> : <ArrowDownRight size={20}/>}
                                                    {analysis.trends.g4 > 0 ? '+' : ''}{analysis.trends.g4}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400 uppercase font-black">Nhóm {'<'} 5tr (G1)</div>
                                                {/* G1 Logic: Increase is BAD (Red), Decrease is GOOD (Green) */}
                                                <div className={`text-xl font-black flex items-center gap-1 ${analysis.trends.g1 <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {analysis.trends.g1 >= 0 ? <ArrowUpRight size={20}/> : <ArrowDownRight size={20}/>}
                                                    {analysis.trends.g1 > 0 ? '+' : ''}{analysis.trends.g1}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400 uppercase font-black">Nhóm 10-15tr (G3)</div>
                                                <div className={`text-lg font-black flex items-center gap-1 ${analysis.trends.g3 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {analysis.trends.g3 >= 0 ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}
                                                    {analysis.trends.g3 > 0 ? '+' : ''}{analysis.trends.g3}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400 uppercase font-black">Nhóm 5-10tr (G2)</div>
                                                <div className={`text-lg font-black flex items-center gap-1 ${analysis.trends.g2 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {analysis.trends.g2 >= 0 ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}
                                                    {analysis.trends.g2 > 0 ? '+' : ''}{analysis.trends.g2}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {analysisUnit === 'all' && (
                                        <>
                                            <div className="bg-white p-4 rounded-xl border border-green-200 shadow-sm">
                                                <div className="flex items-center gap-2 text-green-700 font-bold text-sm mb-2"><Award size={16}/> Chuyển dịch tích cực nhất</div>
                                                <p className="text-base font-black text-slate-800">{analysis.improved.name}</p>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Nhân sự nhóm {'>'} 15tr tăng thêm: <span className="font-bold text-green-600">+{analysis.improved.val}</span> NS.
                                                </p>
                                            </div>
                                            
                                            {analysis.declined.val > 0 && (
                                                <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
                                                    <div className="flex items-center gap-2 text-red-600 font-bold text-sm mb-2"><TrendingDown size={16}/> Cần lưu ý (Giảm năng suất)</div>
                                                    <p className="text-base font-black text-slate-800">{analysis.declined.name}</p>
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        Nhân sự nhóm {'<'} 5tr tăng thêm: <span className="font-bold text-red-500">+{analysis.declined.val}</span> NS.
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <div className="text-xs text-slate-400 italic text-justify leading-relaxed pt-2 border-t">
                                        * Đơn vị có cơ cấu tốt nhất hiện tại (Tỷ lệ G4 cao nhất): <span className="font-bold text-slate-700">{analysis.bestPercent.name} ({analysis.bestPercent.val.toFixed(1)}%)</span>.
                                    </div>
                                </div>
                            )}
                        </div>
                     </div>
                ) : (
                    <div className="space-y-6 animate-fade-in p-6 bg-slate-50 rounded-2xl border h-full overflow-y-auto">
                        <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">1. Link Google Sheet (CSV)</label><div className="flex gap-2"><input value={config.url || ''} onChange={e => setConfig({...config, url: e.target.value})} className="w-full border-2 p-3 rounded-xl bg-white font-mono text-xs"/><button onClick={handleReadSheet} disabled={isProcessing} className="bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50">{isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Table size={14}/>} Đọc</button></div></div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-4 col-span-2">
                                {sheetColumns.length > 0 && (<div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-500">2. Ánh xạ dữ liệu</label><div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border"><MappingSelect label="Cột Mã Đơn vị" columns={sheetColumns} value={config.mapping?.unitCodeCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, unitCodeCol: v}})} /><MappingSelect label="Cột < 5 triệu" columns={sheetColumns} value={config.mapping?.g1Col || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g1Col: v}})} /><MappingSelect label="Cột 5-10 triệu" columns={sheetColumns} value={config.mapping?.g2Col || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g2Col: v}})} /><MappingSelect label="Cột 10-15 triệu" columns={sheetColumns} value={config.mapping?.g3Col || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g3Col: v}})} /><MappingSelect label="Cột > 15 triệu" columns={sheetColumns} value={config.mapping?.g4Col || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g4Col: v}})} /></div></div>)}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-purple-600">3. Ánh xạ so sánh (Q4/2025)</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <MappingSelect label="Chênh lệch < 5tr" columns={sheetColumns} value={config.mapping?.g1DiffCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g1DiffCol: v}})} />
                                    <MappingSelect label="Chênh lệch 5-10tr" columns={sheetColumns} value={config.mapping?.g2DiffCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g2DiffCol: v}})} />
                                    <MappingSelect label="Chênh lệch 10-15tr" columns={sheetColumns} value={config.mapping?.g3DiffCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g3DiffCol: v}})} />
                                    <MappingSelect label="Chênh lệch > 15tr" columns={sheetColumns} value={config.mapping?.g4DiffCol || ''} onChange={(v) => setConfig({...config, mapping: {...config.mapping, g4DiffCol: v}})} />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t"><button onClick={handleSaveConfig} className="bg-slate-200 text-slate-700 px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2"><Save size={14}/> Lưu</button><button onClick={handleSyncData} disabled={isProcessing} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2"><Import size={14}/> Đồng bộ</button></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const MobileOpsDashboard: React.FC<MobileOpsProps> = ({ currentUser, units, systemSettings, onRefresh }) => {
  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-end border-b pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter flex items-center gap-3">
            <Smartphone className="text-blue-600" size={36}/> DASHBOARD CTHĐ DI ĐỘNG
          </h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
            Theo dõi chỉ tiêu PTTB, Doanh thu & Năng suất lao động
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[550px]">
        <div className="h-full">
            <MobileKpiView 
            type="subscribers" 
            title="Phát triển thuê bao" 
            currentUser={currentUser} 
            units={units}
            systemSettings={systemSettings}
            onRefreshParent={onRefresh}
            />
        </div>
        <div className="h-full">
            <MobileKpiView 
            type="revenue" 
            title="Doanh thu di động" 
            currentUser={currentUser} 
            units={units}
            systemSettings={systemSettings}
            onRefreshParent={onRefresh}
            />
        </div>
      </div>

      <div className="h-[600px]">
         <ProductivityView 
            currentUser={currentUser}
            units={units}
            systemSettings={systemSettings}
        />
      </div>

      <div className="h-[600px]">
         <QualityView 
            currentUser={currentUser}
            units={units}
            systemSettings={systemSettings}
         />
      </div>
    </div>
  );
};

export default MobileOpsDashboard;
