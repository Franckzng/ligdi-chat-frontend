// src/components/MessageBubble.tsx
import { useMemo } from "react";
import type { Message } from "../types";

type Props = {
  msg: Message;
  currentUserId: number;
  onDelete: (id: number) => void;
};

export default function MessageBubble({ msg, currentUserId, onDelete }: Props) {
  const mine = useMemo(() => msg.senderId === currentUserId, [msg, currentUserId]);

  const renderContent = () => {
    switch (msg.type) {
      case "TEXT":
        return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
      case "IMAGE":
        return <img src={msg.content} alt="image" className="max-w-full sm:max-w-xs md:max-w-sm rounded-lg" />;
      case "AUDIO":
        return (
          <audio controls className="w-48 sm:w-64">
            <source src={msg.content} type="audio/mpeg" />
          </audio>
        );
      case "VIDEO":
        return (
          <video controls className="max-w-full sm:max-w-xs md:max-w-sm rounded-lg">
            <source src={msg.content} type="video/mp4" />
          </video>
        );
      default:
        return <div>Message non supporté</div>;
    }
  };

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`px-3 py-2 rounded-2xl shadow-sm relative group
          max-w-[85%] sm:max-w-[75%] md:max-w-md
          ${mine
            ? "bg-blue-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
          }`}
      >
        {renderContent()}
        <div className={`text-[11px] mt-1 ${mine ? "opacity-80" : "text-gray-500 dark:text-gray-400"}`}>
          {new Date(msg.createdAt).toLocaleTimeString()}
        </div>
        {mine && (
          <button
            onClick={() => onDelete(msg.id)}
            className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition
                       bg-red-600 text-white text-xs px-2 py-1 rounded-full shadow hover:bg-red-700"
            title="Supprimer"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}
