const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true 
  },
  topicCount: { 
    type: Number, 
    default: 0 
  },
  activeTopicCount: { 
    type: Number, 
    default: 0 
  }
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);
module.exports = { Category };