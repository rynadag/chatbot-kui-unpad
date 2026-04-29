const { Chat } = require('../models/chatModel');
const { Message } = require('../models/messageModel');
const { Admin } = require('../models/adminModel');
const axios = require('axios');
// const { admin } = require("../auth/middleware.js");

console.log("🔥 appController loaded — siap jalan!");


const getChat = async (req, res) => {
    try {
        const chatId = req.session.chatId;

        const messages = await Message.find({ chatId: req.session.chatId }).sort({ createdAt: -1 });


        if (messages.length === 0) {
            return res.status(404).json({ error: true, message: "Chat history tidak ditemukan" });
        }

        res.status(200).json({ error: false, data: messages });
    } catch (error) {
        res.status(500).json({
            error: true,
            message: error.message
        });
    }
};


const postMsg = async (req, res) => {
  try {
    // 1. Validasi Sesi Chat
    if (!req.session.chatId) {
      return res.status(400).json({ 
        error: true, 
        refresh: true, 
        message: 'Chat harus dibuat terlebih dahulu.' 
      });
    }
    const chat = await Chat.findById(req.session.chatId);
    if (!chat || chat.status !== "ACTIVE") {
      return res.status(400).json({
        error: true,
        refresh: true,
        message: 'Chat tidak ditemukan atau sudah tidak aktif.'
      });
    }

    // 2. Ambil Data dari Body
    let { msg, attachment, sender = "USER", isLogOnly = false } = req.body;

    // --- FIX 1: Pastikan Msg Selalu String ---
    if (typeof msg === 'object') {
        msg = JSON.stringify(msg);
    }

    // --- FIX 2: Normalisasi Sender (BOT -> SELF) ---
    // Database lama Anda sepertinya menggunakan "SELF", bukan "BOT"
    let finalSender = sender.toUpperCase();
    if (finalSender === 'BOT' || finalSender === 'AI') {
        finalSender = 'SELF'; 
    }

    // 3. Simpan Pesan ke Database
    const newMessage = new Message({
      chatId: req.session.chatId,
      msg: msg, 
      attachment: attachment,
      sender: finalSender // Gunakan sender yang sudah dinormalisasi (USER/SELF)
    });
    
    await newMessage.save();

    // 4. Log Only (Mencegah Double Reply)
    // Jika request ini datang dari logging frontend, berhenti di sini.
    if (isLogOnly) {
        return res.status(200).json({
            error: false,
            status: 'Log saved',
            data: newMessage
        });
    }

    // ============================================================
    // LOGIKA FALLBACK (Hanya jalan jika lewat HTTP biasa / Postman)
    // ============================================================
    const response = await axios.post('http://127.0.0.1:8080/reply', {
      message: msg
    });
    
    const replyText = typeof response.data.Reply === 'object' 
        ? JSON.stringify(response.data.Reply) 
        : response.data.Reply;
    
    const newReply = new Message({
      chatId: req.session.chatId,
      msg: replyText,
      attachment: null,
      sender: "SELF"
    });
    await newReply.save();
    
    res.status(201).json({
      error: false,
      status: 'Pesan berhasil dikirim.',
      message: msg,
      reply: replyText
    });
    
  } catch (error) {
    console.error('Error saat mengirim pesan:', error);
    // Tampilkan pesan error validasi mongoose jika ada
    res.status(500).json({ error: true, message: error.message });
  }
};


