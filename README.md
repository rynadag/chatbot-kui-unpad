# 🤖 Chatbot KUI (Kantor Urusan Internasional)

Selamat datang di repositori resmi **Chatbot KUI Universitas Padjadjaran**. Proyek ini merupakan asisten virtual interaktif berbasis **RAG (Retrieval-Augmented Generation)** yang dirancang untuk menjadi pusat informasi (*Knowledge Base*) cerdas yang melayani sivitas akademika seputar urusan internasional. 

Sistem ini dibangun dengan arsitektur *microservices* berkinerja tinggi yang memadukan keunggulan **Next.js** (Antarmuka Web), **Express.js** (Manajemen API Inti), dan **FastAPI/Python** (Mesin Kecerdasan Buatan & Soket Waktu Nyata).

---

## ✨ Ikhtisar Fitur Utama

- 💬 **Chatbot AI Kontekstual**: Memanfaatkan Large Language Model (LLM) melalui **Groq API** yang dipadukan dengan dokumen referensi internal (RAG) untuk memberikan jawaban akurat tanpa halusinasi.
- 🎨 **Dashboard Admin Premium**: Antarmuka modern berdesain *glassmorphism* (efek kaca transparan) yang dilengkapi sistem *Dark Mode* adaptif.
- 🗂️ **Manajemen Basis Pengetahuan (Knowledge Base)**: Fasilitas bagi Admin untuk mengunggah, memperbarui, atau menghapus sumber data (teks/dokumen) secara mandiri untuk melatih kecerdasan bot.
- 🛡️ **Autentikasi & Keamanan**: Sistem masuk (login) tersandi yang dilindungi oleh perlindungan anti-bot **Google reCAPTCHA v2/v3**.
- 📈 **Pemantauan Langsung (Live Monitor)**: Soket *real-time* yang merekam aktivitas pengunjung dan kesehatan sistem secara langsung.

---

## 📸 Cuplikan Tampilan Aplikasi (Screenshots)

### 1. Antarmuka Publik & Autentikasi
| Chatbot Publik | Panel Login Admin |
| :---: | :---: |
| ![Chatbot UI](./chatbot.png) <br> *Halaman interaksi pengguna dengan AI secara langsung.* | ![Login UI](./login-admin.png) <br> *Sistem masuk eksklusif bagi administrator dengan proteksi tinggi.* |

### 2. Panel Kontrol Administrator (Dashboard)
| Manajemen Pengetahuan (RAG) | Pemantauan Sistem (Live Monitor) |
| :---: | :---: |
| ![Knowledge Base](./knowledge-base.png) <br> *Injeksi data manual untuk melatih model Chatbot KUI.* | ![Live Monitor](./live-monitor.png) <br> *Pantau jumlah lalu lintas jaringan dan soket secara instan.* |

---

## 🚀 Prasyarat Sistem & Infrastruktur

Untuk menjalankan repositori ini dengan optimal, baik di lingkungan lokal (*development*) maupun peladen (*server/production*), pastikan mesin Anda telah dilengkapi:

