
import React, { useState, useMemo } from 'react';
import { Unit, User, Role } from '../types';
import { Plus, Edit2, Trash2, Building, Save, X, ChevronRight, ChevronDown, Loader2, Search, Download, ShieldCheck, UploadCloud, Eye, Info, LayoutGrid, GitMerge, Users2, FileSpreadsheet, KeyRound, CheckSquare, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import { dbClient } from '../utils/firebaseClient';
import md5 from 'md5';

interface AdminProps {
  units: Unit[];
  users: User[];
  currentUser: User;
  onRefresh: () => void;
}

const MODULE_LIST = [
    { id: 'tasks', label: 'Quản lý Công việc' },
    { id: 'personal-tasks', label: 'Công việc cá nhân' },
    { id: 'admin', label: 'Quản trị nhân sự' },
    { id: 'mobile-ops', label: 'Dashboard CTHĐ di động' },
    { id: 'ob-telesale', label: 'Dashboard TTCSKH' },
    { id: 'kpi-group', label: 'KPI tập thể' },
    { id: 'kpi-personal', label: 'KPI cá nhân' },
    { id: 'reports', label: 'Báo cáo & Đánh giá' },
];

const Admin: React.FC<AdminProps> = ({ units, users, currentUser, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'units' | 'users'>('users');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnit, setFilterUnit] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const isSystemAdmin = currentUser.username === 'admin';
  const isSubAdmin = currentUser.canManageUsers === true;
  const canModify = isSystemAdmin || isSubAdmin;

  const filteredUsers = useMemo(() => {
    let list = users;
    if (!isSystemAdmin && isSubAdmin) {
      list = users.filter(u => u.unitId === currentUser.unitId);
    } else if (!isSystemAdmin && !isSubAdmin) {
      return [];
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(u => u.fullName.toLowerCase().includes(s) || u.hrmCode.toLowerCase().includes(s) || u.username.toLowerCase().includes(s));
    }
    if (filterUnit !== 'all') {
      list = list.filter(u => u.unitId === filterUnit);
    }
    return list;
  }, [users, isSystemAdmin, isSubAdmin, currentUser.unitId, searchTerm, filterUnit]);

  const unitTree = useMemo(() => {
    const build = (parentId: string | null = null): any[] => {
      return units.filter(u => u.parentId === parentId).map(u => ({ ...u, children: build(u.id) }));
    };
    return build(null);
  }, [units]);
  
  const handleDrop = async (e: React.DragEvent, dropTarget: Unit) => {
    e.preventDefault();
    setDragOverId(null);
    const draggedUnitId = e.dataTransfer.getData('unitId');
    if (!draggedUnitId || draggedUnitId === dropTarget.id) return;
    
    const hasUsers = users.some(u => u.unitId === draggedUnitId);
    if (hasUsers) {
      alert("Không thể di chuyển đơn vị đang có nhân sự. Vui lòng chuyển hoặc xóa nhân sự trước.");
      return;
    }
    
    await dbClient.update('units', draggedUnitId, { parentId: dropTarget.id });
    onRefresh();
  };

  const UnitNode: React.FC<{ item: any, level: number }> = ({ item, level }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <div 
        draggable={level > 0} 
        onDragStart={e => e.dataTransfer.setData('unitId', item.id)}
        onDragOver={e => { e.preventDefault(); setDragOverId(item.id); }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={e => handleDrop(e, item)}
        className="flex flex-col"
      >
        <div className={`flex items-center py-3.5 px-4 hover:bg-blue-50 border-b transition-all group ${level === 0 ? 'bg-slate-50 font-black' : ''} ${dragOverId === item.id ? 'bg-blue-200 border-l-4 border-blue-600' : ''}`}>
          <div style={{ width: level * 28 }} />
          {item.children.length > 0 ? ( <button onClick={() => setIsOpen(!isOpen)} className="p-1 mr-2 text-slate-400 hover:text-blue-600"> {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} </button> ) : <div className="w-7" />}
          <Building size={18} className={`${level === 0 ? 'text-blue-600' : 'text-slate-400'} mr-3`} />
          <div className="flex-1"><span className="text-sm font-bold text-slate-700">{item.name}</span><span className="text-[10px] text-slate-400 font-mono ml-2">({item.code})</span></div>
          {isSystemAdmin && (<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingItem(item); setFormData(item); setIsModalOpen(true); }} className="p-1.5 hover:bg-white rounded border text-blue-500 shadow-sm"><Edit2 size={12}/></button>{item.code !== 'VNPT_QN' && <button onClick={async () => { if(confirm("Xóa?")) { await dbClient.delete('units', item.id); onRefresh(); }}} className="p-1.5 hover:bg-white rounded border text-red-500 shadow-sm"><Trash2 size={12}/></button>}</div>)}
        </div>
        {isOpen && item.children.map((c: any) => <UnitNode key={c.id} item={c} level={level + 1} />)}
      </div>
    );
  };


  const handleOpenAddModal = () => {
    if (activeTab === 'users') {
      setEditingItem(null);
      setFormData({ 
          unitId: currentUser.unitId, 
          title: Role.STAFF, 
          accessibleUnitIds: [currentUser.unitId], 
          canManageUsers: false, 
          password: '123',
          allowedModules: ['tasks', 'personal-tasks', 'kpi-personal', 'reports'] // Default modules
      });
    } else {
      const rootUnit = units.find(u => u.level === 0 || u.code === 'VNPT_QN');
      setEditingItem(null);
      setFormData({ name: '', code: `QNH${Math.floor(Math.random() * 900) + 100}`, parentId: rootUnit?.id || null, level: rootUnit ? rootUnit.level + 1 : 1, includeInMobileReport: false });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!canModify) return;
    setIsProcessing(true);
    try {
      const id = editingItem?.id || (activeTab === 'users' ? `user_${Date.now()}` : `unit_${Date.now()}`);
      if (activeTab === 'units') {
        if (!formData.name || !formData.code) throw new Error("Vui lòng nhập tên và mã đơn vị.");
        const parentUnit = units.find(u => u.id === formData.parentId);
        const level = parentUnit ? parentUnit.level + 1 : 0;
        await dbClient.upsert('units', id, { ...formData, level });
      } else {
        if (!formData.fullName || !formData.hrmCode || !formData.username) throw new Error("Vui lòng nhập đủ thông tin nhân sự.");
        const finalUnitId = (isSubAdmin && !isSystemAdmin) ? currentUser.unitId : (formData.unitId || currentUser.unitId);
        
        // Ensure canManageUsers matches the 'admin' module permission
        // Logic: If canManageUsers is true, add 'admin' module. If 'admin' module is selected, set canManageUsers true.
        let allowedModules = formData.allowedModules || [];
        if (formData.canManageUsers && !allowedModules.includes('admin')) {
            allowedModules.push('admin');
        } else if (!formData.canManageUsers && allowedModules.includes('admin')) {
            // If explicitly unchecked SubAdmin, remove admin module access if it was there solely due to subadmin
            // However, usually we keep them synced.
            allowedModules = allowedModules.filter((m: string) => m !== 'admin');
        }

        const payload = { 
            ...formData, 
            unitId: finalUnitId, 
            password: editingItem ? editingItem.password : md5(formData.password || '123'), 
            isFirstLogin: editingItem ? editingItem.isFirstLogin : true, 
            accessibleUnitIds: formData.accessibleUnitIds && formData.accessibleUnitIds.length > 0 ? formData.accessibleUnitIds : [finalUnitId],
            canManageUsers: formData.canManageUsers,
            allowedModules: allowedModules
        };
        await dbClient.upsert('users', id, payload);
      }
      setIsModalOpen(false);
      onRefresh();
    } catch (e: any) { alert(e.message || "Lỗi lưu dữ liệu."); } finally { setIsProcessing(false); }
  };

  const handleResetPassword = async () => {
    if (!editingItem) return;
    if (confirm("Reset mật khẩu nhân viên này về mặc định '123'?")) {
      await dbClient.update('users', editingItem.id, { password: md5('123'), isFirstLogin: true });
      alert("Đã reset mật khẩu thành công!");
      onRefresh();
      setIsModalOpen(false);
    }
  };

  const downloadTemplate = () => {
    const data = [
        ["Họ và tên", "Mã HRM", "Mã đơn vị", "Username", "Mật khẩu", "Chức danh", "Là SubAdmin (Yes/No)", "Các đơn vị được xem (Mã, cách nhau dấu phẩy)", "Các module được dùng (Mã, cách nhau dấu phẩy)"], 
        ["Nguyễn Văn A", "HRM001", "QNH102", "anv", "123", "Chuyên viên", "No", "QNH102, QNH103", "tasks, reports, kpi-personal"], 
        ["Trần Thị B", "HRM002", "QNH103", "btt", "123", "Trưởng phòng", "Yes", "QNH103", "tasks, admin, reports, mobile-ops"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "VNPT_Import_NhanSu_V2.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);
        setIsProcessing(true);
        let importCount = 0;
        
        for (const row of data) {
          const unitCode = row["Mã đơn vị"];
          const unit = units.find(u => u.code === unitCode);
          
          if (unit && row["Họ và tên"] && row["Mã HRM"] && row["Username"]) {
            const isSubAdmin = String(row["Là SubAdmin (Yes/No)"]).toLowerCase() === 'yes';
            
            // Xử lý Accessible Units
            let accessibleUnitIds = [unit.id];
            if (row["Các đơn vị được xem (Mã, cách nhau dấu phẩy)"]) {
                const codes = String(row["Các đơn vị được xem (Mã, cách nhau dấu phẩy)"]).split(',').map(s => s.trim());
                const ids = codes.map(c => units.find(u => u.code === c)?.id).filter(id => id) as string[];
                if (ids.length > 0) accessibleUnitIds = ids;
            }

            // Xử lý Allowed Modules
            let allowedModules = ['tasks', 'personal-tasks', 'kpi-personal', 'reports'];
            if (row["Các module được dùng (Mã, cách nhau dấu phẩy)"]) {
                const mods = String(row["Các module được dùng (Mã, cách nhau dấu phẩy)"]).split(',').map(s => s.trim());
                if (mods.length > 0) allowedModules = mods;
            }
            // Auto add admin module if subadmin
            if (isSubAdmin && !allowedModules.includes('admin')) allowedModules.push('admin');

            await dbClient.upsert(`user_imp_${row["Mã HRM"]}`, 'users', { 
                fullName: row["Họ và tên"], 
                hrmCode: row["Mã HRM"], 
                username: row["Username"], 
                password: md5(String(row["Mật khẩu"] || '123')), 
                title: row["Chức danh"], 
                unitId: unit.id, 
                canManageUsers: isSubAdmin, 
                isFirstLogin: true, 
                accessibleUnitIds: accessibleUnitIds,
                allowedModules: allowedModules
            });
            importCount++;
          }
        }
        alert(`Import hoàn tất ${importCount} nhân sự!`); onRefresh();
      } catch (err) { alert("Lỗi khi đọc file Excel."); } finally { setIsProcessing(false); }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center"><h2 className="text-2xl font-black text-slate-800 tracking-tighter flex items-center gap-3"><ShieldCheck className="text-blue-600" size={32}/> {activeTab === 'users' ? 'QUẢN TRỊ NHÂN SỰ' : 'CƠ CẤU TỔ CHỨC'}</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Hệ thống danh mục VNPT Quảng Ninh</p>
        <div className="flex bg-slate-100 p-1 rounded-2xl border shadow-inner">
          <button onClick={() => setActiveTab('users')} className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Users2 size={16}/> Nhân sự</button>
          {isSystemAdmin && (<button onClick={() => setActiveTab('units')} className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${activeTab === 'units' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><GitMerge size={16}/> Cơ cấu</button>)}
        </div>
      </div>
      <div className="bg-white rounded-[32px] shadow-sm border overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-6 border-b bg-slate-50/50 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-3 flex-1 max-w-xl">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/><input placeholder={activeTab === 'users' ? "Tìm kiếm nhân sự..." : "Tìm kiếm đơn vị..."} className="w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            {activeTab === 'users' && (<select onChange={e => setFilterUnit(e.target.value)} value={filterUnit} className="py-2.5 px-4 bg-white border rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-bold"><option value="all">Tất cả đơn vị</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>)}
          </div>
          {canModify && (<div className="flex gap-2">{activeTab === 'users' && (<><button onClick={downloadTemplate} className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-200"><Download size={16}/> File mẫu</button><label className="bg-green-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-green-700 cursor-pointer shadow-lg shadow-green-100"><FileSpreadsheet size={16}/> Import Excel<input type="file" hidden accept=".xlsx, .xls" onChange={handleImportExcel} /></label></>)}<button onClick={handleOpenAddModal} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-blue-100 flex items-center gap-2 hover:bg-blue-700 transition-all"><Plus size={18}/> {activeTab === 'users' ? 'Thêm nhân sự' : 'Thêm đơn vị'}</button></div>)}
        </div>
        <div className="flex-1 overflow-auto">{activeTab === 'units' ? (<div className="p-6"><div className="text-xs italic text-slate-400 p-4 bg-slate-50 rounded-xl mb-4">Mẹo: Kéo và thả một đơn vị vào đơn vị khác để thay đổi cơ cấu. Đơn vị có nhân sự sẽ không thể di chuyển.</div>{unitTree.map(u => <UnitNode key={u.id} item={u} level={0} />)}</div>) : (<table className="w-full text-sm text-left"><thead className="bg-slate-50 text-[10px] text-slate-400 font-black uppercase tracking-widest sticky top-0 z-10"><tr><th className="p-4 border-b">Họ và tên</th><th className="p-4 border-b">Mã HRM / User</th><th className="p-4 border-b">Chức danh</th><th className="p-4 border-b">Đơn vị gốc</th><th className="p-4 border-b text-right">Thao tác</th></tr></thead><tbody className="divide-y">{filteredUsers.map(user => (<tr key={user.id} className="hover:bg-blue-50/30 transition-colors group"><td className="p-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-black border uppercase overflow-hidden">{user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user.fullName.charAt(0)}</div><div><div className="font-bold text-slate-800">{user.fullName}</div><div className="flex gap-1 mt-1">{user.canManageUsers && <span className="text-[8px] bg-blue-600 text-white px-1 py-0.5 rounded font-black uppercase">SubAdmin</span>}</div></div></div></td><td className="p-4"><div className="text-xs font-bold text-slate-400">{user.hrmCode}</div><div className="text-blue-600 font-bold">@{user.username}</div></td><td className="p-4 text-xs font-bold text-slate-500">{user.title}</td><td className="p-4 text-xs text-slate-400 font-bold">{units.find(u => u.id === user.unitId)?.name || 'N/A'}</td><td className="p-4 text-right">{(isSystemAdmin || (isSubAdmin && user.unitId === currentUser.unitId)) && (<div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingItem(user); setFormData({ ...user, accessibleUnitIds: user.accessibleUnitIds || [user.unitId], allowedModules: user.allowedModules || ['tasks', 'personal-tasks', 'kpi-personal', 'reports'] }); setIsModalOpen(true); }} className="p-2 hover:bg-blue-100 rounded-lg text-blue-600" title="Chỉnh sửa"><Edit2 size={16}/></button>{user.username !== 'admin' && <button onClick={async () => { if(confirm("Xóa?")) { await dbClient.delete('users', user.id); onRefresh(); }}} className="p-2 hover:bg-red-100 rounded-lg text-red-500" title="Xóa"><Trash2 size={16}/></button>}</div>)}</td></tr>))}</tbody></table>)}</div>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden animate-zoom-in border">
                <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{activeTab === 'users' ? (editingItem ? 'Cập nhật' : 'Thêm mới') : (editingItem ? 'Cập nhật' : 'Tạo mới')}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-red-50 text-slate-400 rounded-full"><X size={24}/></button>
                </div>
                <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {activeTab === 'units' ? (
                        <div className="space-y-6"><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên</label><input className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-bold" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} /></div><div className="grid grid-cols-2 gap-5"><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mã</label><input className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-bold" value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} /></div><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cấp trên</label><select className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-bold" value={formData.parentId || ''} onChange={e => setFormData({...formData, parentId: e.target.value || null})}>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div><div className="p-4 bg-blue-50 rounded-2xl flex items-center gap-3 border"><input type="checkbox" id="chkIncludeInMobile" className="w-5 h-5" checked={formData.includeInMobileReport || false} onChange={e => setFormData({...formData, includeInMobileReport: e.target.checked})} /><label htmlFor="chkIncludeInMobile" className="text-xs font-black text-blue-800 uppercase">Đưa vào điểm tin đánh giá</label></div></div>
                    ) : (
                        <div className="grid grid-cols-2 gap-8">
                            <div className="col-span-2 grid grid-cols-2 gap-5">
                                <div className="col-span-2 space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Họ tên</label><input className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-bold" value={formData.fullName || ''} onChange={e => setFormData({...formData, fullName: e.target.value})} /></div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mã HRM</label><input className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-bold" value={formData.hrmCode || ''} onChange={e => setFormData({...formData, hrmCode: e.target.value})} /></div>
                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Username</label><input className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-bold" value={formData.username || ''} onChange={e => setFormData({...formData, username: e.target.value})} /></div>
                                {!editingItem ? (<div className="space-y-1.5"><label>Mật khẩu</label><input type="password" placeholder="Mặc định: 123" value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} /></div>) : (<div className="space-y-1.5"><label>Bảo mật</label><button onClick={handleResetPassword} className="w-full bg-slate-100 text-slate-700 p-3.5 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-slate-200"><KeyRound size={16}/> Reset Password</button></div>)}
                                <div className="space-y-1.5"><label>Chức danh</label><select value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}>{Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                <div className="space-y-1.5"><label>Đơn vị</label><select value={formData.unitId} onChange={e => setFormData({...formData, unitId: e.target.value})} disabled={isSubAdmin && !isSystemAdmin}>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                            </div>
                            
                            {/* PHÂN QUYỀN MODULE */}
                            <div className="col-span-2 space-y-4">
                                {/* KHÔI PHỤC CHECKBOX SUBADMIN */}
                                <div className="p-4 bg-blue-50 rounded-2xl flex items-center gap-3 border mb-4">
                                    <input 
                                        type="checkbox" 
                                        id="chkSubAdmin" 
                                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" 
                                        checked={formData.canManageUsers || false} 
                                        onChange={e => {
                                            const isSub = e.target.checked;
                                            // Tự động thêm/bớt module 'admin' khi check/uncheck SubAdmin
                                            let mods = formData.allowedModules || [];
                                            if (isSub && !mods.includes('admin')) {
                                                mods = [...mods, 'admin'];
                                            } else if (!isSub && mods.includes('admin')) {
                                                mods = mods.filter((m: string) => m !== 'admin');
                                            }
                                            setFormData({...formData, canManageUsers: isSub, allowedModules: mods});
                                        }} 
                                    />
                                    <label htmlFor="chkSubAdmin" className="text-xs font-black text-blue-800 uppercase flex items-center gap-2">
                                        <ShieldCheck size={16}/> Cấp quyền Sub-Admin (Quản trị Nhân sự & Cơ cấu)
                                    </label>
                                </div>

                                <div className="flex items-center gap-2 border-b-2 pb-2"><Layers size={18}/><label className="font-bold text-sm">Cấp quyền sử dụng Module</label></div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 border rounded-2xl bg-slate-50">
                                    {MODULE_LIST.map(mod => (
                                        <label key={mod.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                checked={(formData.allowedModules || []).includes(mod.id)} 
                                                onChange={e => {
                                                    const currentModules = formData.allowedModules || [];
                                                    let newModules = [];
                                                    if (e.target.checked) {
                                                        newModules = [...currentModules, mod.id];
                                                    } else {
                                                        newModules = currentModules.filter((id: string) => id !== mod.id);
                                                    }
                                                    
                                                    // Nếu bỏ check 'admin', tự động bỏ quyền SubAdmin
                                                    let isSub = formData.canManageUsers;
                                                    if (mod.id === 'admin') {
                                                        isSub = e.target.checked;
                                                    }
                                                    
                                                    setFormData({ ...formData, allowedModules: newModules, canManageUsers: isSub });
                                                }}
                                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-xs font-bold text-slate-700">{mod.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="col-span-2 space-y-4">
                                <div className="flex items-center gap-2 border-b-2 pb-2"><CheckSquare size={18}/><label className="font-bold text-sm">Phân quyền xem dữ liệu đơn vị</label></div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[200px] overflow-y-auto p-4 border rounded-2xl bg-slate-50 custom-scrollbar">
                                    {units.map(u => (
                                        <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-lg cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={(formData.accessibleUnitIds || []).includes(u.id)} 
                                                onChange={e => {
                                                    const c = formData.accessibleUnitIds || [];
                                                    e.target.checked ? setFormData({...formData, accessibleUnitIds: [...c, u.id]}) : setFormData({...formData, accessibleUnitIds: c.filter((id:string)=>id!==u.id)})
                                                }}
                                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-[11px] font-bold truncate">{u.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-8 border-t bg-slate-50/50 flex justify-end gap-4">
                    <button onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-slate-400 font-black text-xs uppercase">Hủy</button>
                    <button onClick={handleSave} className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 flex items-center gap-2">{isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} LƯU</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
