"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import MessageHandler from "@utils/MessageHandler.js";

export const MessageHandlerContext = createContext(null);

export function MessageHandlerProvider({ children }) {
    const handlerRef = useRef(null);
    const [messageHandler, setMessageHandler] = useState(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        (
           async()=>{
            if (!handlerRef.current) {
                handlerRef.current = new MessageHandler();
                await handlerRef.current.init();
                setMessageHandler(handlerRef.current); // trigger re-render
            };
            }
        )()
    }, []);

    return (
        <MessageHandlerContext.Provider value={messageHandler}>
            {children}
        </MessageHandlerContext.Provider>
    );
}

export function useMessageHandler() {
    return useContext(MessageHandlerContext);
}
