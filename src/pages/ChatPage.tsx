// src/pages/ChatPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { connectSocket, getSocket } from "../api/socket";

type Conversation = {
  id: number;
  userA: { id: number; email: string };
  userB: { id: number; email: string };
  lastMessage?: { content: string; createdAt: string };
};

type Message = {
  id: number;
  content: string;
  senderId: number;
  conversationId: number;
  createdAt: string;
  type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO";
};

type User = { id: number; email: string };

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  const navigate = useNavigate();
  const msgInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const me = useMemo(() => {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as User) : null;
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // Initial data + sockets for status + new messages
  useEffect(() => {
    api("/api/conversations").then(setConversations);
    api("/api/users").then(setUsers);

    const token = localStorage.getItem("token");
    if (!token || !me) return;

    const socket = connectSocket(token);
    socket.emit("user_connected", me);

    socket.on("user_status", ({ userId, status }: { userId: number; status: "online" | "offline" }) => {
      setOnlineUsers((prev) => {
        if (status === "online" && !prev.includes(userId)) return [...prev, userId];
        if (status === "offline") return prev.filter((id) => id !== userId);
        return prev;
      });
    });

    socket.on("new_message", (msg: Message) => {
      // Mettre à jour le lastMessage côté liste
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId
            ? { ...c, lastMessage: { content: msg.content, createdAt: msg.createdAt } }
            : c
        )
      );
      // Ajouter dans le panneau actif sans doublon
      if (active?.id === msg.conversationId) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === msg.id);
          return exists ? prev : [...prev, msg];
        });
        scrollToBottom();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [me, active]);

  // Load messages when conversation changes + typing indicators
  useEffect(() => {
    if (!active) return;

    api(`/api/messages/${active.id}`).then((msgs: Message[]) => {
      setMessages(msgs);
      scrollToBottom();
    });

    const socket = getSocket();
    if (!socket) return;

    socket.emit("join_conversation", active.id);

    const typingHandler = ({ user: typingUser }: { user: User }) => {
      if (!me || typingUser.email === me.email) return;
      setTypingUsers((prev) => (prev.includes(typingUser.email) ? prev : [...prev, typingUser.email]));
    };
    const stopTypingHandler = ({ user: typingUser }: { user: User }) => {
      setTypingUsers((prev) => prev.filter((u) => u !== typingUser.email));
    };

    socket.on("typing", typingHandler);
    socket.on("stop_typing", stopTypingHandler);

    return () => {
      socket.emit("leave_conversation", active.id);
      socket.off("typing", typingHandler);
      socket.off("stop_typing", stopTypingHandler);
    };
  }, [active, me]);

  async function sendMessage(content: string) {
    if (!active) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    const msg: Message = await api(`/api/messages/${active.id}`, {
      method: "POST",
      body: JSON.stringify({ content: trimmed }),
    });

    // Dédupliquer côté client
    setMessages((prev) => {
      const exists = prev.some((m) => m.id === msg.id);
      return exists ? prev : [...prev, msg];
    });

    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id ? { ...c, lastMessage: { content: msg.content, createdAt: msg.createdAt } } : c
      )
    );
    scrollToBottom();
  }

  async function sendFile(file: File, type: "IMAGE" | "AUDIO" | "VIDEO") {
    if (!active) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const msg: Message = await api(`/api/messages/${active.id}/upload`, {
        method: "POST",
        body: formData,
      });
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        return exists ? prev : [...prev, msg];
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === active.id ? { ...c, lastMessage: { content: msg.content, createdAt: msg.createdAt } } : c
        )
      );
      scrollToBottom();
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function startConversation(email: string) {
    if (!email || !me || email === me.email) return;
    const conv: Conversation = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ participantEmail: email }),
    });
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === conv.id);
      return exists ? prev : [conv, ...prev];
    });
    setActive(conv);
  }

  function handleTyping() {
    const socket = getSocket();
    if (!socket || !active || !me) return;
    socket.emit("typing", { conversationId: active.id, user: me });
    clearTimeout((window as any).typingTimeout);
    (window as any).typingTimeout = setTimeout(() => {
      socket.emit("stop_typing", { conversationId: active.id, user: me });
    }, 1500);
  }

  function otherUser(conv: Conversation): User {
    if (!me) return { id: 0, email: "" };
    return conv.userA.id === me.id ? conv.userB : conv.userA;
  }

  function renderMessageContent(msg: Message) {
    console.log("DEBUG message reçu :", msg); 
    switch (msg.type) {
      case "TEXT":
        return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;

      case "IMAGE":
        return (
          <img
            src={msg.content}
            alt="image envoyée"
            className="max-w-xs rounded-lg"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        );

      case "AUDIO":
        return (
          <audio controls className="w-64">
            <source src={msg.content} type="audio/mpeg" />
            Votre navigateur ne supporte pas l’audio.
          </audio>
        );

      case "VIDEO":
        return (
          <video controls className="max-w-xs rounded-lg">
            <source src={msg.content} type="video/mp4" />
            Votre navigateur ne supporte pas la vidéo.
          </video>
        );

      default:
        return <div>Message non supporté</div>;
    }
  }


  function scrollToBottom() {
    requestAnimationFrame(() => {
      const container = document.getElementById("messages-container");
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  const filteredUsers = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-blue-600 text-white grid place-items-center font-bold">L</div>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-100">LigdiChat</span>
        </div>
        <button onClick={handleLogout} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700">
          Déconnexion
        </button>
      </header>

      <div className="flex flex-1">
        {/* Conversations */}
        <aside className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 flex flex-col">
          <div className="p-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Conversations</h3>
            <div className="space-y-1">
              {conversations.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">Aucune conversation pour l’instant.</div>
              )}
              {conversations.map((c) => {
                const other = otherUser(c);
                return (
                  <button
                    key={`conv-${c.id}`}
                    onClick={() => setActive(c)}
                    className={`w-full text-left p-3 rounded-lg transition ${
                      active?.id === c.id
                        ? "bg-blue-100 dark:bg-blue-700/40 font-semibold"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{other.email}</div>
                    {c.lastMessage && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {c.lastMessage.content}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Utilisateurs */}
        <aside className="w-72 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-700 dark:text-gray-200">Utilisateurs inscrits</h3>
            <div className="mt-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un email..."
                className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
              />
            </div>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto">
            {filteredUsers.length === 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">Aucun utilisateur trouvé.</div>
            )}
            {filteredUsers.map((u) => (
              <div key={`user-${u.id}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      onlineUsers.includes(u.id) ? "bg-green-500" : "bg-gray-400"
                    }`}
                    title={onlineUsers.includes(u.id) ? "En ligne" : "Hors ligne"}
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-100">{u.email}</span>
                </div>
                <button
                  onClick={() => startConversation(u.email)}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Démarrer
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Panneau de chat */}
        <main className="flex-1 flex flex-col">
          {active ? (
            <>
              {/* En-tête conversation */}
              <div className="border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Chat avec</div>
                  <div className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    {otherUser(active).email}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div id="messages-container" className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/40">
                {messages.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Aucun message pour cette conversation. Dis bonjour 👋
                    </div>
                  </div>
                )}

                {messages.map((m, index) => {
                  const mine = me && m.senderId === me.id;
                  return (
                    <div key={`msg-${m.id}-${index}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`px-3 py-2 rounded-2xl max-w-md shadow-sm ${
                          mine
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        {!mine && <div className="text-[11px] opacity-70 mb-1">Autre</div>}
                        {renderMessageContent(m)}
                        <div className={`text-[11px] mt-1 ${mine ? "opacity-80" : "text-gray-500 dark:text-gray-400"}`}>
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {typingUsers.length > 0 && (
                  <div className="italic text-gray-500 dark:text-gray-400 text-sm">
                    {typingUsers.join(", ")} est en train d’écrire...
                  </div>
                )}
              </div>

              {/* Composer */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = msgInputRef.current;
                  const value = input?.value.trim();
                  if (value) {
                    sendMessage(value);
                    if (input) input.value = "";
                  }
                }}
                className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    ref={msgInputRef}
                    name="msg"
                    placeholder="Écrire un message..."
                    onChange={handleTyping}
                    className="flex-1 px-4 py-2 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
                  />
                  <div className="flex items-center gap-2">
                    {/* Image */}
                    <label className="px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-sm cursor-pointer">
                      Image
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) sendFile(file, "IMAGE");
                        }}
                      />
                    </label>
                    {/* Audio */}
                    <label className="px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-sm cursor-pointer">
                      Audio
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) sendFile(file, "AUDIO");
                        }}
                      />
                    </label>
                    {/* Vidéo */}
                    <label className="px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-sm cursor-pointer">
                      Vidéo
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) sendFile(file, "VIDEO");
                        }}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={uploading}
                      className={`px-4 py-2 rounded-full ${
                        uploading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                      } text-white`}
                    >
                      {uploading ? "Envoi..." : "Envoyer"}
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <div className="text-lg font-semibold mb-1">Bienvenue 👋</div>
                <div className="text-sm">Sélectionne une conversation ou démarre une nouvelle.</div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
