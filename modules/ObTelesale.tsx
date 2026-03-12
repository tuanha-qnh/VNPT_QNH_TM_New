
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User } from '../types';
import { Headset, Settings, Loader2, Table, Save, Import, RefreshCw, Briefcase, TrendingUp, PhoneOutgoing, Target, Percent, User as UserIcon, Clock, Award, LayoutTemplate, Users, Edit3 } from 'lucide-react';
import { dbClient } from '../utils/firebaseClient';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, CartesianGrid, Legend, PieChart, Pie, Cell, LabelList, ComposedChart, Line } from 'recharts';

interface ObTelesaleProps {
  currentUser: User;
  systemSettings: any;
  onRefresh: () => void;
}

const COLORS = {
    ckn: '#0088FE', // Xanh dương
    ckd: '#00C49F', // Xanh lá
    pkg: '#FFBB28', // Vàng
    total: '#8b5cf6', // Tím (Tổng doanh thu)
    gray: '#e5e7eb',
    barAssigned: '#9ca3af',
    barExecuted: '#3b82f6',
    success: '#10b981', // Emerald 500
    readyTotal: '#f43f5e', // Rose
    readyAvg: '#ec4899', // Pink
};

// Custom Gauge Chart Component
const GaugeChart = ({ value, target, title, color }: { value: number, target: number, title: string, color: string }) => {
    const percent = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
    const data = [
        { name: 'Completed', value: percent },
        { name: 'Remaining', value: 100 - percent },
    ];

    return (
        <div className="flex flex-col items-center justify-center h-full relative">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 text-center px-2">{title}</h4>
            <div className="h-[120px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="100%"
                            startAngle={180}
                            endAngle={0}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={0}
                            dataKey="value"
                            stroke="none"
                        >
                            <Cell key="cell-0" fill={color} />
                            <Cell key="cell-1" fill={COLORS.gray} />
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute bottom-0 left-0 w-full text-center mb-2">
                    <div className="text-3xl font-black" style={{ color: color }}>{percent}%</div>
                    <div className="text-[10px] font-bold text-slate-400">
                        {value.toLocaleString()} / {target.toLocaleString()}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ObTelesale: React.FC<ObTelesaleProps> = ({ currentUser, systemSettings }) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'config'>('dashboard');
    const [configTab, setConfigTab] = useState<'general' | 'agent'>('general'); // Sub-tab for config
    
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
    
    // Config states
    const [generalConfig, setGeneralConfig] = useState<any>({});
    const [agentConfig, setAgentConfig] = useState<any>({});
    
    // Data states
    const [generalData, setGeneralData] = useState<any[]>([]);
    const [agentData, setAgentData] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Column states for mapping dropdowns
    const [generalColumns, setGeneralColumns] = useState<string[]>([]);
    const [agentColumns, setAgentColumns] = useState<string[]>([]);

    const isAdmin = currentUser.username === 'admin';

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        
        // IDs
        const genConfigId = `ob_general_config_${selectedMonth}`;
        const genDataId = `ob_general_data_${selectedMonth}`;
        const agtConfigId = `ob_agent_config_${selectedMonth}`;
        const agtDataId = `ob_agent_data_${selectedMonth}`;

        const [genConf, genData, agtConf, agtData] = await Promise.all([
            dbClient.getById('ob_telesale_configs', genConfigId),
            dbClient.getById('ob_telesale_data', genDataId),
            dbClient.getById('ob_telesale_configs', agtConfigId),
            dbClient.getById('ob_telesale_data', agtDataId)
        ]);

        setGeneralConfig(genConf || { url: '', mapping: {} });
        setGeneralData(genData?.data || []);
        
        setAgentConfig(agtConf || { url: '', mapping: {}, manualTargets: {} });
        setAgentData(agtData?.data || []);

        setIsLoading(false);
    }, [selectedMonth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- PROCESSED DATA FOR DASHBOARD ---
    
    // 1. General Metrics (Top Section)
    const { revenueMetrics, obRateData, conversionData, evaluationText } = useMemo(() => {
        if (!generalConfig.mapping || generalData.length === 0) {
            return { revenueMetrics: null, obRateData: [], conversionData: [], evaluationText: '' };
        }
        const m = generalConfig.mapping;
        let t = {
            rev_ckn_t: 0, rev_ckn_a: 0,
            rev_ckd_t: 0, rev_ckd_a: 0,
            rev_pkg_t: 0, rev_pkg_a: 0,
            ckn_assign: 0, ckn_exec: 0, ckn_success: 0,
            ckd_assign: 0, ckd_exec: 0, ckd_success: 0,
            pkg_assign: 0, pkg_exec: 0, pkg_success: 0,
        };

        // Sum up all rows in general data (in case general file has multiple rows)
        generalData.forEach(row => {
            t.rev_ckn_t += Number(row[m.rev_ckn_t] || 0); t.rev_ckn_a += Number(row[m.rev_ckn_a] || 0);
            t.rev_ckd_t += Number(row[m.rev_ckd_t] || 0); t.rev_ckd_a += Number(row[m.rev_ckd_a] || 0);
            t.rev_pkg_t += Number(row[m.rev_pkg_t] || 0); t.rev_pkg_a += Number(row[m.rev_pkg_a] || 0);

            t.ckn_assign += Number(row[m.ckn_assign] || 0); t.ckn_exec += Number(row[m.ckn_exec] || 0); t.ckn_success += Number(row[m.ckn_success] || 0);
            t.ckd_assign += Number(row[m.ckd_assign] || 0); t.ckd_exec += Number(row[m.ckd_exec] || 0); t.ckd_success += Number(row[m.ckd_success] || 0);
            t.pkg_assign += Number(row[m.pkg_assign] || 0); t.pkg_exec += Number(row[m.pkg_exec] || 0); t.pkg_success += Number(row[m.pkg_success] || 0);
        });

        const totalRevTarget = t.rev_ckn_t + t.rev_ckd_t + t.rev_pkg_t;
        const totalRevActual = t.rev_ckn_a + t.rev_ckd_a + t.rev_pkg_a;
        const totalRevPercent = totalRevTarget > 0 ? (totalRevActual / totalRevTarget) * 100 : 0;

        const revenueMetrics = {
            ckn: { target: t.rev_ckn_t, actual: t.rev_ckn_a },
            ckd: { target: t.rev_ckd_t, actual: t.rev_ckd_a },
            pkg: { target: t.rev_pkg_t, actual: t.rev_pkg_a },
            total: { target: totalRevTarget, actual: totalRevActual }
        };

        const obRateData = [
            { name: 'Gói CKN', rate: t.ckn_assign > 0 ? parseFloat(((t.ckn_exec / t.ckn_assign) * 100).toFixed(1)) : 0, fill: COLORS.ckn },
            { name: 'Gói CKD', rate: t.ckd_assign > 0 ? parseFloat(((t.ckd_exec / t.ckd_assign) * 100).toFixed(1)) : 0, fill: COLORS.ckd },
            { name: 'Bán gói', rate: t.pkg_assign > 0 ? parseFloat(((t.pkg_exec / t.pkg_assign) * 100).toFixed(1)) : 0, fill: COLORS.pkg },
        ];

        const conversionData = [
            { name: 'Mời CKN', rate: t.ckn_exec > 0 ? parseFloat(((t.ckn_success / t.ckn_exec) * 100).toFixed(1)) : 0, fill: COLORS.ckn },
            { name: 'Mời CKD', rate: t.ckd_exec > 0 ? parseFloat(((t.ckd_success / t.ckd_exec) * 100).toFixed(1)) : 0, fill: COLORS.ckd },
            { name: 'Bán gói', rate: t.pkg_exec > 0 ? parseFloat(((t.pkg_success / t.pkg_exec) * 100).toFixed(1)) : 0, fill: COLORS.pkg },
        ];

        let evaluationText = `Đánh giá hiệu quả TTCSKH tháng ${selectedMonth}:\n`;
        evaluationText += `Tổng doanh thu đạt: ${totalRevActual.toLocaleString()} VNĐ (${totalRevPercent.toFixed(1)}% kế hoạch).\n`;
        evaluationText += `- Gia hạn CKN: Tỷ lệ OB ${obRateData[0].rate}%, Thành công ${conversionData[0].rate}%.\n`;
        evaluationText += `- Gia hạn CKD: Tỷ lệ OB ${obRateData[1].rate}%, Thành công ${conversionData[1].rate}%.\n`;
        evaluationText += `- Bán gói cước: Tỷ lệ OB ${obRateData[2].rate}%, Thành công ${conversionData[2].rate}%.`;

        return { revenueMetrics, obRateData, conversionData, evaluationText };
    }, [generalConfig, generalData, selectedMonth]);

    // 2. Agent Metrics (Bottom Section)
    const processedAgentData = useMemo(() => {
        if (!agentConfig.mapping || agentData.length === 0) return [];
        const m = agentConfig.mapping;
        const manualTargets = agentConfig.manualTargets || {};

        return agentData.map(row => {
             const name = row[m.agent_name] || 'Unknown';
             
             // Targets from Manual Config
             const targets = manualTargets[name] || { ckn: 0, ckd: 0, pkg: 0 };
             const r_ckn_t = Number(targets.ckn || 0);
             const r_ckd_t = Number(targets.ckd || 0);
             const r_pkg_t = Number(targets.pkg || 0);

             // Actuals from Import
             const r_ckn_a = Number(row[m.rev_ckn_a] || 0);
             const r_ckd_a = Number(row[m.rev_ckd_a] || 0);
             const r_pkg_a = Number(row[m.rev_pkg_a] || 0);
             
             // Metrics - Direct Rates from CSV
             const ckn_rate = Number(row[m.ckn_rate] || 0);
             const ckd_rate = Number(row[m.ckd_rate] || 0);
             const pkg_rate = Number(row[m.pkg_rate] || 0);

             const ready_total = Number(row[m.ready_time_total] || 0);
             const ready_avg = Number(row[m.ready_time_avg] || 0);

             const total_rev_t = r_ckn_t + r_ckd_t + r_pkg_t;
             const total_rev_a = r_ckn_a + r_ckd_a + r_pkg_a;
             const total_rev_p = total_rev_t > 0 ? (total_rev_a / total_rev_t) * 100 : 0;

             return {
                name,
                r_ckn_t, r_ckn_a, r_ckn_p: r_ckn_t > 0 ? (r_ckn_a/r_ckn_t)*100 : 0,
                r_ckd_t, r_ckd_a, r_ckd_p: r_ckd_t > 0 ? (r_ckd_a/r_ckd_t)*100 : 0,
                r_pkg_t, r_pkg_a, r_pkg_p: r_pkg_t > 0 ? (r_pkg_a/r_pkg_t)*100 : 0,
                total_rev_t, total_rev_a, total_rev_p,
                ckn_rate: Number(ckn_rate.toFixed(1)),
                ckd_rate: Number(ckd_rate.toFixed(1)),
                pkg_rate: Number(pkg_rate.toFixed(1)),
                ready_total, ready_avg
            };
        }).sort((a,b) => b.total_rev_a - a.total_rev_a);
    }, [agentConfig, agentData]);


    // --- ACTION HANDLERS ---

    const processGoogleSheetUrl = (url: string) => {
        let finalUrl = url.trim();
        // Case 1: Published to web (contains output=csv) or already formatted export link
        if (finalUrl.includes('output=csv') || finalUrl.includes('export?format=csv')) {
            return finalUrl;
        }
        // Case 2: Edit link
        if (finalUrl.includes('/edit')) {
            return finalUrl.split('/edit')[0] + '/export?format=csv';
        }
        // Case 3: Root link (e.g. .../d/ID)
        if (finalUrl.endsWith('/')) {
            return finalUrl + 'export?format=csv';
        }
        // Fallback for ID only or other formats
        return finalUrl + '/export?format=csv';
    };

    const handleReadSheet = async (type: 'general' | 'agent') => {
        const currentConfig = type === 'general' ? generalConfig : agentConfig;
        const setColumns = type === 'general' ? setGeneralColumns : setAgentColumns;

        if (!currentConfig.url) return alert("Vui lòng nhập URL Google Sheet.");
        setIsProcessing(true);
        try {
            const finalUrl = processGoogleSheetUrl(currentConfig.url);
            const res = await fetch(finalUrl);
            if (!res.ok) throw new Error("Không thể tải file (Lỗi mạng hoặc URL sai/chưa share Public).");
            
            const csv = await res.text();
            
            // Check for HTML response (Login page or error page)
            if (csv.trim().toLowerCase().startsWith('<!doctype html') || csv.includes('<html') || csv.includes('<script')) {
                throw new Error("Link không đúng định dạng CSV hoặc chưa được chia sẻ công khai (Public). Vui lòng kiểm tra lại.");
            }

            let wb;
            try {
                wb = XLSX.read(csv, { type: 'string' });
            } catch (xlsxError: any) {
                if (xlsxError.message && xlsxError.message.includes('Invalid HTML')) {
                     throw new Error("Dữ liệu trả về là HTML thay vì CSV. Vui lòng đảm bảo File Google Sheet đã được chia sẻ công khai (Anyone with the link).");
                }
                throw xlsxError;
            }

            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if (rows.length > 0) {
                setColumns(Object.keys(rows[0]));
                alert("Đã đọc thành công các cột. Vui lòng ánh xạ.");
            } else {
                alert("File rỗng.");
            }
        } catch (e: any) { alert("Lỗi đọc file: " + e.message); } finally { setIsProcessing(false); }
    };

    const handleSaveConfig = async (type: 'general' | 'agent') => {
        const configId = `ob_${type}_config_${selectedMonth}`;
        const currentConfig = type === 'general' ? generalConfig : agentConfig;
        
        await dbClient.upsert('ob_telesale_configs', configId, { ...currentConfig, id: configId, period: selectedMonth, type });
        alert(`Đã lưu cấu hình ${type === 'general' ? 'Tổng hợp' : 'Điện thoại viên'}!`);
    };

    const handleSyncData = async (type: 'general' | 'agent') => {
        const currentConfig = type === 'general' ? generalConfig : agentConfig;
        const setData = type === 'general' ? setGeneralData : setAgentData;

        if (!currentConfig.url) return alert("Chưa có cấu hình URL.");
        setIsProcessing(true);
        try {
            const finalUrl = processGoogleSheetUrl(currentConfig.url);
            const res = await fetch(finalUrl);
            if (!res.ok) throw new Error("Không thể tải file.");
            
            const csv = await res.text();
            
            // Check for HTML response
            if (csv.trim().toLowerCase().startsWith('<!doctype html') || csv.includes('<html')) {
                throw new Error("Link không đúng định dạng CSV hoặc chưa được chia sẻ công khai (Public).");
            }

            let wb;
            try {
                wb = XLSX.read(csv, { type: 'string' });
            } catch (xlsxError: any) {
                if (xlsxError.message && xlsxError.message.includes('Invalid HTML')) {
                     throw new Error("Dữ liệu trả về là HTML. Vui lòng kiểm tra quyền truy cập (Share Public).");
                }
                throw xlsxError;
            }

            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            
            const dataId = `ob_${type}_data_${selectedMonth}`;
            await dbClient.upsert('ob_telesale_data', dataId, { data: rows });
            setData(rows);
            alert(`Đồng bộ thành công ${rows.length} dòng dữ liệu.`);
        } catch (e: any) { alert("Lỗi đồng bộ: " + e.message); } finally { setIsProcessing(false); }
    };

    const handleQuickSync = async () => {
        if (!isAdmin && !systemSettings?.allowKpiSync) return alert("Chức năng bị khóa bởi Admin.");
        if (!confirm("Bạn có muốn đồng bộ lại cả dữ liệu Tổng hợp và ĐTV cho tháng này?")) return;
        
        setIsProcessing(true);
        try {
            // Helper function to fetch and check
            const fetchAndCheck = async (url: string) => {
                const finalUrl = processGoogleSheetUrl(url);
                const res = await fetch(finalUrl);
                if (!res.ok) throw new Error(`Lỗi tải file (${res.status}). Kiểm tra quyền truy cập.`);
                const text = await res.text();
                
                if (text.trim().toLowerCase().startsWith('<!doctype html') || text.includes('<html')) {
                    throw new Error(`File chưa được chia sẻ Public hoặc URL sai.`);
                }
                return text;
            };

            // 1. Sync General
            const genConfigId = `ob_general_config_${selectedMonth}`;
            const genConf = await dbClient.getById('ob_telesale_configs', genConfigId);
            if (genConf?.url) {
                const csv = await fetchAndCheck(genConf.url);
                let w;
                try {
                    w = XLSX.read(csv, {type:'string'});
                } catch(e: any) {
                    if (e.message.includes('Invalid HTML')) throw new Error("Lỗi định dạng (HTML). Kiểm tra share Public.");
                    throw e;
                }
                const d = XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]]);
                await dbClient.upsert('ob_telesale_data', `ob_general_data_${selectedMonth}`, {data:d});
                setGeneralData(d);
            }

            // 2. Sync Agent
            const agtConfigId = `ob_agent_config_${selectedMonth}`;
            const agtConf = await dbClient.getById('ob_telesale_configs', agtConfigId);
            if (agtConf?.url) {
                const csv = await fetchAndCheck(agtConf.url);
                let w;
                try {
                    w = XLSX.read(csv, {type:'string'});
                } catch(e: any) {
                    if (e.message.includes('Invalid HTML')) throw new Error("Lỗi định dạng (HTML). Kiểm tra share Public.");
                    throw e;
                }
                const d = XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]]);
                await dbClient.upsert('ob_telesale_data', `ob_agent_data_${selectedMonth}`, {data:d});
                setAgentData(d);
            }
            alert("Đã đồng bộ xong dữ liệu!");
        } catch(e: any) { alert("Lỗi: " + e.message); } finally { setIsProcessing(false); }
    };

    // Helper to populate manual targets from imported data
    const handlePopulateAgents = () => {
        if (!agentConfig.mapping?.agent_name) return alert("Vui lòng ánh xạ cột 'Tên Điện thoại viên' trước.");
        if (agentData.length === 0) return alert("Chưa có dữ liệu ĐTV. Vui lòng đồng bộ dữ liệu trước.");
        
        const existingTargets = agentConfig.manualTargets || {};
        const newTargets = { ...existingTargets };
        let count = 0;

        agentData.forEach(row => {
            const name = row[agentConfig.mapping.agent_name];
            if (name && !newTargets[name]) {
                newTargets[name] = { ckn: 0, ckd: 0, pkg: 0 };
                count++;
            }
        });

        setAgentConfig({ ...agentConfig, manualTargets: newTargets });
        alert(`Đã thêm ${count} ĐTV vào bảng kế hoạch.`);
    };

    const MappingSelect = ({ label, field, type }: { label: string, field: string, type: 'general' | 'agent' }) => {
        const currentConfig = type === 'general' ? generalConfig : agentConfig;
        const setConfig = type === 'general' ? setGeneralConfig : setAgentConfig;
        const columns = type === 'general' ? generalColumns : agentColumns;

        return (
            <div>
                <label className="text-[10px] font-bold text-slate-500">{label}</label>
                <select 
                    value={currentConfig.mapping?.[field] || ''} 
                    onChange={e => setConfig({ ...currentConfig, mapping: { ...currentConfig.mapping, [field]: e.target.value } })} 
                    className="w-full border p-2 rounded-md mt-1 text-xs"
                >
                    <option value="">-- Chọn cột --</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
        );
    };

    return (
        <div className="bg-white p-6 rounded-[40px] shadow-sm border space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-4">
                <h3 className="text-lg font-black tracking-tighter uppercase text-blue-700 flex items-center gap-2">
                    <Headset size={24}/> DASHBOARD TTCSKH
                </h3>
                <div className="flex items-center gap-2">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border-2 rounded-xl px-2 py-1.5 font-bold text-[10px] bg-slate-50 outline-none w-28"/>
                    <button onClick={handleQuickSync} disabled={isProcessing} className="bg-slate-100 text-slate-600 p-1.5 rounded-xl border hover:bg-slate-200" title="Đồng bộ nhanh"><RefreshCw size={14}/></button>
                    {isAdmin && (<div className="flex bg-slate-100 p-1 rounded-xl border ml-2"><button onClick={() => setActiveTab('dashboard')} className={`p-1.5 rounded-lg text-[10px] ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><TrendingUp size={14}/></button><button onClick={() => setActiveTab('config')} className={`p-1.5 rounded-lg text-[10px] ${activeTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Settings size={14}/></button></div>)}
                </div>
            </div>

            <div className="flex-1 min-h-[500px]">
                {activeTab === 'dashboard' ? (
                    isLoading ? <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-blue-600"/></div> :
                    <div className="flex flex-col gap-6 h-full">
                        {/* 1. Revenue Gauges (FROM GENERAL DATA) */}
                        {revenueMetrics && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg-slate-50 p-6 rounded-[32px] border border-slate-100">
                                <div className="h-[160px]">
                                    <GaugeChart title="KQTH DT gia hạn gói CKN" value={revenueMetrics.ckn.actual} target={revenueMetrics.ckn.target} color={COLORS.ckn} />
                                </div>
                                <div className="h-[160px]">
                                    <GaugeChart title="KQTH DT gia hạn gói CKD" value={revenueMetrics.ckd.actual} target={revenueMetrics.ckd.target} color={COLORS.ckd} />
                                </div>
                                <div className="h-[160px]">
                                    <GaugeChart title="KQTH DT bán gói" value={revenueMetrics.pkg.actual} target={revenueMetrics.pkg.target} color={COLORS.pkg} />
                                </div>
                                <div className="h-[160px]">
                                    <GaugeChart title="Tổng doanh thu OB Telesale" value={revenueMetrics.total.actual} target={revenueMetrics.total.target} color={COLORS.total} />
                                </div>
                            </div>
                        )}

                        {/* 2. Charts Row (FROM GENERAL DATA) */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[350px]">
                            {/* Bar Chart: OB Rate */}
                            <div className="bg-white p-6 rounded-[32px] border shadow-sm flex flex-col">
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2"><PhoneOutgoing size={16}/> Hiệu suất thực hiện OB (OB Rate)</h4>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={obRateData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5}/>
                                            <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} interval={0} />
                                            <YAxis tick={{fontSize: 10}} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} cursor={{fill: 'transparent'}} formatter={(value: number) => [`${value}%`, 'Tỷ lệ OB']} />
                                            <Bar dataKey="rate" name="Tỷ lệ OB" barSize={40} radius={[6,6,0,0]}>
                                                <LabelList dataKey="rate" position="top" formatter={(v: number) => `${v}%`} fontSize={10} fontWeight="bold" />
                                                {obRateData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Bar Chart: Conversion Rate */}
                            <div className="bg-white p-6 rounded-[32px] border shadow-sm flex flex-col">
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Phễu chuyển đổi (Conversion Rate)</h4>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={conversionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5}/>
                                            <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} interval={0} />
                                            <YAxis tick={{fontSize: 10}} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} cursor={{fill: 'transparent'}} formatter={(value: number) => [`${value}%`, 'Tỷ lệ Thành công']} />
                                            <Bar dataKey="rate" name="Tỷ lệ Thành công" barSize={40} radius={[6,6,0,0]}>
                                                <LabelList dataKey="rate" position="top" formatter={(v: number) => `${v}%`} fontSize={10} fontWeight="bold" />
                                                {conversionData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Evaluation Text */}
                        <div className="bg-blue-50 p-6 rounded-[32px] border border-blue-100">
                            <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2 flex items-center gap-2"><Briefcase size={16}/> Đánh giá kết quả</h4>
                            <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line text-justify">
                                {evaluationText || "Chưa có dữ liệu tổng hợp để đánh giá."}
                            </p>
                        </div>
                        
                        {/* -------------------- AGENT DETAIL SECTION (FROM AGENT DATA) -------------------- */}
                        {processedAgentData.length > 0 && (
                            <>
                                <div className="flex items-center gap-4 py-4">
                                    <div className="h-px bg-slate-200 flex-1"></div>
                                    <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><UserIcon size={16}/> Hiệu quả Điện thoại viên</h3>
                                    <div className="h-px bg-slate-200 flex-1"></div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">
                                    {/* Chart: Agent Conversion Rates */}
                                    <div className="bg-white p-6 rounded-[32px] border shadow-sm flex flex-col">
                                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Tỷ lệ gia hạn/bán gói theo ĐTV</h4>
                                        <div className="flex-1 w-full min-h-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={processedAgentData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5}/>
                                                    <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                                                    <YAxis tick={{fontSize: 10}} domain={[0, 100]} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                                                    <Legend wrapperStyle={{fontSize: '11px', fontWeight: 'bold'}} />
                                                    <Bar dataKey="ckn_rate" name="% Gia hạn CKN" fill={COLORS.ckn} radius={[4,4,0,0]} />
                                                    <Bar dataKey="ckd_rate" name="% Gia hạn CKD" fill={COLORS.ckd} radius={[4,4,0,0]} />
                                                    <Bar dataKey="pkg_rate" name="% Bán gói" fill={COLORS.pkg} radius={[4,4,0,0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Chart: Ready Time */}
                                    <div className="bg-white p-6 rounded-[32px] border shadow-sm flex flex-col">
                                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2"><Clock size={16}/> Thời gian Ready Time</h4>
                                        <div className="flex-1 w-full min-h-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={processedAgentData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5}/>
                                                    <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                                                    <YAxis yAxisId="left" tick={{fontSize: 10}} />
                                                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10}} />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                                                    <Legend wrapperStyle={{fontSize: '11px', fontWeight: 'bold'}} />
                                                    <Bar yAxisId="left" dataKey="ready_total" name="Tổng Ready (phút)" fill={COLORS.readyTotal} barSize={20} radius={[4,4,0,0]} />
                                                    <Line yAxisId="right" type="monotone" dataKey="ready_avg" name="BQ Ready (phút)" stroke={COLORS.readyAvg} strokeWidth={2} dot={{r: 3}} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Table */}
                                <div className="bg-white rounded-[32px] border shadow-sm overflow-hidden">
                                    <div className="p-6 border-b bg-slate-50">
                                         <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><Table size={16}/> Bảng chi tiết kết quả thực hiện</h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-white text-slate-500 font-black uppercase border-b">
                                                <tr>
                                                    <th className="p-4 sticky left-0 bg-white z-10 shadow-sm min-w-[150px]">ĐTV</th>
                                                    <th className="p-4 text-right min-w-[100px]">KH CKN</th>
                                                    <th className="p-4 text-right min-w-[100px]">TH CKN</th>
                                                    <th className="p-4 text-center">%</th>
                                                    <th className="p-4 text-right min-w-[100px]">KH CKD</th>
                                                    <th className="p-4 text-right min-w-[100px]">TH CKD</th>
                                                    <th className="p-4 text-center">%</th>
                                                    <th className="p-4 text-right min-w-[100px]">KH Bán gói</th>
                                                    <th className="p-4 text-right min-w-[100px]">TH Bán gói</th>
                                                    <th className="p-4 text-center">%</th>
                                                    <th className="p-4 text-right min-w-[120px] bg-slate-50">Tổng KH</th>
                                                    <th className="p-4 text-right min-w-[120px] bg-slate-50">Tổng TH</th>
                                                    <th className="p-4 text-center bg-slate-50 min-w-[100px]">% Tổng</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y font-medium text-slate-700">
                                                {processedAgentData.map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                                                        <td className="p-4 font-bold sticky left-0 bg-white z-10 shadow-sm border-r">{row.name}</td>
                                                        <td className="p-4 text-right font-mono">{row.r_ckn_t.toLocaleString()}</td>
                                                        <td className="p-4 text-right font-mono text-blue-600 font-bold">{row.r_ckn_a.toLocaleString()}</td>
                                                        <td className="p-4 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.r_ckn_p >= 100 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{row.r_ckn_p.toFixed(0)}%</span></td>
                                                        
                                                        <td className="p-4 text-right font-mono">{row.r_ckd_t.toLocaleString()}</td>
                                                        <td className="p-4 text-right font-mono text-green-600 font-bold">{row.r_ckd_a.toLocaleString()}</td>
                                                        <td className="p-4 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.r_ckd_p >= 100 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{row.r_ckd_p.toFixed(0)}%</span></td>

                                                        <td className="p-4 text-right font-mono">{row.r_pkg_t.toLocaleString()}</td>
                                                        <td className="p-4 text-right font-mono text-yellow-600 font-bold">{row.r_pkg_a.toLocaleString()}</td>
                                                        <td className="p-4 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.r_pkg_p >= 100 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{row.r_pkg_p.toFixed(0)}%</span></td>

                                                        <td className="p-4 text-right font-mono bg-slate-50 font-bold">{row.total_rev_t.toLocaleString()}</td>
                                                        <td className="p-4 text-right font-mono bg-slate-50 text-purple-600 font-black">{row.total_rev_a.toLocaleString()}</td>
                                                        <td className="p-4 bg-slate-50">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                    <div className={`h-full rounded-full ${row.total_rev_p >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{width: `${Math.min(row.total_rev_p, 100)}%`}}></div>
                                                                </div>
                                                                <span className="text-[10px] font-black">{row.total_rev_p.toFixed(0)}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in p-6 bg-slate-50 rounded-2xl border h-full overflow-y-auto">
                        
                        {/* SUB TABS FOR CONFIG */}
                        <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                            <button onClick={() => setConfigTab('general')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${configTab === 'general' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                                <LayoutTemplate size={14}/> 1. Dữ liệu Tổng hợp
                            </button>
                            <button onClick={() => setConfigTab('agent')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${configTab === 'agent' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                                <Users size={14}/> 2. Dữ liệu Điện thoại viên
                            </button>
                        </div>

                        {/* CONFIG CONTENT */}
                        <div className="space-y-6">
                             <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Link Google Sheet (CSV) - {configTab === 'general' ? 'Tổng hợp' : 'Chi tiết ĐTV'}
                                </label>
                                <div className="flex gap-2">
                                    <input 
                                        value={configTab === 'general' ? (generalConfig.url || '') : (agentConfig.url || '')} 
                                        onChange={e => {
                                            if (configTab === 'general') setGeneralConfig({...generalConfig, url: e.target.value});
                                            else setAgentConfig({...agentConfig, url: e.target.value});
                                        }} 
                                        className="w-full border-2 p-3 rounded-xl bg-white font-mono text-xs"
                                        placeholder="https://docs.google.com/spreadsheets/d/..."
                                    />
                                    <button 
                                        onClick={() => handleReadSheet(configTab)} 
                                        disabled={isProcessing} 
                                        className="bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                                    >
                                        {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Table size={14}/>} Đọc
                                    </button>
                                </div>
                             </div>

                             {((configTab === 'general' && generalColumns.length > 0) || (configTab === 'agent' && agentColumns.length > 0)) && (
                                <div className="space-y-6">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ánh xạ dữ liệu ({configTab === 'general' ? 'Tổng hợp' : 'ĐTV'})</label>
                                    
                                    {configTab === 'agent' ? (
                                        <>
                                            <div className="bg-white p-4 rounded-xl border space-y-4">
                                                <h5 className="text-xs font-bold text-slate-800 uppercase border-b pb-2 flex items-center gap-2"><UserIcon size={14}/> Thông tin chung</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <MappingSelect label="Tên Điện thoại viên" field="agent_name" type="agent" />
                                                    <MappingSelect label="Tổng Ready Time" field="ready_time_total" type="agent" />
                                                    <MappingSelect label="BQ Ready Time" field="ready_time_avg" type="agent" />
                                                </div>
                                            </div>
                                            
                                            {/* REVENUE MAPPING (Agent) - ACTUALS ONLY */}
                                            <div className="bg-white p-4 rounded-xl border space-y-4">
                                                <h5 className="text-xs font-bold text-blue-600 uppercase border-b pb-2">I. Chỉ tiêu Doanh thu (Map cột Thực hiện)</h5>
                                                <div className="grid grid-cols-3 gap-4">
                                                    <MappingSelect label="CKN - Thực hiện (VNĐ)" field="rev_ckn_a" type="agent" />
                                                    <MappingSelect label="CKD - Thực hiện (VNĐ)" field="rev_ckd_a" type="agent" />
                                                    <MappingSelect label="Bán gói - Thực hiện (VNĐ)" field="rev_pkg_a" type="agent" />
                                                </div>
                                            </div>

                                            {/* PERFORMANCE MAPPING (Agent) */}
                                            <div className="bg-white p-4 rounded-xl border space-y-4">
                                                <h5 className="text-xs font-bold text-green-600 uppercase border-b pb-2">II. Hiệu suất & Chuyển đổi (SL Thuê bao)</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div className="space-y-3 p-3 bg-slate-50 rounded-xl border">
                                                        <MappingSelect label="Tỷ lệ Gia hạn CKN (%)" field="ckn_rate" type="agent" />
                                                    </div>
                                                    <div className="space-y-3 p-3 bg-slate-50 rounded-xl border">
                                                        <MappingSelect label="Tỷ lệ Gia hạn CKD (%)" field="ckd_rate" type="agent" />
                                                    </div>
                                                    <div className="space-y-3 p-3 bg-slate-50 rounded-xl border">
                                                        <MappingSelect label="Tỷ lệ Bán gói (%)" field="pkg_rate" type="agent" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* MANUAL TARGET TABLE */}
                                            <div className="bg-white p-4 rounded-xl border space-y-4">
                                                <div className="flex justify-between items-center border-b pb-2">
                                                    <h5 className="text-xs font-bold text-purple-600 uppercase">III. Nhập Kế hoạch giao (Theo ĐTV)</h5>
                                                    <button onClick={handlePopulateAgents} className="text-[10px] bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-black flex items-center gap-1">
                                                        <Users size={12}/> Lấy danh sách ĐTV từ dữ liệu Import
                                                    </button>
                                                </div>
                                                <div className="overflow-x-auto max-h-[300px]">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-slate-50 text-slate-500 font-bold">
                                                            <tr>
                                                                <th className="p-2 text-left sticky top-0 bg-slate-50 z-10">Tên ĐTV</th>
                                                                <th className="p-2 text-center sticky top-0 bg-slate-50 z-10 w-[120px]">KH CKN</th>
                                                                <th className="p-2 text-center sticky top-0 bg-slate-50 z-10 w-[120px]">KH CKD</th>
                                                                <th className="p-2 text-center sticky top-0 bg-slate-50 z-10 w-[120px]">KH Bán gói</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {Object.keys(agentConfig.manualTargets || {}).length === 0 ? (
                                                                <tr><td colSpan={4} className="p-4 text-center italic text-slate-400">Chưa có danh sách ĐTV. Nhấn nút trên để lấy từ file Import.</td></tr>
                                                            ) : (
                                                                Object.keys(agentConfig.manualTargets || {}).sort().map(name => (
                                                                    <tr key={name}>
                                                                        <td className="p-2 font-bold">{name}</td>
                                                                        <td className="p-1"><input type="number" className="w-full border p-1 rounded text-right font-mono" value={agentConfig.manualTargets[name].ckn} onChange={e => setAgentConfig({...agentConfig, manualTargets: {...agentConfig.manualTargets, [name]: {...agentConfig.manualTargets[name], ckn: Number(e.target.value)}}})}/></td>
                                                                        <td className="p-1"><input type="number" className="w-full border p-1 rounded text-right font-mono" value={agentConfig.manualTargets[name].ckd} onChange={e => setAgentConfig({...agentConfig, manualTargets: {...agentConfig.manualTargets, [name]: {...agentConfig.manualTargets[name], ckd: Number(e.target.value)}}})}/></td>
                                                                        <td className="p-1"><input type="number" className="w-full border p-1 rounded text-right font-mono" value={agentConfig.manualTargets[name].pkg} onChange={e => setAgentConfig({...agentConfig, manualTargets: {...agentConfig.manualTargets, [name]: {...agentConfig.manualTargets[name], pkg: Number(e.target.value)}}})}/></td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        // GENERAL CONFIG
                                        <>
                                            {/* REVENUE MAPPING */}
                                            <div className="bg-white p-4 rounded-xl border space-y-4">
                                                <h5 className="text-xs font-bold text-blue-600 uppercase border-b pb-2">I. Chỉ tiêu Doanh thu</h5>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <MappingSelect label="CKN - Kế hoạch (VNĐ)" field="rev_ckn_t" type={configTab} />
                                                    <MappingSelect label="CKN - Thực hiện (VNĐ)" field="rev_ckn_a" type={configTab} />
                                                    <MappingSelect label="CKD - Kế hoạch (VNĐ)" field="rev_ckd_t" type={configTab} />
                                                    <MappingSelect label="CKD - Thực hiện (VNĐ)" field="rev_ckd_a" type={configTab} />
                                                    <MappingSelect label="Bán gói - Kế hoạch (VNĐ)" field="rev_pkg_t" type={configTab} />
                                                    <MappingSelect label="Bán gói - Thực hiện (VNĐ)" field="rev_pkg_a" type={configTab} />
                                                </div>
                                            </div>

                                            {/* PERFORMANCE MAPPING (General) - Keeps existing complex structure */}
                                            <div className="bg-white p-4 rounded-xl border space-y-4">
                                                <h5 className="text-xs font-bold text-green-600 uppercase border-b pb-2">II. Hiệu suất & Chuyển đổi (SL Thuê bao)</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    {/* CKN Group */}
                                                    <div className="space-y-3 p-3 bg-slate-50 rounded-xl border">
                                                        <div className="text-[10px] font-black text-slate-500 uppercase text-center">Gia hạn CKN</div>
                                                        <MappingSelect label="SL Giao (Assign)" field="ckn_assign" type={configTab} />
                                                        <MappingSelect label="SL Gọi (Executed)" field="ckn_exec" type={configTab} />
                                                        <MappingSelect label="SL Thành công" field="ckn_success" type={configTab} />
                                                    </div>
                                                    {/* CKD Group */}
                                                    <div className="space-y-3 p-3 bg-slate-50 rounded-xl border">
                                                        <div className="text-[10px] font-black text-slate-500 uppercase text-center">Gia hạn CKD</div>
                                                        <MappingSelect label="SL Giao (Assign)" field="ckd_assign" type={configTab} />
                                                        <MappingSelect label="SL Gọi (Executed)" field="ckd_exec" type={configTab} />
                                                        <MappingSelect label="SL Thành công" field="ckd_success" type={configTab} />
                                                    </div>
                                                    {/* Package Group */}
                                                    <div className="space-y-3 p-3 bg-slate-50 rounded-xl border">
                                                        <div className="text-[10px] font-black text-slate-500 uppercase text-center">Bán Gói Cước</div>
                                                        <MappingSelect label="SL Giao (Assign)" field="pkg_assign" type={configTab} />
                                                        <MappingSelect label="SL Gọi (Executed)" field="pkg_exec" type={configTab} />
                                                        <MappingSelect label="SL Thành công" field="pkg_success" type={configTab} />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                             )}

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button onClick={() => handleSaveConfig(configTab)} className="bg-slate-200 text-slate-700 px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2">
                                    <Save size={14}/> Lưu cấu hình ({configTab === 'general' ? 'Tổng hợp' : 'ĐTV'})
                                </button>
                                <button onClick={() => handleSyncData(configTab)} disabled={isProcessing} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2">
                                    <Import size={14}/> Đồng bộ dữ liệu ({configTab === 'general' ? 'Tổng hợp' : 'ĐTV'})
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ObTelesale;
