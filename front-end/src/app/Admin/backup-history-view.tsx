// src/app/Admin/backup-history-view.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  History,
  DownloadCloud,
  FileText,
  User,
  Calendar,
  Loader2,
  CornerDownLeft,
  ServerCrash
} from 'lucide-react';
import { toast } from 'sonner';

// --- KONFIGURASI API ---
// Sebaiknya gunakan process.env.NEXT_PUBLIC_API_URL di production
const API_BASE_URL = 'http://localhost:5000'; 

interface BackupItem {
  _id: string;
  filename: string;
  triggeredBy: string;
  size: string;
  createdAt: string;
}

interface BackupHistoryViewProps {
  onBack: () => void;
}

export default function BackupHistoryView({ onBack }: BackupHistoryViewProps) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // 1. Fetch List Backup
  useEffect(() => {
    const fetchBackups = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/backup/list`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Gagal memuat riwayat backup.');
        const json = await res.json();
        setBackups(json.data || []);
      } catch (error) {
        console.error(error);
        toast.error('Gagal mengambil data backup.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBackups();
  }, []);

  // 2. Handle Download File
  const handleDownload = async (id: string, filename: string) => {
    try {
      setIsDownloading(id);
      
      const response = await fetch(`${API_BASE_URL}/api/backup/download/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Gagal mengunduh file.');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Buat elemen anchor sementara untuk trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Download Berhasil', {
        description: `File ${filename} telah disimpan.`
      });
    } catch (error) {
      console.error("Error fetching backups:", error);
      toast.error('Gagal Download', { 
        description: 'File mungkin sudah dihapus atau server sedang sibuk.' 
      });
    } finally {
      setIsDownloading(null);
    }
  };

  return (
    <div className='p-4 sm:p-6 lg:p-8 h-full flex flex-col animate-in fade-in duration-300'>
      
      {/* Header Section */}
      <header className='mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white/40 backdrop-blur-md p-6 rounded-xl border border-white/50 shadow-sm gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-[#13484f] tracking-tight flex items-center gap-3'>
            <History className="w-8 h-8 text-primary" />
            Riwayat Backup
          </h1>
          <p className='text-gray-600 mt-1 font-medium opacity-80 text-sm'>
            Arsip 5 backup terakhir dari proses RAG.
          </p>
        </div>
        <button
          onClick={onBack}
          className='flex items-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold bg-[#13484f] text-white hover:bg-[#0f3d42] hover:shadow-lg transition-all active:scale-95'
        >
          <CornerDownLeft className='w-4 h-4' />
          <span>Kembali</span>
        </button>
      </header>

      {/* Content Area (Glass Card) */}
      <div className='glass-card flex-1 overflow-hidden flex flex-col p-0 border border-white/40 bg-white/30 backdrop-blur-lg shadow-xl'>
        
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 p-4 bg-[#13484f]/10 border-b border-[#13484f]/10 font-bold text-[#13484f] text-xs uppercase tracking-wider sticky top-0 z-10">
          <div className="col-span-8 md:col-span-5 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Nama File
          </div>
          {/* Hidden on mobile */}
          <div className="hidden md:flex col-span-3 items-center gap-2">
            <User className="w-4 h-4" /> Admin
          </div>
          <div className="hidden md:flex col-span-2 items-center gap-2">
            <Calendar className="w-4 h-4" /> Tanggal
          </div>
          <div className="col-span-4 md:col-span-2 text-right">Aksi</div>
        </div>

        {/* List Content */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-[#13484f]" />
              <p className="text-sm font-medium">Memuat riwayat backup...</p>
            </div>
          ) : backups.length > 0 ? (
            backups.map((item) => (
              <div 
                key={item._id}
                className="grid grid-cols-12 gap-4 p-4 rounded-xl bg-white/40 border border-white/50 hover:bg-white/70 hover:shadow-md transition-all items-center group"
              >
                {/* 1. Filename & Size */}
                <div className="col-span-8 md:col-span-5 overflow-hidden">
                  <div className="font-bold text-[#13484f] text-sm truncate pr-2" title={item.filename}>
                    {item.filename}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono bg-[#13484f]/10 text-[#13484f] px-2 py-0.5 rounded-md">
                      {item.size || '0 KB'}
                    </span>
                    {/* Tampilkan user di mobile only */}
                    <span className="md:hidden text-[10px] text-gray-500 truncate">
                      by {item.triggeredBy}
                    </span>
                  </div>
                </div>

                {/* 2. Triggered By (Desktop) */}
                <div className="hidden md:flex col-span-3 items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold shadow-sm">
                      {/* Safety Check for charAt */}
                      {(item.triggeredBy || '?').charAt(0).toUpperCase()}
                   </div>
                   <div className="flex flex-col">
                     <span className="text-sm font-semibold text-gray-700 truncate max-w-[120px]">
                        {item.triggeredBy}
                     </span>
                     <span className="text-[10px] text-gray-400">Admin</span>
                   </div>
                </div>

                {/* 3. Date (Desktop) */}
                <div className="hidden md:flex col-span-2 text-xs text-gray-600 font-medium">
                  {new Date(item.createdAt).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </div>

                {/* 4. Action Button */}
                <div className="col-span-4 md:col-span-2 flex justify-end">
                  <button
                    onClick={() => handleDownload(item._id, item.filename)}
                    disabled={isDownloading === item._id}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold shadow-sm transition-all
                      ${isDownloading === item._id 
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                        : 'bg-white border border-primary/20 text-primary hover:bg-primary hover:text-white hover:shadow-md active:scale-95'}
                    `}
                  >
                    {isDownloading === item._id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <DownloadCloud className="w-3.5 h-3.5" />
                    )}
                    <span>{isDownloading === item._id ? '...' : 'Unduh'}</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            // Empty State
            <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-80">
              <div className="p-6 bg-white/50 rounded-full mb-4 shadow-sm">
                <ServerCrash className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="font-bold text-gray-600 text-lg">Belum ada riwayat backup</h3>
              <p className="text-xs mt-1 text-center max-w-xs">
                Sistem akan otomatis membuat backup saat Anda menekan tombol <span className="font-bold">&quot;Update RAG&quot;</span> di menu Knowledge Base.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}