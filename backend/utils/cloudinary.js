import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import { Readable } from "stream";
import { isApprovedSystemAvatarUrl } from "../config/systemAvatars.js";

dotenv.config();

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});

/**
 * Centralized Cloudinary folder names
 */
export const CLOUDINARY_FOLDERS = {
  PROFILES: "ChitChat_App/ChitChat_App_Uploaded_User_Profile_Avatar",
  CHAT_MEDIA: "ChitChat_App/ChitChat_App_Media_Photos",
  GROUP_AVATARS: "ChitChat_App/ChitChat_App_Uploaded_Group_Avatar",

  SYSTEM_DEFAULT_AVATAR:
    "ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Default",

  SYSTEM_MALE_AVATARS:
    "ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Male",

  SYSTEM_FEMALE_AVATARS:
    "ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Female",

  SYSTEM_GROUP_AVATARS:
    "ChitChat_App/ChitChat_App_Avatars/ChitChat_App_Avatars_Group",
};

/**
 * Protected shared system folder prefixes that must NEVER be destroyed
 */
export const SYSTEM_FOLDER_PREFIXES = [
  "ChitChat_App/ChitChat_App_Avatars",
  "ChitChat_App_Avatars",
];

/**
 * Checks if a given Cloudinary public_id belongs to a shared system avatar folder
 * @param {string} publicId
 * @returns {boolean}
 */
export const isSystemAvatarPublicId = (publicId) => {
  if (!publicId || typeof publicId !== "string") return false;
  const cleanId = publicId.trim();
  return SYSTEM_FOLDER_PREFIXES.some(
    (prefix) => cleanId.startsWith(prefix) || cleanId.includes(prefix)
  );
};

/**
 * Checks if a URL points to an approved system avatar asset
 * @param {string} url
 * @returns {boolean}
 */
export const isSystemAvatarUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  return isApprovedSystemAvatarUrl(url);
};

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per image

/**
 * Validates if Cloudinary credentials are fully configured in the environment
 * @returns {boolean}
 */
export const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

/**
 * Calculates byte size of a base64 or Data URI string
 * @param {string} base64String
 * @returns {number}
 */
export const calculateBase64Size = (base64String) => {
  if (!base64String) return 0;
  const base64Data = base64String.includes(",")
    ? base64String.split(",")[1]
    : base64String;
  const padding = (base64Data.match(/=/g) || []).length;
  return Math.floor((base64Data.length * 3) / 4) - padding;
};

/**
 * Uploads a Buffer (from Multer memoryStorage) to Cloudinary via upload_stream
 *
 * @param {Buffer} buffer - File buffer from Multer
 * @param {object} options - Custom Cloudinary upload options (e.g. folder, transformation)
 * @returns {Promise<{ secure_url: string, public_id: string, width: number|null, height: number|null, format: string|null, bytes: number|null }>}
 */
export const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      return reject(new Error("Cloudinary service is not configured on the server."));
    }

    if (!buffer || !(buffer instanceof Buffer)) {
      return reject(new Error("Invalid file buffer provided for upload."));
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return reject(new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit.`));
    }

    const uploadOptions = {
      folder: CLOUDINARY_FOLDERS.CHAT_MEDIA,
      resource_type: "auto",
      ...options,
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve({
          secure_url: result.secure_url || result.url,
          public_id: result.public_id,
          width: result.width || null,
          height: result.height || null,
          format: result.format || null,
          bytes: result.bytes || null,
        });
      }
    );

    const readable = new Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Upload an image (Buffer, Multer file object, base64 data URI, or remote URL) to Cloudinary.
 * Enforces 5 MB limit BEFORE upload.
 * Preserves and returns secure_url, public_id, width, height, format, bytes.
 *
 * @param {Buffer|object|string} fileInput - Buffer, Multer file object, base64 Data URI, or URL
 * @param {object} options - Custom Cloudinary upload options
 * @returns {Promise<{ secure_url: string, public_id: string, width: number|null, height: number|null, format: string|null, bytes: number|null }>}
 */
export const uploadToCloudinary = async (fileInput, options = {}) => {
  if (!fileInput) {
    throw new Error("No file input provided for upload");
  }

  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary service is not configured on the server.");
  }

  // Case 1: Multer file object with buffer property
  if (fileInput && typeof fileInput === "object" && Buffer.isBuffer(fileInput.buffer)) {
    return uploadBufferToCloudinary(fileInput.buffer, options);
  }

  // Case 2: Raw Buffer
  if (Buffer.isBuffer(fileInput)) {
    return uploadBufferToCloudinary(fileInput, options);
  }

  // Case 3: Base64 data URI or string URL
  if (typeof fileInput === "string") {
    if (fileInput.startsWith("data:")) {
      const approximateSize = calculateBase64Size(fileInput);
      if (approximateSize > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File size (${(approximateSize / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit.`);
      }
    }

    const uploadOptions = {
      folder: CLOUDINARY_FOLDERS.CHAT_MEDIA,
      resource_type: "auto",
      ...options,
    };

    const result = await cloudinary.uploader.upload(fileInput, uploadOptions);

    return {
      secure_url: result.secure_url || result.url,
      public_id: result.public_id,
      width: result.width || null,
      height: result.height || null,
      format: result.format || null,
      bytes: result.bytes || null,
    };
  }

  throw new Error("Unsupported file input format for Cloudinary upload");
};

/**
 * Deletes an asset from Cloudinary by its public_id.
 *
 * @param {string} publicId - Cloudinary public_id of the asset to delete
 * @param {string} resourceType - Cloudinary resource type ("image", "video", "raw")
 * @returns {Promise<{ result: string }>}
 */
export const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  if (!publicId || typeof publicId !== "string" || !publicId.trim()) {
    return { result: "not_found" };
  }

  const cleanId = publicId.trim();

  // System Avatar Safety Guard: Refuse deletion of shared system assets
  if (isSystemAvatarPublicId(cleanId)) {
    console.warn(
      `[Cloudinary Safety] Blocked deletion attempt on shared system avatar asset: "${cleanId}"`
    );
    return { result: "system_asset_protected" };
  }

  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary service is not configured on the server.");
  }

  const response = await cloudinary.uploader.destroy(cleanId, {
    resource_type: resourceType,
  });

  return response;
};

export default cloudinary;
