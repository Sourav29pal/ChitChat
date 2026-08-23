/**
 * WebRTC ICE Configuration (STUN / TURN)
 *
 * ⚠️ PRODUCTION REQUIREMENT (TODO):
 * Public STUN servers only handle NAT discovery and will fail on symmetric NATs,
 * mobile carrier networks (CGNAT), and enterprise firewalls (~15-20% of all real-world calls).
 * Before deploying to production, configure a TURN relay server by setting `VITE_ICE_SERVERS`.
 *
 * Examples of TURN providers:
 * 1. Self-hosted coturn (Free & Open Source):
 *    - Example coturn URL: "turn:turn.yourdomain.com:3478" (with username & credential)
 * 2. Twilio Network Traversal Service / Xirsys / Metered.ca
 *
 * Expected format in .env:
 * VITE_ICE_SERVERS='[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pwd"}]'
 */

const DEFAULT_ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

/**
 * Returns RTCConfiguration with ICE servers from environment or defaults
 */
export const getIceConfiguration = () => {
  const envIceServers = import.meta.env.VITE_ICE_SERVERS;

  if (envIceServers) {
    try {
      const parsed = typeof envIceServers === "string" ? JSON.parse(envIceServers) : envIceServers;
      if (Array.isArray(parsed)) {
        return { iceServers: parsed };
      }
      if (parsed && parsed.iceServers) {
        return parsed;
      }
    } catch (err) {
      console.warn("⚠️ Failed to parse VITE_ICE_SERVERS from environment. Using default STUN servers.", err);
    }
  }

  return DEFAULT_ICE_SERVERS;
};

export default getIceConfiguration;
