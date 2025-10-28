// src/pages/ChatPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { connectSocket, getSocket } from "../api/socket";
import MessageBubble from "../components/MessageBubble";
import type { Message, Conversation, User } from "../types";

function useSmartScroll(containerId: string, deps: any[] = []) {
  const shouldScrollRef = useRef(true);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 100;
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (shouldScrollRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, deps);
}

export default function ChatPage() {
  // États
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // overlay mobile

  // Refs
  const navigate = useNavigate();
  const msgInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll intelligent
  useSmartScroll("messages-container", [messages]);

  // Utilisateur courant
  const me = useMemo(() => {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as User) : null;
  }, []);

  // Déconnexion
  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // Démarrer une conversation
  async function startConversation(email: string) {
    if (!email || !me || email === me.email) return;
    const conv: Conversation = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ participantEmail: email }),
    });
    setConversations((prev) => (prev.find((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    setActive(conv);
    setSidebarOpen(false);
  }

  // Initialisation des données + socket
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
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId ? { ...c, lastMessage: { content: msg.content, createdAt: msg.createdAt } } : c
        )
      );
      if (active?.id === msg.conversationId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    });

    socket.on("message_deleted", ({ id }: { id: number }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    return () => {
      socket.disconnect();
    };
  }, [me, active]);

  // Charger les messages quand la conversation change
  useEffect(() => {
    if (!active) return;

    api(`/api/messages/${active.id}`).then((msgs: Message[]) => {
      setMessages(msgs);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
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

  // Sécurité : scroll en bas quand messages changent
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Envoyer un message
  async function sendMessage(content: string) {
    if (!active) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    const msg: Message = await api(`/api/messages/${active.id}`, {
      method: "POST",
      body: JSON.stringify({ content: trimmed }),
    });

    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id ? { ...c, lastMessage: { content: msg.content, createdAt: msg.createdAt } } : c
      )
    );
  }

  // Envoyer un fichier
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

      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === active.id ? { ...c, lastMessage: { content: msg.content, createdAt: msg.createdAt } } : c
        )
      );
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  // Supprimer un message
  async function deleteMessage(id: number) {
    if (!active) return;
    const ok = window.confirm("Supprimer ce message ?");
    if (!ok) return;

    try {
      await api(`/api/messages/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Erreur suppression message:", err);
    }
  }

  // Indicateur de frappe
  function handleTyping() {
    const socket = getSocket();
    if (!socket || !active || !me) return;
    socket.emit("typing", { conversationId: active.id, user: me });
    clearTimeout((window as any).typingTimeout);
    (window as any).typingTimeout = setTimeout(() => {
      socket.emit("stop_typing", { conversationId: active.id, user: me });
    }, 1500);
  }

  // Autre participant
  function otherUser(conv: Conversation): User {
    if (!me) return { id: 0, email: "" };
    return conv.userA.id === me.id ? conv.userB : conv.userA;
  }

  // Filtrage utilisateurs
  const filteredUsers = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));

  // Rendu
  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* En-tête */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          {/* Bouton menu mobile */}
          <button
            className="md:hidden text-gray-700 dark:text-gray-200 text-2xl"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Ouvrir le menu"
          >
            ☰
          </button>
          <div className="h-8 w-8 rounded-full bg-blue-600 text-white grid place-items-center font-bold">L</div>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-100">LigdiChat</span>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 sm:px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
        >
          Déconnexion
        </button>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Overlay mobile : Conversations + Utilisateurs */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div className="w-72 bg-white dark:bg-gray-800 shadow-lg overflow-y-auto">
              {/* Conversations */}
              <div className="p-4 border-b dark:border-gray-700">
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-2">Conversations</h3>
                {conversations.length === 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Aucune conversation.</div>
                )}
                {conversations.map((c) => {
                  const other = otherUser(c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setActive(c);
                        setSidebarOpen(false);
                      }}
                      className={`block w-full text-left p-2 rounded ${
                        active?.id === c.id
                          ? "bg-blue-100 dark:bg-blue-700/40"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{other.email}</div>
                      {c.lastMessage && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {c.lastMessage.content}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Utilisateurs */}
              <div className="p-4">
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-2">Utilisateurs inscrits</h3>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full mb-3 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                />
                {filteredUsers.length === 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Aucun utilisateur.</div>
                )}
                {filteredUsers.map((u) => (
                  <div key={u.id} className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-800 dark:text-gray-100">{u.email}</span>
                    <button
                      onClick={() => {
                        startConversation(u.email);
                        setSidebarOpen(false);
                      }}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Démarrer
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* Zone clic pour fermer */}
            <div className="flex-1 bg-black bg-opacity-50" onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* Colonne 1 (PC) : Conversations */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-2">Conversations</h3>
            {conversations.length === 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">Aucune conversation.</div>
            )}
            <div className="space-y-1">
              {conversations.map((c) => {
                const other = otherUser(c);
                return (
                  <button
                    key={c.id}
                    onClick={() => setActive(c)}
                    className={`block w-full text-left p-2 rounded ${
                      active?.id === c.id
                        ? "bg-blue-100 dark:bg-blue-700/40"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{other.email}</div>
                    {c.lastMessage && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {c.lastMessage.content}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Colonne 2 (PC) : Utilisateurs inscrits */}
        <aside className="hidden lg:flex lg:flex-col lg:w-72 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-700 dark:text-gray-200">Utilisateurs inscrits</h3>
            <div className="mt-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
              />
            </div>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto">
            {filteredUsers.length === 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">Aucun utilisateur.</div>
            )}
            {filteredUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
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
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Démarrer
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Colonne 3 : Chat */}
        <main className="flex-1 flex flex-col">
          {active ? (
            <>
              {/* En-tête de la conversation */}
              <div className="border-b border-gray-200 dark:border-gray-800 p-3 sm:p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400">Chat avec</div>
                <div className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {otherUser(active).email}
                </div>
              </div>

              {/* Messages */}
              <div
                id="messages-container"
                className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3 bg-gray-50 dark:bg-gray-900/40"
                style={{ scrollBehavior: "smooth" }}
              >
                {messages.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Aucun message pour cette conversation. Dis bonjour 👋
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} currentUserId={me?.id ?? 0} onDelete={deleteMessage} />
                ))}

                {typingUsers.length > 0 && (
                  <div className="italic text-gray-500 dark:text-gray-400 text-sm">
                    {typingUsers.join(", ")} est en train d’écrire...
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Compositeur */}
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
                className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 p-2 sm:p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    ref={msgInputRef}
                    name="msg"
                    placeholder="Écrire un message..."
                    onChange={handleTyping}
                    className="flex-1 px-3 py-2 text-sm sm:text-base rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
                  />
                  <div className="flex items-center gap-2">
                    {/* Image */}
                    <label className="px-2 sm:px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-xs sm:text-sm cursor-pointer">
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
                    <label className="px-2 sm:px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-xs sm:text-sm cursor-pointer">
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
                    <label className="px-2 sm:px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-xs sm:text-sm cursor-pointer">
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
                      className={`px-3 sm:px-4 py-2 rounded-full ${
                        uploading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                      } text-white text-sm sm:text-base`}
                    >
                      {uploading ? "Envoi..." : "Envoyer"}
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            // Écran d’accueil
            <div className="flex-1 grid place-items-center text-gray-500 dark:text-gray-400 p-6">
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold">Bienvenue 👋</div>
                <div className="text-sm">
                  Sélectionne une conversation dans la liste ou démarre une nouvelle depuis “Utilisateurs inscrits”.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}