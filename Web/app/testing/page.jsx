"use client";

import { useEffect, useState } from "react";
import { useMessageHandler } from "@context/MessageHandler.jsx";

export default function HomePage() {
  const messageHandler = useMessageHandler();

  const [input, setInput] = useState("");
  const [bytes, setBytes] = useState([]);
  const [cookies, setCookies] = useState([]);
  // console.log("hellow how are you ",messageHandler);
  useEffect(() => {
    if (!messageHandler) return;

    // message receive callback
    messageHandler.setOnMessageReceive(1,
      ({ src, srcPort, dst, dstPort, type, payload }) => {
        console.log("From:", src.join("."), srcPort);
        console.log("To:", dst.join("."), dstPort);
        console.log("Type:", type);

        const arr = Array.from(payload);
        setBytes(arr);

        console.log("Payload:", payload);
      }
    );

    // native close event
    messageHandler.setNotificationHandler("close", () => {
      console.log("close event happened");
      messageHandler.sendNotification("close-current");
    });

    // generic notification callback
    messageHandler.setOnNotification((data) => {
      console.log("[JS] Notification from HOST:", data);
    });

    // cookies
    const existing = getCookies();
    console.log("Existing cookies on load:", existing);
    setCookies(existing);

    setPersistentCookie("myPersistentCookie", "helloWorld", 7);
  }, [messageHandler]);

  const sendToHost = () => {
    if (!messageHandler) return;

    messageHandler.sendMessage({
      src: [127, 0, 0, 1],
      srcPort: 3000,
      dst: [127, 0, 0, 1],
      dstPort: 3000,
      type: 1, // TCP
      payload: input,
    });
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>SharedBuffer Messaging + Cookies 😸</h2>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type something…"
        style={{ padding: 10, width: 250 }}
      />

      <button
        onClick={sendToHost}
        style={{ marginLeft: 10, padding: "10px 20px" }}
      >
        Send
      </button>

      <div style={{ marginTop: 20 }}>
        <h3>Byte Data Output:</h3>
        <pre>{JSON.stringify(bytes, null, 2)}</pre>

        <h3>Persistent Cookies:</h3>
        <pre>{JSON.stringify(cookies, null, 2)}</pre>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function setPersistentCookie(name, value, days = 1) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`;
}

function getCookies() {
  return document.cookie
    .split(";")
    .map(c => c.trim())
    .filter(c => c);
}
