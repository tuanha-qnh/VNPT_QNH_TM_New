
import React, { useState, useEffect, useMemo } from 'react';
import { User, PersonalTask } from '../types';
import { Plus, Trash2, Edit2, CheckCircle2, Circle, Clock, MoreVertical, X, Save, Search, Calendar, StickyNote, Loader2, Filter, AlertCircle, XCircle } from 'lucide-react';
import { dbClient } from '../utils/firebaseClient';

interface PersonalTasksProps {
  currentUser: User;
}

const PersonalTasks: React.FC<PersonalTasksProps> = ({ currentUser }) => {
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [formData, setFormData] = useState<Partial<PersonalTask>>({
    status: 'Chưa xử lý',
    name: '',
    content: '',
    deadline: '',
    note: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const all = await dbClient.getAll('personal_tasks');
      const filtered = (all as PersonalTask[]).filter(t => t.userId === currentUser.id);
      
      // Auto-check overdue
      const today = new Date().toISOString().split('T')[0];
      const tasksToUpdate = filtered.filter(t => 
        t.deadline < today && 
        t.status !== 'Đã hoàn thành' && 
        t.status !== 'Quá hạn'
      );

      if (tasksToUpdate.length > 0) {
        await Promise.all(tasksToUpdate.map(t => dbClient.update('personal_tasks', t.id, { status: 'Quá hạn' })));
        // Refresh local state without refetching from server again immediately
        const updatedTasks = filtered.map(t => {
            if (t.deadline < today && t.status !== 'Đã hoàn thành') return { ...t, status: 'Quá hạn' };
            return t;
        });
        setTasks(updatedTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as PersonalTask[]);
      } else {
        setTasks(filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }

    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [currentUser]);

  const handleSave = async () => {
    if (!formData.name || !formData.deadline) return alert("Vui lòng nhập tên và thời hạn.");
    const id = formData.id || `ptask_${Date.now()}`;
    const payload = {
      ...formData,
      id,
      userId: currentUser.id,
      createdAt: formData.createdAt || new Date().toISOString(),
      status: formData.status || 'Chưa xử lý'
    };
    await dbClient.upsert('personal_tasks', id, payload);
    setShowForm(false);
    fetchTasks();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Xóa công việc cá nhân này?")) {
      await dbClient.delete('personal_tasks', id);
      fetchTasks();
    }
  };

  const filteredList = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchMonth = t.deadline.startsWith(selectedMonth);
      return matchSearch && matchMonth;
    }).sort((a, b) => {
         // Sort Overdue to top
         if (a.status === 'Quá hạn' && b.status !== 'Quá hạn') return -1;
         if (a.status !== 'Quá hạn' && b.status === 'Quá hạn') return 1;
         return 0;
    });
  }, [tasks, searchTerm, selectedMonth]);

  const statusColors = {
    'Chưa xử lý': 'bg-slate-100 text-slate-500',
    'Đang xử lý': 'bg-blue-100 text-blue-600',
    'Đã hoàn thành': 'bg-green-100 text-green-600',
    'Quá hạn': 'bg-red-100 text-red-600'
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20 max-w-6xl mx-auto">
      <div className="flex justify-between items-center border-b pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter flex items-center gap-3 uppercase">
            <StickyNote className="text-amber-500" size={36}/> Công việc cá nhân
          </h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Quản lý mục tiêu cá nhân hàng tháng</p>
        </div>
        <button onClick={() => { setFormData({ status: 'Chưa xử lý', name: '', content: '', deadline: '', note: '' }); setShowForm(true); }} className="bg-amber-500 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-amber-600 transition-all flex items-center gap-2">
          <Plus size={20}/> Ghi chú việc mới
        </button>
      </div>

      <div className="bg-white rounded-[40px] shadow-sm border overflow-hidden">
        <div className="p-8 border-b bg-slate-50/50 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
            <input placeholder="Tìm nhanh đầu việc..." className="w-full pl-11 pr-6 py-3 bg-white border-2 rounded-2xl text-sm font-bold focus:border-amber-500 outline-none transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
               <Filter size={16}/> Lọc theo tháng:
            </div>
            <input type="month" className="border-2 rounded-2xl px-4 py-2 text-sm font-bold bg-white outline-none focus:border-amber-500" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-[10px] text-slate-400 font-black uppercase tracking-widest border-b">
              <tr>
                <th className="p-5">Trạng thái</th>
                <th className="p-5 min-w-[300px]">Tên công việc</th>
                <th className="p-5 text-center">Thời hạn</th>
                <th className="p-5">Ghi chú</th>
                <th className="p-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y font-bold">
              {isLoading ? (
                <tr><td colSpan={5} className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-amber-500" size={40}/></td></tr>
              ) : filteredList.length === 0 ? (
                <tr><td colSpan={5} className="p-20 text-center text-slate-400 font-bold italic">Không có công việc nào trong tháng này.</td></tr>
              ) : filteredList.map(task => {
                const isOverdue = task.status === 'Quá hạn';
                const isCompleted = task.status === 'Đã hoàn thành';
                
                return (
                  <tr key={task.id} className={`transition-all group border-l-4 ${isOverdue ? 'bg-red-50/50 hover:bg-red-100/50 border-l-red-500' : isCompleted ? 'bg-green-50/30 hover:bg-green-100/30 border-l-green-500' : 'hover:bg-amber-50/30 border-l-transparent'}`}>
                    <td className="p-5">
                      <button 
                          onClick={async () => {
                            if (task.status === 'Quá hạn') return; // Không đổi trạng thái nhanh nếu đã quá hạn
                            const nextStatus = task.status === 'Đã hoàn thành' ? 'Chưa xử lý' : 'Đã hoàn thành';
                            await dbClient.update('personal_tasks', task.id, { status: nextStatus });
                            fetchTasks();
                          }}
                          className={`transition-colors flex items-center gap-2 ${isCompleted ? 'text-green-600' : isOverdue ? 'text-red-600' : 'text-slate-300 hover:text-amber-500'}`}
                        >
                          {isCompleted ? <CheckCircle2 size={24}/> : isOverdue ? <XCircle size={24}/> : <Circle size={24}/>}
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusColors[task.status]}`}>{task.status}</span>
                        </button>
                    </td>
                    <td className="p-5">
                      <div className={`${isCompleted ? 'line-through opacity-50' : ''} text-slate-800 ${isOverdue ? 'text-red-700' : ''}`}>{task.name}</div>
                      {task.content && <div className="text-[10px] text-slate-400 mt-1 font-medium">{task.content}</div>}
                    </td>
                    <td className="p-5 text-center">
                      <div className={`${isOverdue ? 'text-red-600 font-black' : 'text-slate-500'} flex items-center justify-center gap-1`}><Clock size={14}/> {task.deadline}</div>
                    </td>
                    <td className="p-5">
                      <span className="text-[11px] text-slate-500 italic max-w-[200px] truncate block">{task.note || '---'}</span>
                    </td>
                    <td className="p-5 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setFormData(task); setShowForm(true); }} className="p-2 hover:bg-white rounded-xl text-blue-600 shadow-sm border"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete(task.id)} className="p-2 hover:bg-white rounded-xl text-red-500 shadow-sm border"><Trash2 size={16}/></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl overflow-hidden border animate-zoom-in">
            <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{formData.id ? 'SỬA GHI CHÚ' : 'THÊM VIỆC CẦN LÀM'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-red-50 text-slate-400 rounded-full"><X size={24}/></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên đầu việc</label>
                <input className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-black outline-none focus:border-amber-500" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chi tiết công việc</label>
                <textarea className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-bold h-24 outline-none resize-none focus:border-amber-500" value={formData.content || ''} onChange={e => setFormData({...formData, content: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Thời hạn (Deadline)</label>
                  <input type="date" className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-black outline-none focus:border-amber-500" value={formData.deadline || ''} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Trạng thái</label>
                  <select className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-black outline-none focus:border-amber-500" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                    <option value="Chưa xử lý">Chưa xử lý</option>
                    <option value="Đang xử lý">Đang xử lý</option>
                    <option value="Đã hoàn thành">Đã hoàn thành</option>
                    <option value="Quá hạn">Quá hạn</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú thêm</label>
                <input className="w-full border-2 p-3.5 rounded-2xl bg-slate-50 font-bold outline-none focus:border-amber-500" value={formData.note || ''} onChange={e => setFormData({...formData, note: e.target.value})} />
              </div>
            </div>
            <div className="p-8 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-6 py-3 text-slate-400 font-black text-[10px] uppercase">Bỏ qua</button>
              <button onClick={handleSave} className="bg-amber-500 text-white px-10 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-amber-600 transition-all flex items-center gap-2">
                <Save size={16}/> Lưu dữ liệu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalTasks;
