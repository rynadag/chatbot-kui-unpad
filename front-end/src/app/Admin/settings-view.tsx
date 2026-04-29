// Admin/settings-view.tsx
'use client';
import { useState } from 'react';
import { 
  Lock, Loader2, UserCog, Eye, EyeOff, ShieldCheck 
} from 'lucide-react';
import { toast } from 'sonner';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  setShow: (value: boolean) => void;
  placeholder: string;
}

export default function SettingsView() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // State Toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      return toast.warning('Password baru minimal 6 karakter');
    }
    if (newPassword !== confirmPassword) {
      return toast.warning('Konfirmasi password baru tidak cocok');
    }

    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/admin/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const json = await res.json();
      if (res.ok) {
        toast.success('Password berhasil diubah!');
        // Reset form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(json.message || 'Gagal mengubah password');
      }
    } catch (error) { 
      console.error(error); 
      toast.error('Terjadi kesalahan koneksi');
    } finally {
      setLoading(false);
    }
  };

  // Helper untuk Input Password dengan Style Glass
  const PasswordInput = ({ 
    label, value, onChange, show, setShow, placeholder 
  }: PasswordInputProps) => (
    <div className="mb-5 group">
      <label className="block text-sm font-semibold text-[#13484f] mb-2 pl-1">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Lock className="h-4 w-4 text-primary/70 group-focus-within:text-primary transition-colors" />
        </div>
        <input 
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-xl 
                     bg-white/60 border border-white/50 
                     text-gray-700 placeholder:text-gray-400
                     focus:ring-2 focus:ring-primary/50 focus:border-primary/50 focus:bg-white/80
                     outline-none transition-all duration-200 shadow-sm backdrop-blur-sm"
          placeholder={placeholder}
          required
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md
                     text-gray-400 hover:text-primary hover:bg-primary/10 transition-all"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className='p-4 sm:p-6 h-full flex flex-col items-center justify-center overflow-y-auto'>
      
      {/* Container Utama menggunakan class 'glass-card' dari globals.css */}
      <div className="glass-card w-full max-w-lg p-8 sm:p-10 relative overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* Dekorasi Background Halus (Opsional) */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>

        <header className="text-center mb-8 relative z-10">
          <div className="mx-auto w-20 h-20 mb-4 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/20 border border-white/50 flex items-center justify-center shadow-inner">
            <UserCog className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-[#13484f] tracking-tight">
            Pengaturan Akun
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto leading-relaxed">
            Amankan akun Anda dengan memperbarui kata sandi secara berkala.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="relative z-10">
          
          <div className="bg-white/40 border border-white/50 rounded-2xl p-6 shadow-sm mb-6">
             <PasswordInput 
              label="Password Lama" 
              value={currentPassword} 
              onChange={setCurrentPassword} 
              show={showCurrent} 
              setShow={setShowCurrent} 
              placeholder="Masukkan password saat ini"
            />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-gray-300/50"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white/50 px-3 text-xs font-medium text-black-500 rounded-full backdrop-blur-sm">
                Password Baru
              </span>
            </div>
          </div>

          <div className="space-y-4 text-black">
            <PasswordInput 
              label="Password Baru" 
              value={newPassword} 
              onChange={setNewPassword} 
              show={showNew} 
              setShow={setShowNew} 
              placeholder="Minimal 6 karakter"
            />

            <PasswordInput 
              label="Konfirmasi Password" 
              value={confirmPassword} 
              onChange={setConfirmPassword} 
              show={showConfirm} 
              setShow={setShowConfirm} 
              placeholder="Ulangi password baru"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-8 flex items-center justify-center gap-2 py-3.5 px-4 
                       bg-gradient-to-r from-primary to-accent 
                       hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.01] active:scale-[0.98]
                       text-black rounded-xl font-semibold transition-all duration-200 
                       disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none border border-white/20"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
            <span>{loading ? 'Menyimpan Perubahan...' : 'Simpan Perubahan'}</span>
          </button>

        </form>
      </div>
      
  
    </div>
  );
}