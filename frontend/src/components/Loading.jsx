import React from "react";

function Loading({ isGroup = false }) {
  return (
    <div className="flex-1 flex flex-col justify-end space-y-3.5 py-4 px-2 animate-pulse select-none min-h-[350px]">
      {/* ── Incoming Message Skeleton 1 (Left - Emerald Member) ───────────── */}
      <div className="flex items-start gap-1.5 max-w-[75%] sm:max-w-[60%]">
        {isGroup && (
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40 border border-slate-700/80 flex-shrink-0 mt-0.5" />
        )}
        <div className="relative space-y-2 px-3.5 py-2.5 rounded-2xl rounded-tl-none bg-[#202c33] shadow-sm w-56">
          {/* Top-Left SVG Tail */}
          <svg
            viewBox="0 0 8 13"
            width="8"
            height="13"
            className="absolute -left-[6px] top-0 text-[#202c33] fill-current z-10 transform -scale-x-100"
          >
            <path d="M6.467 2.568L0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
          </svg>

          {isGroup && <div className="h-2.5 bg-emerald-400/40 rounded w-20 mb-1" />}
          <div className="h-3 bg-slate-600/50 rounded w-36" />
          <div className="h-2 bg-slate-600/30 rounded w-12 ml-auto" />
        </div>
      </div>

      {/* ── Outgoing Message Skeleton (Right - Current User, No Avatar) ───── */}
      <div className="flex items-start justify-end max-w-[75%] sm:max-w-[60%] ml-auto">
        <div className="relative space-y-2 px-3.5 py-2.5 rounded-2xl rounded-tr-none bg-[#005c4b] shadow-sm w-64">
          {/* Top-Right SVG Tail */}
          <svg
            viewBox="0 0 8 13"
            width="8"
            height="13"
            className="absolute -right-[6px] top-0 text-[#005c4b] fill-current z-10"
          >
            <path d="M6.467 2.568L0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
          </svg>

          <div className="h-3 bg-emerald-300/30 rounded w-48" />
          <div className="h-3 bg-emerald-300/20 rounded w-32" />
          <div className="h-2 bg-emerald-300/25 rounded w-14 ml-auto" />
        </div>
      </div>

      {/* ── Incoming Message Skeleton 2 (Left - Amber Member) ─────────────── */}
      <div className="flex items-start gap-1.5 max-w-[75%] sm:max-w-[60%]">
        {isGroup && (
          <div className="w-7 h-7 rounded-full bg-amber-500/20 ring-2 ring-amber-500/40 border border-slate-700/80 flex-shrink-0 mt-0.5" />
        )}
        <div className="relative space-y-2 px-3.5 py-2.5 rounded-2xl rounded-tl-none bg-[#202c33] shadow-sm w-44">
          {/* Top-Left SVG Tail */}
          <svg
            viewBox="0 0 8 13"
            width="8"
            height="13"
            className="absolute -left-[6px] top-0 text-[#202c33] fill-current z-10 transform -scale-x-100"
          >
            <path d="M6.467 2.568L0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
          </svg>

          {isGroup && <div className="h-2.5 bg-amber-400/40 rounded w-16 mb-1" />}
          <div className="h-3 bg-slate-600/50 rounded w-28" />
          <div className="h-2 bg-slate-600/30 rounded w-12 ml-auto" />
        </div>
      </div>

      {/* ── Outgoing Message Skeleton 2 (Right - Current User, No Avatar) ─── */}
      <div className="flex items-start justify-end max-w-[75%] sm:max-w-[60%] ml-auto">
        <div className="relative space-y-2 px-3.5 py-2.5 rounded-2xl rounded-tr-none bg-[#005c4b] shadow-sm w-72">
          {/* Top-Right SVG Tail */}
          <svg
            viewBox="0 0 8 13"
            width="8"
            height="13"
            className="absolute -right-[6px] top-0 text-[#005c4b] fill-current z-10"
          >
            <path d="M6.467 2.568L0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
          </svg>

          <div className="h-3 bg-emerald-300/30 rounded w-56" />
          <div className="h-3 bg-emerald-300/20 rounded w-40" />
          <div className="h-2 bg-emerald-300/25 rounded w-14 ml-auto" />
        </div>
      </div>

      {/* ── Incoming Message Skeleton 3 (Left - Violet Member) ────────────── */}
      <div className="flex items-start gap-1.5 max-w-[75%] sm:max-w-[60%]">
        {isGroup && (
          <div className="w-7 h-7 rounded-full bg-violet-500/20 ring-2 ring-violet-500/40 border border-slate-700/80 flex-shrink-0 mt-0.5" />
        )}
        <div className="relative space-y-2 px-3.5 py-2.5 rounded-2xl rounded-tl-none bg-[#202c33] shadow-sm w-52">
          {/* Top-Left SVG Tail */}
          <svg
            viewBox="0 0 8 13"
            width="8"
            height="13"
            className="absolute -left-[6px] top-0 text-[#202c33] fill-current z-10 transform -scale-x-100"
          >
            <path d="M6.467 2.568L0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
          </svg>

          {isGroup && <div className="h-2.5 bg-violet-400/40 rounded w-20 mb-1" />}
          <div className="h-3 bg-slate-600/50 rounded w-36" />
          <div className="h-2 bg-slate-600/30 rounded w-12 ml-auto" />
        </div>
      </div>
    </div>
  );
}

export default Loading;