'use strict';
class MulterError extends Error { constructor(code) { super(code); this.code = code; } }
function multer(opts = {}) {
  const lim = opts.limits || {};
  return {
    array(field) {
      return (req, res, next) => {
        const form = req._form;
        if (!form) { req.files = []; return next(); }
        const files = form.files.filter((f) => f.field === field);
        if (lim.files && files.length > lim.files) return next(new MulterError('LIMIT_FILE_COUNT'));
        if (lim.fileSize && files.some((f) => f.size > lim.fileSize)) return next(new MulterError('LIMIT_FILE_SIZE'));
        req.files = files.map((f) => ({ buffer: f.buffer, originalname: f.name, size: f.size }));
        req.body = { ...form.fields };
        next();
      };
    },
  };
}
multer.memoryStorage = () => ({});
multer.MulterError = MulterError;
module.exports = multer;
