import { useEffect, useState } from "react";
import { messageHandler } from "../utils/MessageHandler.js";

export default function HomePage() {
  const [input, setInput] = useState("");
  const [bytes, setBytes] = useState([]);
  const [cookies, setCookies] = useState([]);

  useEffect(() => {
    // message receive callback
    messageHandler.setOnMessageReceive(
      ({ src, srcPort, dst, dstPort, type, payload }) => {
        console.log("From:", src.join("."), srcPort);
        console.log("To:", dst.join("."), dstPort);
        console.log("Type:", type);

        const arr = Array.from(payload);
        setBytes(arr);

        console.log("Payload:", payload);//new TextDecoder().decode(payload));
      }
    );
    messageHandler.setNotificationHandler("close",()=>{
      console.log("close event happened");
      messageHandler.sendNotification("close-current");
    })
    // window.chrome.webview.onClosing= () => {
    //   // navigator.sendBeacon(
    //   //   "/offline",
    //   //   JSON.stringify({
    //   //     id: "user-123",
    //   //     ts: Date.now()
    //   //   })
    //   // );
    //   messageHandler.sendNotification("something");
    // } 
    // messageHandler.sendNotification("something");
    // window.close();
    // messageHandler.
    // notification callback
    messageHandler.setOnNotification((data) => {
      console.log("[JS] Notification from HOST:", data);
    });

    // cookies
    const existing = getCookies();
    console.log("Existing cookies on load:", existing);
    setCookies(existing);

    setPersistentCookie("myPersistentCookie", "helloWorld", 7);
  }, []);

  const sendToHost = () => {
    messageHandler.sendMessage({
      src: [127, 0, 0, 1],
      srcPort: 0,
      dst: [127, 0, 0, 1],
      dstPort: 5173,
      type: 1,
      payload: input
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
