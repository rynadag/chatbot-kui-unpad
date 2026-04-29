const express = require("express");
const rateLimit = require('express-rate-limit'); 

const { 
  createAccount, 
  login, 
  logout, 
  getAllAdmins,
  updateAdminPassword,
  deleteAdmin,
  changeOwnPassword,
  getChatHistory, 
  deleteOldChats,
  getAllChats,
  deleteChatById 
} = require("../controller/adminController.js");

const { isAdmin, isSuperAdmin } = require("../middleware/authAdmin.js");

const adminRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: { 
    error: true, 
    message: "Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit." 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

adminRouter.post('/login', loginLimiter, login);


adminRouter.post('/create-account', isSuperAdmin, createAccount); 
adminRouter.get('/list', isSuperAdmin, getAllAdmins);             
adminRouter.put('/:id/password', isSuperAdmin, updateAdminPassword); 
adminRouter.delete('/:id', isSuperAdmin, deleteAdmin);

adminRouter.post('/logout', isAdmin, logout);
adminRouter.get('/chats/history', isAdmin, getChatHistory);
adminRouter.delete('/chats/delete-old', isAdmin, deleteOldChats);
adminRouter.get('/chats/all', isAdmin, getAllChats);
adminRouter.delete('/chats/:id', isAdmin, deleteChatById);
adminRouter.put('/change-password', isAdmin, changeOwnPassword);


module.exports = adminRouter;