"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { PresenceManager } from "@utils/PresenceManager.js";
import { useMessageHandler } from "@context/MessageHandler.jsx";

export const PresenceManagerContext = createContext(null);

export function PresenceManagerProvider({ children }) {
    const messageHandler = useMessageHandler();
    const presenceRef = useRef(null);
    const [presenceManager, setPresenceManager] = useState(null);

    useEffect(() => {
        if (!messageHandler) return;

        if (!presenceRef.current) {
            presenceRef.current = new PresenceManager(messageHandler);
            setPresenceManager(presenceRef.current);
        }
    }, [messageHandler]);

    return (
        <PresenceManagerContext.Provider value={presenceManager}>
            {children}
        </PresenceManagerContext.Provider>
    );
}

export function usePresenceManager() {
    return useContext(PresenceManagerContext);
}
