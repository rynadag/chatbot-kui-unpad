const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chatId: String,
    msg: String,
    attachment: String,
    sender: { type: String, enum: ["USER", "SELF"], required: true },
},{ timestamps: true });
const Message = mongoose.model('Message', messageSchema, 'message');

module.exports = { Message };