const express = require("express");
const { 
  getChat, 
  createChat, 
  nonactiveChat, 
  postMsg, 
  postHeartbeat,
} = require("../controller/appController.js");

const adminRouter = require('./adminroutes.js');

const router = express.Router();

router.use('/admin', adminRouter); 

router.get('/chat', getChat);
router.post('/create-chat', createChat);
router.get('/nonactive', nonactiveChat);
router.post('/send-msg', postMsg);
router.post('/heartbeat', postHeartbeat);

module.exports = router;