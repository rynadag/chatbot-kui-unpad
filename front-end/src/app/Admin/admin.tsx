// Admin/admin.tsx
'use client';
import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Trash2,
  User,
  Search,
  Bot,
  Loader2,
  LogOut,
  UserPlus,
  DatabaseZap,
  ChevronsLeft,
  UploadCloud,
  Settings,
  Menu,
  Monitor,
  History,
} from 'lucide-react';
import { toast } from 'sonner';

// --- LIBRARY MARKDOWN & HTML PARSER ---
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw'; // <--- PLUGIN PENTING UNTUK RENDER HTML

// --- IMPORT SUB-VIEWS ---
// Pastikan file-file ini ada di folder yang sama (Admin/)
import KnowledgeView from './knowledge-view';
import ManageAdminView from './manage-admin-view';
import RagDetailView from './rag-detail-view';
import SettingsView from './settings-view';
import MonitorView from './Monitor-view';
import BackupHistoryView from './backup-history-view';

// --- INTERFACES ---
interface ChatSession {
  _id: string;
  status: string;
  createdAt: string;
}

interface Message {
  sender: 'user' | 'bot';
  msg: string;
  createdAt: string;
}

interface BackendMessage {
  sender: 'USER' | 'BOT';
  msg: string;
  createdAt: string;
}

interface SelectedConversation {
  _id: string;
  status: string;
  messages: Message[];
}

interface ChatListResponse {
  data: ChatSession[];
}

interface ChatHistoryResponse {
  data: BackendMessage[];
}

interface DeleteOldChatsResponse {
  message: string;
}

// Tipe untuk Navigasi
type ActiveView =
  | 'history'
  | 'knowledge'
  | 'manageAdmin'
  | 'ragUpload'
  | 'settings'
  | 'monitor'
  | 'backupHistory';

interface MonitorEvent {
  ts: number;
  type: string;
  payload: unknown;
}

