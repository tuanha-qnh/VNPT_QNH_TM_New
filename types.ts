
export enum Role {
  DIRECTOR = 'Giám đốc',
  VICE_DIRECTOR = 'Phó Giám đốc',
  MANAGER = 'Trưởng phòng',
  VICE_MANAGER = 'Phó phòng',
  SPECIALIST = 'Chuyên viên',
  STAFF = 'Nhân viên'
}

export interface Unit {
  id: string;
  code: string; 
  parentId: string | null; 
  name: string;
  level: number; 
  managerIds?: string[];
  address?: string;
  phone?: string;
  includeInMobileReport?: boolean;
}

export interface User {
  id: string;
  hrmCode: string;
  fullName: string;
  email: string;
  title: Role | string;
  unitId: string;
  username: string;
  password?: string; 
  isFirstLogin: boolean;
  avatar?: string;
  canManageUsers?: boolean; // Quyền SubAdmin
  accessibleUnitIds?: string[]; // Danh sách ID đơn vị được phép xem dữ liệu
  allowedModules?: string[]; // Danh sách ID module được phép truy cập
}

export enum TaskStatus {
  PENDING = 'Chưa thực hiện',
  IN_PROGRESS = 'Đang thực hiện',
  COMPLETED = 'Đã hoàn thành',
  NOT_PERFORMED = 'Không thực hiện',
  OVERDUE = 'Quá hạn',
  STUCK = 'Vướng mắc'
}

export enum TaskPriority {
  LOW = 'Thấp',
  MEDIUM = 'Trung bình',
  HIGH = 'Cao'
}

export interface ExtensionRequest {
  requestedDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  rejectionReason?: string;
}

export interface TaskTimeline {
  date: string;
  comment: string;
  progress: number;
}

export interface Task {
  id: string;
  name: string;
  content: string;
  assignerId: string; 
  assignerName: string;
  dateAssigned: string; // ISO Date YYYY-MM-DD
  primaryAssigneeIds: string[]; 
  supportAssigneeIds: string[]; 
  deadline: string;
  status: TaskStatus;
  progress: number; // 0-100
  priority: TaskPriority;
  note?: string;
  difficulties?: string; // Báo cáo vướng mắc
  extensionRequest?: ExtensionRequest;
  timeline?: TaskTimeline[];
  assignmentSource: 'eOffice' | 'Zalo' | 'Direct' | string;
  eOfficeNumber?: string;
  coordinationInstructions?: string; // Chỉ đạo phối hợp
  executionResults?: string; // Kết quả thực hiện (dành cho nhân sự)
  type?: string;
  projectId?: string;
  createdAt?: string;
}

export interface PersonalTask {
  id: string;
  userId: string;
  name: string;
  content: string;
  deadline: string;
  status: 'Chưa xử lý' | 'Đang xử lý' | 'Đã hoàn thành' | 'Quá hạn';
  note: string;
  createdAt: string;
}

export interface KPIDefinition {
  id: string; // e.g., "fiber", "mytv"
  name: string;
  type: 'group' | 'personal' | 'both';
  unit: string; // e.g., "TB", "VNĐ"
  order?: number;
}

export interface KPIRecord {
  id: string;
  period: string; // YYYY-MM
  entityId: string; // hrmCode hoặc unitCode
  type: 'personal' | 'group';
  targets: {
    [key: string]: {
      target: number;
      actual: number;
    }
  };
}
