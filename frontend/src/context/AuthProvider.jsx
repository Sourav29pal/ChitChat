import React, { createContext, useContext, useState } from "react";
import Cookies from "js-cookie";
export const AuthContext = createContext();
export const AuthProvider = ({ children }) => {
  const [authUser, setAuthUser] = useState(() => {
    try {
      const initialUserState = localStorage.getItem("ChatApp");
      if (
        initialUserState &&
        initialUserState !== "undefined" &&
        initialUserState !== "null"
      ) {
        return JSON.parse(initialUserState);
      }
    } catch (err) {
      console.error("Error parsing authUser from localStorage:", err);
      try {
        localStorage.removeItem("ChatApp");
      } catch (e) {}
    }
    return undefined;
  });

  return (
    <AuthContext.Provider value={[authUser, setAuthUser]}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  return context || [undefined, () => {}];
};