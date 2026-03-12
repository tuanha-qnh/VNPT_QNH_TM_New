
import React, { useState, useRef, useEffect } from 'react';
import { Mail, Save, Shield, AlertCircle, Loader2, Key, RotateCcw, ShieldAlert, Settings as SettingsIcon, Camera, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { User, Role } from '../types';
import { dbClient } from '../utils/firebaseClient';
import md5 from 'md5';

interface SettingsProps {
    currentUser: User;
    onRefresh: () => void;
}

const Settings: React.FC<SettingsProps> = ({ currentUser, onRefresh }) => {
    const [passwordData, setPasswordData] = useState({ old: '', new: '', confirm: '' });
    const [isChangingPass, setIsChangingPass] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [systemSettings, setSystemSettings] = useState({ allowKpiSync: false });
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const isSystemAdmin = currentUser.username === 'admin';

    useEffect(() => {
        if (isSystemAdmin) {
            dbClient.getById('system_settings', 'general').then(res => {
                if (res) setSystemSettings({ allowKpiSync: res.allowKpiSync });
            });
        }
    }, [isSystemAdmin]);

    // Chính sách mật khẩu: 8 ký tự, 1 chữ, 1 số, 1 ký tự đặc biệt
    const validatePassword = (pass: string) => {
        const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
        return regex.test(pass);
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Giới hạn 1MB cho avatar (vì lưu base64 vào firestore)
        if (file.size > 1024 * 1024) {
            alert("Dung lượng ảnh quá lớn (Vui lòng chọn ảnh < 1MB)");
            return;
        }

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            try {
                await dbClient.update('users', currentUser.id, { avatar: base64 });
                onRefresh();
                alert("Cập nhật ảnh đại diện thành công!");
            } catch (err) {
                alert("Lỗi khi lưu ảnh.");
            } finally {
                setIsUploading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!validatePassword(passwordData.new)) {
            return alert("Mật khẩu không đạt yêu cầu: Tối thiểu 8 ký tự, bao gồm chữ cái, chữ số và ít nhất 1 ký tự đặc biệt (!@#$%^&*).");
        }

        if (passwordData.new !== passwordData.confirm) return alert("Mật khẩu mới không khớp!");
        
        setIsChangingPass(true);
        try {
            if (md5(passwordData.old) !== currentUser.password && passwordData.old !== currentUser.password) {
                throw new Error("Mật khẩu cũ không chính xác.");
            }
            await dbClient.update('users', currentUser.id, { 
                password: md5(passwordData.new),
                isFirstLogin: false 
            });
            alert("Đổi mật khẩu thành công!");
            setPasswordData({ old: '', new: '', confirm: '' });
            onRefresh();
        } catch (err: any) { alert("Lỗi: " + err.message); }
        finally { setIsChangingPass(false); }
    };

    const handleSaveSystemSettings = async () => {
        setIsSavingSettings(true);
        try {
            await dbClient.upsert('system_settings', 'general', systemSettings);
            alert("Đã lưu cấu hình hệ thống!");
        } catch (e) {
            alert("Lỗi lưu cấu hình");
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleResetDatabase = async () => {
        if (!isSystemAdmin) return;
        const confirm1 = confirm("CẢNH BÁO NGUY HIỂM!\n\nHành động này sẽ XÓA SẠCH dữ liệu Cloud. Tiếp tục?");
        if (!confirm1) return;
        setIsResetting(true);
        try {
            const collections = ['units', 'users', 'tasks', 'kpis'];
            for (const col of collections) {
                const items = await dbClient.getAll(col);
                for (const item of items) await dbClient.delete(col, item.id);
            }
            const rootId = 'unit_root_qn';
            await dbClient.upsert('units', rootId, { code: 'VNPT_QN', name: 'VNPT Quảng Ninh (Gốc)', level: 0, parentId: null });
            await dbClient.upsert('users', 'user_admin_root', {
                hrmCode: 'ADMIN', fullName: 'Quản Trị Viên', email: 'admin@vnpt.vn',
                username: 'admin', password: md5('123'), title: Role.DIRECTOR,
                unitId: rootId, isFirstLogin: false, canManageUsers: true
            });
            alert("Khởi tạo lại Database thành công!");
            window.location.reload();
        } catch (err: any) { alert("Lỗi reset: " + err.message); }
        finally { setIsResetting(false); }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-10 animate-fade-in pb-20">
            <div className="flex items-center gap-4 border-b-4 border-slate-100 pb-6">
                <SettingsIcon className="text-slate-800" size={36}/>
                <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Cài đặt hệ thống</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white rounded-[32px] shadow-sm border p-8 flex flex-col items-center text-center">
                        <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
                            <div className="w-24 h-24 bg-blue-600 rounded-[24px] flex items-center justify-center text-white font-black text-4xl mb-6 shadow-xl shadow-blue-100 overflow-hidden">
                                {currentUser.avatar ? (
                                    <img src={currentUser.avatar} className="w-full h-full object-cover" />
                                ) : currentUser.fullName.charAt(0)}
                                {isUploading && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <Loader2 className="animate-spin text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="absolute bottom-4 right-[-4px] bg-slate-800 p-2 rounded-xl text-white shadow-lg border-2 border-white group-hover:scale-110 transition-transform">
                                <Camera size={14}/>
                            </div>
                            <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileChange} />
                        </div>
                        <h3 className="font-black text-slate-800 text-xl">{currentUser.fullName}</h3>
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">{currentUser.title}</p>
                    </div>
                </div>

                <div className="md:col-span-2 space-y-8">
                    {isSystemAdmin && (
                        <div className="bg-white rounded-[40px] shadow-sm border p-10 space-y-8">
                            <div className="flex items-center gap-3 border-b pb-6">
                                <Shield className="text-purple-600" size={24}/>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Cấu hình Quản trị viên</h3>
                            </div>
                            <div className="flex items-center justify-between bg-purple-50 p-6 rounded-3xl border border-purple-100">
                                <div>
                                    <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                                        {systemSettings.allowKpiSync ? <Unlock size={16} className="text-green-600"/> : <Lock size={16} className="text-red-500"/>}
                                        Cho phép người dùng đồng bộ KPI
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1 max-w-sm">
                                        Khi tắt, chỉ Admin mới có thể đồng bộ dữ liệu KPI và Mobile Ops từ Google Sheet.
                                        User khác sẽ bị chặn nút đồng bộ.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={systemSettings.allowKpiSync} onChange={e => setSystemSettings({...systemSettings, allowKpiSync: e.target.checked})} />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                            <div className="flex justify-end">
                                <button onClick={handleSaveSystemSettings} disabled={isSavingSettings} className="bg-purple-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase shadow-lg shadow-purple-100 hover:bg-purple-700 flex items-center gap-2">
                                    {isSavingSettings ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Lưu cấu hình
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-[40px] shadow-sm border p-10 space-y-8">
                        <div className="flex items-center gap-3 border-b pb-6">
                            <Key className="text-blue-600" size={24}/>
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Đổi mật khẩu bảo mật</h3>
                        </div>
                        
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-2">
                             <div className="flex items-center gap-2 text-amber-700 font-black text-[10px] uppercase">
                                <Shield size={14}/> Chính sách mật khẩu VNPT
                             </div>
                             <ul className="text-[10px] font-bold text-amber-600 list-disc list-inside space-y-1">
                                <li>Tối thiểu 8 ký tự.</li>
                                <li>Phải bao gồm cả chữ và số.</li>
                                <li>Phải có ít nhất 1 ký tự đặc biệt (!@#$%^&*).</li>
                             </ul>
                        </div>

                        <form onSubmit={handleChangePassword} className="space-y-6">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu hiện tại</label>
                                <input type="password" required className="w-full border-2 rounded-2xl p-4 bg-slate-50 outline-none focus:border-blue-500 font-bold transition-all" value={passwordData.old} onChange={e => setPasswordData({...passwordData, old: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu mới</label>
                                    <input type="password" required className="w-full border-2 rounded-2xl p-4 bg-slate-50 outline-none focus:border-blue-500 font-bold transition-all" value={passwordData.new} onChange={e => setPasswordData({...passwordData, new: e.target.value})} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Xác nhận mật khẩu</label>
                                    <input type="password" required className="w-full border-2 rounded-2xl p-4 bg-slate-50 outline-none focus:border-blue-500 font-bold transition-all" value={passwordData.confirm} onChange={e => setPasswordData({...passwordData, confirm: e.target.value})} />
                                </div>
                            </div>
                            <button type="submit" disabled={isChangingPass} className="w-full bg-blue-600 text-white py-5 rounded-[20px] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                                {isChangingPass ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Cập nhật mật khẩu
                            </button>
                        </form>
                    </div>

                    {isSystemAdmin && (
                        <div className="bg-red-50 rounded-[40px] shadow-sm border border-red-100 p-10 space-y-8">
                            <div className="flex items-center gap-3 border-b border-red-200 pb-6">
                                <ShieldAlert className="text-red-600" size={24}/>
                                <h3 className="text-lg font-black text-red-600 uppercase tracking-tight">Danger Zone</h3>
                            </div>
                            <button onClick={handleResetDatabase} disabled={isResetting} className="w-full bg-red-600 text-white py-5 rounded-[20px] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                                {isResetting ? <Loader2 className="animate-spin" size={18}/> : <RotateCcw size={18}/>} Khởi tạo lại toàn bộ Database
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Settings;
