import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import io from "socket.io-client";
const socketContext = createContext();

// it is a hook.
export const useSocketContext = () => {
  const context = useContext(socketContext);
  return context || { socket: null, onlineUsers: [] };
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [authUser] = useAuth();

  useEffect(() => {
    const targetUserId = authUser?.user?._id || authUser?._id;
    if (targetUserId) {
      const serverUrl =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
          ? "http://localhost:4001"
          : window.location.origin;

      const socket = io(serverUrl, {
        query: {
          userId: targetUserId,
        },
      });
      setSocket(socket);

      socket.on("getOnlineUsers", (users) => {
        setOnlineUsers(users);
      });

      // Heartbeat every 25 seconds to keep Redis presence TTL refreshed
      const heartbeatInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit("heartbeat");
        }
      }, 25000);

      return () => {
        clearInterval(heartbeatInterval);
        socket.close();
      };
    } else {
      if (socket) {
        socket.close();
        setSocket(null);
      }
    }
  }, [authUser]);
  return (
    <socketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </socketContext.Provider>
  );
};