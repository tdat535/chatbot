// Auth middleware đã bỏ token - không cần verify nữa
module.exports = function requireAuth(req, res, next) {
  next();
};
