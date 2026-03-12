
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Task, TaskStatus, Unit, User, Role, KPIDefinition } from '../types';
import { BarChartBig, Users, Building, RefreshCw, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { dbClient } from '../utils/firebaseClient';

interface ReportsProps {
  tasks: Task[];
  units: Unit[];
  users: User[];
  currentUser: User;
  kpiDefinitions: KPIDefinition[];
  onRefresh: () => void;
}

const Reports: React.FC<ReportsProps> = ({ tasks, units, users, currentUser, kpiDefinitions, onRefresh }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState<'unit' | 'user'>('unit');
  const [isSyncing, setIsSyncing] = useState(false);

  const isLeader = [Role.DIRECTOR, Role.VICE_DIRECTOR, Role.MANAGER, Role.VICE_MANAGER].includes(currentUser.title as Role);
  const myAccessibleUnits = currentUser.accessibleUnitIds || [currentUser.unitId];

  const handleSyncData = async () => {
    const monthToSync = prompt("Nhập tháng muốn đồng bộ dữ liệu (định dạng YYYY-MM):", selectedMonth);
    if (!monthToSync || !/^\d{4}-\d{2}$/.test(monthToSync)) {
        if (monthToSync) alert("Định dạng tháng không hợp lệ. Vui lòng nhập YYYY-MM.");
        return;
    }
    
    setIsSyncing(true);
    try {
        const modes: ('personal' | 'group')[] = ['personal', 'group'];
        let totalSynced = 0;
        let syncedModes = [];

        for (const mode of modes) {
            const configDoc = await dbClient.getById('kpi_configs', `${mode}_${monthToSync}`);
            if (!configDoc || !configDoc.url || !configDoc.mapping?.id) {
                console.warn(`Không tìm thấy cấu hình import cho ${mode} tháng ${monthToSync}`);
                continue;
            }
            
            const config = configDoc;
            let finalUrl = config.url.trim();
            if (finalUrl.includes('/edit')) {
                finalUrl = finalUrl.split('/edit')[0] + '/export?format=csv';
            }
            
            const res = await fetch(finalUrl);
            if (!res.ok) {
                console.warn(`Could not fetch KPI data for ${mode} from ${finalUrl}`);
                continue;
            }
            
            const csv = await res.text();
            const wb = XLSX.read(csv, { type: 'string' });
            const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

            let count = 0;
            for (const row of rows) {
                const entityId = String(row[config.mapping.id] || '').trim();
                if (!entityId) continue;
                
                const targets: any = {};
                kpiDefinitions.forEach(def => {
                    const k = def.id;
                    targets[k] = {
                        target: Number(row[config.mapping[`${k}_t`]] || 0),
                        actual: Number(row[config.mapping[`${k}_a`]] || 0)
                    };
                });
                
                const docId = `${mode}_${monthToSync}_${entityId}`;
                await dbClient.upsert('kpis', docId, { period: monthToSync, entityId, type: mode, targets });
                count++;
            }
            if (count > 0) {
                syncedModes.push(mode === 'group' ? 'Tập thể' : 'Cá nhân');
                totalSynced += count;
            }
        }

        if (totalSynced > 0) {
            alert(`Đồng bộ hoàn tất!\n- Dữ liệu: ${syncedModes.join(', ')}\n- Tháng: ${monthToSync}\n- Số bản ghi: ${totalSynced}`);
            onRefresh();
        } else {
            alert(`Không tìm thấy dữ liệu hoặc cấu hình import cho tháng ${monthToSync}. Vui lòng kiểm tra lại hoặc yêu cầu Admin thiết lập.`);
        }

    } catch (e) {
        console.error("Sync error:", e);
        alert("Đã xảy ra lỗi trong quá trình đồng bộ dữ liệu. Vui lòng kiểm tra lại URL trong phần cấu hình KPI.");
    } finally {
        setIsSyncing(false);
    }
  };

  const reportData = useMemo(() => {
    // 1. Lọc công việc theo tháng và quyền hạn
    const tasksInMonth = tasks.filter(t => {
      if (!t.dateAssigned || !t.dateAssigned.startsWith(selectedMonth)) return false;
      if (currentUser.username === 'admin') return true;

      // Check direct involvement
      const isRelated = t.assignerId === currentUser.id || 
                        t.primaryAssigneeIds.includes(currentUser.id) || 
                        t.supportAssigneeIds.includes(currentUser.id);
      
      if (isLeader) {
        // Nếu là công việc liên quan trực tiếp -> Hiển thị
        if (isRelated) return true;

        // Nếu là Lãnh đạo -> Xem được công việc được giao cho nhân sự thuộc đơn vị mình quản lý
        if (t.primaryAssigneeIds.length > 0) {
            const primaryAssignee = users.find(u => u.id === t.primaryAssigneeIds[0]);
            if (primaryAssignee && primaryAssignee.unitId && myAccessibleUnits.includes(primaryAssignee.unitId)) {
                return true;
            }
        }

        // Nếu là Lãnh đạo -> Xem được công việc do nhân sự thuộc đơn vị mình quản lý đi giao (giao việc)
        const assigner = users.find(u => u.id === t.assignerId);
        if (assigner && assigner.unitId && myAccessibleUnits.includes(assigner.unitId)) {
            return true;
        }

        return false;
      }
      return isRelated;
    });

    const results: { [key: string]: { name: string, total: number, completed: number, stuck: number, overdue: number } } = {};

    // 2. Gom nhóm và tính toán
    tasksInMonth.forEach(task => {
      const primaryAssigneeId = task.primaryAssigneeIds[0];
      if (!primaryAssigneeId) return;

      const assignee = users.find(u => u.id === primaryAssigneeId);
      if (!assignee) return;

      const key = viewMode === 'unit' ? assignee.unitId : assignee.id;
      const name = viewMode === 'unit' ? (units.find(u => u.id === assignee.unitId)?.name || 'N/A') : (assignee.fullName || 'N/A');

      if (!results[key]) {
        results[key] = { name, total: 0, completed: 0, stuck: 0, overdue: 0 };
      }
      results[key].total++;
      if (task.status === TaskStatus.COMPLETED) results[key].completed++;
      if (task.status === TaskStatus.STUCK) results[key].stuck++;
      if (task.status === TaskStatus.OVERDUE) results[key].overdue++;
    });

    // 3. Tính tỷ lệ và trả về mảng
    return Object.values(results).map(r => ({
      ...r,
      completionRate: r.total > 0 ? Math.round(((r.completed + r.stuck) / r.total) * 100) : 0
    })).sort((a, b) => b.completionRate - a.completionRate);

  }, [selectedMonth, viewMode, tasks, users, units, currentUser, isLeader, myAccessibleUnits]);

  const overallStats = useMemo(() => {
    return reportData.reduce((acc, item) => {
        acc.total += item.total;
        acc.completed += item.completed;
        acc.stuck += item.stuck;
        acc.overdue += item.overdue;
        return acc;
    }, { total: 0, completed: 0, stuck: 0, overdue: 0 });
  }, [reportData]);
  
  const overallRate = overallStats.total > 0 ? Math.round(((overallStats.completed + overallStats.stuck) / overallStats.total) * 100) : 0;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-center border-b pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter flex items-center gap-3">
            <BarChartBig className="text-blue-600" size={36}/> BÁO CÁO & ĐÁNH GIÁ
          </h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Kết quả thực hiện công việc theo tháng</p>
        </div>
      </div>

      <div className="bg-white rounded-[40px] shadow-sm border p-8 space-y-8">
        <div className="flex flex-wrap gap-4 justify-between items-center">
            <div className="flex items-center gap-4">
                <label className="text-xs font-black text-slate-400 uppercase">Chọn tháng:</label>
                <input type="month" className="border-2 rounded-2xl px-5 py-2.5 font-black text-sm bg-slate-50 outline-none" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                <button 
                  onClick={handleSyncData} 
                  disabled={isSyncing} 
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 flex items-center gap-2 hover:bg-blue-700 transition-all disabled:bg-slate-400"
                >
                  {isSyncing ? <Loader2 className="animate-spin" size={16}/> : <RefreshCw size={16}/>}
                  Đồng bộ dữ liệu
                </button>
            </div>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border">
                <button onClick={() => setViewMode('unit')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${viewMode === 'unit' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Building size={16}/> Theo Đơn vị</button>
                <button onClick={() => setViewMode('user')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${viewMode === 'user' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Users size={16}/> Theo Cá nhân</button>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100"><div className="text-3xl font-black text-blue-600">{overallStats.total}</div><div className="text-[10px] font-black text-blue-500 uppercase mt-2">Tổng CV</div></div>
            <div className="bg-green-50 p-6 rounded-3xl border border-green-100"><div className="text-3xl font-black text-green-600">{overallStats.completed}</div><div className="text-[10px] font-black text-green-500 uppercase mt-2">Hoàn thành</div></div>
            <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100"><div className="text-3xl font-black text-orange-600">{overallStats.stuck}</div><div className="text-[10px] font-black text-orange-500 uppercase mt-2">Vướng mắc</div></div>
            <div className="bg-red-50 p-6 rounded-3xl border border-red-100"><div className="text-3xl font-black text-red-600">{overallStats.overdue}</div><div className="text-[10px] font-black text-red-500 uppercase mt-2">Quá hạn</div></div>
            <div className="bg-slate-800 text-white p-6 rounded-3xl"><div className="text-3xl font-black">{overallRate}%</div><div className="text-[10px] font-black text-slate-300 uppercase mt-2">Tỷ lệ chung</div></div>
        </div>

        <div className="space-y-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest text-center">BIỂU ĐỒ TỶ LỆ HOÀN THÀNH ({viewMode === 'unit' ? 'ĐƠN VỊ' : 'CÁ NHÂN'})</h3>
            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} tick={{ fontSize: 10, fontWeight: 'bold' }}/>
                        <YAxis tickFormatter={(value) => `${value}%`} />
                        <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '16px' }} />
                        <Bar dataKey="completionRate" name="Tỷ lệ HT" fill="#0068FF" barSize={30} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest text-center mb-6">BẢNG DỮ LIỆU CHI TIẾT</h3>
            <div className="overflow-x-auto border rounded-3xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase border-b">
                  <tr>
                    <th className="p-4">{viewMode === 'unit' ? 'Đơn vị' : 'Cá nhân'}</th>
                    <th className="p-4 text-center">Tổng CV</th>
                    <th className="p-4 text-center">Hoàn thành</th>
                    <th className="p-4 text-center">Vướng mắc</th>
                    <th className="p-4 text-center">Quá hạn</th>
                    <th className="p-4 text-center">Tỷ lệ HT (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-bold text-slate-700">
                  {reportData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-all">
                      <td className="p-4 font-black">{item.name}</td>
                      <td className="p-4 text-center font-mono">{item.total}</td>
                      <td className="p-4 text-center font-mono text-green-600">{item.completed}</td>
                      <td className="p-4 text-center font-mono text-orange-600">{item.stuck}</td>
                      <td className="p-4 text-center font-mono text-red-600">{item.overdue}</td>
                      <td className="p-4 text-center">
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-black ${item.completionRate >= 80 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            {item.completionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>

      </div>
    </div>
  );
};

export default Reports;