const createChat = async (req, res) => {
  try {
    const { captchaToken, consent } = req.body; 

    if (!captchaToken) {
      return res.status(400).json({ error: true, message: 'Verifikasi CAPTCHA diperlukan.' });
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
        console.error("RECAPTCHA_SECRET_KEY tidak ditemukan di file .env");
        return res.status(500).json({ error: true, message: 'Konfigurasi server error.' });
    }

    const verificationUrl = 'https://www.google.com/recaptcha/api/siteverify';
    
    const params = new URLSearchParams();
    params.append('secret', secretKey);
    params.append('response', captchaToken);
    
    const verificationResponse = await axios.post(verificationUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { success, 'error-codes': errorCodes } = verificationResponse.data;

    if (!success) {
      console.warn('Verifikasi CAPTCHA gagal:', errorCodes);
      return res.status(401).json({ error: true, message: 'Verifikasi CAPTCHA gagal. Silakan coba lagi.' });
    }

    if (req.session.chatId){
      setChatNonActive(req.session.chatId, req.session.consent);
      delete req.session.chatId;
      delete req.session.consent; 
    }
    const status  = "ACTIVE";

    const newChat = new Chat({ status });
    await newChat.save();
    
    req.session.chatId = newChat._id;
    req.session.consent = consent || 'false'; 

    console.log(`Sesi chat ${newChat._id} dibuat dengan consent=${req.session.consent}`);

    res.status(201).json({
      message: 'Chat berhasil dibuat',
      data: newChat
    });
  } catch (error) {
    console.error('Error saat membuat chat:', error);
    if (error.response) {
      console.error('Error data from Google:', error.response.data);
    }
    res.status(500).json({ error: 'Gagal membuat chat' });
  }
};

const setChatNonActive = async (chatId, consent) => {
  try {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      console.log('Chat tidak ditemukan.')
      return null;
    }

    if (chat.status !== "ACTIVE") {
      console.log('Chat sudah tidak aktif.');
      return null;
    }
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { status: "NONACTIVE" },
      { new: true }
    );

    if (!updatedChat) {
      console.log(`⚠️ Chat ${chatId} tidak ditemukan`);
      return null;
    }
    lastHeartbeat.delete(chatId);
    console.log(consent);
    console.log(consent=='true');
    console.log(consent=='false');
    if (consent=='false') {
      const result = await Message.deleteMany({ chatId: chatId });
      const result1 = await Chat.findByIdAndDelete(chatId);
    }
    

    console.log(`✅ Chat ${chatId} berhasil diubah menjadi NONACTIVE dan karena consen = ${consent}, maka chat ${(consent)?'tidak dihapus':'dihapus'}`);
    return updatedChat;
  } catch (error) {
    console.error(`❌ Gagal mengubah status chat ${chatId}:`, error);
    throw error;
  }
};


const nonactiveChat = async (req, res) => {
  try {
    if (!req.session.chatId) {
      return res.status(400).json({ error: true, message: 'Chat belum dibuat' });
    }

    const updatedChat = await setChatNonActive(req.session.chatId, req.session.consent);

    if (!updatedChat) {
      return res.status(404).json({ error: true, message: 'Chat tidak ditemukan' });
    }
    delete req.session.chatId;

    return res.status(200).json({
      message: 'Status chat berhasil diubah menjadi NONACTIVE',
      data: updatedChat
    });
  } catch (error) {
    console.error('Error saat mengubah status chat:', error);
    return res.status(500).json({ error: 'Gagal mengubah status chat' });
  }
};



const lastHeartbeat = new Map();

const postHeartbeat = async (req, res) => {

  lastHeartbeat.set(req.session.chatId, Date.now());
  console.log(`💓 Heartbeat diterima dari chatId ${req.session.chatId} pada ${new Date().toLocaleTimeString()}`);

  res.status(200).json({ message: "Heartbeat diterima" });
};

setInterval(async () => {
  const now = Date.now();
  const TIMEOUT = 5 * 60 * 1000; 

  for (const [chatId, lastTime] of lastHeartbeat.entries()) {
    if (now - lastTime > TIMEOUT) {
      console.log(`⚠️ Chat ${chatId} tidak aktif selama >5 menit. Menonaktifkan...`);

      try {
        setChatNonActive(chatId, 'true');
      } catch (err) {
        console.error(`❌ Gagal menonaktifkan chat ${chatId}:`, err.message);
      }
    }
  }
}, 2 * 60 * 1000); 
module.exports = { getChat, createChat, nonactiveChat, postMsg, setInterval, postHeartbeat };