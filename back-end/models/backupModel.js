const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
  filename: { 
    type: String, 
    required: true 
  },
  filepath: { 
    type: String, 
    required: true 
  },
  triggeredBy: { 
    type: String, 
    required: true 
  },
  size: {
    type: String, 
  }
}, { timestamps: true });

const BackupHistory = mongoose.model('BackupHistory', backupSchema);
module.exports = { BackupHistory };