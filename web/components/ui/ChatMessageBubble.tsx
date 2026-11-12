import type { ChatMessageDTO } from "@rozenblum/shared";

export default function ChatMessageBubble({ message }: { message: ChatMessageDTO }) {
  const own = message.from === "me";
  const staff = message.authorRole !== "alumno";
  return (
    <div className={`flex min-w-0 flex-col ${own ? "items-end" : "items-start"}`}>
      <div className="mb-1 flex max-w-[90%] flex-wrap items-baseline gap-x-2 px-1 text-[11px]">
        <span className="font-semibold" style={{ color: staff ? "#8A6529" : "#173B6C" }}>
          {message.authorName}
        </span>
        <time dateTime={message.createdAt} style={{ color: "rgba(23,59,108,0.55)" }}>
          {message.time}
        </time>
      </div>
      <div className="max-w-[90%] break-words rounded-lg px-4 py-3 text-sm leading-relaxed"
        style={staff
          ? { backgroundColor: "#B58A43", color: "#FFFFFF" }
          : { backgroundColor: "#E8EDF3", color: "#173B6C" }}>
        {message.text}
      </div>
    </div>
  );
}
