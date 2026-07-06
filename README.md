# 🤖 Chatbot KUI Unpad

Selamat datang di repositori resmi **Kantor Urusan Internasional (KUI) Universitas Padjadjaran**. Proyek ini merupakan asisten virtual interaktif berbasis **RAG (Retrieval-Augmented Generation)** yang dirancang untuk menjadi pusat informasi (*Knowledge Base*) cerdas yang melayani sivitas akademika seputar informasi akademik dan administrasi.

Sistem ini dibangun dengan arsitektur *microservices* berkinerja tinggi yang memadukan keunggulan **Next.js** (Antarmuka Web Frontend), **Express.js** (Manajemen API & Autentikasi JWT), **FastAPI/Python** (Mesin Kecerdasan Buatan & Pemrosesan Dokumen), serta terintegrasi mulus dengan ekosistem **WordPress**.

---

## ✨ Ikhtisar Fitur Utama

- 💬 **Chatbot AI Kontekstual**: Memanfaatkan Large Language Model (LLM) melalui **Groq API** yang dipadukan dengan dokumen referensi internal (RAG) untuk memberikan jawaban akurat secara instan.
- 🌐 **Dukungan Multibahasa**: Mendukung percakapan interaktif dalam **Bahasa Indonesia** maupun **Bahasa Inggris** yang adaptif sesuai preferensi pengguna.
- 🎨 **Dashboard Admin Premium**: Antarmuka modern berdesain *glassmorphism* (efek kaca transparan) yang dilengkapi sistem *Dark Mode* adaptif.
- 🗂️ **Manajemen Basis Pengetahuan (Knowledge Base)**: Fasilitas bagi Admin untuk menambah, mengedit, menonaktifkan, atau menghapus data pengetahuan secara mandiri dengan pengelompokan kategori yang dinamis.
- 📄 **Upload Dokumen Cerdas**: Unggah berkas **PDF** atau **TXT**, AI akan otomatis mengekstrak tabel, membersihkan format teks, lalu mengindeksnya ke dalam basis pengetahuan (Vector Search).
- 💾 **Backup Otomatis**: Pengunggahan dokumen akan memicu otomatisasi pencadangan data ke server dengan rotasi maksimum 5 arsip yang dapat diunduh kapan saja.
- 🔌 **Integrasi WordPress Instan**: Dilengkapi dengan plugin bawaan (`plugin.zip`) yang siap diunggah untuk langsung menampilkan widget chatbot di halaman WordPress Anda.
- 👤 **Manajemen Multi-Admin & Live Monitor**: Membuat akun administrator baru, mengganti kata sandi, hingga memantau sesi aktivitas obrolan pengguna secara *real-time*.

---

## 📸 Cuplikan Tampilan Aplikasi (Screenshots)

*Dokumentasi visual untuk antarmuka pengguna dan administrator.*

### 1. Antarmuka Publik & Autentikasi
| Chatbot Publik | Panel Login Admin |
| :---: | :---: |
| ![Chatbot UI](./docs/screenshots/chatbot.png) <br> *Halaman interaksi chat publik dengan AI secara langsung* | ![Login UI](./docs/screenshots/login-admin.png) <br> *Halaman Login Admin dengan desain glassmorphism* |

### 2. Panel Kontrol Administrator (Dashboard)
| Manajemen Pengetahuan (Knowledge Base) | Manajemen Admin |
| :---: | :---: |
| ![Knowledge Base](./docs/screenshots/knowledge-base.png) <br> *Tabel kelola seluruh data pengetahuan* | ![Manage Admin](./docs/screenshots/manage-admin.png) <br> *Halaman daftar dan pembuatan Admin baru* |

---

## 🚀 Prasyarat Sistem & Infrastruktur

Untuk menjalankan repositori ini dengan optimal, pastikan server atau mesin lokal Anda telah dilengkapi:

