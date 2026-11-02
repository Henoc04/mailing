import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../context/AuthContext";

/**
 * Creates (once) a socket.io-client connection to VITE_SOCKET_URL, authing
 * via `socket.handshake.auth.token` (matches backend/src/lib/socket.ts).
 * Connects only when a token exists; disconnects on unmount or logout.
 */
export function useSocket(): Socket | null {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      return;
    }

    const instance = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      auth: { token },
    });

    socketRef.current = instance;
    setSocket(instance);

    return () => {
      instance.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [token]);

  return socket;
}
