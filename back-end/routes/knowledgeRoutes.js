const express = require("express");
const { isAdmin } = require("../middleware/authAdmin.js");
const { 
  getAllKnowledge, 
  createKnowledge, 
  updateKnowledge, 
  deleteKnowledge,
  toggleKnowledgeStatus,
  getCategories,
  getKnowledgeStructure 
} = require("../controller/knowledgeController.js");

const knowledgeRouter = express.Router();

knowledgeRouter.get('/categories', getCategories); 
knowledgeRouter.get('/structure', getKnowledgeStructure);


knowledgeRouter.use(isAdmin);

knowledgeRouter.get('/', getAllKnowledge);
knowledgeRouter.post('/', createKnowledge);
knowledgeRouter.put('/:id/status', toggleKnowledgeStatus);
knowledgeRouter.put('/:id', updateKnowledge);
knowledgeRouter.delete('/:id', deleteKnowledge);

module.exports = knowledgeRouter;