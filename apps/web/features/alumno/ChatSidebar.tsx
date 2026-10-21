"use client";

import type { ChatMessage } from "../../types";

type ChatSidebarProps = {
  messages: ChatMessage[];
  chatMsg: string;
  onChatMsgChange: (val: string) => void;
  onSend: () => void;
};

export default function ChatSidebar({ messages, chatMsg, onChatMsgChange, onSend }: ChatSidebarProps) {
  return (
    <aside className="w-80 flex-shrink-0 flex flex-col" style={{ backgroundColor: "#FFFFFF", borderLeft: "2px solid #B58A43" }}>
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(23,59,108,0.08)" }}>
        <h4 className="text-lg font-semibold" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Contactar al Profesor</h4>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.from === "me" ? "items-end" : "items-start"}`}>
            <div
              className="px-4 py-3 text-sm leading-relaxed max-w-[90%] rounded-lg"
              style={msg.from === "me"
                ? { backgroundColor: "#B58A43", color: "#FAF8F5" }
                : { backgroundColor: "#F0F0F0", color: "#173B6C" }}
            >
              {msg.text}
            </div>
            <p className="text-[10px] mt-1 px-1" style={{ color: "rgba(23,59,108,0.45)" }}>{msg.time}</p>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-4 flex items-center gap-2" style={{ borderTop: "1px solid #E0E0E0" }}>
        <input
          value={chatMsg}
          onChange={(e) => onChatMsgChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Escribe tu pregunta..."
          className="flex-1 px-3 py-2.5 text-sm outline-none rounded transition-all duration-200"
          style={{ border: "1px solid #E0E0E0", fontFamily: "'Roboto', sans-serif", color: "#173B6C" }}
          onFocus={(e) => (e.target.style.border = "2px solid #B58A43")}
          onBlur={(e) => (e.target.style.border = "1px solid #E0E0E0")}
        />
        <button
          onClick={onSend}
          className="w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-105"
          style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
