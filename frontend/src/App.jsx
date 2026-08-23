import React from "react";
import Left from "./Home/Leftpart/Left";
import Right from "./Home/Rightpart/Right";
import Signup from "./components/Signup";
import Login from "./components/Login";
import Onboarding from "./components/Onboarding";
import CallModal from "./components/CallModal";
import ImageLightbox from "./components/ImageLightbox";
import { useAuth } from "./context/AuthProvider";
import useGetSocketMessage from "./context/useGetSocketMessage";
import useConversation from "./zustand/useConversation";
import { Toaster } from "react-hot-toast";
import { Navigate, Route, Routes } from "react-router-dom";

function MainChatLayout() {
  useGetSocketMessage();
  const { selectedConversation } = useConversation();

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-slate-950 p-1 sm:p-2 gap-1.5 sm:gap-2 box-border relative">
      {/* Ambient Neon Glowing Mesh Orbs (Balanced across entire workspace) */}
      <div className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-gradient-to-tr from-violet-600/15 to-indigo-600/15 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute -bottom-32 -right-32 w-[550px] h-[550px] bg-gradient-to-tr from-cyan-600/15 to-indigo-600/15 rounded-full blur-[140px] pointer-events-none"></div>

      {/* LEFT SIDEBAR: Adaptive width on half-screen, master-detail on mobile */}
      <div
        className={`${
          selectedConversation ? "hidden md:flex" : "flex w-full"
        } md:w-[360px] lg:w-[420px] xl:w-[460px] 2xl:w-[490px] flex-shrink-0 h-full rounded-2xl overflow-hidden border border-slate-800/90 shadow-[0_8px_30px_rgb(0,0,0,0.5)] ring-1 ring-white/5 bg-slate-950/70 backdrop-blur-xl flex-col relative z-10`}
      >
        <Left />
      </div>

      {/* RIGHT CHAT AREA: Adaptive on half-screen, full-width on mobile when open */}
      <div
        className={`${
          !selectedConversation ? "hidden md:flex" : "flex w-full"
        } flex-1 h-full min-w-0 rounded-2xl overflow-hidden border border-slate-800/90 shadow-[0_8px_30px_rgb(0,0,0,0.5)] ring-1 ring-white/5 bg-slate-950/70 backdrop-blur-xl flex-col relative z-10`}
      >
        <Right />
      </div>
    </div>
  );
}

function App() {
  const [authUser] = useAuth();
  const userObj = authUser?.user || (authUser && authUser._id ? authUser : null);
  const isProfileComplete = userObj?.isProfileComplete === true;

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {authUser && isProfileComplete && (
        <>
          <CallModal />
          <ImageLightbox />
        </>
      )}
      <Routes>
        <Route
          path="/"
          element={
            authUser ? (
              isProfileComplete ? (
                <MainChatLayout />
              ) : (
                <Navigate to="/onboarding" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/onboarding"
          element={
            !authUser ? (
              <Navigate to="/login" />
            ) : isProfileComplete ? (
              <Navigate to="/" />
            ) : (
              <Onboarding />
            )
          }
        />

        <Route
          path="/login"
          element={
            authUser ? (
              isProfileComplete ? (
                <Navigate to="/" />
              ) : (
                <Navigate to="/onboarding" />
              )
            ) : (
              <Login />
            )
          }
        />
        <Route
          path="/signup"
          element={
            authUser ? (
              isProfileComplete ? (
                <Navigate to="/" />
              ) : (
                <Navigate to="/onboarding" />
              )
            ) : (
              <Signup />
            )
          }
        />
      </Routes>

      <Toaster position="top-center" reverseOrder={false} />
    </div>
  );
}

export default App;