1. **[Node.js](https://nodejs.org/en)** (Versi 18 LTS atau lebih baru) - Berfungsi sebagai mesin eksekusi JavaScript.
2. **[PNPM](https://pnpm.io/installation)** (Node Package Manager versi modern) - Untuk manajemen pustaka Frontend & Backend NodeJS.
   - Perintah Instalasi: `npm install -g pnpm`
3. **[Python](https://www.python.org/downloads/)** (Versi 3.10 atau lebih baru) - Lingkungan dasar pengolahan AI.
4. **[UV](https://github.com/astral-sh/uv)** (Manajer pustaka Python berkecepatan tinggi berbasis bahasa Rust) - Digunakan untuk memangkas waktu manajemen environment Python.
   - Install via pip: `pip install uv`
   - Install via bash (macOS/Linux): `curl -LsSf https://astral.sh/uv/install.sh | sh`
5. **Koneksi Internet** yang reliabel untuk sinkronisasi MongoDB Atlas dan permintaan model *Machine Learning* via *Cloud*.

---

## 🔑 Langkah 1: Pengadaan API Keys dan Kredensial Akses

Sistem ini memanifestasikan integrasi *Cloud Services*. Anda membutuhkan tiga jenis *credentials* agar sistem berjalan sempurna.

### A. MongoDB URI (Penyimpanan Utama)
1. Kunjungi [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) dan daftarkan diri Anda.
2. Buat klaster basis data baru (Gunakan *tier* M0/Gratis untuk uji coba).
3. Buka tab **Database Access** -> Buat pengguna (User) baru dan tetapkan *Password*.
4. Buka tab **Network Access** -> Klik **Add IP Address** -> Pilih **Allow Access from Anywhere** (`0.0.0.0/0`) agar API dapat terhubung.
5. Pada menu **Database**, klik **Connect** -> Pilih opsi **Drivers** -> Salin *Connection String* yang diberikan.
   - *Format Umum: `mongodb+srv://<username>:<password>@clusterX...`*
   - Ganti `<password>` dengan sandi aktual Anda.

### B. Google reCAPTCHA (Pencegahan Spam)
1. Akses [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin/create).
2. Daftarkan Domain. Sangat disarankan memilih tipe **reCAPTCHA v2 (Invisible)** atau **v3**.
3. Di daftar *Domains*, sertakan `localhost` dan `127.0.0.1` untuk pengembangan lokal.
4. Simpan dua buah kunci yang diterbitkan: **Site Key** (Konsumsi Publik) dan **Secret Key** (Rahasia Server).

### C. Groq API Key (Infrastruktur LLM)
1. Kunjungi [Groq Cloud Console](https://console.groq.com/keys) dan buat akun.
2. Masuk ke manu **API Keys** -> Klik **Create API Key**.
3. Simpan Kunci Sandi (`gsk_...`) di tempat yang aman. Sandi ini menjadi jembatan penghubung antara sistem Anda dan otak kecerdasan buatan Groq.

---

## 🛠️ Langkah 2: Konfigurasi Environment Variables (`.env`)

Pisahkan ketiga sistem ini menjadi 3 file *environment* yang aman dan tidak terpublikasi (`.env`). Buat file baru pada direktori yang telah ditentukan:

### 📍 Konfigurasi Front-End (`front-end/.env.local`)
Berisi pengaturan rahasia namun dibutuhkan klien peramban web:
```env
# Ganti dengan Site Key dari Google reCAPTCHA
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=isi_site_key_anda_disini
```

### 📍 Konfigurasi Back-End API Node.js (`back-end/.env`)
Berisi konfigurasi server Express.js untuk manajemen sesi, autentikasi dan basis data:
```env
# Konektor MongoDB Atlas
MONGO_URI=mongodb+srv://admin:passwordAnda@kui-cluster...
MONGO_DB_NAME=test

# Rahasia Sesi Kriptografi (Hasilkan String Teks Panjang/Acak)
SESSION_SECRET=c8621a20d4383780f740bd030d5e88cd632d3eaf70a4cb38d393bc2ddc71f...

# Ganti dengan Secret Key dari Google reCAPTCHA
RECAPTCHA_SECRET_KEY=isi_secret_key_anda_disini

# Port Peladen
PORT=5000
```

### 📍 Konfigurasi AI & WebSocket Python (`back-end/chatbot/.env`)
Berisi kunci infrastruktur AI, RAG, dan koneksi *Socket*:
```env
# Wajib sama dengan Konfigurasi Node.js
MONGO_URI=mongodb+srv://admin:passwordAnda@kui-cluster...
MONGO_DB_NAME=test

# Spesifikasi Model Pembuatan Vektor (Embedding)
EMBED_MODEL=all-MiniLM-L6-v2

# Ganti dengan Groq API Key Anda
GROQ_API_KEY=gsk_r3Znc8gVYtv3ULXIgXMuWGdy...
```

---

## 💻 Langkah 3: Eksekusi Berjalan (Panduan Terminal)

Proyek ini menggunakan arsitektur modular yang berjalan secara mandiri dan berkesinambungan. Oleh karena itu, siapkan **3 jendela/sesi Terminal** (*Command Prompt / Terminal Mac*) sekaligus.

### 🟢 Sesi Terminal 1: Back-End API Server (Node.js)
Servis ini menaungi operasi masuk, baca/tulis riwayat admin, dan pengolahan *Knowledge Base*.
1. Pergi ke direktori Back-End:
   ```bash
   cd back-end
   ```
2. Resolusi pustaka menggunakan PNPM:
   ```bash
   pnpm install
   ```
3. Mulai peladen:
   ```bash
   pnpm dev
   ```
   🚀 *Server Backend kini memantau jaringan pada `http://localhost:5000`*

---

### 🔵 Sesi Terminal 2: Mesin AI & WebSocket (Python)
Servis ini menaungi sistem vektor, inferensi RAG (pencarian referensi dokumen cerdas), dan aliran soket (*streaming*) komunikasi pesan langsung.
1. Pergi ke direktori Chatbot AI:
   ```bash
   cd back-end/chatbot
   ```
2. Jalankan skrip terisolasi menggunakan `uv`. Anda **TIDAK PERLU** lagi mengeksekusi `venv` atau `pip install` secara manual! Cukup serahkan pada `uv run`:
   ```bash
   uv run --with-requirements requirements.txt python app.py
   ```
   🚀 *Setelah berhasil menginisiasi model ke memori lokal, Soket AI akan menyala pada `ws://localhost:8080`*

---

### 🟣 Sesi Terminal 3: Antarmuka Web Interaktif (Next.js)
Servis ini adalah apa yang akan dilihat dan berinteraksi secara visual dengan pengguna dan pengurus (admin).
1. Pergi ke direktori Front-End:
   ```bash
   cd front-end
   ```
2. Pasang semua paket React & Next.js:
   ```bash
   pnpm install
   ```
3. Bangun mode pengembangan (*Dev Mode*):
   ```bash
   pnpm dev
   ```
   🚀 *Aplikasi Chatbot dan Dasbor dapat diakses di Browser melalui `http://localhost:3000`*

---

## 📝 Resolusi Masalah Umum (FAQ)

- **Aplikasi Menolak Untuk Dijalankan / Menampilkan Error `EADDRINUSE`:**
  Hal ini berarti Port 3000, 5000, atau 8080 sedang digunakan oleh perangkat lunak lain di komputer Anda. Hentikan seluruh proses yang bersinggungan melalui Task Manager (Windows) atau matikan menggunakan perintah `killall node` & `killall python` di Mac/Linux.
- **Terminal Tidak Mengenali `uv` atau `pnpm`:**
  Direktori *Environment PATH* sistem operasi Anda gagal mendeteksi instalasi. Cobalah menutup dan membuka ulang jendela Terminal untuk menyegarkan PATH, atau jalankan eksekusi Terminal sebagai Administrator.
- **WebSocket Disconnected / Balasan Chatbot Error:**
  Layanan pesan Chatbot membutuhkan Sesi Terminal 2 berjalan optimal. Periksa Terminal Python Anda! Jika ada error API Groq (`Rate Limit` atau `Unauthorized`), pastikan `GROQ_API_KEY` Anda valid. Jika ada masalah `Mongo Timeout`, pastikan Anda telah *Allow All IP* di pengaturan MongoDB Atlas.
- **Komponen Gambar Tidak Terbaca Pada Panduan Ini:**
  Ubah teks `front-end/public/Logo1.png` dengan hierarki struktur *file* screenshot Anda yang aktual sesuai spesifikasi sintaks *Markdown*.

---
🛡️ *Sistem ini dirancang & dioptimasi khusus untuk memenuhi standarisasi pelayanan prima* ***Kantor Urusan Internasional (KUI)***.
