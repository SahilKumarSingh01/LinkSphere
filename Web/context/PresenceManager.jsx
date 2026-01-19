"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { PresenceManager } from "@utils/PresenceManager.js";
import { useMessageHandler } from "@context/MessageHandler.jsx";

export const PresenceManagerContext = createContext(null);

export function PresenceManagerProvider({ children }) {
    const messageHandler = useMessageHandler();
    const presenceRef = useRef(null);
    const [users,setUsers] =useState([]);
    const [presenceManager, setPresenceManager] = useState(null);

    useEffect(() => {
        if (!messageHandler) return;

        if (!presenceRef.current) {
            (async ()=>{
                presenceRef.current = new PresenceManager(messageHandler);
                const data = await presenceRef.current.getMyPresence();
                const org = data.userInfo?.organisation;
                presenceRef.current.setOrganisation(org);
                setPresenceManager(presenceRef.current);
                presenceRef.current.setOnUserUpdate((users)=>{setUsers(users)});
            })();
        }
    }, [messageHandler]);

    return (
        <PresenceManagerContext.Provider value={{presenceManager,users}}>
            {children}
        </PresenceManagerContext.Provider>
    );
}

export function usePresenceManager() {
    return useContext(PresenceManagerContext);
}
