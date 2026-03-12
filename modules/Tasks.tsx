
import React, { useState, useMemo, useEffect } from 'react';
import { Task, TaskStatus, TaskPriority, User, Unit, Role, ExtensionRequest } from '../types';
import { Plus, Search, X, Edit2, Trash2, Save, Loader2, Timer, CheckCircle2, AlertTriangle, Clock, Hash, Smartphone, MessageCircle, MoreHorizontal, UserCheck, Users, CalendarPlus, XCircle } from 'lucide-react';
import { dbClient } from '../utils/firebaseClient';

interface TasksProps {
  tasks: Task[];
  users: User[];
  units: Unit[];
  currentUser: User;
  onRefresh: () => void;
}

const Tasks: React.FC<TasksProps> = ({ tasks, users, units, currentUser, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState<Partial<Task>>({
    assignmentSource: 'Direct',
    priority: TaskPriority.MEDIUM,
    primaryAssigneeIds: [],
    supportAssigneeIds: []
  });

  // Tự động kiểm tra và cập nhật trạng thái Quá hạn
  useEffect(() => {
    const checkOverdueTasks = async () => {
        const today = new Date().toISOString().split('T')[0];
        const tasksToUpdate = tasks.filter(t => {
            // Điều kiện: Deadline nhỏ hơn hôm nay VÀ Trạng thái chưa hoàn thành/vướng mắc/quá hạn
            return t.deadline < today && 
                   t.status !== TaskStatus.COMPLETED && 
                   t.status !== TaskStatus.OVERDUE &&
                   t.status !== TaskStatus.STUCK; // Có thể giữ Stuck nếu muốn, hoặc cho quá hạn luôn
        });

        if (tasksToUpdate.length > 0) {
            console.log(`Found ${tasksToUpdate.length} overdue tasks. Updating...`);
            try {
                await Promise.all(tasksToUpdate.map(t => dbClient.update('tasks', t.id, { status: TaskStatus.OVERDUE })));
                onRefresh(); // Refresh lại dữ liệu sau khi update
            } catch (error) {
                console.error("Failed to update overdue tasks", error);
            }
        }
    };

    if (tasks.length > 0) {
        checkOverdueTasks();
    }
  }, [tasks]); // Chạy lại khi danh sách tasks thay đổi (hoặc lần đầu load)

  // Xác định người dùng có phải lãnh đạo hay không
  const isLeader = [Role.DIRECTOR, Role.VICE_DIRECTOR, Role.MANAGER, Role.VICE_MANAGER].includes(currentUser.title as Role);
  const myAccessibleUnits = currentUser.accessibleUnitIds || [currentUser.unitId];

  const assignableUsers = useMemo(() => {
    let list = users.filter(u => u.unitId === currentUser.unitId && u.id !== currentUser.id);
    if (currentUser.title === Role.VICE_DIRECTOR) {
      const subordinates = [Role.MANAGER, Role.VICE_MANAGER, Role.SPECIALIST, Role.STAFF];
      list = list.filter(u => subordinates.includes(u.title as Role));
    } else if (currentUser.title === Role.VICE_MANAGER) {
      const subordinates = [Role.SPECIALIST, Role.STAFF];
      list = list.filter(u => subordinates.includes(u.title as Role));
    }
    return list;
  }, [users, currentUser]);

  const filteredTasks = useMemo(() => {
    let list = [...tasks];
    
    if (currentUser.username !== 'admin') {
      if (isLeader) {
        list = list.filter(t => 
          t.assignerId === currentUser.id ||
          t.primaryAssigneeIds.includes(currentUser.id) || 
          t.supportAssigneeIds.includes(currentUser.id) ||
          myAccessibleUnits.includes(users.find(u => u.id === t.assignerId)?.unitId || '')
        );
      } else {
        list = list.filter(t => 
          t.assignerId === currentUser.id ||
          t.primaryAssigneeIds.includes(currentUser.id) || 
          t.supportAssigneeIds.includes(currentUser.id)
        );
      }
    }

    if (searchTerm) list = list.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus);
    if (filterMonth) list = list.filter(t => t.dateAssigned.startsWith(filterMonth));
    
    // Sắp xếp: Quá hạn lên đầu, sau đó đến việc mới nhất
    return list.sort((a, b) => {
        if (a.status === TaskStatus.OVERDUE && b.status !== TaskStatus.OVERDUE) return -1;
        if (a.status !== TaskStatus.OVERDUE && b.status === TaskStatus.OVERDUE) return 1;
        return new Date(b.dateAssigned).getTime() - new Date(a.dateAssigned).getTime();
    });
  }, [tasks, searchTerm, filterStatus, filterMonth, currentUser, isLeader, myAccessibleUnits, users]);

  const statusStyle: Record<TaskStatus, string> = {
    [TaskStatus.PENDING]: 'bg-slate-100 text-slate-500',
    [TaskStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-600',
    [TaskStatus.COMPLETED]: 'bg-green-100 text-green-600',
    [TaskStatus.NOT_PERFORMED]: 'bg-red-100 text-red-500',
    [TaskStatus.OVERDUE]: 'bg-red-600 text-white shadow-md shadow-red-200',
    [TaskStatus.STUCK]: 'bg-orange-100 text-orange-600'
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.name || !formData.deadline) return alert("Vui lòng nhập tên và thời hạn.");
    setIsProcessing(true);
    const id = formData.id || `task_${Date.now()}`;
    const payload = { ...formData, id, assignerId: formData.assignerId || currentUser.id, assignerName: formData.assignerName || currentUser.fullName, dateAssigned: formData.dateAssigned || new Date().toISOString().split('T')[0], status: formData.status || TaskStatus.PENDING, progress: formData.progress || 0, primaryAssigneeIds: formData.primaryAssigneeIds || [], supportAssigneeIds: formData.supportAssigneeIds || [], priority: formData.priority || TaskPriority.MEDIUM, assignmentSource: formData.assignmentSource || 'Direct', eOfficeNumber: formData.eOfficeNumber || '', coordinationInstructions: formData.coordinationInstructions || '' };
    await dbClient.upsert('tasks', id, payload);
    setShowForm(false);
    onRefresh();
    setIsProcessing(false);
    if (selectedTask?.id === id) setSelectedTask(payload as Task);
  };

  const handleUpdateStatus = async (task: Task, newStatus: TaskStatus) => {
    await dbClient.update('tasks', task.id, { status: newStatus });
    onRefresh();
    if (selectedTask?.id === task.id) setSelectedTask({...selectedTask, status: newStatus});
  };

  const handleAddTimeline = async (task: Task) => {
    const progress = prompt("Tiến độ hiện tại (%)?", String(task.progress));
    const comment = prompt("Nội dung báo cáo kết quả thực hiện?");
    if (progress !== null && comment) {
      const newTimeline = [...(task.timeline || []), { date: new Date().toISOString(), comment, progress: Number(progress) }];
      // Nếu tiến độ là 100%, tự động chuyển trạng thái thành Hoàn thành
      const newStatus = Number(progress) === 100 ? TaskStatus.COMPLETED : task.status;
      
      await dbClient.update('tasks', task.id, { timeline: newTimeline, progress: Number(progress), executionResults: comment, status: newStatus });
      onRefresh();
      if (selectedTask?.id === task.id) setSelectedTask({...selectedTask, timeline: newTimeline, progress: Number(progress), executionResults: comment, status: newStatus});
      alert("Đã cập nhật báo cáo thành công!");
    }
  };
  
  const handleRequestExtension = async (task: Task) => {
    const newDeadline = prompt("Nhập ngày gia hạn mới (YYYY-MM-DD):");
    if (!newDeadline || !/^\d{4}-\d{2}-\d{2}$/.test(newDeadline)) {
      if(newDeadline) alert("Định dạng ngày không hợp lệ.");
      return;
    }
    const reason = prompt("Lý do xin gia hạn:");
    if (!reason) return;
    
    const newRequest: ExtensionRequest = { requestedDate: newDeadline, reason, status: 'pending', requestDate: new Date().toISOString().split('T')[0] };
    await dbClient.update('tasks', task.id, { extensionRequest: newRequest });
    onRefresh();
    if (selectedTask?.id === task.id) setSelectedTask({...selectedTask, extensionRequest: newRequest});
    alert("Đã gửi yêu cầu gia hạn thành công!");
  };

  const approveExtension = async (task: Task) => {
    if (!task.extensionRequest) return;
    const newDeadline = task.extensionRequest.requestedDate;
    // Khi duyệt gia hạn, nếu trạng thái đang là Overdue thì chuyển về In Progress
    const newStatus = task.status === TaskStatus.OVERDUE ? TaskStatus.IN_PROGRESS : task.status;

    await dbClient.update('tasks', task.id, { deadline: newDeadline, extensionRequest: { ...task.extensionRequest, status: 'approved' }, status: newStatus }); 
    onRefresh(); 
    if (selectedTask?.id === task.id) setSelectedTask({...selectedTask, deadline: newDeadline, extensionRequest: {...task.extensionRequest, status: 'approved'}, status: newStatus});
    alert("Đã phê duyệt gia hạn thời gian thực hiện!"); 
  };
  
  const rejectExtension = async (task: Task) => {
    if (!task.extensionRequest) return;
    const reason = prompt("Lý do từ chối (không bắt buộc):");
    const updatedRequest: ExtensionRequest = { ...task.extensionRequest, status: 'rejected', rejectionReason: reason || "Không có lý do cụ thể." };
    await dbClient.update('tasks', task.id, { extensionRequest: updatedRequest });
    onRefresh();
    if (selectedTask?.id === task.id) setSelectedTask({...selectedTask, extensionRequest: updatedRequest});
    alert("Đã từ chối yêu cầu gia hạn.");
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-center border-b pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter flex items-center gap-3">
            <Timer className="text-blue-600" size={36}/> QUẢN LÝ CÔNG VIỆC
          </h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">VNPT Quảng Ninh - Hệ thống điều hành & giám sát</p>
        </div>
        {(isLeader || currentUser.canManageUsers) && (
          <button onClick={() => { setFormData({ assignmentSource: 'Direct', priority: TaskPriority.MEDIUM, primaryAssigneeIds: [], supportAssigneeIds: [] }); setShowForm(true); }} className="bg-blue-600 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2">
            <Plus size={20}/> Giao việc mới
          </button>
        )}
      </div>

      <div className="bg-white rounded-[40px] shadow-sm border overflow-hidden">
        <div className="p-8 border-b bg-slate-50/50 flex flex-wrap gap-5 items-center">
          <div className="relative flex-1 min-w-[350px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
            <input placeholder="Tìm nhanh công việc..." className="w-full pl-12 pr-6 py-3.5 bg-white border-2 rounded-[20px] text-sm font-bold focus:border-blue-500 outline-none transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <input type="month" className="border-2 rounded-2xl px-4 py-3 text-sm font-bold bg-white outline-none" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
            <select className="border-2 rounded-2xl px-4 py-3 text-sm font-bold bg-white outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] text-slate-400 font-black uppercase tracking-widest border-b">
              <tr>
                <th className="p-5">Ngày giao</th>
                <th className="p-5 min-w-[250px]">Tên công việc</th>
                <th className="p-5">Người giao</th>
                <th className="p-5">Chủ trì</th>
                <th className="p-5">Phối hợp</th>
                <th className="p-5">Hạn hoàn thành</th>
                <th className="p-5">Tiến độ</th>
                <th className="p-5">Trạng thái</th>
                <th className="p-5 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredTasks.map((task, idx) => {
                  const isOverdue = task.status === TaskStatus.OVERDUE;
                  const isCompleted = task.status === TaskStatus.COMPLETED;
                  
                  return (
                    <tr key={task.id} className={`group transition-all border-l-4 ${isOverdue ? 'bg-red-50/50 border-l-red-500 hover:bg-red-100/50' : isCompleted ? 'bg-green-50/30 border-l-green-500 hover:bg-green-100/30' : 'border-l-transparent hover:bg-blue-50/40 hover:border-l-blue-500'}`}>
                      <td className="p-5 font-bold text-slate-500 text-xs cursor-pointer" onClick={() => setSelectedTask(task)}>{task.dateAssigned}</td>
                      <td className="p-5 cursor-pointer" onClick={() => setSelectedTask(task)}>
                        <div className="flex items-center gap-2 mb-1">
                          {task.assignmentSource === 'eOffice' && <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-black"><Hash size={10}/> {task.eOfficeNumber}</span>}
                          {isOverdue && <span className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded text-[9px] font-black animate-pulse"><AlertTriangle size={10}/> QUÁ HẠN</span>}
                        </div>
                        <div className={`font-black text-sm break-words line-clamp-2 ${isOverdue ? 'text-red-700' : isCompleted ? 'text-green-800' : 'text-slate-800'}`}>{task.name}</div>
                      </td>
                      <td className="p-5 font-bold text-slate-700 text-xs cursor-pointer" onClick={() => setSelectedTask(task)}>{task.assignerName}</td>
                      <td className="p-5 cursor-pointer" onClick={() => setSelectedTask(task)}>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white overflow-hidden">
                            {users.find(u => u.id === task.primaryAssigneeIds[0])?.avatar ? ( <img src={users.find(u => u.id === task.primaryAssigneeIds[0])?.avatar} className="w-full h-full object-cover" /> ) : users.find(u => u.id === task.primaryAssigneeIds[0])?.fullName.charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-slate-600 truncate max-w-[100px]">{users.find(u => u.id === task.primaryAssigneeIds[0])?.fullName || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-5 cursor-pointer" onClick={() => setSelectedTask(task)}>
                        <div className="flex -space-x-2">
                          {task.supportAssigneeIds.slice(0, 3).map(uid => (
                            <div key={uid} className="w-6 h-6 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-[8px] font-black text-white" title={users.find(u => u.id === uid)?.fullName}>
                              {users.find(u => u.id === uid)?.fullName.charAt(0)}
                            </div>
                          ))}
                          {task.supportAssigneeIds.length > 3 && <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[8px] font-black text-slate-500">+{task.supportAssigneeIds.length - 3}</div>}
                        </div>
                      </td>
                      <td className={`p-5 font-bold text-xs cursor-pointer ${isOverdue ? 'text-red-600' : 'text-slate-500'}`} onClick={() => setSelectedTask(task)}>{task.deadline}</td>
                      <td className="p-5 cursor-pointer" onClick={() => setSelectedTask(task)}>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full ${isOverdue ? 'bg-red-500' : isCompleted ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }} />
                        </div>
                        <span className={`text-[10px] font-black mt-1 block ${isOverdue ? 'text-red-600' : isCompleted ? 'text-green-600' : 'text-blue-600'}`}>{task.progress}%</span>
                      </td>
                      <td className="p-5 cursor-pointer" onClick={() => setSelectedTask(task)}>
                        <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center justify-center w-fit gap-1 ${statusStyle[task.status]}`}>
                          {isCompleted && <CheckCircle2 size={10}/>}
                          {isOverdue && <XCircle size={10}/>}
                          {task.status}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                         {(currentUser.username === 'admin' || task.assignerId === currentUser.id) && (
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); setFormData(task); setShowForm(true); }} className="p-2 hover:bg-blue-100 rounded-lg text-blue-600" title="Sửa nhanh"><Edit2 size={16} /></button>
                                <button onClick={async (e) => { e.stopPropagation(); if (confirm("Xóa vĩnh viễn công việc này?")) { await dbClient.delete('tasks', task.id); onRefresh(); }}} className="p-2 hover:bg-red-100 rounded-lg text-red-500" title="Xóa"><Trash2 size={16} /></button>
                            </div>
                        )}
                      </td>
                    </tr>
                  )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[48px] w-full max-w-4xl shadow-2xl overflow-hidden border animate-zoom-in">
            <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{formData.id ? 'CHỈNH SỬA CÔNG VIỆC' : 'GIAO VIỆC MỚI'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-red-50 text-slate-400 rounded-full"><X size={28}/></button>
            </div>
            <div className="p-10 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hình thức giao</label>
                  <select className="w-full border-2 p-3 rounded-xl bg-slate-50 font-bold outline-none" value={formData.assignmentSource} onChange={e => setFormData({...formData, assignmentSource: e.target.value})}>
                    <option value="Direct">Trực tiếp</option> <option value="eOffice">eOffice</option> <option value="Zalo">Zalo</option>
                  </select>
                </div>
                {formData.assignmentSource === 'eOffice' && (
                  <div className="space-y-1 animate-fade-in">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Số văn bản eOffice</label>
                    <input className="w-full border-2 p-3 rounded-xl bg-slate-50 font-bold outline-none" placeholder="Nhập số eOffice..." value={formData.eOfficeNumber || ''} onChange={e => setFormData({...formData, eOfficeNumber: e.target.value})} />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Độ ưu tiên</label>
                  <select className="w-full border-2 p-3 rounded-xl bg-slate-50 font-bold outline-none" value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as TaskPriority})}>
                    {Object.values(TaskPriority).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tên công việc</label>
                <input className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-black outline-none" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nội dung chỉ đạo (Chủ trì thực hiện)</label>
                  <textarea className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-bold h-24 outline-none resize-none" value={formData.content || ''} onChange={e => setFormData({...formData, content: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nội dung chỉ đạo (Nhân sự phối hợp)</label>
                  <textarea className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-bold h-24 outline-none resize-none" placeholder="Chỉ đạo cho những người phối hợp..." value={formData.coordinationInstructions || ''} onChange={e => setFormData({...formData, coordinationInstructions: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhân sự chủ trì</label>
                  <select multiple className="w-full border-2 p-3 rounded-xl bg-slate-50 font-bold h-32 text-xs" value={formData.primaryAssigneeIds || []} onChange={e => setFormData({...formData, primaryAssigneeIds: Array.from(e.target.selectedOptions, (o: any) => o.value)})}>
                    {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.title})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhân sự phối hợp</label>
                  <select multiple className="w-full border-2 p-3 rounded-xl bg-slate-50 font-bold h-32 text-xs" value={formData.supportAssigneeIds || []} onChange={e => setFormData({...formData, supportAssigneeIds: Array.from(e.target.selectedOptions, (o: any) => o.value)})}>
                    {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.title})</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hạn hoàn thành</label>
                <input type="date" className="w-full border-2 p-4 rounded-2xl bg-slate-50 font-black outline-none" value={formData.deadline || ''} onChange={e => setFormData({...formData, deadline: e.target.value})} />
              </div>
            </div>
            <div className="p-8 border-t bg-slate-50/50 flex justify-end gap-4">
              <button onClick={() => setShowForm(false)} className="px-8 py-3 text-slate-400 font-black text-xs uppercase">Hủy</button>
              <button onClick={handleCreateOrUpdate} disabled={isProcessing} className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 transition-all">
                {isProcessing ? <Loader2 className="animate-spin" /> : 'LƯU DỮ LIỆU'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[60%] rounded-[48px] shadow-2xl animate-zoom-in flex flex-col max-h-[90vh] overflow-hidden border">
            <div className={`p-8 border-b flex justify-between items-center shadow-lg shrink-0 ${selectedTask.status === TaskStatus.OVERDUE ? 'bg-red-600' : 'bg-blue-600'} text-white`}>
              <div className="flex-1 pr-10">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl font-black break-words leading-tight">{selectedTask.name}</h3>
                    {selectedTask.status === TaskStatus.OVERDUE && <span className="bg-white text-red-600 px-2 py-0.5 rounded text-[10px] font-black">QUÁ HẠN</span>}
                </div>
                <div className="text-[10px] font-bold uppercase opacity-80 tracking-widest mt-2">Giao bởi: {selectedTask.assignerName} | Ngày giao: {selectedTask.dateAssigned}</div>
              </div>
              <div className="flex items-center gap-2">
                {(selectedTask.assignerId === currentUser.id || currentUser.username === 'admin') && (
                  <>
                    <button onClick={() => { setFormData(selectedTask); setShowForm(true); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Chỉnh sửa"><Edit2 size={20}/></button>
                    <button onClick={async () => { if(confirm("Xóa vĩnh viễn công việc này?")) { await dbClient.delete('tasks', selectedTask.id); setSelectedTask(null); onRefresh(); }}} className="p-2 hover:bg-red-500 rounded-lg transition-colors" title="Xóa"><Trash2 size={20}/></button>
                  </>
                )}
                <button onClick={() => setSelectedTask(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={28}/></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><UserCheck size={14}/> Nhân sự chủ trì</h4>
                  <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-black overflow-hidden">
                       {users.find(u => u.id === selectedTask.primaryAssigneeIds[0])?.avatar ? <img src={users.find(u => u.id === selectedTask.primaryAssigneeIds[0])?.avatar} className="w-full h-full object-cover" /> : users.find(u => u.id === selectedTask.primaryAssigneeIds[0])?.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-black text-slate-800 text-sm">{users.find(u => u.id === selectedTask.primaryAssigneeIds[0])?.fullName || 'N/A'}</div>
                      <div className="text-[9px] font-bold text-blue-600 uppercase">{users.find(u => u.id === selectedTask.primaryAssigneeIds[0])?.title}</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Users size={14}/> Nhân sự phối hợp</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.supportAssigneeIds.length > 0 ? selectedTask.supportAssigneeIds.map(uid => {
                      const u = users.find(usr => usr.id === uid);
                      return ( <div key={uid} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border"> <div className="w-5 h-5 rounded-full bg-slate-400 flex items-center justify-center text-[8px] text-white font-black overflow-hidden"> {u?.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : u?.fullName.charAt(0)} </div> <span className="text-[10px] font-bold text-slate-600">{u?.fullName || 'Unknown'}</span> </div> );
                    }) : <span className="text-[10px] font-bold text-slate-400 italic">Không có nhân sự phối hợp</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-6 rounded-3xl border">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Chỉ đạo Chủ trì</h4>
                  <p className="text-sm font-bold text-slate-700 whitespace-pre-line leading-relaxed break-words">{selectedTask.content}</p>
                </div>
                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3">Chỉ đạo Phối hợp</h4>
                  <p className="text-sm font-bold text-blue-700 whitespace-pre-line leading-relaxed break-words">{selectedTask.coordinationInstructions || 'Không có chỉ đạo phối hợp riêng.'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CheckCircle2 size={14}/> Kết quả thực hiện</h4>
                <div className="bg-slate-50 border-2 rounded-3xl p-6 text-slate-700 font-bold text-sm min-h-[100px] whitespace-pre-line break-words italic">
                  {selectedTask.executionResults || 'Chưa có báo cáo kết quả thực hiện.'}
                </div>
                {(selectedTask.primaryAssigneeIds.includes(currentUser.id) || selectedTask.supportAssigneeIds.includes(currentUser.id)) && (
                   <button onClick={() => handleAddTimeline(selectedTask)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all"> Cập nhật Báo cáo kết quả & Tiến độ </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase">Trạng thái</h4>
                  <select className={`w-full p-3 rounded-xl text-[10px] font-black uppercase border-2 outline-none ${statusStyle[selectedTask.status]}`} value={selectedTask.status} onChange={(e) => handleUpdateStatus(selectedTask, e.target.value as TaskStatus)} disabled={selectedTask.assignerId !== currentUser.id && !selectedTask.primaryAssigneeIds.includes(currentUser.id)}>
                    {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase">Tiến độ (%)</h4>
                   <div className="flex items-center gap-3 pt-3">
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${selectedTask.status === TaskStatus.OVERDUE ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${selectedTask.progress}%` }} /></div>
                      <span className={`font-black text-xs ${selectedTask.status === TaskStatus.OVERDUE ? 'text-red-500' : 'text-blue-600'}`}>{selectedTask.progress}%</span>
                   </div>
                </div>
                <div className="space-y-1">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase">Hạn hoàn thành</h4>
                   <div className={`pt-3 font-black text-sm flex items-center gap-2 ${selectedTask.status === TaskStatus.OVERDUE ? 'text-red-600' : 'text-slate-800'}`}>
                     <Clock size={16}/> {selectedTask.deadline}
                     {(selectedTask.primaryAssigneeIds.includes(currentUser.id) || selectedTask.supportAssigneeIds.includes(currentUser.id)) && !selectedTask.extensionRequest && (
                       <button onClick={() => handleRequestExtension(selectedTask)} className="ml-2 text-blue-500 hover:text-blue-700 p-2 bg-blue-50 rounded-xl transition-colors" title="Xin gia hạn"><CalendarPlus size={16}/></button>
                     )}
                   </div>
                </div>
              </div>

              {selectedTask.extensionRequest && (
                <div className="mt-8">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3"><AlertTriangle size={14}/> Yêu cầu gia hạn</h4>
                  <div className={`p-6 rounded-3xl border-2 ${ selectedTask.extensionRequest.status === 'pending' ? 'bg-amber-50 border-amber-200' : selectedTask.extensionRequest.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200' }`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-700"> Xin gia hạn đến ngày: <span className="font-black text-red-600">{selectedTask.extensionRequest.requestedDate}</span> </p>
                        <p className="text-xs text-slate-500 mt-2"> <span className="font-bold">Lý do:</span> {selectedTask.extensionRequest.reason} </p>
                         {selectedTask.extensionRequest.status === 'rejected' && selectedTask.extensionRequest.rejectionReason && (
                           <p className="text-xs text-red-500 mt-2 font-bold italic"> Lý do từ chối: {selectedTask.extensionRequest.rejectionReason} </p>
                         )}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${ selectedTask.extensionRequest.status === 'pending' ? 'bg-amber-200 text-amber-800' : selectedTask.extensionRequest.status === 'approved' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800' }`}>
                        {selectedTask.extensionRequest.status === 'pending' ? 'Chờ duyệt' : selectedTask.extensionRequest.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                      </span>
                    </div>
                    {selectedTask.assignerId === currentUser.id && selectedTask.extensionRequest.status === 'pending' && (
                      <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end gap-3">
                        <button onClick={() => rejectExtension(selectedTask)} className="bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-black uppercase">Từ chối</button>
                        <button onClick={() => approveExtension(selectedTask)} className="bg-green-500 text-white px-4 py-2 rounded-lg text-xs font-black uppercase">Phê duyệt</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 border-t bg-slate-50 flex justify-end shrink-0">
              <button onClick={() => setSelectedTask(null)} className="bg-slate-800 text-white px-10 py-3.5 rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-black transition-all">Đóng cửa sổ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
