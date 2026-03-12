
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cxqyxylgwmepnswwhprn.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4cXl4eWxnd21lcG5zd3docHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MTEzODYsImV4cCI6MjA4MTM4NzM4Nn0.EqaULnMXqR1vraQX_qpJab1B4aTengXAYNUN0cHUiU4';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const dbClient = {
    async getAll(table: string) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        return data || [];
    },
    async upsert(table: string, id: string, data: any) {
        const cleanData: any = {};
        const validColumns: Record<string, string[]> = {
            'units': ['id', 'code', 'name', 'parent_id', 'manager_ids', 'address', 'phone', 'level'],
            'users': ['id', 'hrm_code', 'full_name', 'email', 'username', 'password', 'title', 'unit_id', 'is_first_login', 'can_manage', 'avatar'],
            'tasks': ['id', 'name', 'content', 'type', 'status', 'priority', 'progress', 'deadline', 'assigner_id', 'primary_ids', 'support_ids', 'project_id', 'ext_request']
        };

        const allowed = validColumns[table] || [];
        
        Object.entries(data).forEach(([key, value]) => {
            let targetKey = key;
            // Ánh xạ camelCase sang snake_case
            if (key === 'hrmCode') targetKey = 'hrm_code';
            if (key === 'fullName') targetKey = 'full_name';
            if (key === 'unitId') targetKey = 'unit_id';
            if (key === 'isFirstLogin') targetKey = 'is_first_login';
            if (key === 'canManageUsers') targetKey = 'can_manage';
            
            // Chỉ đưa vào cleanData nếu cột nằm trong danh sách cho phép
            if (allowed.includes(targetKey)) {
                // Nếu là avatar và giá trị rỗng/null, tạm thời bỏ qua để tránh lỗi Schema Cache nếu cột chưa được tạo
                if (targetKey === 'avatar' && !value) return;
                
                cleanData[targetKey] = value === undefined ? null : value;
            }
        });
        
        try {
            const { error } = await supabase.from(table).upsert({ ...cleanData, id }, { onConflict: 'id' });
            if (error) {
                // Nếu lỗi liên quan đến avatar (cột không tồn tại trong cache), thử lại lần 2 không có avatar
                if (error.message.includes('avatar') || error.code === '42703') {
                    console.warn("Phát hiện lỗi cột avatar trong cache, đang thử lại không có avatar...");
                    delete cleanData.avatar;
                    const { error: retryError } = await supabase.from(table).upsert({ ...cleanData, id }, { onConflict: 'id' });
                    if (retryError) throw retryError;
                    return true;
                }
                throw error;
            }
        } catch (err) {
            console.error(`Lỗi DB Upsert (${table}):`, err);
            throw err;
        }
        return true;
    },
    async delete(table: string, id: string) {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        return true;
    }
};