// ==================================================
// Komponen Konfirmasi Bottom-Right (Toast-like UI)
// ==================================================
function ConfirmToast({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Oke',
  cancelLabel = 'Batal',
  loading = false,
}: {
  visible: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      role='dialog'
      aria-modal='true'
      className='fixed bottom-6 right-6 z-[9999] max-w-[380px] w-full'
    >
      <div className='bg-neutral-900/95 border border-neutral-800 rounded-lg shadow-lg text-white overflow-hidden'>
        <div className='p-4 flex gap-3'>
          <div className='flex-shrink-0'>
            <div className='w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center shadow'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='w-5 h-5 text-white'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
              >
                <path
                  d='M20 6L9 17l-5-5'
                  stroke='currentColor'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </div>
          </div>
          <div className='flex-1'>
            {title && (
              <div className='font-semibold text-sm text-emerald-200'>
                {title}
              </div>
            )}
            <div className='text-sm text-emerald-50 mt-1'>{message}</div>
            <div className='mt-3 flex gap-2 justify-end'>
              <button
                onClick={onCancel}
                disabled={loading}
                className='px-3 py-1.5 rounded-md bg-transparent border border-neutral-700 text-neutral-200 text-sm hover:bg-neutral-800/60 transition'
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className='px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-60'
              >
                {loading ? '...' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// KOMPONEN 1: SIDEBAR (GLASS STYLE & FLOATING)
// ============================================================================
const AdminSidebar = ({
  activeView,
  onNavClick,
  onLogout,
  isLoggingOut,
  userRole,
}: {
  activeView: ActiveView;
  onNavClick: (view: ActiveView) => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  userRole: string | null;
}) => {
  const [isOpen, setIsOpen] = useState(true);

  // Daftar Menu Dasar
  const navItems = [
    {
      view: 'history' as ActiveView,
      icon: MessageSquare,
      label: 'Chat History',
    },
    {
      view: 'knowledge' as ActiveView,
      icon: DatabaseZap,
      label: 'Knowledge Base',
    },
    {
      view: 'backupHistory' as ActiveView,
      icon: History,
      label: 'Riwayat Backup',
    },
    {
      view: 'ragUpload' as ActiveView,
      icon: UploadCloud,
      label: 'Upload & Auto-RAG',
    },
    {
      view: 'monitor' as ActiveView,
      icon: Monitor,
      label: 'Live Monitor',
    },
    { view: 'settings' as ActiveView, icon: Settings, label: 'Settings' },
  ];

  // LOGIC SUPER ADMIN: Tambahkan menu 'Manage Admin'
  if (userRole === 'SUPER_ADMIN') {
    navItems.splice(3, 0, {
      view: 'manageAdmin' as ActiveView,
      icon: UserPlus,
      label: 'Manage Admin',
    });
  }

  return (
    <aside
      className={`glass-card flex flex-col my-4 ml-4 h-[calc(100vh-2rem)] transition-all duration-300 ease-in-out z-20 overflow-hidden
                 ${isOpen ? 'w-64' : 'w-20'}`}
    >
      {/* Header Sidebar */}
      <div className='flex items-center h-20 px-6 border-b border-white/40 mb-2'>
        {isOpen ? (
          <div>
            <h1 className='text-xl font-bold text-[#13484f] bg-gradient-to-r from-primary to-accent bg-clip-text  whitespace-nowrap'>
              Admin Panel
            </h1>
            <p className='text-[10px] text-gray-500 font-medium tracking-wider uppercase opacity-80'>
              University Dashboard
            </p>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className='mx-auto  hover:bg-black/5 rounded-lg transition-colors'
          >
            <Menu className='w-6 h-6 text-gray-600' />
          </button>
        )}
        {isOpen && (
          <button
            onClick={() => setIsOpen(false)}
            className='ml-auto p-1 text-gray-400 hover:text-gray-600'
          >
            <ChevronsLeft className='w-5 h-5' />
          </button>
        )}
      </div>

      {/* Menu Items */}
      <nav className='flex-1 flex flex-col gap-2 px-3 py-2'>
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onNavClick(item.view)}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200
                      ${!isOpen && 'justify-center'} 
                      ${
                        activeView === item.view
                          ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                          : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
                      }`}
          >
            <item.icon
              className={`w-5 h-5 flex-shrink-0 ${
                activeView === item.view ? 'text-[#13484f]' : 'text-gray-400'
              }`}
            />

            {isOpen && (
              <span className='whitespace-nowrap text-[#13484f]'>
                {item.label}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer Section: Logout */}
      <div className='p-4 border-t border-white/40 bg-white/20'>
        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium 
                    text-red-600 hover:bg-red-50 hover:text-red-700 hover:shadow-sm
                    transition-all disabled:opacity-50
                    ${!isOpen && 'justify-center'}`}
        >
          {isLoggingOut ? (
            <Loader2 className='w-5 h-5 animate-spin flex-shrink-0' />
          ) : (
            <LogOut className='w-5 h-5 flex-shrink-0' />
          )}
          {isOpen && (
            <span className='whitespace-nowrap text-[#13484f] '>
              {isLoggingOut ? 'Keluar...' : 'Keluar'}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

// ============================================================================
// KOMPONEN 2: CHAT HISTORY VIEW (UPDATED GLASS)
// ============================================================================

const ChatHistoryView = () => {
  const [chatList, setChatList] = useState<ChatSession[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<SelectedConversation | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Konfirmasi kustom state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmTitle, setConfirmTitle] = useState<string | undefined>(
    undefined
  );
  const [confirmLoading, setConfirmLoading] = useState(false);
  const confirmActionRef = useState<() => Promise<void> | void>(() => () => {
    return;
  })[0] as unknown as { current?: () => Promise<void> | void };

  // 1. Fetch List
  const fetchChatList = async () => {
    try {
      setListLoading(true);
      const res = await fetch('http://localhost:5000/api/admin/chats/all', {
        credentials: 'include',
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Gagal mengambil daftar chat.');
      const data: ChatListResponse = await res.json();
      setChatList(data.data || []);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Terjadi kesalahan yang tidak diketahui.');
      }
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchChatList();
  }, []);

  // 2. Select Conversation & Fetch Details
  const handleSelectConversation = async (chatId: string) => {
    try {
      setDetailLoading(true);
      setSelectedConversation(null);

      const res = await fetch(
        `http://localhost:5000/api/admin/chats/history?chatId=${chatId}`,
        { credentials: 'include' }
      );

      let transformedMessages: Message[] = [];
      let status = 'UNKNOWN';

      if (res.ok) {
        const data: ChatHistoryResponse = await res.json();
        transformedMessages = (data.data || []).map(
          (msg: BackendMessage): Message => ({
            msg: msg.msg,
            createdAt: msg.createdAt,
            sender: msg.sender === 'USER' ? 'user' : 'bot',
          })
        );
        transformedMessages.reverse();
      } else {
        console.warn('Gagal fetch detail, mungkin chat kosong.');
      }

      const currentChat = chatList.find((chat) => chat._id === chatId);
      status = currentChat?.status || 'UNKNOWN';

      setSelectedConversation({
        _id: chatId,
        status: status,
        messages: transformedMessages,
      });
    } catch (err) {
      setSelectedConversation({
        _id: chatId,
        status: 'ERROR',
        messages: [],
      });

      if (err instanceof Error) {
        toast.error(`Gagal memuat detail: ${err.message}`);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  // 3. Delete Single Chat (eksekusi sebenarnya)
  const executeDeleteChat = async (id: string) => {
    try {
      setConfirmLoading(true);
      const res = await fetch(`http://localhost:5000/api/admin/chats/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Gagal menghapus chat.');

      setChatList((prev) => prev.filter((c) => c._id !== id));

      if (selectedConversation?._id === id) {
        setSelectedConversation(null);
      }

      toast.success('Percakapan berhasil dihapus.');
    } catch (err) {
      if (err instanceof Error) {
        toast.error(`Error: ${err.message}`);
      } else {
        toast.error('Gagal menghapus chat.');
      }
    } finally {
      setConfirmLoading(false);
      setConfirmVisible(false);
    }
  };

  // wrapper untuk memanggil konfirmasi kustom sebelum menghapus single chat
  const handleDeleteChat = async (id: string) => {
    // jangan gunakan confirm() native — gunakan konfirmasi kustom
    setConfirmTitle(undefined);
    setConfirmMessage(
      'Apakah Anda yakin ingin menghapus percakapan ini secara permanen?'
    );
    confirmActionRef.current = () => executeDeleteChat(id);
    setConfirmVisible(true);
  };

  // 4. Delete Old Chats (eksekusi)
  const executeDeleteOldChats = async () => {
    try {
      setConfirmLoading(true);
      const res = await fetch(
        'http://localhost:5000/api/admin/chats/delete-old',
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) throw new Error('Gagal menghapus chat lama.');
      const result: DeleteOldChatsResponse = await res.json();
      toast.success(result.message);
      fetchChatList();
    } catch (err) {
      if (err instanceof Error) {
        toast.error(`Error: ${err.message}`);
      } else {
        toast.error('Gagal membersihkan chat lama.');
      }
    } finally {
      setConfirmLoading(false);
      setConfirmVisible(false);
    }
  };

  // wrapper untuk memanggil konfirmasi kustom sebelum menghapus chat lama
  const handleDeleteOldChats = async () => {
    setConfirmTitle('Hapus Chat Lama');
    setConfirmMessage('Hapus semua chat lama (NONACTIVE > 7 hari)?');
    confirmActionRef.current = () => executeDeleteOldChats();
    setConfirmVisible(true);
  };

  const filteredConversations = chatList.filter((conv) =>
    conv._id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className='p-4 h-full flex flex-col'>
      {/* Header View */}
      <header className='mb-6 flex justify-between items-center bg-white/40 backdrop-blur-md p-4 rounded-xl border border-white/50 shadow-sm'>
        <div>
          <h1 className='text-2xl font-bold text-[#13484f] tracking-tight'>
            Chat History
          </h1>
          <p className='text-sm text-gray-600 mt-1'>
            Manajemen dan monitoring aktivitas chatbot.
          </p>
        </div>
        <button
          onClick={handleDeleteOldChats}
          className='flex items-center gap-2 bg-gradient-to-r from-orange-400 to-red-500 text-white font-semibold px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95'
        >
          <Trash2 className='w-5 h-5' />
          <span>Hapus Chat Lama</span>
        </button>
      </header>

      {/* Chat History Section */}
      <section className='grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0'>
        {/* LIST PANEL (Glass Card) */}
        <div className='lg:col-span-1 glass-card flex flex-col overflow-hidden h-full'>
          <div className='p-4 border-b border-white/40 bg-white/20'>
            <h2 className='text-sm font-semibold flex items-center mb-3 gap-2 text-gray-700 uppercase tracking-wider opacity-80'>
              <MessageSquare className='w-4 h-4' /> Daftar Percakapan
            </h2>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
              <input
                type='text'
                placeholder='Cari ID percakapan...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='w-full bg-white/60 text-gray-800 rounded-xl border border-white/50 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all placeholder:text-gray-400'
              />
            </div>
          </div>

          <div className='overflow-y-auto flex-1 p-3 space-y-2'>
            {listLoading ? (
              <div className='flex justify-center items-center h-40 text-gray-400'>
                <Loader2 className='w-8 h-8 animate-spin' />
              </div>
            ) : filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => (
                <div
                  key={conv._id}
                  onClick={() => handleSelectConversation(conv._id)}
                  className={`group relative w-full rounded-xl transition-all border cursor-pointer ${
                    selectedConversation?._id === conv._id
                      ? 'bg-white border-primary/30 shadow-md'
                      : 'border-transparent hover:bg-white/40 bg-white/10'
                  }`}
                >
                  <div className='p-4 pr-10'>
                    <div className='flex justify-between items-start mb-1'>
                      <p className='font-mono text-xs text-gray-600 font-semibold truncate w-24'>
                        {conv._id.substring(0, 8)}...
                      </p>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          conv.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-200 text-gray-600 border border-gray-300'
                        }`}
                      >
                        {conv.status}
                      </span>
                    </div>
                    <p className='text-xs text-gray-500'>
                      {new Date(conv.createdAt).toLocaleString('id-ID', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>

                  {/* Tombol Hapus */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // gunakan konfirmasi kustom
                      handleDeleteChat(conv._id);
                    }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg 
                               text-gray-400 hover:text-red-600 hover:bg-red-50 
                               opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all
                               ${
                                 selectedConversation?._id === conv._id
                                   ? 'opacity-100'
                                   : ''
                               }`}
                    title='Hapus Percakapan'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              ))
            ) : (
              <div className='text-center text-gray-500 p-8 text-sm opacity-60'>
                <p>{error || 'Tidak ada percakapan ditemukan.'}</p>
              </div>
            )}
          </div>
        </div>

        {/* DETAIL PANEL (Glass Card) */}
        <div className='lg:col-span-2 glass-card flex flex-col overflow-hidden h-full'>
          {detailLoading ? (
            <div className='flex justify-center items-center h-full text-gray-400'>
              <Loader2 className='w-12 h-12 animate-spin' />
            </div>
          ) : selectedConversation ? (
            <>
              <header className='p-4 border-b border-white/40 bg-white/30 flex justify-between items-center backdrop-blur-sm'>
                <div>
                  <h3 className='font-bold text-gray-800'>Detail Percakapan</h3>
                  <p className='text-xs font-mono text-gray-500 mt-0.5'>
                    ID: {selectedConversation._id}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteChat(selectedConversation._id)}
                  className='flex items-center gap-2 bg-white/50 border border-red-100 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'
                >
                  <Trash2 className='w-4 h-4' />
                  <span>Hapus</span>
                </button>
              </header>

              <div className='flex-1 overflow-y-auto p-6 flex flex-col gap-5 bg-white/20'>
                {selectedConversation.messages.length > 0 ? (
                  selectedConversation.messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-3 max-w-[90%] ${
                        msg.sender === 'user'
                          ? 'self-end flex-row-reverse'
                          : 'self-start'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm border border-white/50 ${
                          msg.sender === 'user'
                            ? 'bg-gradient-to-br from-primary to-accent text-white'
                            : 'bg-white text-primary'
                        }`}
                      >
                        {msg.sender === 'user' ? (
                          <User className='w-5 h-5' />
                        ) : (
                          <Bot className='w-5 h-5' />
                        )}
                      </div>
                      <div
                        className={`px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                          msg.sender === 'user'
                            ? 'bg-[#13484f] text-white rounded-tr-none shadow-md'
                            : 'bg-white/90 backdrop-blur-sm text-gray-800 rounded-tl-none border border-white/60'
                        }`}
                      >
                        {/* --- RENDERER MARKDOWN + HTML TABLE --- */}
                        <div
                          className={`prose prose-sm max-w-none ${
                            msg.sender === 'user' ? 'prose-invert' : ''
                          } text-sm`}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw]} // KUNCI: Render HTML Table dari AI
                            components={{
                              // Table Styling untuk Admin View
                              table: ({ ...props }) => (
                                <div className='overflow-x-auto my-3 border border-gray-200 rounded-lg bg-white/50'>
                                  <table
                                    className='min-w-full divide-y divide-gray-200 text-left text-xs'
                                    {...props}
                                  />
                                </div>
                              ),
                              thead: ({ ...props }) => (
                                <thead className='bg-gray-100/50' {...props} />
                              ),
                              th: ({ ...props }) => (
                                <th
                                  className='px-3 py-2 font-bold text-gray-700 border-b border-gray-100'
                                  {...props}
                                />
                              ),
                              tbody: ({ ...props }) => (
                                <tbody
                                  className='divide-y divide-gray-100'
                                  {...props}
                                />
                              ),
                              tr: ({ ...props }) => (
                                <tr
                                  className='hover:bg-white/60 transition-colors'
                                  {...props}
                                />
                              ),
                              td: ({ ...props }) => (
                                <td
                                  className='px-3 py-2 whitespace-pre-wrap align-top'
                                  {...props}
                                />
                              ),
                              ul: ({ ...props }) => (
                                <ul
                                  className='list-disc pl-4 mb-2 space-y-1'
                                  {...props}
                                />
                              ),
                              ol: ({ ...props }) => (
                                <ol
                                  className='list-decimal pl-4 mb-2 space-y-1'
                                  {...props}
                                />
                              ),
                              h3: ({ ...props }) => (
                                <h3
                                  className='font-bold text-base mt-4 mb-2 opacity-90'
                                  {...props}
                                />
                              ),
                            }}
                          >
                            {msg.msg}
                          </ReactMarkdown>
                        </div>

                        <p
                          className={`text-[10px] mt-2 opacity-70 ${
                            msg.sender === 'user'
                              ? 'text-blue-50'
                              : 'text-gray-400'
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className='flex flex-col items-center justify-center h-full text-gray-400 opacity-60'>
                    <DatabaseZap className='w-12 h-12 mb-2' />
                    <p className='text-sm'>Data percakapan kosong.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className='flex flex-col items-center justify-center h-full text-gray-500'>
              <div className='p-6 bg-white/40 rounded-full mb-4 shadow-sm border border-white/60'>
                <MessageSquare className='w-12 h-12 text-primary/60' />
              </div>
              <h3 className='text-lg font-bold text-gray-700'>
                Belum ada percakapan dipilih
              </h3>
              <p className='text-sm mt-1'>
                Pilih salah satu dari daftar di sebelah kiri.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Confirm Toast (fixed bottom-right) */}
      <ConfirmToast
        visible={confirmVisible}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel='Oke'
        cancelLabel='Batal'
        loading={confirmLoading}
        onCancel={() => {
          setConfirmVisible(false);
        }}
        onConfirm={async () => {
          try {
            // apabila confirmActionRef.current ter-set, jalankan
            setConfirmLoading(true);
            if (confirmActionRef.current) {
              await confirmActionRef.current();
            }
          } catch {
            // error handling done inside executor
          } finally {
            setConfirmLoading(false);
            setConfirmVisible(false);
          }
        }}
      />
    </div>
  );
};

// ============================================================================
// KOMPONEN UTAMA: ADMIN DASHBOARD
// - Added a small monitor websocket to receive real-time monitoring events
//   from the backend (/ws-monitor). Display recent events in a floating panel.
// ============================================================================
export default function AdminDashboard() {
  const [activeView, setActiveView] = useState<ActiveView>('history');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Real-time monitor events
  const [, setMonitorEvents] = useState<MonitorEvent[]>([]);

  // 1. Ambil Role saat mount
  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    setUserRole(storedRole);
  }, []);

  // 2. Setup monitor websocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('ws://localhost:8080/ws-monitor');

      ws.onopen = () => {
        console.log('🔔 Connected to monitor socket');
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setMonitorEvents((prev) => {
            const next = [
              { ts: Date.now(), type: data.type || 'event', payload: data },
              ...prev,
            ].slice(0, 10);
            return next;
          });
        } catch (e) {
          console.warn('Monitor parse error', e);
        }
      };

      ws.onclose = () => {
        console.log('🔕 Monitor socket closed');
      };

      ws.onerror = (err) => {
        console.warn('Monitor socket error', err);
      };
    } catch (e) {
      console.warn('Monitor ws init failed', e);
    }

    return () => {
      if (ws)
        try {
          ws.close();
        } catch {}
    };
  }, []);

  // 3. Logic Logout
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const res = await fetch('http://localhost:5000/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Proses logout gagal.');

      localStorage.removeItem('role');
      window.location.href = '/login';
    } catch (err) {
      if (err instanceof Error) {
        toast.error(`Error saat logout: ${err.message}`);
      } else {
        toast.error('Terjadi kesalahan yang tidak diketahui saat logout.');
      }
      setIsLoggingOut(false);
    }
  };

  // 4. Render View Controller
  const renderView = () => {
    switch (activeView) {
      case 'history':
        return <ChatHistoryView />;
      case 'knowledge':
        return <KnowledgeView onBack={() => setActiveView('history')} />;
      case 'backupHistory':
        return <BackupHistoryView onBack={() => setActiveView('knowledge')} />;
      case 'ragUpload':
        return (
          <RagDetailView
            onBack={() => setActiveView('knowledge')}
            onSuccess={() => setActiveView('knowledge')}
          />
        );
      case 'manageAdmin':
        return userRole === 'SUPER_ADMIN' ? (
          <ManageAdminView onBack={() => setActiveView('history')} />
        ) : (
          <ChatHistoryView />
        );
      case 'monitor':
        return <MonitorView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <ChatHistoryView />;
    }
  };

  return (
    <div className='flex h-screen font-sans overflow-hidden'>
      {/* Sidebar (Floating Glass) */}
      <AdminSidebar
        activeView={activeView}
        onNavClick={setActiveView}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
        userRole={userRole}
      />
      {/* Main Content Area */}
      <main className='flex-1 overflow-hidden relative'>{renderView()}</main>
    </div>
  );
}
