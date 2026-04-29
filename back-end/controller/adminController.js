const bcrypt = require('bcrypt');
const { Admin } = require('../models/adminModel');
const { Chat } = require('../models/chatModel');
const { Message } = require('../models/messageModel');

const createAccount = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: true, message: 'Username dan password diperlukan' });
  }

  try {
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(409).json({ error: true, message: 'Username sudah digunakan' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newAdmin = new Admin({
      username,
      password: hashedPassword,
    });

    await newAdmin.save();

    res.status(201).json({
      error: false,
      message: 'Akun berhasil dibuat',
      admin: {
        _id: newAdmin._id,
        username: newAdmin.username,
      }
    });

  } catch (error) {
    console.error("Create account error:", error);
    res.status(500).json({
      error: true,
      message: 'Terjadi kesalahan server saat membuat akun',
      detail: error.message
    });
  }
};


const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: true, message: 'Username atau password salah' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: true, message: 'Username atau password salah' });
    }

    req.session.adminId = admin._id;
    req.session.username = admin.username;
    
    req.session.role = admin.role; 

    req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session save failed' });
      }
      
      res.json({
        error: false,
        message: 'Berhasil Sign In',
        adminId: admin._id,
        username: admin.username,
        role: admin.role 
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: true,
      message: 'Terjadi kesalahan server',
      detail: error.message
    });
  }
};

const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: true, message: 'Gagal logout' });
    }
    
    res.clearCookie('connect.sid'); 
    res.status(200).json({ error: false, message: 'Berhasil logout' });
  });
};

const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({}, '-password').sort({ createdAt: -1 });
    res.status(200).json({ error: false, data: admins });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

const updateAdminPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: true, message: 'Password minimal 6 karakter' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await Admin.findByIdAndUpdate(id, { password: hashedPassword });

    res.status(200).json({ error: false, message: 'Password berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

const deleteAdmin = async (req, res) => {
  const { id } = req.params;
  
  if (req.session.adminId === id) {
    return res.status(400).json({ error: true, message: 'Tidak dapat menghapus akun sendiri saat login.' });
  }

  try {
    await Admin.findByIdAndDelete(id);
    res.status(200).json({ error: false, message: 'Admin berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

const changeOwnPassword = async (req, res) => {
  const adminId = req.session.adminId; 
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: true, message: 'Password lama dan baru diperlukan' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: true, message: 'Password baru minimal 6 karakter' });
  }

  try {
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: true, message: 'Admin tidak ditemukan' });
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ error: true, message: 'Password lama salah' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    admin.password = hashedPassword;
    await admin.save();

    res.status(200).json({ error: false, message: 'Password berhasil diubah' });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

const getAllChats = async (req, res) => {
  try {
    const chats = await Chat.find({})
      .select('_id status createdAt')
      .sort({ createdAt: -1 }); 

    res.status(200).json({ error: false, data: chats });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

const deleteChatById = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedChat = await Chat.findByIdAndDelete(id);

    if (!deletedChat) {
      return res.status(404).json({ error: true, message: 'Chat tidak ditemukan' });
    }

    await Message.deleteMany({ chatId: id.toString() });

    res.status(200).json({ error: false, message: `Chat ID ${id} dan semua pesannya berhasil dihapus.` });
  } catch (error) {
    console.error(`Error saat menghapus chat ${req.params.id}:`, error);
    res.status(500).json({ error: true, message: error.message });
  }
};

const getChatHistory = async (req, res) => {
    try {
        const { chatId } = req.query; 

        if (!chatId) {
          return res.status(400).json({ error: true, message: "Parameter 'chatId' diperlukan" });
        }

        const messages = await Message.aggregate([
          {
            $match: { chatId: chatId } 
          },
          {
            $lookup: {
              from: "chat", 
              let: { chatIdString: "$chatId" },
              pipeline: [
                {
                  $addFields: {
                    _idStr: { $toString: "$_id" } 
                  }
                },
                {
                  $match: {
                    $expr: { $eq: ["$_idStr", "$$chatIdString"] } 
                  }
                }
              ],
              as: "chatHistory"
            }
          },
          { $unwind: "$chatHistory" },
          { $sort: { createdAt: -1 } },
          {
            $project: {
              msg: 1,
              createdAt: 1,
              chatId: 1,
              sender: 1,
              chatAt: "$chatHistory.createdAt"
            }
          }
        ]);


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

const deleteOldChats = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldChats = await Chat.find({
      status: "NONACTIVE",
      updatedAt: { $lte: sevenDaysAgo }
    });

    if (oldChats.length === 0) {
      return res.status(200).json({
        message: 'Tidak ada chat lama yang perlu dihapus.'
      });
    }

    const chatObjectIds = oldChats.map(chat => chat._id);

    const chatStringIds = oldChats.map(chat => chat._id.toString());

    await Message.deleteMany({ chatId: { $in: chatStringIds } });

    await Chat.deleteMany({ _id: { $in: chatObjectIds } });
    
    res.status(200).json({
      message: `Berhasil menghapus ${chatObjectIds.length} chat lama dan pesan terkait.`,
      deletedChatIds: chatStringIds
    });
  } catch (error) {
    console.error('Error saat menghapus chat lama:', error);
    res.status(500).json({ error: 'Gagal menghapus chat lama' });
  }
};

module.exports = { 
  login, 
  logout,
  createAccount, 
  getAllAdmins,
  updateAdminPassword,
  deleteAdmin,
  changeOwnPassword,
  getChatHistory, 
  deleteOldChats,
  getAllChats,
  deleteChatById 
};