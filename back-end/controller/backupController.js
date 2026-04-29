const fs = require('fs');
const path = require('path');
const { BackupHistory } = require('../models/backupModel');
const { KnowledgeBase } = require('../models/knowledgeModel');

// Lokasi folder penyimpanan backup di server
const BACKUP_DIR = path.join(__dirname, '../backups');

// Pastikan folder backups ada saat server jalan
if (!fs.existsSync(BACKUP_DIR)){
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Helper: Format data knowledge menjadi string (Sama seperti logika frontend sebelumnya)
const formatContent = (items) => {
  return items.map(item => 
    `TOPIC: ${item.topic}\n` +
    `CATEGORY: ${item.category}\n` +
    `STATUS: ${item.status}\n` +
    `CONTENT:\n${item.content}\n` +
    `--------------------------------------------------\n`
  ).join('\n');
};

exports.createBackup = async (req, res) => {
  try {
    const adminUsername = req.session.username || 'Unknown Admin'; // Ambil dari session login

    // 1. Ambil semua data knowledge
    const allData = await KnowledgeBase.find({}).sort({ category: 1, topic: 1 });
    if (allData.length === 0) {
      return res.status(400).json({ error: true, message: "Tidak ada data untuk dibackup." });
    }

    const fileContent = formatContent(allData);
    
    // 2. Buat nama file unik: backup-YYYY-MM-DD-HH-mm-ss.txt
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `knowledge-backup-${timestamp}.txt`;
    const filepath = path.join(BACKUP_DIR, filename);

    // 3. Cek Jumlah History (Logika Rotasi Max 5)
    const currentBackups = await BackupHistory.find().sort({ createdAt: 1 }); // Urutkan dari yang terlama
    
    if (currentBackups.length >= 5) {
      // Hapus yang paling tua (index 0)
      const oldBackup = currentBackups[0];
      
      // Hapus file fisik
      if (fs.existsSync(oldBackup.filepath)) {
        fs.unlinkSync(oldBackup.filepath);
      }
      
      // Hapus record di database
      await BackupHistory.findByIdAndDelete(oldBackup._id);
      console.log(`🗑️ Backup lama dihapus: ${oldBackup.filename}`);
    }

    // 4. Simpan file baru ke server
    fs.writeFileSync(filepath, fileContent);

    // 5. Simpan record baru ke database
    const newBackup = new BackupHistory({
      filename,
      filepath,
      triggeredBy: adminUsername,
      size: `${(Buffer.byteLength(fileContent) / 1024).toFixed(2)} KB`
    });
    await newBackup.save();

    res.status(201).json({ 
      error: false, 
      message: 'Backup berhasil dibuat & disimpan di server.',
      data: newBackup 
    });

  } catch (error) {
    console.error("Backup Error:", error);
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.getBackupList = async (req, res) => {
  try {
    // Tampilkan urut dari yang terbaru (descending)
    const backups = await BackupHistory.find().sort({ createdAt: -1 });
    res.status(200).json({ error: false, data: backups });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.downloadBackupFile = async (req, res) => {
  try {
    const { id } = req.params;
    const backup = await BackupHistory.findById(id);

    if (!backup || !fs.existsSync(backup.filepath)) {
      return res.status(404).json({ error: true, message: "File backup tidak ditemukan." });
    }

    // Mengirim file ke frontend untuk diunduh
    res.download(backup.filepath, backup.filename);
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};