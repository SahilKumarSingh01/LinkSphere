import { useEffect, useState } from "react";
import { MessageChannel } from "../utils/MessageChannel.js"; // your class

export default function HomePage() {
  const [channel, setChannel] = useState(null);
  const [input, setInput] = useState("");
  const [bytes, setBytes] = useState([]);
  const [cookies, setCookies] = useState([]);

  useEffect(() => {

    const sharedPtr = window.chrome?.webview?.sharedBuffer;
    if (!sharedPtr) return;

    const arr = new Uint8Array(sharedPtr);
    const chan = new MessageChannel(arr, arr.length, false);

    setChannel(chan);

    const onHostMessage = (event) => {
      console.log(event);
      const msg = event.data;
      
      if (msg === "dataReady") {
        if (channel) {
          console
          const size = channel.sizeofNextMessage();
          if (size > 0) {
            const buf = new Uint8Array(size);
            const read = channel.readBuf(buf, size);
            console.log("Read from shared buffer:", buf);
          }
        }
      } else {
        console.log("[JS] Received from HOST:", msg);
      }
    };

    window.chrome.webview.addEventListener("message", onHostMessage);
    // --- Log existing persistent cookies ---
    const existing = getCookies();
    console.log("Existing cookies on load:", existing);
    setCookies(existing);

    // --- Optional: create a persistent cookie ---
    setPersistentCookie("myPersistentCookie", "helloWorld", 7); // lasts 7 days
    return ()=>{
      window.chrome.webview.removeEventListener("message", onHostMessage)
    }
  }, []);

  const sendToHost = () => {
    if (!channel) return;
    const enc = new TextEncoder();
    const data = enc.encode(input);
    const written = channel.writeBuf(data, data.length);
    if (written > 0) {
      console.log("[JS] Sent to HOST:", data);
      setBytes([...data]);
      window.chrome.webview.postMessage("dataReady")
    } else {
      console.error("Ring buffer is full — cannot write.");
    }
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

// --- helpers ---
function setPersistentCookie(name, value, days = 1) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`;
}

function getCookies() {
  return document.cookie.split(";").map(c => c.trim()).filter(c => c);
}
