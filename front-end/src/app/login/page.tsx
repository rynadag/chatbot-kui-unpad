'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { LogIn, Loader2, Eye, EyeOff, User, Lock } from 'lucide-react';

// --- INTERFACE ---
interface LoginSuccessResponse {
  message: string;
  token?: string;
  role: string;
}

interface LoginErrorResponse {
  message: string;
}

type LoginResponse = LoginSuccessResponse | LoginErrorResponse;

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // State visibilitas password
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data: LoginResponse = await res.json();

      if (!res.ok) {
        throw new Error(
          (data as LoginErrorResponse).message || 'Gagal untuk login.'
        );
      }

      // Simpan role ke localStorage
      const successData = data as LoginSuccessResponse;
      if (successData.role) {
        localStorage.setItem('role', successData.role);
      }

      window.location.href = '/Admin';
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Terjadi kesalahan yang tidak diketahui.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className='min-h-screen flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden '>
      {/* --- CSS HACK UNTUK MENGATASI WARNA AUTOFILL BROWSER --- */}
      <style jsx global>{`
        /* Mengubah warna teks autofill menjadi putih */
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-text-fill-color: white !important;
          /* Transisi background sangat lama agar warna asli browser tidak muncul */
          transition: background-color 5000s ease-in-out 0s;
          /* Fallback shadow untuk menutup background putih default jika transisi gagal di beberapa browser */
          -webkit-box-shadow: 0 0 0px 1000px rgba(0, 0, 0, 0.2) inset !important;
          background-color: rgba(0, 0, 0, 0.2) !important;
        }
      `}</style>

      {/* BACKGROUND DECORATION (Blurry Blobs) */}
      {/* Blob Biru Kiri Atas */}
      <div
        className='absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-sky-600/30 rounded-full blur-[120px] opacity-40 pointer-events-none animate-pulse'
        style={{ animationDuration: '8s' }}
      />
      {/* Blob Orange/Merah Kanan Bawah */}
      <div
        className='absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-orange-600/20 rounded-full blur-[120px] opacity-40 pointer-events-none animate-pulse'
        style={{ animationDuration: '10s' }}
      />
      {/* Blob Teal Tengah (Opsional untuk variasi) */}
      <div className='absolute top-[40%] left-[40%] w-[400px] h-[400px] bg-teal-600/20 rounded-full blur-[100px] opacity-30 pointer-events-none transform -translate-x-1/2 -translate-y-1/2' />

      {/* GLASS CARD CONTAINER */}
      <div
        className='w-full max-w-md p-8 sm:p-10 rounded-3xl border flex flex-col items-center relative z-10 backdrop-blur-2xl shadow-2xl'
        style={{
          background: 'rgba(255, 255, 255, 0.03)', // Sangat transparan
          borderColor: 'rgba(255, 255, 255, 0.08)', // Border halus
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', // Shadow dalam
        }}
      >
        {/* LOGO AREA */}
        <div className='mb-6 relative group'>
          <div className='absolute inset-0 bg-white/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-50 transition-opacity duration-500'></div>
          <div className='relative w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden bg-white/10 border border-white/10 backdrop-blur-md shadow-inner'>
            <Image
              src='/Logo1.jpg'
              alt='Admin Logo'
              width={60}
              height={60}
              className='object-contain p-1'
            />
          </div>
        </div>

        {/* HEADER TEXT */}
        <div className='text-center mb-10'>
          <h1 className='text-3xl font-bold tracking-tight text-white mb-2 drop-shadow-md'>
            Admin Portal
          </h1>
          <p className='text-sm text-gray-300 font-medium opacity-80'>
            Masuk untuk mengakses dashboard KUI.
          </p>
        </div>

        {/* FORM */}
        <form className='w-full space-y-6' onSubmit={handleLogin}>
          {/* USERNAME INPUT */}
          <div className='space-y-2'>
            <label
              htmlFor='username'
              className='text-xs font-semibold text-white/80 ml-1 tracking-wide uppercase'
            >
              Username
            </label>
            <div className='relative group'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50 group-focus-within:text-blue-400 transition-colors'>
                <User className='w-5 h-5' />
              </div>
              <input
                id='username'
                name='username'
                type='text'
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className='block w-full pl-11 pr-4 py-3.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-inner'
                placeholder='Masukkan username'
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.25)', // Latar belakang input gelap transparan
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              />
            </div>
          </div>

          {/* PASSWORD INPUT */}
          <div className='space-y-2'>
            <label
              htmlFor='password'
              className='text-xs font-semibold text-white/80 ml-1 tracking-wide uppercase'
            >
              Password
            </label>
            <div className='relative group'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50 group-focus-within:text-blue-400 transition-colors'>
                <Lock className='w-5 h-5' />
              </div>
              <input
                id='password'
                name='password'
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className='block w-full pl-11 pr-12 py-3.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-inner'
                placeholder='••••••••'
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.25)', // Sama dengan username
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              />
              <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
                className='absolute inset-y-0 right-0 flex items-center pr-4 text-white/40 hover:text-white transition-colors'
                title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? (
                  <EyeOff className='w-5 h-5' />
                ) : (
                  <Eye className='w-5 h-5' />
                )}
              </button>
            </div>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div className='p-3 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center animate-in fade-in slide-in-from-top-2'>
              <span className='text-red-200 text-sm font-medium'>{error}</span>
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <div className='pt-4'>
            <button
              type='submit'
              disabled={loading}
              className='w-full flex justify-center items-center gap-2 py-4 rounded-xl shadow-lg text-sm font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100'
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)', // Gradient Blue to Indigo yang lebih vibrant
                boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {loading ? (
                <Loader2 className='w-5 h-5 animate-spin' />
              ) : (
                <LogIn className='w-5 h-5' />
              )}
              <span>{loading ? 'Memproses...' : 'Masuk Dashboard'}</span>
            </button>
          </div>
        </form>

        {/* FOOTER TEXT */}
        <div className='mt-8 text-center'>
          <p className='text-[10px] uppercase tracking-widest text-white/30 font-semibold'>
            © {new Date().getFullYear()} Kantor Urusan Internasional
          </p>
        </div>
      </div>
    </section>
  );
}
