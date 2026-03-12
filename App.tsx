
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './modules/Dashboard';
import Admin from './modules/Admin';
import Tasks from './modules/Tasks';
import KPI from './modules/KPI';
import Settings from './modules/Settings';
import PersonalTasks from './modules/PersonalTasks';
import Reports from './modules/Reports';
import MobileOps from './modules/MobileOps';
import ObTelesale from './modules/ObTelesale';
import { dbClient } from './utils/firebaseClient'; 
import { Task, Unit, User, Role, KPIDefinition } from './types';
import { Search, LogOut, Loader2, Database, ShieldAlert, RefreshCw, Key, ShieldCheck, Save } from 'lucide-react';
import md5 from 'md5'; 

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isInitialLoading, setIsInitialLoading] = useState(true); 
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeModule, setActiveModule] = useState(() => localStorage.getItem('vnpt_active_module') || 'dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // System Settings
  const [systemSettings, setSystemSettings] = useState<any>({ allowKpiSync: false });

  // State cho màn hình cưỡng bức đổi mật khẩu
  const [forcePassData, setForcePassData] = useState({ new: '', confirm: '' });
  const [isSubmittingForcePass, setIsSubmittingForcePass] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [kpiDefinitions, setKpiDefinitions] = useState<KPIDefinition[]>([]);
  
  useEffect(() => {
    localStorage.setItem('vnpt_active_module', activeModule);
  }, [activeModule]);

  const fetchInitialData = useCallback(async (isSilent = false) => {
      if (!isSilent) setIsInitialLoading(true);
      else setIsRefreshing(true);
      
      try {
          const [
              unitsData, usersData, tasksData, kpisData, kpiDefsDataResult, settingsData
          ] = await Promise.all([
              dbClient.getAll('units'),
              dbClient.getAll('users'),
              dbClient.getAll('tasks'),
              dbClient.getAll('kpis'),
              dbClient.getAll('kpi_definitions'),
              dbClient.getById('system_settings', 'general')
          ]);

          let kpiDefsData = kpiDefsDataResult as KPIDefinition[];
          if (kpiDefsData.length === 0) {
              const defaultKpis: KPIDefinition[] = [
                { id: 'fiber', name: "PTTB FiberVNN", type: 'group', unit: 'TB', order: 1 },
                { id: 'mytv', name: "PTTB MyTV", type: 'group', unit: 'TB', order: 2 },
                { id: 'mesh', name: "PTTB Mesh", type: 'group', unit: 'TB', order: 3 },
                { id: 'camera', name: "PTTB Camera", type: 'group', unit: 'TB', order: 4 },
                { id: 'mobile_ptm', name: "PTTB Di động", type: 'group', unit: 'TB', order: 5 },
                { id: 'mobile_rev', name: "Doanh thu Di động", type: 'group', unit: 'VNĐ', order: 6 },
                { id: 'revenue', name: "Doanh thu VT-CNTT", type: 'group', unit: 'VNĐ', order: 7 }
              ];
              for (const kpi of defaultKpis) await dbClient.upsert('kpi_definitions', kpi.id, kpi);
              kpiDefsData = defaultKpis;
          }
          
          setUnits(unitsData as Unit[]);
          setUsers(usersData as User[]);
          setTasks(tasksData as Task[]);
          setKpis(kpisData || []);
          setKpiDefinitions(kpiDefsData.sort((a,b) => (a.order || 99) - (b.order || 99)));
          if (settingsData) {
            setSystemSettings(settingsData);
          }
          
          const stored = localStorage.getItem('vnpt_user_session');
          if (stored) {
              const parsed = JSON.parse(stored);
              const updated = (usersData as User[]).find(u => u.id === parsed.id);
              if (updated) {
                  setCurrentUser(updated);
                  localStorage.setItem('vnpt_user_session', JSON.stringify(updated));
              }
          }
      } catch (error) {
          console.error("Lỗi tải dữ liệu:", error);
      } finally {
          setIsInitialLoading(false);
          setIsRefreshing(false);
      }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('vnpt_user_session');
  };

  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      const hashedInput = md5(loginPassword);
      const user = users.find(u => u.username === loginUsername && (u.password === hashedInput || u.password === loginPassword));
      if (user) {
          setCurrentUser(user);
          localStorage.setItem('vnpt_user_session', JSON.stringify(user));
      } else {
          alert("Tên đăng nhập hoặc mật khẩu không chính xác.");
      }
  };

  const handleForceChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
      
      if (!regex.test(forcePassData.new)) {
          return alert("Mật khẩu không đạt yêu cầu: Tối thiểu 8 ký tự, bao gồm chữ cái, chữ số và 1 ký tự đặc biệt.");
      }
      if (forcePassData.new !== forcePassData.confirm) {
          return alert("Mật khẩu xác nhận không khớp.");
      }

      setIsSubmittingForcePass(true);
      try {
          if (!currentUser) return;
          const updatedUser = { ...currentUser, password: md5(forcePassData.new), isFirstLogin: false };
          await dbClient.update('users', currentUser.id, { password: updatedUser.password, isFirstLogin: false });
          setCurrentUser(updatedUser);
          localStorage.setItem('vnpt_user_session', JSON.stringify(updatedUser));
          alert("Chúc mừng! Bạn đã kích hoạt tài khoản thành công.");
      } catch (err) {
          alert("Có lỗi xảy ra khi đổi mật khẩu.");
      } finally {
          setIsSubmittingForcePass(false);
      }
  };

  if (currentUser && currentUser.isFirstLogin) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 bg-[url('https://www.toptal.com/designers/subtlepatterns/uploads/dot-grid.png')]">
              <div className="bg-white p-12 rounded-[48px] shadow-2xl w-full max-w-lg border-b-8 border-blue-600 animate-zoom-in">
                  <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-blue-100 rounded-3xl mx-auto mb-6 flex items-center justify-center text-blue-600"><Key size={40} /></div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Kích hoạt tài khoản</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Vui lòng đổi mật khẩu mặc định để tiếp tục</p>
                  </div>
                  <form onSubmit={handleForceChangePassword} className="space-y-6">
                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-1"><p className="text-[10px] font-black text-blue-800 uppercase flex items-center gap-2"><ShieldCheck size={14}/> Quy định bảo mật VNPT QN:</p><p className="text-[9px] font-bold text-blue-600 leading-tight">Mật khẩu mới phải dài ít nhất 8 ký tự, bao gồm cả chữ cái, chữ số và ít nhất một ký tự đặc biệt (!@#$%^&*).</p></div>
                      <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu mới</label><input type="password" required className="w-full border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 bg-slate-50" value={forcePassData.new} onChange={e => setForcePassData({...forcePassData, new: e.target.value})} /></div>
                      <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Xác nhận mật khẩu</label><input type="password" required className="w-full border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 bg-slate-50" value={forcePassData.confirm} onChange={e => setForcePassData({...forcePassData, confirm: e.target.value})} /></div>
                      <div className="flex gap-4"><button type="button" onClick={handleLogout} className="flex-1 py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest text-slate-400">Đăng xuất</button><button type="submit" disabled={isSubmittingForcePass} className="flex-[2] bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-100 flex items-center justify-center gap-2">{isSubmittingForcePass ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Lưu & Truy cập</button></div>
                  </form>
              </div>
          </div>
      );
  }

  const renderModule = () => {
    if (isInitialLoading) return <div className="flex flex-col items-center justify-center h-full gap-4 text-blue-600 font-bold"><Loader2 className="animate-spin" size={48} /> <span>Đang kết nối Cloud...</span></div>;
    switch (activeModule) {
      case 'dashboard': return <Dashboard tasks={tasks} units={units} users={users} currentUser={currentUser!} groupKpi={kpis} kpiDefinitions={kpiDefinitions} systemSettings={systemSettings} onRefresh={() => fetchInitialData(true)} />;
      case 'admin': return <Admin units={units} users={users} currentUser={currentUser!} onRefresh={() => fetchInitialData(true)} />;
      case 'tasks': return <Tasks tasks={tasks} users={users} units={units} currentUser={currentUser!} onRefresh={() => fetchInitialData(true)} />;
      case 'personal-tasks': return <PersonalTasks currentUser={currentUser!} />;
      case 'mobile-ops': return <MobileOps currentUser={currentUser!} units={units} systemSettings={systemSettings} onRefresh={() => fetchInitialData(true)} />;
      case 'ob-telesale': return <ObTelesale currentUser={currentUser!} systemSettings={systemSettings} onRefresh={() => fetchInitialData(true)} />;
      case 'kpi-personal': return <KPI mode="personal" users={users} units={units} currentUser={currentUser!} kpiDefinitions={kpiDefinitions} onRefresh={() => fetchInitialData(true)} />;
      case 'kpi-group': return <KPI mode="group" users={users} units={units} currentUser={currentUser!} kpiDefinitions={kpiDefinitions} onRefresh={() => fetchInitialData(true)} />;
      case 'reports': return <Reports tasks={tasks} units={units} users={users} currentUser={currentUser!} kpiDefinitions={kpiDefinitions} onRefresh={() => fetchInitialData(true)} />;
      case 'settings': return <Settings currentUser={currentUser!} onRefresh={() => fetchInitialData(true)} />;
      default: return <Dashboard tasks={tasks} units={units} users={users} currentUser={currentUser!} groupKpi={kpis} kpiDefinitions={kpiDefinitions} systemSettings={systemSettings} onRefresh={() => fetchInitialData(true)} />;
    }
  };

  if (!currentUser) {
      return (
          <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6 bg-[url('https://www.toptal.com/designers/subtlepatterns/uploads/dot-grid.png')]">
              <div className="bg-white p-12 rounded-[40px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] w-full max-w-md border border-white relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
                  <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-blue-200"><Database className="text-white" size={40} /></div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tighter">VNPT QUẢNG NINH</h1>
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">Management System v1.9.5 (Firebase)</p>
                  </div>
                  <form onSubmit={handleLogin} className="space-y-5 animate-fade-in">
                      <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên đăng nhập</label><input type="text" required className="w-full border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 bg-slate-50" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} /></div>
                      <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu</label><input type="password" required className="w-full border-2 border-slate-100 rounded-2xl p-4 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 bg-slate-50" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></div>
                      <button type="submit" disabled={isInitialLoading} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center">{isInitialLoading ? <Loader2 className="animate-spin" /> : 'Vào hệ thống'}</button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <Sidebar activeModule={activeModule} setActiveModule={setActiveModule} isOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} currentUser={currentUser} />
      <div className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-16'} flex flex-col`}>
        <header className="h-20 bg-white/80 backdrop-blur-md sticky top-0 border-b px-8 flex items-center justify-between z-40">
           <div className="flex items-center gap-4"><div className="flex items-center bg-slate-100 rounded-2xl px-5 py-2.5 w-full max-w-md border border-slate-200"><Search size={18} className="text-slate-400 mr-2" /><input type="text" placeholder="Tìm nhanh..." className="bg-transparent border-none outline-none text-sm w-full font-bold text-slate-600" /></div></div>
           <div className="flex items-center gap-6"><div className="text-right hidden sm:block"><div className="text-sm font-black text-slate-800 leading-none uppercase tracking-tighter">{currentUser.fullName}</div><div className="text-[10px] text-blue-600 font-black uppercase tracking-widest mt-1">{currentUser.title}</div></div><div className="h-12 w-12 bg-gradient-to-tr from-blue-700 to-blue-500 rounded-2xl flex items-center justify-center text-white font-black shadow-xl shadow-blue-100 text-xl border-2 border-white overflow-hidden">{currentUser.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover" /> : currentUser.fullName.charAt(0)}</div><button onClick={handleLogout} className="text-slate-300 hover:text-red-600 transition-all p-2 hover:bg-red-50 rounded-xl"><LogOut size={24} /></button></div>
        </header>
        <main className="p-10 flex-1 overflow-x-hidden">{renderModule()}</main>
      </div>
    </div>
  );
};

export default App;
