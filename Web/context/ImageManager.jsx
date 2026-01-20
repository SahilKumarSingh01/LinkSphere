"use client";
import { createContext, useContext, useRef, useEffect } from "react";
import { ImageManager } from "@utils/ImageManager";
import { useMessageHandler } from "@context/MessageHandler";
import { usePresenceManager } from "@context/PresenceManager";

const ImageManagerContext = createContext(null);

export function ImageManagerProvider({ children }) {
  const managerRef = useRef(new ImageManager());
  const messageHandler = useMessageHandler();
  const { presenceManager } = usePresenceManager();

  useEffect(() => {
    if (!messageHandler || !presenceManager) return;

    (async () => {
      const ip = messageHandler.getDefaultIP();
      managerRef.current.setPrivateIP(ip);

      const data = await presenceManager.getMyPresence();
      const org = data.userInfo?.organisation;

      managerRef.current.setOrganisation(org);
    })();
  }, [messageHandler, presenceManager]);

  return (
    <ImageManagerContext.Provider value={managerRef.current}>
      {children}
    </ImageManagerContext.Provider>
  );
}

export function useImageManager() {
  return useContext(ImageManagerContext);
}
