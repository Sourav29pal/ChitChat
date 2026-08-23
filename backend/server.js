import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ==================== MONGODB DATABASE CONFIGURATION ====================
// 1. Local MongoDB connection URI (hardcoded for local development)
const LOCAL_MONGODB_URI = "mongodb://127.0.0.1:27017/chatapp";

// 2. Connection Selector Switch:
// --- LOCAL DEVELOPMENT (Default active configuration) ---
// const MONGODB_URI = LOCAL_MONGODB_URI;

// --- MONGODB ATLAS (Uncomment to use Atlas deployment; comment out LOCAL above) ---
const MONGODB_URI = process.env.MONGODB_ATLAS_URI;
// ========================================================================

// Validate MongoDB URI before attempting connection
if (!MONGODB_URI || (typeof MONGODB_URI === "string" && !MONGODB_URI.trim())) {
  console.error("FATAL ERROR: MONGODB_ATLAS_URI is not configured in the environment.");
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message || error);
    process.exit(1);
  }
};

export default connectDB;