1. **[Node.js](https://nodejs.org/en)** (Versi 18 LTS atau lebih baru) - Berfungsi sebagai mesin eksekusi JavaScript Frontend & Backend API.
2. **[PNPM](https://pnpm.io/installation)** (Node Package Manager versi modern) - Manajemen pustaka (*dependency*).
   - Perintah Instalasi: `npm install -g pnpm`
3. **[Python](https://www.python.org/downloads/)** (Versi 3.10 atau lebih baru) - Lingkungan dasar pengolahan AI Backend.
4. **[UV](https://github.com/astral-sh/uv)** (Manajer pustaka Python berkecepatan tinggi) - Memangkas waktu instalasi library Python.
   - Install via bash (macOS/Linux): `curl -LsSf https://astral.sh/uv/install.sh | sh`
5. **Koneksi Internet** yang reliabel untuk sinkronisasi MongoDB Atlas, pengunduhan Model HuggingFace lokal, dan API Groq Cloud.

---

## 🔑 Langkah 1: Pengadaan Kredensial Akses (Database & API)

Sistem ini memanifestasikan integrasi *Cloud Services*. Anda membutuhkan dua *credentials* utama:

### A. MongoDB URI (Penyimpanan Utama & Vektor)
1. Kunjungi [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) dan buat klaster basis data (M0/Gratis bisa digunakan untuk uji coba).
2. Di **Database Access**, buat pengguna (*User*) dan catat *Password*-nya.
3. Di **Network Access**, izinkan akses dari mana saja (`0.0.0.0/0`).
4. Salin *Connection String* MongoDB Anda (`mongodb+srv://...`).
5. Buat **Vector Search Index** di MongoDB Atlas untuk koleksi `knowledgesources`:
   - Buka klaster -> **Atlas Search** -> **Create Search Index** -> **JSON Editor**.
   - Masukkan skema indeks (namakan `vector_index`):
     ```json
     {
       "fields": [
         {
           "type": "vector",
           "path": "embedding",
           "numDimensions": 384,
           "similarity": "cosine"
         }
       ]
     }
     ```

### B. Groq API Key (Infrastruktur Otak LLM)
1. Kunjungi [Groq Cloud Console](https://console.groq.com/keys).
2. Masuk ke menu **API Keys** -> **Create API Key**.
3. Simpan Kunci Sandi (`gsk_...`) di tempat yang aman.

---

## 🛠️ Langkah 2: Konfigurasi Environment Variables (`.env`)

Pisahkan konfigurasi di 2 direktori terpisah.

### 📍 Konfigurasi Back-End API Node.js (`back-end/.env`)
Gunakan pengaturan berikut (ubah variabel yang berisi 'xxx'):
```env
# ── Server ────────────────────────────────────────────────────
PORT=5000

# ── MongoDB Atlas ─────────────────────────────────────────────
MONGO_URI=mongodb+srv://admin:passwordAnda@cluster.mongodb.net/?appName=chatbot
MONGO_DB_NAME=chatbot_database
MONGO_VECTOR_INDEX=vector_index

# ── JWT Secret (ganti dengan string acak yang kuat!) ──────────
JWT_SECRET=rahasia_jwt_sangat_kuat_2026_random_string

# ── Identitas Unit ────────────────────────────────────
UNIT_NAME=Chatbot KUI Unpad
UNIV_ABBREVIATION=Unpad
HELPDESK_CONTACT=admin@unpad.ac.id

# ── LLM & AI ──────────────────────────────────────────────────
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
LLM_TEMPERATURE=0.2
```

---

## 💻 Langkah 3: Eksekusi Berjalan (Panduan Terminal)

Siapkan **3 jendela/sesi Terminal** karena proyek ini menggunakan arsitektur modular (Backend Node, AI Python, Frontend Next.js).

### 🟢 Terminal 1: Back-End API Server (Node.js)
Servis ini menaungi autentikasi JWT, riwayat chat, manajemen admin, dan rute REST API.
```bash
cd back-end
pnpm install
pnpm dev
```
🚀 *Berjalan pada `http://localhost:5000`*

### 🔵 Terminal 2: Mesin AI (Python/FastAPI)
Servis ini mengeksekusi pipeline RAG (pengindeksan dokumen) dan inferensi LLM.
```bash
cd back-end/chatbot
uv run --with-requirements requirements.txt python app.py
```
🚀 *Berjalan pada `http://0.0.0.0:8080` (Akan mengunduh model sentence-transformer pada run pertama).*

### 🟣 Terminal 3: Antarmuka Web Interaktif (Next.js)
Servis ini menaungi panel *Chatbot* dan *Admin Dashboard*.
```bash
cd front-end
pnpm install
pnpm dev
```
🚀 *Berjalan pada `http://localhost:3000`*

---

## 🔌 Langkah 4: Instalasi & Konfigurasi Plugin WordPress

Jika Anda menggunakan WordPress sebagai website utama institusi, kami menyediakan integrasi instan menggunakan plugin khusus.

### A. Instalasi Plugin
1. Masuk ke Dashboard Admin WordPress Anda (contoh: `https://domain-anda.com/wp-admin`).
2. Navigasi ke menu **Plugins** -> **Add New Plugin** -> **Upload Plugin**.
3. Cari file bernama `plugin.zip` di dalam root repositori ini, lalu unggah.
4. Klik **Install Now** dan tunggu hingga proses instalasi WordPress selesai.
5. Klik tombol **Activate Plugin**.

| Proses Upload Plugin | Aktivasi Plugin |
| :---: | :---: |
| ![Upload Plugin](./docs/screenshots/wp-upload.png) <br> *Halaman Upload Plugin WordPress menunjuk ke plugin.zip* | ![Aktivasi Plugin](./docs/screenshots/wp-activate.png) <br> *Daftar plugin WordPress dengan tombol Activate/Deactivate* |

### B. Konfigurasi Plugin (Penting!)
1. Setelah plugin aktif, perhatikan sidebar kiri WordPress Anda. Akan muncul menu navigasi baru bernama **Chatbot**.
2. Klik menu **Chatbot** tersebut untuk membuka halaman pengaturan.
3. Di dalam form **Chatbot Frontend URL**, masukkan URL tempat aplikasi Next.js (Terminal 3) Anda berjalan (contoh: `http://localhost:3000` untuk lokal, atau `https://chat.kui.unpad.ac.id` untuk production).
4. Klik **Simpan Perubahan** (*Save Changes*).
5. Selamat! Widget *bubble* obrolan interaktif kini otomatis melayang (mengambang) di pojok kanan bawah seluruh halaman depan website WordPress Anda.

| Pengaturan URL Chatbot di WP | Tampilan Widget di Halaman Web Publik |
| :---: | :---: |
| ![WP Settings](./docs/screenshots/wp-settings.png) <br> *Halaman form Pengaturan Chatbot di WP Admin yang berisi input URL* | ![Widget UI](./docs/screenshots/wp-widget.png) <br> *Gelembung/Bubble icon chatbot di pojok kanan bawah halaman web utama WordPress* |

---

## 📖 Langkah 5: PANDUAN PENGGUNAAN DASHBOARD ADMIN (LENGKAP)

Dashboard Admin dirancang untuk mempermudah Anda mengelola pengetahuan AI, dokumen, dan administrator. Berikut adalah panduan langkah demi langkah untuk setiap fiturnya:

### A. Login & Manajemen Akses
Halaman login dilindungi oleh sistem token JWT yang aman.
1. Buka browser dan arahkan ke `http://localhost:3000/Admin`.
2. Masukkan kombinasi *Username* dan *Password* Administrator yang telah diberikan/dibuat.
3. Jika berhasil, Anda akan dialihkan ke halaman utama panel Admin.

| Halaman Login |
| :---: |
| ![Halaman Login](./docs/screenshots/login-admin-full.png) <br> *Halaman form login (/Admin) dengan tampilan utuh* |

### B. Cara Membuat Akun Admin Baru (Manage Admin)
Untuk menambah anggota tim yang bisa mengelola chatbot:
1. Di Dashboard, klik menu **Manage Admin** di *sidebar* sebelah kiri.
2. Anda akan melihat daftar admin yang saat ini terdaftar.
3. Klik tombol **Tambah Admin** (atau Add Admin).
4. Masukkan **Username** baru dan **Password** yang kuat.
5. Klik **Simpan**. Akun baru tersebut kini bisa digunakan untuk login.
6. Anda juga dapat menggunakan tombol *Delete* (ikon tempat sampah) untuk menghapus admin yang sudah tidak aktif.

| Halaman Manage Admin | Form Tambah Admin |
| :---: | :---: |
| ![Daftar Admin](./docs/screenshots/admin-list.png) <br> *Tabel daftar akun admin* | ![Tambah Admin](./docs/screenshots/admin-add.png) <br> *Modal/Popup penambahan admin baru* |

### C. Kelola Basis Pengetahuan (Knowledge Base)
Menu ini adalah "otak" dari chatbot. Apa pun yang tertulis di sini adalah apa yang akan dijawab oleh AI.
1. Klik menu **Knowledge Base**.
2. **Tambah Data (Manual):** Klik tombol "Tambah Data", masukkan Judul Topik, Kategori (misal: "Beasiswa", "Kurikulum"), dan Isi Teks.
3. **Edit Data:** Klik tombol "Edit" (ikon pensil) pada baris data yang ingin diubah.
4. **Aktif/Nonaktifkan (Toggle):** Klik *switch/toggle* "Active" untuk menyembunyikan informasi sementara waktu agar tidak dibaca oleh AI tanpa menghapusnya secara permanen.

| Halaman Knowledge Base | Form Input Pengetahuan |
| :---: | :---: |
| ![Tabel Pengetahuan](./docs/screenshots/knowledge-base.png) <br> *Halaman tabel utama Knowledge Base* | ![Form Pengetahuan](./docs/screenshots/knowledge-form.png) <br> *Modal form untuk mengetik Judul, Kategori, Isi* |

### D. Upload Dokumen Cerdas (File PDF/TXT)
Jika Anda memiliki dokumen pedoman panjang (PDF/TXT) dan malas mengetiknya satu per satu:
1. Di halaman **Knowledge Base**, temukan tombol **Upload Dokumen**.
2. Pilih file PDF atau TXT dari komputer Anda. 
3. *Sistem AI akan otomatis membaca teks, memperbaiki format tabel, merangkum, dan memasukkannya ke dalam tabel basis pengetahuan.*
4. **PENTING:** Setelah upload atau menambah/mengedit data secara manual, Anda **WAJIB** menekan tombol **"Update RAG"**. Tombol ini berfungsi menyinkronkan data teks menjadi bentuk *Vector* agar AI bisa memahami konteksnya.

| Fitur Upload Dokumen | Tombol Update RAG |
| :---: | :---: |
| ![Upload PDF](./docs/screenshots/upload-pdf.png) <br> *Jendela dialog Upload Dokumen PDF* | ![Update RAG](./docs/screenshots/update-rag.png) <br> *Soroti/Tunjuk tombol "Update RAG" yang sedang berputar/memproses* |

### E. Manajemen Backup & Restore
Setiap kali Anda mengunggah dokumen baru, sistem akan **otomatis melakukan backup** untuk berjaga-jaga. Anda juga dapat mengelolanya secara mandiri:
1. Klik menu **Backup History**.
2. Anda akan melihat daftar hingga 5 riwayat backup terakhir.
3. **Manual Backup:** Klik tombol "Create Backup" untuk mencadangkan data *saat ini juga*.
4. **Restore:** Jika AI mulai memberikan jawaban yang salah karena data berantakan, Anda bisa klik tombol "Restore" pada riwayat backup sebelumnya untuk mengembalikan isi otak AI ke waktu tersebut.
5. **Download:** Anda bisa mengunduh file JSON dari arsip backup ke komputer Anda.

| Riwayat Backup |
| :---: |
| ![Halaman Backup](./docs/screenshots/backup-history.png) <br> *Tabel Backup History dengan tombol Restore dan Download* |

### F. Pemantauan Langsung (Live Monitor)
Ingin tahu siapa saja yang sedang berinteraksi dengan Chatbot?
1. Klik menu **Live Monitor**.
2. Halaman ini akan menampilkan koneksi jaringan WebSocket yang aktif secara *real-time*. Anda bisa melihat kapan pengguna masuk (connect) dan keluar (disconnect).

| Halaman Live Monitor |
| :---: |
| ![Live Monitor](./docs/screenshots/live-monitor.png) <br> *Halaman Live Monitor yang menunjukkan aktivitas grafik/koneksi aktif* |

---

## 📝 Resolusi Masalah Umum (FAQ)

- **Aplikasi Menolak Untuk Dijalankan / Menampilkan Error `EADDRINUSE`:**
  Port 3000, 5000, atau 8080 sedang digunakan oleh perangkat lunak lain. Khusus macOS, port 5000 sering digunakan oleh "AirPlay Receiver". Anda dapat mematikan AirPlay di setting Mac Anda, atau mengganti PORT di `.env` dan di frontend *Next.js*.

- **Terminal Tidak Mengenali `uv` atau `pnpm`:**
  Direktori *Environment PATH* sistem operasi Anda belum dikonfigurasi. Tutup dan buka kembali terminal Anda.

- **Koneksi MongoDB Gagal / `Mongo Timeout` / `ServerSelectionTimeoutError`:**
  Pastikan Anda mengizinkan IP `0.0.0.0/0` (Allow from Anywhere) di menu **Network Access** MongoDB Atlas.

- **AI Mengembalikan Error / Kosong Saat Chat:**
  Cek layar Terminal 2 (Python). Jika ada tulisan `Unauthorized` atau `Rate Limit`, kunci *Groq API Key* Anda mungkin tidak valid atau sudah melampaui batas (*rate limit*). Pastikan `.env` terkonfigurasi dengan benar.

---
🛡️ *Dikembangkan oleh **Pusat Inovasi dan Pusat Inovasi Pengajaran dan Pembelajaran (PIPP) Universitas Padjadjaran**.*
