const mongoose = require('mongoose');

const knowledgeSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, required: true },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE'
  },
  is_sync: { 
    type: Boolean, 
    default: false 
  }
}, { timestamps: true });

const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeSchema, 'knowledgebase');

module.exports = { KnowledgeBase };