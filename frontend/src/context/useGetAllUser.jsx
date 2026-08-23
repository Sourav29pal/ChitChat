import React, { useEffect, useState } from "react";
import api from "../api";
import useConversation from "../zustand/useConversation.js";

function useGetAllUsers() {
  const { allUsers, setAllUsers, setUnreadCounts, unreadCounts } = useConversation();
  const [loading, setLoading] = useState(allUsers.length === 0);

  useEffect(() => {
    const getUsers = async () => {
      setLoading(true);
      try {
        const response = await api.get("/api/user/allusers");
        const users = response.data;
        setAllUsers(users);

        // Restore unread counts from backend on page load / refresh
        // Only seed counts that are NOT already tracked in Zustand
        // (so real-time increments from the current session are not lost)
        const restoredCounts = {};
        users.forEach((u) => {
          const key = String(u._id);
          if (typeof u.unreadCount === "number" && u.unreadCount > 0) {
            // Use the larger of backend count vs current in-memory count
            const current = unreadCounts[key] || 0;
            restoredCounts[key] = Math.max(current, u.unreadCount);
          }
        });
        if (Object.keys(restoredCounts).length > 0) {
          setUnreadCounts({ ...unreadCounts, ...restoredCounts });
        }
      } catch (error) {
        console.log("Error in useGetAllUsers: ", error);
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          localStorage.removeItem("ChatApp");
          window.location.href = "/login";
        }
      } finally {
        setLoading(false);
      }
    };
    getUsers();
  }, [setAllUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  return [allUsers, loading];
}

export default useGetAllUsers;