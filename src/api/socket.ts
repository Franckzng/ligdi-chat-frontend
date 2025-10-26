import { io, Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL;
console.log("👉 API_URL chargé dans le frontend =", API_URL);

let socket: Socket | null = null;

export function connectSocket(token: string) {
  socket = io(API_URL, {
    auth: { token },
  });
  return socket;
}

export function getSocket() {
  return socket;
}
