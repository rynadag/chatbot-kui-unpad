// Admin/manage-admin-view.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { 
  CornerDownLeft, UserPlus, Loader2, Trash2, Key, Users, ShieldCheck, Shield, Lock, Eye, EyeOff 
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminItem {
  _id: string;
  username: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  createdAt: string;
}

interface AdminRequest {
  username?: string;
  password?: string;
  newPassword?: string;
}

interface ManageAdminViewProps {
  onBack: () => void;
}


type GlassInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const GlassInput = ({ className, ...props }: GlassInputProps) => (
  <input 
    {...props}
    className={`w-full p-2.5 rounded-xl 
               bg-white/60 border border-white/50 
               text-gray-700 placeholder:text-gray-400
               focus:ring-2 focus:ring-primary/50 focus:border-primary/50 focus:bg-white/80
               outline-none transition-all duration-200 shadow-sm backdrop-blur-sm ${className || ''}`}
  />
);

export default function ManageAdminView({ onBack }: ManageAdminViewProps) {
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  
  // State Form
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [selectedAdmin, setSelectedAdmin] = useState<AdminItem | null>(null);
  
  // Form Inputs
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // STATE VISIBILITAS PASSWORD
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Fetch Admin List
  const fetchAdmins = async () => {
    setLoadingList(true);
    try {
      const res = await fetch('http://localhost:5000/api/admin/list', { credentials: 'include' });
      const json = await res.json();
      if (res.ok) {
        setAdmins(json.data);
      } else {
        toast.error(json.message || 'Gagal mengambil data admin');
      }
    } catch {
      toast.error('Error koneksi server');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  // 2. Handle Select for Edit
  const handleSelectAdmin = (admin: AdminItem) => {
    setSelectedAdmin(admin);
    setMode('edit');
    setUsername(admin.username); 
    setPassword(''); 
    setConfirmPassword('');
    setShowPassword(false);       
    setShowConfirmPassword(false);
  };

  // 3. Handle Switch to Create Mode
  const handleCreateMode = () => {
    setSelectedAdmin(null);
    setMode('create');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);       
    setShowConfirmPassword(false);
  };

  // 4. Submit Handler (Create / Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // --- VALIDASI ---
    if (password.length < 6) {
      return toast.warning('Password minimal 6 karakter');
    }
    if (password !== confirmPassword) {
      return toast.warning('Konfirmasi password tidak cocok!');
    }
    // ----------------
    
    setIsSubmitting(true);
    try {
      let url = 'http://localhost:5000/api/admin/create-account';
      let method = 'POST';
      
      let body: AdminRequest = { username, password };

      if (mode === 'edit' && selectedAdmin) {
        url = `http://localhost:5000/api/admin/${selectedAdmin._id}/password`;
        method = 'PUT';
        body = { newPassword: password };
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const json = await res.json();
      
      if (!res.ok) throw new Error(json.message);

      toast.success(mode === 'create' ? 'Admin berhasil dibuat' : 'Password berhasil diubah');
      
      await fetchAdmins();
      handleCreateMode(); 

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Delete Handler
  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus admin ini?')) return;

    try {
      const res = await fetch(`http://localhost:5000/api/admin/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Admin dihapus');
        fetchAdmins();
        if (selectedAdmin?._id === id) handleCreateMode();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error('Gagal menghapus');
    }
  };

  return (
    <div className='p-4 sm:p-6 lg:p-8 h-full flex flex-col animate-in fade-in duration-300'>
      
      {/* Header View */}
      <header className='mb-6 flex justify-between items-center bg-white/40 backdrop-blur-md p-4 rounded-xl border border-white/50 shadow-sm'>
        <div>
          <h1 className='text-3xl font-bold text-[#13484f] tracking-tight'>
            Manajemen Admin
          </h1>
          <p className='text-gray-600 mt-1 font-medium opacity-80'>
            Kelola akses administrator sistem.
          </p>
        </div>
        <button
          onClick={onBack}
          className='flex items-center gap-2 py-2 px-4 rounded-xl text-sm font-semibold text-[#13484f] 
                     glass-card hover:bg-white/40 border-white/50 shadow-sm transition-all active:scale-95'
        >
          <CornerDownLeft className='w-4 h-4' />
          <span>Kembali</span>
        </button>
      </header>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0'>
        
        {/* KOLOM KIRI: DAFTAR ADMIN (Glass Card) */}
        <div className='lg:col-span-1 glass-card h-full flex flex-col overflow-hidden'>
          <div className='p-4 border-b border-white/40 bg-white/20 flex justify-between items-center backdrop-blur-sm'>
            <h2 className='text-sm font-bold flex items-center gap-2 text-[#13484f] uppercase tracking-wider'>
              <Users className='w-4 h-4' /> Daftar Admin
            </h2>
            <button 
              onClick={handleCreateMode}
              className='p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition border border-primary/20'
              title="Tambah Baru"
            >
              <UserPlus className='w-4 h-4' />
            </button>
          </div>
          
          <div className='overflow-y-auto flex-1 p-3 space-y-2'>
            {loadingList ? (
              <div className='flex justify-center p-8'><Loader2 className='animate-spin text-primary/50 w-8 h-8' /></div>
            ) : (
              admins.map((admin) => (
                <div 
                  key={admin._id}
                  onClick={() => handleSelectAdmin(admin)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                    selectedAdmin?._id === admin._id 
                      ? 'bg-gradient-to-r from-primary/10 to-accent/5 border-primary/30 shadow-sm' 
                      : 'bg-white/30 border-transparent hover:bg-white/50'
                  }`}
                >
                  <div className='flex items-center gap-3'>
                    <div className={`p-2.5 rounded-full shadow-inner ${
                      admin.role === 'SUPER_ADMIN' 
                        ? 'bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700' 
                        : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600'
                    }`}>
                      {admin.role === 'SUPER_ADMIN' ? <ShieldCheck className='w-4 h-4' /> : <Shield className='w-4 h-4' />}
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${selectedAdmin?._id === admin._id ? 'text-primary' : 'text-gray-800'}`}>
                        {admin.username}
                      </p>
                      <p className='text-[10px] text-gray-500 tracking-wide'>{admin.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                  
                  {admin.role !== 'SUPER_ADMIN' && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(admin._id); }}
                      className='p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100'
                    >
                      <Trash2 className='w-4 h-4' />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* KOLOM KANAN: FORM (Glass Card) */}
        <div className='lg:col-span-2 glass-card h-fit p-8 relative overflow-hidden'>
            {/* Background Decor */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className='mb-8 pb-4 border-b border-white/40 relative z-10'>
            <h2 className='text-xl font-bold text-[#13484f] flex items-center gap-2'>
              {mode === 'create' ? <UserPlus className='w-6 h-6 text-primary' /> : <Key className='w-6 h-6 text-amber-500' />}
              {mode === 'create' ? 'Buat Admin Baru' : `Ganti Password: ${selectedAdmin?.username}`}
            </h2>
            <p className='text-sm text-gray-500 mt-1 leading-relaxed'>
              {mode === 'create' 
                ? 'Tambahkan administrator baru untuk mengelola sistem dashboard kampus.' 
                : 'Masukkan password baru yang aman untuk mereset akses admin ini.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className='space-y-6 max-w-xl relative z-10'>
            {mode === 'create' && (
              <div>
                <label className='block text-sm font-bold text-[#13484f] mb-2 pl-1'>Username</label>
                <GlassInput 
                  type="text" 
                  value={username}
                  // TypeScript otomatis meng-infer event (e) karena GlassInputProps
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder='Contoh: admin_kampus'
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* PASSWORD FIELD */}
              <div>
                <label className='block text-sm font-bold text-[#13484f] mb-2 pl-1'>
                  {mode === 'create' ? 'Password' : 'Password Baru'}
                </label>
                <div className="relative group">
                  <GlassInput 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    placeholder='Min 6 karakter'
                    required
                  />
                  <Lock className="w-4 h-4 text-primary/60 group-focus-within:text-primary absolute left-3 top-1/2 -translate-y-1/2 transition-colors" />
                  
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded p-1 transition-all"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* CONFIRM PASSWORD FIELD */}
              <div>
                <label className='block text-sm font-bold text-[#13484f] mb-2 pl-1'>
                  Konfirmasi Password
                </label>
                <div className="relative group">
                  <GlassInput 
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`pl-10 pr-10 ${
                        confirmPassword && password !== confirmPassword 
                        ? '!border-red-400 !focus:ring-red-400' 
                        : ''
                    }`}
                    placeholder='Ulangi password'
                    required
                  />
                  <Lock className="w-4 h-4 text-primary/60 group-focus-within:text-primary absolute left-3 top-1/2 -translate-y-1/2 transition-colors" />
                  
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded p-1 transition-all"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1 pl-1 font-medium">Password tidak cocok.</p>
                )}
              </div>
            </div>

            <div className='flex gap-3 pt-6 border-t border-white/40 mt-4'>
              {mode === 'edit' && (
                <button 
                  type="button" 
                  onClick={handleCreateMode}
                  className='px-5 py-2.5 text-sm font-medium text-gray-600 bg-white/50 rounded-xl hover:bg-white/80 border border-white/60 transition-all'
                >
                  Batal
                </button>
              )}
              <button 
                type="submit" 
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]
                  ${mode === 'create' 
                    ? 'bg-gradient-to-r from-primary to-accent hover:shadow-primary/20' 
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:shadow-amber-500/20'}
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
              >
                {isSubmitting && <Loader2 className='w-4 h-4 animate-spin' />}
                {mode === 'create' ? 'Buat Akun' : 'Simpan Password'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}