const isAdmin = (req, res, next) => {
  if (req.session && req.session.adminId) {
    next();
  } else {
    res.status(401).json({ error: true, message: 'Akses ditolak. Silakan login.' });
  }
};

const isSuperAdmin = (req, res, next) => {
  if (req.session && req.session.adminId && req.session.role === 'SUPER_ADMIN') {
    next();
  } else {
    res.status(403).json({ error: true, message: 'Akses ditolak. Butuh hak akses Super Admin.' });
  }
};

module.exports = { isAdmin, isSuperAdmin };