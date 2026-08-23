import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  FiSmile,
  FiUser,
  FiFeather,
  FiCoffee,
  FiActivity,
  FiHeart,
  FiSearch,
  FiX,
} from "react-icons/fi";

const EMOJI_CATEGORIES = [
  {
    id: "smileys",
    name: "Smileys & Emotion",
    icon: FiSmile,
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "🥹",
      "☺️", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘",
      "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐",
      "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟",
      "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭",
      "😮‍💨", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱",
      "😨", "😰", "😥", "😓", "🫣", "🤗", "🫡", "🤔", "🫢", "🤭",
      "🤫", "🤥", "😶", "😐", "😑", "😬", "🫠", "🙄", "😯", "😦",
      "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "😵‍💫", "🫥",
      "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠",
      "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽",
      "👾", "🤖", "🎃"
    ],
  },
  {
    id: "people",
    name: "People & Gestures",
    icon: FiUser,
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌",
      "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
      "👆", "🖕", "👇", "☝️", "🫵", "👍", "👎", "✊", "👊", "🤛",
      "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "✍️", "💅",
      "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "👀",
      "👁️", "👅", "👄", "💋", "👶", "🧒", "👦", "👧", "🧑", "👱",
      "👨", "🧔", "👩", "🧓", "👴", "👵", "👮", "👷", "💂", "🕵️",
      "🧑‍⚕️", "🧑‍🌾", "🧑‍🍳", "🧑‍🎓", "🧑‍🎤", "🧑‍🏫", "🧑‍💻", "🧑‍🎨", "🧑‍🚀", "👸",
      "🤴", "🦸", "🦹", "🧙", "🧚", "🧛", "🧜", "🧝", "🧞", "🧟"
    ],
  },
  {
    id: "nature",
    name: "Animals & Nature",
    icon: FiFeather,
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨",
      "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒",
      "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗",
      "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦗", "🕷️",
      "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞",
      "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🦭", "🐊",
      "🐅", "🐆", "🦓", "🦍", "🐘", "🦛", "🦏", "🐪", "🦒", "🦘",
      "🐎", "🐕", "🐈", "🌲", "🌳", "🌴", "🌱", "🌿", "🍀", "🎍",
      "🍃", "🍂", "🍁", "🍄", "🌾", "💐", "🌷", "🌹", "🌻", "🌸",
      "🌞", "🌝", "🌛", "⭐", "🌟", "✨", "⚡", "🔥", "🌈", "☀️",
      "⛅", "🌧️", "❄️", "☃️", "🌊"
    ],
  },
  {
    id: "food",
    name: "Food & Drink",
    icon: FiCoffee,
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐",
      "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦",
      "🥒", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🥐", "🥯", "🍞",
      "🥖", "🥨", "🧀", "🥚", "🍳", "🥞", "🧇", "🥓", "🥩", "🍗",
      "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🌮", "🌯", "🥗", "🥘",
      "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🍤", "🍙", "🍚",
      "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬",
      "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "☕", "🍵",
      "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🍸", "🍹"
    ],
  },
  {
    id: "activity",
    name: "Activities & Sports",
    icon: FiActivity,
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱",
      "🪀", "🏓", "🏸", "🏒", "🏑", "🏏", "🥊", "🥋", "🛹", "🛼",
      "🎿", "🏂", "🏋️", "🤺", "🏇", "🏄", "🏊", "🧗", "🚴", "🏆",
      "🥇", "🥈", "🥉", "🏅", "🎖️", "🎫", "🎟️", "🎪", "🎨", "🎬",
      "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸", "🎻", "🎲",
      "♟️", "🎯", "🎳", "🎮", "🎰", "🧩", "🚗", "🏎️", "🚓", "🚑",
      "🚒", "🛵", "🏍️", "🚲", "🛴", "✈️", "🚀", "🛸", "⛵", "🚢"
    ],
  },
  {
    id: "hearts",
    name: "Hearts & Symbols",
    icon: FiHeart,
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝",
      "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "☯️", "🛐", "♈",
      "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒",
      "♓", "🆔", "⚛️", "✴️", "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵",
      "🅰️", "🅱️", "🆎", "🅾️", "🆘", "❌", "⭕", "🛑", "⛔", "🚫",
      "💯", "💢", "♨️", "❗", "❕", "❓", "❔", "‼️", "⁉️", "⚠️",
      "🔰", "♻️", "✅", "❇️", "✳️", "❎", "🌐", "💠", "💤", "🏧",
      "🚾", "♿", "🅿️", "💡", "💰", "💎", "🔒", "🔓", "🔑", "🔔"
    ],
  },
];

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

function EmojiPicker({ onSelect, onClose, className = "absolute bottom-16 left-0", triggerRef = null }) {
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [searchQuery, setSearchQuery] = useState("");
  const pickerRef = useRef(null);

  // Close on outside click (ignoring trigger button)
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target) &&
        (!triggerRef || (triggerRef.current && !triggerRef.current.contains(e.target)))
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose, triggerRef]);

  // Filter emojis if search query is entered
  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    return Array.from(new Set(all));
  }, [searchQuery]);

  const currentCategoryObj = EMOJI_CATEGORIES.find(
    (c) => c.id === activeCategory
  ) || EMOJI_CATEGORIES[0];

  return (
    <div
      ref={pickerRef}
      className={`z-50 w-72 sm:w-80 max-h-96 rounded-2xl bg-[#1e2a30]/95 border border-[#2a3942] shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-wa-popup-bottom ${className}`}
    >
      {/* Search Header & Quick Reactions */}
      <div className="p-2.5 border-b border-[#2a3942]/70 space-y-2 bg-[#182229]/60">
        <div className="relative flex items-center">
          <FiSearch className="absolute left-3 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Search emojis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#111b21] border border-[#26343d] text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-slate-200"
            >
              <FiX className="text-xs" />
            </button>
          )}
        </div>

        {/* Quick Reaction Bar */}
        {!searchQuery && (
          <div className="flex items-center justify-between px-1">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelect(emoji)}
                className="w-7 h-7 flex items-center justify-center text-lg hover:scale-125 transition-transform duration-150 rounded-lg hover:bg-slate-700/50"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category Tabs */}
      {!searchQuery && (
        <div className="flex items-center justify-around px-1 py-1.5 border-b border-[#2a3942]/60 bg-[#162026]/80">
          {EMOJI_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const isActive = activeCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                title={category.name}
                className={`p-1.5 rounded-xl transition ${
                  isActive
                    ? "text-indigo-400 bg-indigo-500/15"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
                }`}
              >
                <Icon className="text-base" />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid Area */}
      <div className="flex-1 overflow-y-auto p-2.5 custom-scrollbar max-h-60">
        {searchQuery ? (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 mb-2 px-1">
              Search Results
            </p>
            <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5">
              {filteredEmojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-xl hover:scale-125 hover:bg-slate-700/60 rounded-xl transition duration-150 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 mb-2 px-1">
              {currentCategoryObj.name}
            </p>
            <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5">
              {currentCategoryObj.emojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-xl hover:scale-125 hover:bg-slate-700/60 rounded-xl transition duration-150 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmojiPicker;
