
import React from 'react';
import { LayoutDashboard, Users, CheckSquare, BarChart2, Settings, Menu, PieChart, StickyNote, BarChartBig, Smartphone, Headset } from 'lucide-react';
import { User } from '../types';

interface SidebarProps {
  activeModule: string;
  setActiveModule: (module: string) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  currentUser: User;
}

const Sidebar: React.FC<SidebarProps> = ({ activeModule, setActiveModule, isOpen, toggleSidebar, currentUser }) => {
  const isSystemAdmin = currentUser.username === 'admin';
  
  // Kiểm tra quyền truy cập module
  const hasAccess = (moduleId: string) => {
    if (isSystemAdmin) return true; // Admin hệ thống thấy tất cả
    if (moduleId === 'dashboard') return true; // Dashboard luôn hiện
    
    // Nếu user chưa được cấu hình allowedModules (user cũ), fallback theo logic cũ:
    // Mặc định hiện các module cơ bản, ẩn các module quản trị/dashboard chuyên sâu
    if (!currentUser.allowedModules) {
        if (moduleId === 'admin') return currentUser.canManageUsers; // Logic cũ cho admin
        if (['tasks', 'personal-tasks', 'kpi-personal', 'kpi-group', 'reports'].includes(moduleId)) return true;
        return false; // Mặc định ẩn mobile-ops, ob-telesale với user cũ chưa cấu hình
    }
    
    return currentUser.allowedModules.includes(moduleId);
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={20} /> },
    { id: 'tasks', label: 'Quản lý công việc', icon: <CheckSquare size={20} /> },
    { id: 'personal-tasks', label: 'Công việc cá nhân', icon: <StickyNote size={20} /> },
    { id: 'admin', label: 'Quản trị nhân sự', icon: <Users size={20} /> },
    { type: 'divider' },
    { id: 'mobile-ops', label: 'Dashboard CTHĐ di động', icon: <Smartphone size={20} /> },
    { id: 'ob-telesale', label: 'Dashboard TTCSKH', icon: <Headset size={20} /> },
    { id: 'kpi-group', label: 'KPI Tập thể', icon: <PieChart size={20} /> },
    { id: 'kpi-personal', label: 'KPI Cá nhân', icon: <BarChart2 size={20} /> },
    { type: 'divider' },
    { id: 'reports', label: 'Báo cáo & Đánh giá', icon: <BarChartBig size={20} /> },
  ].filter(item => {
      if (!item) return false;
      if (item.type === 'divider') return true;
      return hasAccess(item.id!);
  });

  // Clean up dividers (remove consecutive dividers or dividers at ends)
  const cleanedMenuItems = menuItems.filter((item, index, arr) => {
      if (item.type === 'divider') {
          if (index === 0 || index === arr.length - 1) return false;
          if (arr[index - 1].type === 'divider') return false;
      }
      return true;
  });

  return (
    <div className={`fixed left-0 top-0 h-full bg-[#0f172a] text-white transition-all duration-300 z-50 flex flex-col ${isOpen ? 'w-64' : 'w-16'}`}>
      <div className="h-16 flex items-center justify-between px-4 bg-[#004BB5] shadow-md">
        {isOpen && <span className="font-bold text-lg tracking-wider">VNPT QN</span>}
        <button onClick={toggleSidebar} className="p-1 hover:bg-white/10 rounded">
          <Menu size={20} />
        </button>
      </div>

      <nav className="flex-1 py-4 custom-scrollbar overflow-y-auto">
        <ul>
          {cleanedMenuItems.map((item: any, index) => {
            if (item.type === 'divider') {
                return <li key={`div-${index}`} className="my-2 border-t border-white/10"></li>;
            }
            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveModule(item.id!)}
                  className={`w-full flex items-center px-4 py-3 hover:bg-white/10 transition-colors ${
                    activeModule === item.id ? 'bg-[#0068FF] border-r-4 border-white' : ''
                  }`}
                  title={!isOpen ? item.label : ''}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {isOpen && <span className="ml-3 truncate font-bold text-sm tracking-tight">{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-white/10 space-y-2 bg-[#0f172a]">
        <button 
          onClick={() => setActiveModule('settings')}
          className={`flex items-center text-gray-400 hover:text-white transition-colors w-full px-4 py-2 rounded ${activeModule === 'settings' ? 'bg-white/10 text-white' : ''}`}
          title={!isOpen ? 'Cài đặt' : ''}
        >
          <Settings size={20} />
          {isOpen && <span className="ml-3 font-bold text-sm">Cài đặt</span>}
        </button>
        
        {isOpen && (
            <div className="px-4 text-[10px] text-gray-500 text-center pt-2 font-bold uppercase tracking-widest">
                v1.9.6 Secure
            </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
