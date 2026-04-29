const { KnowledgeBase } = require('../models/knowledgeModel');
const { Category } = require('../models/categoryModel');

const refreshCategorySummary = async () => {
  try {
    const allData = await KnowledgeBase.find({ 
      status: 'ACTIVE',
      topic: { $ne: 'daftar kategori chatbot' } 
    }).sort({ category: 1, topic: 1 });

    const groupedData = {};
    allData.forEach(item => {
      const cat = item.category || 'Uncategorized';
      
      if (!groupedData[cat]) {
        groupedData[cat] = [];
      }
      groupedData[cat].push(item.topic);
    });

    let summaryContent = "Berikut adalah daftar kategori dan topik yang tersedia dalam pengetahuan chatbot:\n\n";
    
    for (const [category, topics] of Object.entries(groupedData)) {
      summaryContent += `${category}\n`;
      topics.forEach(topic => {
        summaryContent += `- ${topic}\n`;
      });
      summaryContent += "\n"; 
    }

    await KnowledgeBase.findOneAndUpdate(
      { topic: 'daftar kategori chatbot' }, 
      { 
        topic: 'daftar kategori chatbot',
        content: summaryContent,
        category: 'System',
        status: 'ACTIVE'
      },
      { upsert: true, new: true } 
    );

    console.log("✓ Daftar kategori chatbot berhasil diperbarui otomatis.");

  } catch (error) {
    console.error("Gagal memperbarui daftar kategori:", error.message);
  }
};

const updateCategoryStats = async (categoryName, changeTotal, changeActive) => {
  if (!categoryName) return;

  try {
    const updatedCat = await Category.findOneAndUpdate(
      { name: categoryName },
      { 
        $inc: { 
          topicCount: changeTotal, 
          activeTopicCount: changeActive 
        } 
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (updatedCat.topicCount <= 0) {
      await Category.findByIdAndDelete(updatedCat._id);
      console.log(`🗑️ Kategori "${categoryName}" dihapus karena kosong.`);
    }
  } catch (error) {
    console.error(`Gagal update stats kategori ${categoryName}:`, error);
  }
};


exports.getAllKnowledge = async (req, res) => {
  try {
    const allData = await KnowledgeBase.find({}).sort({ updatedAt: -1 });
    res.status(200).json({ error: false, data: allData });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.status(200).json({ error: false, data: categories });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.createKnowledge = async (req, res) => {
  try {
    const { topic, content, category } = req.body;
    
    const newData = new KnowledgeBase({ 
      topic, 
      content, 
      category,
      status: 'ACTIVE',
      is_sync: false 
    });
    await newData.save();

    await updateCategoryStats(category, 1, 1);

    res.status(201).json({ error: false, message: 'Data berhasil dibuat', data: newData });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.updateKnowledge = async (req, res) => {
  try {
    const { id } = req.params;
    const { topic, content, category } = req.body; 
    
    const oldData = await KnowledgeBase.findById(id);
    if (!oldData) return res.status(404).json({ error: true, message: 'Data tidak ditemukan' });

    const oldCategory = oldData.category;
    const isActive = oldData.status === 'ACTIVE';

    const updatedData = await KnowledgeBase.findByIdAndUpdate(
      id, 
      { topic, content, category, is_sync: false },
      { new: true, runValidators: true }
    );

    if (oldCategory !== category) {
      await updateCategoryStats(oldCategory, -1, isActive ? -1 : 0);

      await updateCategoryStats(category, 1, isActive ? 1 : 0);
    }

    res.status(200).json({ error: false, message: 'Data berhasil diupdate', data: updatedData });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.toggleKnowledgeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const knowledgeItem = await KnowledgeBase.findById(id);
    if (!knowledgeItem) return res.status(404).json({ error: true, message: 'Data tidak ditemukan' });

    const oldStatus = knowledgeItem.status;
    const newStatus = oldStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const updatedItem = await KnowledgeBase.findByIdAndUpdate(
      id,
      { status: newStatus, is_sync: false },
      { new: true }
    );

    if (newStatus === 'ACTIVE') {
      await updateCategoryStats(knowledgeItem.category, 0, 1);
    } else {
      await updateCategoryStats(knowledgeItem.category, 0, -1);
    }

    res.status(200).json({ 
      error: false, 
      message: `Status berhasil diubah menjadi ${newStatus}`, 
      data: updatedItem 
    });

  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.deleteKnowledge = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await KnowledgeBase.findById(id);
    
    if (!item) {
      return res.status(404).json({ error: true, message: 'Data tidak ditemukan' });
    }

    if (item.status !== 'INACTIVE' || item.is_sync !== true) {
      return res.status(400).json({ 
        error: true, 
        message: 'Gagal menghapus! Data harus berstatus INACTIVE dan sudah sinkron (Sync RAG: Sudah) sebelum dihapus permanen.' 
      });
    }

    await KnowledgeBase.findByIdAndDelete(id);

    await updateCategoryStats(item.category, -1, 0);

    res.status(200).json({ error: false, message: 'Data berhasil dihapus permanen.' });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

exports.getKnowledgeStructure = async (req, res) => {
  try {
    const structure = await KnowledgeBase.aggregate([
      { $match: { status: 'ACTIVE', is_sync: true } },
      {
        $group: {
          _id: "$category", 
          topics: { $push: "$topic" } 
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({ error: false, data: structure });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};