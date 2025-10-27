// src/types.ts

export type Conversation = {
  id: number;
  userA: { id: number; email: string };
  userB: { id: number; email: string };
  lastMessage?: { content: string; createdAt: string };
};

export type Message = {
  id: number;
  content: string;
  senderId: number;
  conversationId: number;
  createdAt: string;
  type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO";
};

export type User = {
  id: number;
  email: string;
};
