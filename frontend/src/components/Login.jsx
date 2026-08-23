import axios from "axios";
import React from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "../context/AuthProvider";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FiMail, FiLock } from "react-icons/fi";
import chitChatLogo from "../assets/chitchat_logo.svg";

function Login() {
  const [, setAuthUser] = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    const userInfo = {
      email: data.email ? data.email.trim() : "",
      password: data.password,
    };

    try {
      const response = await axios.post("/api/user/login", userInfo);

      if (response.data) {
        toast.success("Welcome back!");
        localStorage.setItem("ChatApp", JSON.stringify(response.data));
        setAuthUser(response.data);
      }
    } catch (error) {
      if (error.response) {
        toast.error(error.response.data.error || "Login failed");
      } else {
        toast.error("Something went wrong");
      }
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center py-8 px-4 sm:px-6 bg-slate-950 text-slate-100 relative overflow-y-auto">
      {/* Background Neon Glowing Orbs */}
      <div className="absolute top-1/3 left-1/3 w-72 sm:w-96 h-72 sm:h-96 bg-indigo-600/30 rounded-full blur-[100px] sm:blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/3 right-1/3 w-72 sm:w-96 h-72 sm:h-96 bg-violet-600/30 rounded-full blur-[100px] sm:blur-[120px] pointer-events-none"></div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-[400px] sm:max-w-md p-6 sm:p-8 rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 shadow-2xl space-y-4 sm:space-y-6 z-10 my-auto"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <img
              src={chitChatLogo}
              alt="ChitChat"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl shadow-lg shadow-indigo-500/30 ring-1 ring-white/10 object-contain flex-shrink-0"
            />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(99,102,241,0.3)]">
                ChitChat
              </span>
            </h1>
          </div>
          <p className="text-xs text-indigo-400 font-medium tracking-wide">
            Real-time messaging, made simple.
          </p>
          <p className="text-xs text-slate-400">
            Sign in to access your messages, groups & calls
          </p>
        </div>

        {/* Email */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Email Address</label>
          <div className="relative">
            <FiMail className="absolute left-3.5 top-3.5 text-slate-500 text-lg" />
            <input
              type="email"
              placeholder="user@example.com"
              {...register("email", { required: true })}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>
          {errors.email && (
            <span className="text-rose-400 text-xs pl-1">Email is required</span>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Password</label>
          <div className="relative">
            <FiLock className="absolute left-3.5 top-3.5 text-slate-500 text-lg" />
            <input
              type="password"
              placeholder="••••••••"
              {...register("password", { required: true })}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>
          {errors.password && (
            <span className="text-rose-400 text-xs pl-1">Password is required</span>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-[0.98]"
        >
          Log In
        </button>

        {/* Footer Link */}
        <p className="text-center text-slate-400 text-xs pt-2">
          Don't have an account?{" "}
          <Link to="/signup" className="text-indigo-400 font-semibold hover:underline">
            Sign Up
          </Link>
        </p>
      </form>
    </div>
  );
}

export default Login;