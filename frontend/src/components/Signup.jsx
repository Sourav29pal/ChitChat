import React, { useState } from "react";
import { useForm } from "react-hook-form";
import api from "../api";
import { useAuth } from "../context/AuthProvider";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FiUser, FiMail, FiLock, FiPhoneCall, FiLoader, FiEye, FiEyeOff, FiCheck, FiX } from "react-icons/fi";
import chitChatLogo from "../assets/chitchat_logo.svg";

function Signup() {
  const [, setAuthUser] = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const password = watch("password", "");
  const confirmPassword = watch("confirmPassword", "");

  // Live password policy criteria checks (8+ chars, 1 uppercase, 1 special char)
  const isLengthValid = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isPasswordPolicyMet = isLengthValid && hasUppercase && hasSpecial;

  const validatePasswordPolicy = (value) => {
    if (!value) return "Password is required";
    if (value.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(value)) return "Password must include at least one uppercase letter";
    if (!/[^A-Za-z0-9]/.test(value)) return "Password must include at least one special character";
    return true;
  };

  const validatePasswordMatch = (value) => {
    if (!value) return "Confirm password is required";
    return value === password || "Passwords do not match";
  };

  const onSubmit = async (data) => {
    const userInfo = {
      email: data.email ? data.email.trim() : "",
      password: data.password,
      confirmPassword: data.confirmPassword,
    };

    setLoading(true);

    try {
      const response = await api.post("/api/user/signup", userInfo);

      if (response.data) {
        toast.success("Account created successfully!");
        localStorage.setItem("ChatApp", JSON.stringify(response.data));
        setAuthUser(response.data);
        navigate("/onboarding");
      }
    } catch (error) {
      setLoading(false);
      if (!error.response) {
        toast.error("Unable to reach the server. Please check your connection.");
      } else if (
        error.response.data?.error === "User with this email already registered" ||
        error.response.status === 409
      ) {
        toast.error("An account with this email already exists. Please log in instead.");
      } else if (error.response.status >= 500) {
        toast.error("Unable to create your account. Please try again.");
      } else {
        toast.error(error.response.data?.error || "Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center py-8 px-4 sm:px-6 bg-slate-950 text-slate-100 relative overflow-y-auto">
      {/* Background Neon Glowing Orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-violet-600/30 rounded-full blur-[100px] sm:blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-indigo-600/30 rounded-full blur-[100px] sm:blur-[120px] pointer-events-none"></div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-[400px] sm:max-w-md p-6 sm:p-8 rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 shadow-2xl space-y-4 sm:space-y-4 z-10 my-auto"
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
            Create your account and start connecting.
          </p>
          <p className="text-xs text-slate-400">
            Connect with real-time chats, groups, voice & video calls
          </p>
        </div>

        {/* Email */}
        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-semibold text-slate-300">Email Address</label>
          <div className="relative">
            <FiMail className="absolute left-3.5 top-3.5 text-slate-500 text-lg" />
            <input
              id="email"
              type="email"
              placeholder="you@gmail.com"
              autoComplete="email"
              aria-invalid={errors.email ? "true" : "false"}
              {...register("email", { required: "Email is required" })}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>
          {errors.email && (
            <span className="text-rose-400 text-xs pl-1">{errors.email.message}</span>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-semibold text-slate-300">Password</label>
          <div className="relative">
            <FiLock className="absolute left-3.5 top-3.5 text-slate-500 text-lg" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              autoComplete="new-password"
              aria-invalid={errors.password ? "true" : "false"}
              {...register("password", {
                required: "Password is required",
                validate: validatePasswordPolicy,
              })}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-200 transition focus:outline-none cursor-pointer"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff className="text-lg" /> : <FiEye className="text-lg" />}
            </button>
          </div>
          {errors.password && (
            <span className="text-rose-400 text-xs pl-1">{errors.password.message}</span>
          )}

          {/* Minimal Live Password Guidance (Always visible from the start) */}
          <div className="pt-1 space-y-1 transition-all duration-200">
            {isPasswordPolicyMet ? (
              <p className="text-emerald-400 text-xs font-medium flex items-center gap-1.5 pl-1">
                <FiCheck className="text-sm flex-shrink-0" /> Password meets all requirements
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 text-[11px] pl-0.5">
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] transition-all flex items-center gap-1 ${
                    isLengthValid
                      ? "bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/30"
                      : "bg-slate-800/80 text-slate-400 border border-slate-700/60"
                  }`}
                >
                  {isLengthValid ? <FiCheck className="text-xs" /> : "•"} 8+ chars
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] transition-all flex items-center gap-1 ${
                    hasUppercase
                      ? "bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/30"
                      : "bg-slate-800/80 text-slate-400 border border-slate-700/60"
                  }`}
                >
                  {hasUppercase ? <FiCheck className="text-xs" /> : "•"} 1 uppercase (A-Z)
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] transition-all flex items-center gap-1 ${
                    hasSpecial
                      ? "bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/30"
                      : "bg-slate-800/80 text-slate-400 border border-slate-700/60"
                  }`}
                >
                  {hasSpecial ? <FiCheck className="text-xs" /> : "•"} 1 special char (!@#$)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-1">
          <label htmlFor="confirmPassword" className="text-xs font-semibold text-slate-300">Confirm Password</label>
          <div className="relative">
            <FiLock className="absolute left-3.5 top-3.5 text-slate-500 text-lg" />
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              aria-invalid={
                errors.confirmPassword || (confirmPassword && confirmPassword !== password)
                  ? "true"
                  : "false"
              }
              {...register("confirmPassword", {
                required: "Confirm password is required",
                validate: validatePasswordMatch,
              })}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-200 transition focus:outline-none cursor-pointer"
              tabIndex={-1}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? <FiEyeOff className="text-lg" /> : <FiEye className="text-lg" />}
            </button>
          </div>
          {confirmPassword ? (
            confirmPassword === password ? (
              <span className="text-emerald-400 text-xs pl-1 flex items-center gap-1">
                <FiCheck className="text-xs" /> Passwords match
              </span>
            ) : (
              <span className="text-rose-400 text-xs pl-1 flex items-center gap-1">
                <FiX className="text-xs" /> Passwords do not match
              </span>
            )
          ) : errors.confirmPassword ? (
            <span className="text-rose-400 text-xs pl-1 block">
              {errors.confirmPassword.message}
            </span>
          ) : null}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition transform flex items-center justify-center gap-2 ${
            loading
              ? "opacity-75 cursor-not-allowed pointer-events-none"
              : "hover:from-violet-500 hover:to-indigo-500 active:scale-[0.98] cursor-pointer"
          }`}
        >
          {loading ? (
            <>
              <FiLoader className="animate-spin text-base" />
              <span>Signing up...</span>
            </>
          ) : (
            "Sign Up"
          )}
        </button>

        {/* Footer Link */}
        <p className="text-center text-slate-400 text-xs pt-2">
          Already have an account?{" "}
          <Link to="/login" className="text-indigo-400 font-semibold hover:underline">
            Log In
          </Link>
        </p>
      </form>
    </div>
  );
}

export default Signup;
