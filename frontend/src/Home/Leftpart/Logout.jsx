import React from "react";
import { BiLogOutCircle } from "react-icons/bi";
import axios from "axios";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthProvider";

function Logout() {
  const [authUser, setAuthUser] = useAuth();

  const handleLogout = async () => {
    try {
      await axios.post("/api/user/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.clear();
      Cookies.remove("jwt", { path: "/" });
      setAuthUser(undefined);
      toast.success("Logged out successfully");
      window.location.href = "/login";
    }
  };

  return (
    <div className="w-full flex items-center justify-between">
      
      {/* Username (ONLY HERE) */}
      <span className="text-sm text-gray-400 truncate">
        {authUser?.user?.fullname}
      </span>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="
          flex items-center gap-2
          px-4 py-2
          rounded-full
          bg-red-500/10
          text-red-400
          hover:bg-red-500/20
          transition
        "
      >
        <BiLogOutCircle className="text-lg" />
        Logout
      </button>

    </div>
  );
}

export default Logout;
