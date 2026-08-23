import multer from "multer";

// Use in-memory storage to prevent writing uploaded files to server local disk
const storage = multer.memoryStorage();

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per image
export const MAX_IMAGE_COUNT = 5; // Maximum 5 images per request

/**
 * Filter to strictly accept only allowed image MIME types (JPEG, PNG, WebP)
 */
const imageFileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname);
    error.message = "Only JPG, PNG, and WebP images are allowed.";
    cb(error, false);
  }
};

/**
 * Base configured Multer instance
 */
export const multerInstance = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_FILE_SIZE,
    files: MAX_IMAGE_COUNT,
  },
  fileFilter: imageFileFilter,
});

/**
 * Higher-order error handling wrapper for Multer middleware.
 * Ensures all Multer/file validation errors return formatted JSON responses.
 *
 * @param {Function} multerMiddleware - A multer middleware instance (e.g. upload.single('image'))
 * @returns {Function} Express middleware
 */
export const handleUpload = (multerMiddleware) => {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "Image must be 5 MB or smaller." });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({ error: `Maximum ${MAX_IMAGE_COUNT} images allowed per upload.` });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({ error: err.message || "Unexpected file field or unsupported file type." });
        }
        return res.status(400).json({ error: err.message || "File upload error." });
      } else if (err) {
        return res.status(400).json({ error: err.message || "Invalid file upload." });
      }
      next();
    });
  };
};

/**
 * Middleware for handling single image uploads (e.g. 'image', 'avatar', 'groupAvatar')
 * @param {string} fieldName - Form field name (default: "image")
 */
export const uploadSingleImage = (fieldName = "image") =>
  handleUpload(multerInstance.single(fieldName));

/**
 * Middleware for handling multiple image uploads (up to maxCount, default: 5)
 * @param {string} fieldName - Form field name (default: "images")
 * @param {number} maxCount - Max files allowed (default: 5)
 */
export const uploadMultipleImages = (fieldName = "images", maxCount = MAX_IMAGE_COUNT) =>
  handleUpload(multerInstance.array(fieldName, maxCount));

/**
 * Preconfigured convenience middleware for profile avatar
 */
export const uploadAvatar = uploadSingleImage("avatar");

/**
 * Preconfigured convenience middleware for group avatar
 */
export const uploadGroupAvatar = uploadSingleImage("groupAvatar");

/**
 * Preconfigured convenience middleware for chat image message
 */
export const uploadChatImage = uploadSingleImage("image");

/**
 * Preconfigured convenience middleware for chat multiple images (up to 5)
 */
export const uploadChatImages = uploadMultipleImages("images", MAX_IMAGE_COUNT);

/**
 * Preconfigured convenience middleware for chat files accepting either 'image' or 'images' (up to 5)
 */
export const uploadChatFiles = handleUpload(
  multerInstance.fields([
    { name: "image", maxCount: 1 },
    { name: "images", maxCount: MAX_IMAGE_COUNT },
  ])
);

export default {
  uploadSingleImage,
  uploadMultipleImages,
  uploadAvatar,
  uploadGroupAvatar,
  uploadChatImage,
  uploadChatImages,
  uploadChatFiles,
  multerInstance,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGE_COUNT,
};
