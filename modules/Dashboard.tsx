
import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Task, TaskStatus, Unit, User, Role, PersonalTask, KPIDefinition } from '../types';
import { Wifi, Tv, Rss, Camera, UserPlus, BarChartBig, TrendingUp, Zap, Briefcase, Calendar as CalendarIcon, Smartphone, StickyNote, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { dbClient } from '../utils/firebaseClient';
import * as XLSX from 'xlsx';

interface DashboardProps {
  tasks: Task[];
  units: Unit[];
  users: User[];
  currentUser: User;
  groupKpi: any[];
  kpiDefinitions: KPIDefinition[];
  systemSettings: any;
  onRefresh: () => void;
}

const kpiDetails: Record<string, { icon: React.ReactElement, color: string, bgColor: string }> = {
  fiber: { icon: <Wifi size={24}/>, color: 'text-sky-500', bgColor: 'bg-sky-50' },
  mytv: { icon: <Tv size={24}/>, color: 'text-purple-500', bgColor: 'bg-purple-50' },
  mesh: { icon: <Rss size={24}/>, color: 'text-amber-500', bgColor: 'bg-amber-50' },
  camera: { icon: <Camera size={24}/>, color: 'text-slate-500', bgColor: 'bg-slate-50' },
  mobile_ptm: { icon: <UserPlus size={24}/>, color: 'text-pink-500', bgColor: 'bg-pink-50' },
  mobile_rev: { icon: <Smartphone size={24}/>, color: 'text-blue-500', bgColor: 'bg-blue-50' },
  revenue: { icon: <BarChartBig size={24}/>, color: 'text-green-500', bgColor: 'bg-green-50' },
};


const Dashboard: React.FC<DashboardProps> = ({ tasks, units, users, currentUser, groupKpi, kpiDefinitions, systemSettings, onRefresh }) => {
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isLeader = [Role.DIRECTOR, Role.VICE_DIRECTOR, Role.MANAGER, Role.VICE_MANAGER].includes(currentUser.title as Role);
  const myAccessibleUnits = currentUser.accessibleUnitIds || [currentUser.unitId];
  
  const groupKpiDefs = useMemo(() => kpiDefinitions.filter(d => d.type === 'group' || d.type === 'both'), [kpiDefinitions]);

  useEffect(() => {
    const fetchPersonal = async () => {
      const all = await dbClient.getAll('personal_tasks');
      setPersonalTasks((all as PersonalTask[]).filter(t => t.userId === currentUser.id));
    };
    fetchPersonal();
  }, [currentUser.id]);

  const handleSyncKpi = async () => {
    const isAdmin = currentUser.username === 'admin';
    const currentMonth = new Date().toISOString().slice(0, 7);

    // 1. Kiểm tra quyền đồng bộ
    if (!isAdmin && !systemSettings?.allowKpiSync) {
        alert("Chức năng đồng bộ KPI đang bị khóa bởi Quản trị viên.");
        return;
    }

    let monthToSync = currentMonth;
    
    // 2. Nếu là Admin thì được chọn tháng, User khác mặc định tháng hiện tại
    if (isAdmin) {
        const input = prompt("Nhập tháng muốn đồng bộ dữ liệu (định dạng YYYY-MM):", currentMonth);
        if (!input) return; // Người dùng hủy
        if (!/^\d{4}-\d{2}$/.test(input)) {
            alert("Định dạng tháng không hợp lệ. Vui lòng nhập YYYY-MM.");
            return;
        }
        monthToSync = input;
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
            alert(`Không tìm thấy dữ liệu hoặc cấu hình import cho tháng ${monthToSync}. Vui lòng liên hệ Admin.`);
        }

    } catch (e) {
        console.error("Sync error:", e);
        alert("Đã xảy ra lỗi trong quá trình đồng bộ dữ liệu.");
    } finally {
        setIsSyncing(false);
    }
  };

  // 1. Điểm tin KPI - Lọc theo đơn vị được phép
  const provinceKpi = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const records = groupKpi.filter(r => r.period === currentMonth && r.type === 'group' && (currentUser.username === 'admin' || myAccessibleUnits.includes(units.find(u => u.code === r.entityId)?.id || '')));
    const summary: any = {};
    groupKpiDefs.forEach(def => {
      let t = 0, a = 0;
      records.forEach(r => {
        t += r.targets?.[def.id]?.target || 0;
        a += r.targets?.[def.id]?.actual || 0;
      });
      summary[def.id] = { target: t, actual: a, percent: t > 0 ? Math.round((a/t)*100) : 0 };
    });
    return summary;
  }, [groupKpi, units, currentUser, myAccessibleUnits, groupKpiDefs]);

  // 2. Thống kê công việc - Lọc theo quyền xem
  const myTasks = useMemo(() => {
    if (currentUser.username === 'admin') return tasks;
    return tasks.filter(t => 
      // Điều kiện cơ bản: Công việc liên quan trực tiếp đến người dùng
      t.assignerId === currentUser.id ||
      t.primaryAssigneeIds.includes(currentUser.id) || 
      t.supportAssigneeIds.includes(currentUser.id) ||
      // Điều kiện mở rộng cho Lãnh đạo: Xem tất cả công việc từ đơn vị mình quản lý
      (isLeader && myAccessibleUnits.includes(users.find(u => u.id === t.assignerId)?.unitId || ''))
    );
  }, [tasks, currentUser, myAccessibleUnits, users, isLeader]);

  const taskStats = {
    total: myTasks.length,
    completed: myTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
    inProgress: myTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
    overdue: myTasks.filter(t => t.status === TaskStatus.OVERDUE || (new Date(t.deadline) < new Date() && t.status !== TaskStatus.COMPLETED)).length,
    nearDeadline: myTasks.filter(t => {
      const diff = new Date(t.deadline).getTime() - new Date().getTime();
      return diff > 0 && diff < 86400000 * 3 && t.status !== TaskStatus.COMPLETED;
    }).length
  };

  const personalMonthStats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const thisMonth = personalTasks.filter(t => t.deadline.startsWith(currentMonth));
    return {
      total: thisMonth.length,
      completed: thisMonth.filter(t => t.status === 'Đã hoàn thành').length,
      inProgress: thisMonth.filter(t => t.status === 'Đang xử lý').length,
      pending: thisMonth.filter(t => t.status === 'Chưa xử lý').length,
    };
  }, [personalTasks]);

  return (
    <div className="space-y-12 animate-fade-in pb-10">
      <div className="flex justify-between items-end border-b-4 border-slate-100 pb-8">
        <div>
          <div className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-2 flex items-center gap-2"><Zap size={14}/> Hệ thống điều hành VNPT QN</div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Chào {currentUser.fullName}!</h2>
        </div>
        <div className="text-right hidden sm:block">
          <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest bg-slate-100 px-4 py-2 rounded-2xl">
            <CalendarIcon size={14}/> {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-12">
            <section className="space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
                  <TrendingUp className="text-blue-600" size={24}/> Điểm tin sản lượng & doanh thu
                </h3>
                <button 
                  onClick={handleSyncKpi} 
                  disabled={isSyncing} 
                  className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-200 transition-all disabled:bg-slate-300">
                  {isSyncing ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>}
                  Đồng bộ KPI
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupKpiDefs.map(def => {
                  const key = def.id;
                  const data = provinceKpi[key] || { target: 0, actual: 0, percent: 0 };
                  const details = kpiDetails[key] || { icon: <BarChartBig size={24}/>, color: 'text-slate-500', bgColor: 'bg-slate-50' };
                  return (
                    <div key={key} className="bg-white p-6 rounded-[32px] shadow-sm border flex flex-col justify-between">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${details.bgColor} ${details.color}`}>
                          {details.icon}
                        </div>
                        <div className={`text-xl font-black ${details.color}`}>{data.percent}%</div>
                      </div>
                      <div className="mt-auto">
                        <h4 className="text-sm font-bold text-slate-800 leading-tight mb-1 truncate">{def.name}</h4>
                        <div className="text-2xl font-black text-slate-800">
                          {data.actual.toLocaleString()}
                          <span className="text-xs font-mono text-slate-400 ml-2">/ {data.target.toLocaleString()}</span>
                        </div>
                        <div className="mt-4">
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className={`${details.color.replace('text-', 'bg-')} h-full rounded-full`} style={{ width: `${Math.min(data.percent, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </section>

            <section className="space-y-8">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
                <Briefcase className="text-orange-500" size={24}/> Tình hình công việc xử lý
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[32px] border-2 border-slate-50 text-center group">
                  <div className="text-3xl font-black text-slate-800">{taskStats.total}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">Tổng việc</div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border-2 border-slate-50 text-center group">
                  <div className="text-3xl font-black text-green-600">{taskStats.completed}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">Hoàn thành</div>
                </div>
                <div className="bg-red-50 p-6 rounded-[32px] border-2 border-red-100 text-center group">
                  <div className="text-3xl font-black text-red-600">{taskStats.overdue}</div>
                  <div className="text-[9px] font-black text-red-400 uppercase tracking-widest mt-2">Quá hạn</div>
                </div>
              </div>
            </section>
        </div>

        <div className="space-y-8">
           <section className="space-y-6">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
                <StickyNote className="text-amber-500" size={24}/> Việc cá nhân trong tháng
              </h3>
              <div className="bg-white rounded-[40px] border shadow-sm p-8 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                
                <div className="flex items-center gap-6">
                   <div className="text-5xl font-black text-amber-500">{personalMonthStats.total}</div>
                   <div>
                      <div className="text-xs font-black text-slate-800 uppercase">Tổng đầu việc</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Ghi chú cá nhân tháng {new Date().getMonth()+1}</div>
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t pt-8">
                   <div className="text-center">
                      <div className="text-xl font-black text-green-600">{personalMonthStats.completed}</div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mt-1">Xong</div>
                   </div>
                   <div className="text-center border-x">
                      <div className="text-xl font-black text-blue-500">{personalMonthStats.inProgress}</div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mt-1">Đang xử lý</div>
                   </div>
                   <div className="text-center">
                      <div className="text-xl font-black text-slate-400">{personalMonthStats.pending}</div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mt-1">Chưa làm</div>
                   </div>
                </div>

                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                    <div className="text-[10px] font-black text-amber-700 uppercase mb-3 flex items-center justify-between">
                       <span>Danh sách việc cần lưu ý</span>
                       <ArrowRight size={14}/>
                    </div>
                    <div className="space-y-3">
                       {personalTasks.filter(t => t.status !== 'Đã hoàn thành').slice(0, 3).map(pt => (
                         <div key={pt.id} className="flex items-start gap-2 group">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0"></div>
                            <span className="text-[11px] font-bold text-slate-600 line-clamp-1 group-hover:text-amber-600 cursor-default">{pt.name}</span>
                         </div>
                       ))}
                       {personalMonthStats.total === 0 && <div className="text-[10px] text-slate-400 italic">Tháng này chưa có việc.</div>}
                    </div>
                </div>
              </div>
           </section>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
