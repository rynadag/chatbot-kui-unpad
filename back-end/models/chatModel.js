const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    status:{ type: String, enum: ["ACTIVE", "NONACTIVE"], required: true }
},{ timestamps: true });
const Chat = mongoose.model('Chat', chatSchema, 'chat');

module.exports = { Chat };