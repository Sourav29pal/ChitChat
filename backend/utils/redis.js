import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_URI || null;
const PRESENCE_TTL_SECONDS = parseInt(process.env.PRESENCE_TTL_SECONDS, 10) || 60; // 60s TTL
const KEY_PREFIX = "chatapp:presence:";

let pubClient = null;
let subClient = null;
let presenceClient = null;
let isRedisAvailable = false;

// In-memory fallback if Redis is not configured or offline
const memoryUsers = new Map();

/**
 * Initialize Redis clients and Socket.IO adapter if Redis is available
 */
export const initRedis = async (io) => {
  if (!REDIS_URL && !process.env.REDIS_HOST) {
    console.log("ℹ️  REDIS_URL not configured. Running Socket.IO in standalone in-memory mode.");
    return false;
  }

  const redisOptions = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 5) {
        console.warn("⚠️ Redis reconnect retries exhausted. Falling back to memory presence.");
        return null; // Stop retrying
      }
      return Math.min(times * 100, 2000);
    },
    lazyConnect: true,
  };

  try {
    const connectUrl = REDIS_URL || `redis://${process.env.REDIS_HOST || "127.0.0.1"}:${process.env.REDIS_PORT || 6379}`;
    
    pubClient = new Redis(connectUrl, redisOptions);
    subClient = pubClient.duplicate();
    presenceClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect(), presenceClient.connect()]);

    pubClient.on("error", (err) => console.error("Redis PubClient Error:", err.message));
    subClient.on("error", (err) => console.error("Redis SubClient Error:", err.message));
    presenceClient.on("error", (err) => console.error("Redis PresenceClient Error:", err.message));

    io.adapter(createAdapter(pubClient, subClient));
    isRedisAvailable = true;
    console.log("✅ Socket.IO Redis adapter and Redis presence initialized successfully.");
    return true;
  } catch (err) {
    console.warn("⚠️ Failed to connect to Redis. Operating in standalone in-memory mode.", err.message);
    isRedisAvailable = false;
    return false;
  }
};

/**
 * Set user online with TTL
 */
export const setUserOnline = async (userId, socketId) => {
  const userIdStr = String(userId);
  memoryUsers.set(userIdStr, socketId);

  if (isRedisAvailable && presenceClient) {
    try {
      const key = `${KEY_PREFIX}${userIdStr}`;
      await presenceClient.set(key, socketId, "EX", PRESENCE_TTL_SECONDS);
    } catch (err) {
      console.error(`Error setting presence in Redis for user ${userIdStr}:`, err.message);
    }
  }
};

/**
 * Refresh user presence TTL (Heartbeat)
 */
export const refreshUserPresence = async (userId) => {
  const userIdStr = String(userId);
  if (isRedisAvailable && presenceClient) {
    try {
      const key = `${KEY_PREFIX}${userIdStr}`;
      const exists = await presenceClient.expire(key, PRESENCE_TTL_SECONDS);
      return exists === 1;
    } catch (err) {
      console.error(`Error refreshing presence TTL for user ${userIdStr}:`, err.message);
    }
  }
  return memoryUsers.has(userIdStr);
};

/**
 * Set user offline
 */
export const setUserOffline = async (userId, socketId) => {
  const userIdStr = String(userId);
  
  if (memoryUsers.get(userIdStr) === socketId) {
    memoryUsers.delete(userIdStr);
  }

  if (isRedisAvailable && presenceClient) {
    try {
      const key = `${KEY_PREFIX}${userIdStr}`;
      const currentSocketId = await presenceClient.get(key);
      if (currentSocketId === socketId) {
        await presenceClient.del(key);
      }
    } catch (err) {
      console.error(`Error removing presence in Redis for user ${userIdStr}:`, err.message);
    }
  }
};

/**
 * Retrieve socket ID for a given user ID
 */
export const getSocketId = async (userId) => {
  const userIdStr = String(userId);

  if (isRedisAvailable && presenceClient) {
    try {
      const key = `${KEY_PREFIX}${userIdStr}`;
      const socketId = await presenceClient.get(key);
      if (socketId) return socketId;
    } catch (err) {
      console.error(`Error getting socket ID from Redis for user ${userIdStr}:`, err.message);
    }
  }

  return memoryUsers.get(userIdStr) || null;
};

/**
 * Synchronously get cached local socket ID (fast path for synchronous emissions)
 */
export const getLocalSocketId = (userId) => {
  return memoryUsers.get(String(userId)) || null;
};

/**
 * Get list of all currently active online user IDs
 */
export const getAllOnlineUserIds = async () => {
  if (isRedisAvailable && presenceClient) {
    try {
      const keys = await presenceClient.keys(`${KEY_PREFIX}*`);
      return keys.map((key) => key.replace(KEY_PREFIX, ""));
    } catch (err) {
      console.error("Error retrieving online user keys from Redis:", err.message);
    }
  }

  return Array.from(memoryUsers.keys());
};
