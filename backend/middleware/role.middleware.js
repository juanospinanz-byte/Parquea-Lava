// Permite la ruta solo a usuarios con alguno de los roles indicados (va después de authMiddleware)
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.rol)) {
    return res.status(403).json({ mensaje: 'No tienes permiso para realizar esta acción' });
  }
  next();
};

module.exports = requireRole;
