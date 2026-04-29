const express = require("express");
const { isAdmin } = require("../middleware/authAdmin"); // Pastikan hanya admin yang bisa akses
const { 
  createBackup, 
  getBackupList, 
  downloadBackupFile 
} = require("../controller/backupController");

const backupRouter = express.Router();

// Middleware: Hanya admin yang boleh akses
backupRouter.use(isAdmin);

backupRouter.post('/create', createBackup);       // Trigger saat tombol "Update RAG" ditekan
backupRouter.get('/list', getBackupList);         // Untuk Side Navbar
backupRouter.get('/download/:id', downloadBackupFile); // Aksi tombol download di list

module.exports = backupRouter;