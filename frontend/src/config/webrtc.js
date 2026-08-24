import api from "../api";

/**
 * Default Public STUN Servers (Fallback for direct P2P NAT discovery)
 */
const DEFAULT_ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceTransportPolicy: "all",
  iceCandidatePoolSize: 10,
};

let cachedIceConfiguration = null;

/**
 * Parses and validates raw ICE server configuration
 */
export const parseIceServers = (rawConfig) => {
  if (!rawConfig) return null;
  try {
    const parsed = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return {
        iceServers: parsed,
        iceTransportPolicy: "all",
        iceCandidatePoolSize: 10,
      };
    }
    if (parsed && parsed.iceServers && Array.isArray(parsed.iceServers)) {
      return {
        ...parsed,
        iceTransportPolicy: parsed.iceTransportPolicy || "all",
        iceCandidatePoolSize: parsed.iceCandidatePoolSize || 10,
      };
    }
  } catch (err) {
    console.warn("⚠️ Failed to parse ICE servers from config:", err);
  }
  return null;
};

/**
 * Fetches dynamic ICE configuration from the backend endpoint (/api/call/ice-servers)
 * which securely retrieves and generates TURN credentials without exposing secrets.
 */
export const fetchIceConfiguration = async () => {
  if (cachedIceConfiguration) {
    return cachedIceConfiguration;
  }

  // 1. Check frontend environment variable (e.g. Vercel dashboard)
  const envConfig = parseIceServers(import.meta.env.VITE_ICE_SERVERS);
  if (envConfig) {
    cachedIceConfiguration = envConfig;
    return cachedIceConfiguration;
  }

  // 2. Fetch from secure backend endpoint
  try {
    const res = await api.get("/api/call/ice-servers");
    if (res.data?.iceServers && Array.isArray(res.data.iceServers)) {
      cachedIceConfiguration = {
        iceServers: res.data.iceServers,
        iceTransportPolicy: "all",
        iceCandidatePoolSize: 10,
      };
      return cachedIceConfiguration;
    }
  } catch (err) {
    console.warn("[WebRTC] Could not fetch dynamic ICE servers from backend, using default STUN:", err.message);
  }

  // 3. Fallback to default STUN
  cachedIceConfiguration = DEFAULT_ICE_SERVERS;
  return cachedIceConfiguration;
};

/**
 * Returns RTCConfiguration with ICE servers from cache, environment, or defaults
 */
export const getIceConfiguration = () => {
  if (cachedIceConfiguration) {
    return cachedIceConfiguration;
  }
  const envConfig = parseIceServers(import.meta.env.VITE_ICE_SERVERS);
  return envConfig || DEFAULT_ICE_SERVERS;
};

export default getIceConfiguration;
