

import { User, Unit, Task, TaskStatus, TaskPriority, Role } from '../types';

// Initial Mock Data
const initialUnits: Unit[] = [
  { id: 'u1', code: 'QNH001', parentId: null, name: 'VNPT Quảng Ninh (Cấp Tỉnh)', managerIds: ['usr_admin'], address: '20 Lê Thánh Tông', phone: '', level: 0 },
  { id: 'u2', code: 'QNH102', parentId: 'u1', name: 'Phòng Kỹ thuật - Đầu tư', managerIds: ['usr1'], address: 'Tầng 3', phone: '02033123456', level: 1 },
  { id: 'u3', code: 'QNH103', parentId: 'u1', name: 'Phòng Kinh doanh', managerIds: ['usr3'], address: 'Tầng 2', phone: '02033987654', level: 1 },
  { id: 'u4', code: 'QNH201', parentId: 'u1', name: 'Trung tâm Viễn thông 1', managerIds: ['usr5'], address: 'Hạ Long', phone: '02033666777', level: 1 },
  { id: 'u5', code: 'QNH205', parentId: 'u4', name: 'Tổ Kỹ thuật (Thuộc TTVT1)', managerIds: [], address: 'Hạ Long', phone: '', level: 2 },
];

const initialUsers: User[] = [
  // Admin hệ thống (Giám đốc + Quyền Admin)
  { id: 'usr_admin', hrmCode: 'ADMIN', fullName: 'Quản Trị Viên', email: 'admin@vnpt.vn', title: Role.DIRECTOR, unitId: 'u1', username: 'admin', password: '123', isFirstLogin: false, canManageUsers: true },
  
  // Các user khác
  { id: 'usr1', hrmCode: 'VNPT001', fullName: 'Nguyễn Văn A', email: 'vana@vnpt.vn', title: Role.MANAGER, unitId: 'u2', username: 'anv', password: '123456', isFirstLogin: true, avatar: 'https://picsum.photos/40/40?random=1' },
  { id: 'usr2', hrmCode: 'VNPT002', fullName: 'Trần Thị B', email: 'thib@vnpt.vn', title: Role.STAFF, unitId: 'u2', username: 'btt', password: '123456', isFirstLogin: true, avatar: 'https://picsum.photos/40/40?random=2' },
  { id: 'usr3', hrmCode: 'VNPT003', fullName: 'Lê Văn C', email: 'vanc@vnpt.vn', title: Role.DIRECTOR, unitId: 'u3', username: 'clv', password: '123456', isFirstLogin: true, avatar: 'https://picsum.photos/40/40?random=3' },
  { id: 'usr4', hrmCode: 'VNPT004', fullName: 'Phạm Thị D', email: 'thid@vnpt.vn', title: Role.STAFF, unitId: 'u3', username: 'dpt', password: '123456', isFirstLogin: true, avatar: 'https://picsum.photos/40/40?random=4' },
  
  // Sub-admin (Ví dụ Giám đốc TTVT1 được quyền quản trị TTVT1)
  { id: 'usr5', hrmCode: 'VNPT005', fullName: 'Hoàng Văn E', email: 'vane@vnpt.vn', title: Role.DIRECTOR, unitId: 'u4', username: 'ehv', password: '123456', isFirstLogin: true, avatar: 'https://picsum.photos/40/40?random=5', canManageUsers: true }, 
];

const initialTasks: Task[] = [
  {
    id: 't1',
    name: 'Triển khai hạ tầng khu đô thị X',
    content: 'Khảo sát và lắp đặt tủ cáp quang',
    type: 'Project',
    projectId: 'PRJ-001',
    assignerId: 'usr1',
    // Added missing assignerName and dateAssigned properties
    assignerName: 'Nguyễn Văn A',
    dateAssigned: new Date().toISOString().split('T')[0],
    primaryAssigneeIds: ['usr2'],
    supportAssigneeIds: ['usr4'],
    deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
    status: TaskStatus.IN_PROGRESS,
    progress: 45,
    priority: TaskPriority.HIGH,
    createdAt: new Date().toISOString(),
    // Added missing required property 'assignmentSource'
    assignmentSource: 'Direct',
  },
  {
    id: 't2',
    name: 'Báo cáo doanh thu tháng 10',
    content: 'Tổng hợp số liệu từ các đơn vị',
    type: 'Single',
    assignerId: 'usr3',
    // Added missing assignerName and dateAssigned properties
    assignerName: 'Lê Văn C',
    dateAssigned: new Date().toISOString().split('T')[0],
    primaryAssigneeIds: ['usr4'],
    supportAssigneeIds: [],
    deadline: new Date(Date.now() - 86400000).toISOString(),
    status: TaskStatus.OVERDUE,
    progress: 80,
    priority: TaskPriority.MEDIUM,
    createdAt: new Date().toISOString(),
    // Added missing required property 'assignmentSource'
    assignmentSource: 'Direct',
  },
];

// Helper to load/save from localStorage
export const loadData = <T>(key: string, initial: T): T => {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : initial;
};

export const saveData = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const mockUnits = initialUnits;
export const mockUsers = initialUsers;
export const mockTasks = initialTasks;