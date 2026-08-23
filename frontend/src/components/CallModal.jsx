import React, { useEffect, useRef, useState } from "react";
import api from "../api";
import { useSocketContext } from "../context/SocketContext";
import { useAuth } from "../context/AuthProvider";
import useConversation from "../zustand/useConversation";
import {
  FiPhone,
  FiPhoneOff,
  FiVideo,
  FiVideoOff,
  FiMic,
  FiMicOff,
  FiRepeat,
} from "react-icons/fi";
import toast from "react-hot-toast";
import { getIceConfiguration } from "../config/webrtc.js";

function CallModal() {
  const { socket } = useSocketContext();
  const [authUser] = useAuth();
  const { activeCall, setActiveCall } = useConversation();

  const [callState, setCallState] = useState("idle"); // 'idle' | 'calling' | 'incoming' | 'connected'
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [isRemoteVideoDisabled, setIsRemoteVideoDisabled] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false); // Swap Main & PiP video views
  const [callDuration, setCallDuration] = useState(0);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceCandidatesQueue = useRef([]);
  const callConnectedAtRef = useRef(null);
  const callStartedAtRef = useRef(null);
  const callAnsweredAtRef = useRef(null);
  const callLoggedRef = useRef(false);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const audioCtxRef = useRef(null);
  const ringtoneIntervalRef = useRef(null);
  const ringTimeoutRef = useRef(null);

  const clearRingTimeout = () => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  };

  const callStateRef = useRef(callState);
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // 30-second unanswered timeout for outgoing calling state
  useEffect(() => {
    if (callState === "calling" && activeCall?.isInitiator) {
      clearRingTimeout();
      ringTimeoutRef.current = setTimeout(() => {
        const targetId = activeCall?.userToCall?._id;
        recordCallLog("unanswered", 0);
        if (targetId && socket) {
          socket.emit("end-call", { to: targetId });
        }
        toast("No answer", { icon: "📞" });
        cleanupCall();
      }, 30000);
    } else {
      clearRingTimeout();
    }

    return () => {
      clearRingTimeout();
    };
  }, [callState, activeCall?.isInitiator, activeCall?.userToCall?._id, socket]);

  // Live call timer during connected state
  useEffect(() => {
    let timer = null;
    if (callState === "connected") {
      if (!callConnectedAtRef.current) {
        callConnectedAtRef.current = Date.now();
      }
      timer = setInterval(() => {
        if (callConnectedAtRef.current) {
          setCallDuration(Math.floor((Date.now() - callConnectedAtRef.current) / 1000));
        }
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState]);

  // Persistent call logger — only the caller (initiator) creates the database record
  const recordCallLog = async (statusOverride, durationOverride) => {
    if (callLoggedRef.current) return;

    try {
      const isCaller = activeCall?.isInitiator;
      // Strictly only the caller/initiator logs the call to prevent duplicate database records
      if (!isCaller) return;
      callLoggedRef.current = true;

      const otherUserId = activeCall?.userToCall?._id;
      if (!otherUserId) return;

      const callType = activeCall?.callType || "voice";
      let status = statusOverride;
      let duration = 0;

      if (!status) {
        if (callConnectedAtRef.current) {
          status = "completed";
          duration = Math.round((Date.now() - callConnectedAtRef.current) / 1000);
        } else {
          status = "unanswered";
          duration = 0;
        }
      }

      if (durationOverride !== undefined) {
        duration = durationOverride;
      }

      const startedAt = callStartedAtRef.current || new Date().toISOString();
      const answeredAt = callConnectedAtRef.current ? (callAnsweredAtRef.current || new Date(callConnectedAtRef.current).toISOString()) : null;
      const endedAt = new Date().toISOString();

      const res = await api.post("/api/call/log", {
        receiverId: otherUserId,
        callType,
        status,
        duration,
        startedAt,
        answeredAt,
        endedAt,
      });

      if (res.data) {
        const currentSelected = useConversation.getState().selectedConversation;
        const currentSelectedId = currentSelected?._id;
        if (currentSelectedId && String(currentSelectedId) === String(otherUserId)) {
          useConversation.getState().addRealtimeMessage(res.data);
        }
        useConversation.getState().setLastMessage(otherUserId, res.data);
        useConversation.getState().bumpUserToTop(otherUserId);
      }
    } catch (err) {
      console.error("Failed to log call:", err);
    }
  };

  const processIceQueue = async () => {
    const pc = peerConnectionRef.current;
    if (pc && pc.remoteDescription && pc.remoteDescription.type && iceCandidatesQueue.current.length > 0) {
      for (const cand of iceCandidatesQueue.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.error("Error processing queued ICE candidate:", err);
        }
      }
      iceCandidatesQueue.current = [];
    }
  };

  // Audio tone generator for ringing
  const playRingtone = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioCtxRef.current = new AudioCtx();
      
      const ring = () => {
        if (!audioCtxRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, audioCtxRef.current.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime);
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.start();
        osc.stop(audioCtxRef.current.currentTime + 1.2);
      };

      ring();
      ringtoneIntervalRef.current = setInterval(ring, 2500);
    } catch (err) {
      console.log("Ringtone error:", err);
    }
  };

  const stopRingtone = () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  // Sync with global activeCall state from header click
  useEffect(() => {
    if (activeCall && activeCall.isInitiator && callState === "idle") {
      initiateCall(activeCall.userToCall, activeCall.callType);
    }
  }, [activeCall]);

  // Socket Listeners - stable subscription (doesn't tear down on callState change)
  useEffect(() => {
    if (!socket) return;

    // Incoming Call Handler
    socket.on("incoming-call", ({ signal, from, callerName, callerAvatar, callType }) => {
      if (callStateRef.current !== "idle") return; // busy
      setCallState("incoming");
      setActiveCall({
        isIncoming: true,
        callerId: from,
        callerName,
        callerAvatar,
        callType,
        signal,
      });
      playRingtone();
    });

    // Call Accepted Handler
    socket.on("call-accepted", async ({ signal }) => {
      stopRingtone();
      clearRingTimeout();
      callAnsweredAtRef.current = new Date().toISOString();
      setCallState("connected");
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(signal)
          );
          await processIceQueue();
        } catch (err) {
          console.error("Error setting remote description:", err);
        }
      }
    });

    // Call Rejected Handler
    socket.on("call-rejected", () => {
      stopRingtone();
      clearRingTimeout();
      recordCallLog("declined", 0);
      toast.error("Call was declined");
      cleanupCall();
    });

    // ICE Candidate Handler
    socket.on("ice-candidate", async ({ candidate }) => {
      if (candidate) {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error adding ICE candidate:", err);
          }
        } else {
          iceCandidatesQueue.current.push(candidate);
        }
      }
    });

    // Remote Camera Toggle Signal
    socket.on("remote-toggle-camera", ({ videoEnabled }) => {
      setIsRemoteVideoDisabled(!videoEnabled);
    });

    // Remote Audio Toggle Signal
    socket.on("remote-toggle-audio", ({ audioEnabled }) => {
      setIsRemoteAudioMuted(!audioEnabled);
    });

    // Call Ended Handler
    socket.on("call-ended", () => {
      stopRingtone();
      clearRingTimeout();
      recordCallLog();
      toast("Call ended", { icon: "📞" });
      cleanupCall();
    });

    return () => {
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("call-rejected");
      socket.off("ice-candidate");
      socket.off("remote-toggle-camera");
      socket.off("remote-toggle-audio");
      socket.off("call-ended");
    };
  }, [socket]);

  // Generate a fallback video stream using canvas if hardware camera is busy/locked by another tab
  const createCanvasVideoStream = (label = "User Video") => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    let angle = 0;
    const draw = () => {
      angle += 0.04;
      // Dark gradient background
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#1e1b4b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Animated glowing circle
      const radius = 55 + Math.sin(angle) * 8;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2 - 20, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#6366f1";
      ctx.shadowColor = "#818cf8";
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      // User label & text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("📹 " + label, canvas.width / 2, canvas.height / 2 + 65);
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#a5b4fc";
      ctx.fillText("(Camera active - Shared Device Feed)", canvas.width / 2, canvas.height / 2 + 95);

      requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    return canvasStream.getVideoTracks()[0];
  };

  // Peer Connection Setup
  const createPeerConnection = (targetUserId) => {
    const pc = new RTCPeerConnection(getIceConfiguration());

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("ice-candidate", { to: targetUserId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      let stream = event.streams[0];
      if (!stream) {
        stream = new MediaStream();
        stream.addTrack(event.track);
      }
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // Get Media Stream with robust fallback & virtual video feed handling
  const getMedia = async (callType) => {
    let audioTrack = null;
    let videoTrack = null;

    // 1. Try real hardware audio
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioTrack = audioStream.getAudioTracks()[0];
    } catch (err) {
      console.warn("Could not get hardware mic, creating silent audio track:", err);
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        audioTrack = dst.stream.getAudioTracks()[0];
        setIsAudioMuted(true);
      } catch (e) {
        console.warn("Silent audio track fallback failed:", e);
      }
    }

    // 2. If video call, try hardware camera, fallback to virtual video stream if camera is busy (2 tabs on 1 PC)
    if (callType === "video") {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoTrack = videoStream.getVideoTracks()[0];
        setIsVideoDisabled(false);
      } catch (err) {
        console.warn("Hardware camera in use by another tab/process, providing virtual video feed:", err);
        videoTrack = createCanvasVideoStream(authUser?.user?.fullname || "User");
        setIsVideoDisabled(false);
      }
    }

    const tracks = [];
    if (audioTrack) tracks.push(audioTrack);
    if (videoTrack) tracks.push(videoTrack);

    const combinedStream = new MediaStream(tracks);
    localStreamRef.current = combinedStream;
    setLocalStream(combinedStream);
    return combinedStream;
  };

  // Initiate Outgoing Call
  const initiateCall = async (targetUser, callType) => {
    try {
      callStartedAtRef.current = new Date().toISOString();
      setCallState("calling");
      playRingtone();

      const stream = await getMedia(callType);
      const pc = createPeerConnection(targetUser._id);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call-user", {
        userToCall: targetUser._id,
        signalData: offer,
        from: authUser.user._id,
        callerName: authUser.user.fullname,
        callerAvatar: authUser.user.avatar,
        callType,
      });
    } catch (err) {
      console.error("Error initiating call:", err);
      cleanupCall();
    }
  };

  // Accept Incoming Call
  const acceptCall = async () => {
    stopRingtone();
    if (!activeCall) return;

    try {
      setCallState("connected");
      const stream = await getMedia(activeCall.callType);
      const pc = createPeerConnection(activeCall.callerId);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(activeCall.signal));
      await processIceQueue();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer-call", {
        to: activeCall.callerId,
        signal: answer,
      });
    } catch (err) {
      console.error("Error accepting call:", err);
      cleanupCall();
    }
  };

  // Reject Incoming Call
  const rejectCall = () => {
    stopRingtone();
    if (activeCall && socket) {
      socket.emit("reject-call", { to: activeCall.callerId });
    }
    cleanupCall();
  };

  // End Current Call
  const endCall = () => {
    stopRingtone();
    clearRingTimeout();
    recordCallLog();
    const targetId = activeCall?.callerId || activeCall?.userToCall?._id;
    if (targetId && socket) {
      socket.emit("end-call", { to: targetId });
    }
    toast("Call ended", { icon: "📞" });
    cleanupCall();
  };

  // Toggle Mute Audio
  const toggleMuteAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMuted = !audioTrack.enabled;
        setIsAudioMuted(newMuted);

        const targetId = activeCall?.callerId || activeCall?.userToCall?._id;
        if (targetId && socket) {
          socket.emit("toggle-audio", { to: targetId, audioEnabled: audioTrack.enabled });
        }
      }
    }
  };

  // Toggle Video Camera
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newDisabled = !videoTrack.enabled;
        setIsVideoDisabled(newDisabled);

        const targetId = activeCall?.callerId || activeCall?.userToCall?._id;
        if (targetId && socket) {
          socket.emit("toggle-camera", { to: targetId, videoEnabled: videoTrack.enabled });
        }
      }
    }
  };

  // Cleanup Resources
  const cleanupCall = () => {
    stopRingtone();
    clearRingTimeout();
    callConnectedAtRef.current = null;
    callStartedAtRef.current = null;
    callAnsweredAtRef.current = null;
    callLoggedRef.current = false;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    remoteStreamRef.current = null;
    iceCandidatesQueue.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCallState("idle");
    setActiveCall(null);
    setIsAudioMuted(false);
    setIsVideoDisabled(false);
    setIsRemoteVideoDisabled(false);
    setIsRemoteAudioMuted(false);
    setIsSwapped(false);
    setCallDuration(0);
  };

  if (callState === "idle" && !activeCall) return null;

  const isVideoCall = activeCall?.callType === "video";
  const callerName = activeCall?.callerName || activeCall?.userToCall?.fullname || "User";
  const callerAvatar = activeCall?.callerAvatar || activeCall?.userToCall?.avatar;
  const myName = authUser?.user?.fullname || "You";
  const myAvatar = authUser?.user?.avatar;

  // Streams mapping based on isSwapped state
  const mainStream = isSwapped ? localStream : (remoteStream || localStream);
  const pipStream = isSwapped ? (remoteStream || localStream) : localStream;

  const mainIsVideoDisabled = isSwapped ? isVideoDisabled : (remoteStream ? isRemoteVideoDisabled : isVideoDisabled);
  const pipIsVideoDisabled = isSwapped ? (remoteStream ? isRemoteVideoDisabled : isVideoDisabled) : isVideoDisabled;

  const mainName = isSwapped ? myName : callerName;
  const mainAvatar = isSwapped ? myAvatar : callerAvatar;
  const pipName = isSwapped ? callerName : myName;
  const pipAvatar = isSwapped ? callerAvatar : myAvatar;

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none">
      {/* INCOMING CALL MODAL */}
      {callState === "incoming" && (
        <div className="w-full max-w-sm p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl text-center space-y-6 animate-scale-up">
          <div className="relative inline-block">
            <span className="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping"></span>
            <img
              src={callerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${callerName}`}
              alt={callerName}
              className="w-24 h-24 rounded-full mx-auto object-cover ring-2 ring-white/90 shadow-xl relative z-10"
            />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">{callerName}</h3>
            <p className="text-sm text-indigo-400 font-medium capitalize mt-1">
              Incoming {activeCall?.callType} Call...
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 pt-2">
            <button
              onClick={rejectCall}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition transform active:scale-90"
              title="Decline"
            >
              <FiPhoneOff className="text-2xl" />
            </button>
            <button
              onClick={acceptCall}
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/40 transition transform active:scale-90 animate-bounce"
              title="Accept"
            >
              {isVideoCall ? <FiVideo className="text-2xl" /> : <FiPhone className="text-2xl" />}
            </button>
          </div>
        </div>
      )}

      {/* OUTGOING CALLING MODAL */}
      {callState === "calling" && (
        <div className="w-full max-w-sm p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl text-center space-y-6 animate-fade-in relative overflow-hidden">
          {/* Live Camera Preview background if video call */}
          {isVideoCall && (
            <div className="absolute inset-0 z-0 opacity-20">
              <video
                ref={(el) => {
                  if (el && localStreamRef.current) el.srcObject = localStreamRef.current;
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
            </div>
          )}

          <div className="relative z-10 space-y-6">
            <div className="relative inline-block">
              <span className="absolute inset-0 rounded-full bg-violet-500/30 animate-pulse"></span>
              <img
                src={callerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${callerName}`}
                alt={callerName}
                className="w-24 h-24 rounded-full mx-auto object-cover ring-2 ring-white/90 shadow-xl relative z-10"
              />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">{callerName}</h3>
              <p className="text-sm text-slate-400 font-medium capitalize mt-1">
                Calling ({activeCall?.callType} call)...
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white mx-auto flex items-center justify-center shadow-lg shadow-rose-600/40 transition transform active:scale-90"
              >
                <FiPhoneOff className="text-2xl" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE CONNECTED CALL SCREEN */}
      {callState === "connected" && (
        <div className="w-full max-w-4xl h-[80vh] rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col overflow-hidden relative">
          {/* Remote Audio Element for Voice & Video Calls */}
          <audio
            ref={(el) => {
              if (el && remoteStream) {
                el.srcObject = remoteStream;
                el.play().catch((err) => console.log("Remote audio autoplay error:", err));
              }
            }}
            autoPlay
            playsInline
          />

          {/* Main Video Screen (or Voice Avatar View) */}
          <div className="flex-1 bg-slate-950 relative flex items-center justify-center overflow-hidden">
            {/* Live Call Duration Floating Badge */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-slate-700/60 shadow-lg flex items-center gap-2 z-20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold tracking-wider text-slate-100 font-mono">
                {formatTimer(callDuration)}
              </span>
            </div>

            {isVideoCall ? (
              mainIsVideoDisabled ? (
                /* Camera Turned Off Screen for Main View */
                <div className="text-center space-y-4 z-10 animate-fade-in">
                  <div className="relative inline-block">
                    <img
                      src={mainAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${mainName}`}
                      alt={mainName}
                      className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-indigo-500/50 shadow-2xl"
                    />
                    <span className="absolute bottom-0 right-0 p-2 bg-slate-800 border-2 border-slate-900 rounded-full text-rose-400 text-lg shadow-lg">
                      <FiVideoOff />
                    </span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">{mainName}</h3>
                    <p className="text-xs text-rose-400 font-semibold uppercase tracking-wider mt-1">
                      Camera Turned Off
                    </p>
                  </div>
                </div>
              ) : (
                <video
                  ref={(el) => {
                    if (el && mainStream) {
                      el.srcObject = mainStream;
                      el.play().catch((err) => console.log("Main video play error:", err));
                    }
                  }}
                  autoPlay
                  playsInline
                  muted // main audio played by dedicated audio element above
                  className={`w-full h-full object-cover ${isSwapped ? "mirror" : ""}`}
                />
              )
            ) : (
              <div className="text-center space-y-4">
                <img
                  src={callerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${callerName}`}
                  alt={callerName}
                  className="w-32 h-32 rounded-full mx-auto object-cover ring-2 ring-white/90 shadow-2xl animate-pulse"
                />
                <h3 className="text-2xl font-bold text-white">{callerName}</h3>
                <p className="text-sm text-emerald-400 font-medium font-mono">
                  Connected • {formatTimer(callDuration)}
                </p>
              </div>
            )}

            {/* Top-Right PiP Box (Small View) - Click to Swap! */}
            {isVideoCall && (
              <div
                onClick={() => setIsSwapped(!isSwapped)}
                className="absolute top-4 right-4 w-48 h-36 rounded-2xl overflow-hidden border-2 border-indigo-500/60 shadow-2xl bg-slate-900/90 z-20 cursor-pointer group hover:border-indigo-400 transition"
                title="Click to Swap Big & Small Camera View"
              >
                {pipIsVideoDisabled ? (
                  /* Camera Turned Off Screen for PiP View */
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900">
                    <img
                      src={pipAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${pipName}`}
                      alt={pipName}
                      className="w-12 h-12 rounded-full object-cover ring-[1.5px] ring-white/85 mb-1"
                    />
                    <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                      <FiVideoOff /> Camera Off
                    </span>
                  </div>
                ) : (
                  <video
                    ref={(el) => {
                      if (el && pipStream) {
                        el.srcObject = pipStream;
                        el.play().catch((err) => console.log("PiP video play error:", err));
                      }
                    }}
                    autoPlay
                    playsInline
                    muted={!isSwapped} // mute local stream audio in PiP
                    className={`w-full h-full object-cover ${!isSwapped ? "mirror" : ""}`}
                  />
                )}

                {/* Hover Swap Indicator */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white font-bold text-xs backdrop-blur-[2px] transition">
                  <FiRepeat className="text-base" /> Swap View
                </div>
              </div>
            )}
          </div>

          {/* Call Controls HUD Bar */}
          <div className="p-6 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 flex items-center justify-center gap-5">
            {/* Audio Mute Toggle */}
            <button
              onClick={toggleMuteAudio}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition ${
                isAudioMuted
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  : "bg-slate-800 hover:bg-slate-700 text-white"
              }`}
              title={isAudioMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isAudioMuted ? <FiMicOff className="text-xl" /> : <FiMic className="text-xl" />}
            </button>

            {/* Video Camera Toggle */}
            {isVideoCall && (
              <button
                onClick={toggleVideo}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition ${
                  isVideoDisabled
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                    : "bg-slate-800 hover:bg-slate-700 text-white"
                }`}
                title={isVideoDisabled ? "Turn On Camera" : "Turn Off Camera"}
              >
                {isVideoDisabled ? <FiVideoOff className="text-xl" /> : <FiVideo className="text-xl" />}
              </button>
            )}

            {/* Swap Big & Small Camera View Toggle */}
            {isVideoCall && (
              <button
                onClick={() => setIsSwapped(!isSwapped)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition ${
                  isSwapped
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "bg-slate-800 hover:bg-slate-700 text-white"
                }`}
                title="Swap Camera Screens (Big & Small)"
              >
                <FiRepeat className="text-xl" />
              </button>
            )}

            {/* End Call Button */}
            <button
              onClick={endCall}
              className="w-14 h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition transform active:scale-90"
              title="End Call"
            >
              <FiPhoneOff className="text-2xl" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CallModal;
