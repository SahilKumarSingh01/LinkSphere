"use client";

import { useEffect, useState } from "react";
import { useMessageHandler } from "@context/MessageHandler.jsx";

export default function NativeInteractiveTest() {
  const handler = useMessageHandler();
  const [logs, setLogs] = useState([]);

  const log = (msg) => setLogs((prev) => [...prev, msg]);

  useEffect(() => {
    if (!handler) return;

    // General fallback notification
    handler.setOnNotification((msg) => {
      log(`[NOTIFICATION] ${msg}`);
    });

    // TCP server notifications
    handler.setNotificationHandler("serverStarted", (param) =>
      log(`[TCP] Server started at port ${param}`)
    );
    handler.setNotificationHandler("serverFailed", (param) =>
      log(`[TCP] Server failed to start at port ${param}`)
    );

    // Connection notifications
    handler.setNotificationHandler("create-success", (param) =>
      log(`[CREATE_CONN] ${param}`)
    );
    handler.setNotificationHandler("create-failed", (param) =>
      log(`[CREATE_CONN] Failed: ${param}`)
    );
    handler.setNotificationHandler("received-success", (param) =>
      log(`[REMOVE_CONN] ${param}`)
    );
    handler.setNotificationHandler("received-failed", (param) =>
      log(`[REMOVE_CONN] Failed: ${param}`)
    );
    // handler.setNotificationHandler("connected", (param) =>
    //   log(`[CLIENT_CONN] : ${param}`)
    // );

    // IP assignment
    handler.setNotificationHandler("IpAssigned", (param) =>
      log(`[IP] Assigned: ${param}`)
    );

    // === KEY & MOUSE LISTENERS ===
    const handleKeyDown = (e) =>
      log(`[KEY_DOWN] ${e.key} (Code: ${e.keyCode})`);
    const handleKeyUp = (e) =>
      log(`[KEY_UP] ${e.key} (Code: ${e.keyCode})`);
    const handleMouseDown = (e) => log(`[MOUSE_DOWN] Button: ${e.button}`);
    const handleMouseUp = (e) => log(`[MOUSE_UP] Button: ${e.button}`);
    const handleMouseMove = (e) =>
      log(`[MOUSE_MOVE] X: ${e.clientX}, Y: ${e.clientY}`);
    const handleWheel = (e) => log(`[MOUSE_WHEEL] Delta: ${e.deltaY}`);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // === MESSAGE RECEIVING ===
    const registerMessageHandlers = () => {
      if (!handler) return;

      // Register all types you expect here
      const udpTypes = [1]; // example: 1 = UDP text type
      const tcpTypes = [172]; // example: 172 = TCP text type

      udpTypes.forEach((type) =>
        handler.setOnMessageReceive(
          type,
          (src, srcPort, dst, dstPort, type, payload) => {
            const payloadText = new TextDecoder().decode(payload);
            log(`[UDP_MSG] From ${handler.itoip(src)}:${srcPort} → ${dst}:${dstPort} | ${payloadText}`);
          }
        )
      );

      tcpTypes.forEach((type) =>
        handler.setOnMessageReceive(
          type,
          (src, srcPort, dst, dstPort, type, payload) => {
            const payloadText = new TextDecoder().decode(payload);
            log(`[TCP_MSG] From ${handler.itoip(src)}:${srcPort} → ${dst}:${dstPort} | ${payloadText}`);
          }
        )
      );
    };

    registerMessageHandlers();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handler]);

  // === SEND EVENT & MESSAGE HELPERS ===
  const sendEvent = (event, payload = "") => {
    if (!handler) return;
    log(`[SEND] ${event}-${payload}`);
    handler.sendNotification(payload ? `${event}-${payload}` : event);
  };

  const sendMessage = ({ type, payload }) => {
    if (!handler) return;
    const srcIP =  0x7F000001;
    const dstIP = 3232235622; // loopback for testing
    const srcPort = type >= 128 ? 0 : 5000;
    const dstPort = type >= 128 ? 5173 : 5000;

    // Using new positional argument format
    handler.sendMessage( srcPort, dstIP, dstPort, type, new TextEncoder().encode(payload));

    log(`[SEND_MSG] Type ${type} | Payload: ${payload}`);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Native Interactive Test</h1>
      <p>
        Click a button to test a native action. Logs show verbose
        success/failure and key/mouse presses.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <button onClick={() => sendEvent("startTCP", "5173")}>Start TCP Server</button>
        <button onClick={() => sendEvent("getIp", "private")}>Get Local IPs</button>
        <button onClick={() => sendEvent("createConn", "1-0-5000-3232235622-5000")}>Create Connection UDP</button>
        <button onClick={() => sendEvent("removeConn", "1-0-5000-3232235622-5000")}>Remove Connection UDP</button>
        <button onClick={() => sendEvent("createConn", "172-0-0-3232235622-5173")}>Create Connection TCP</button>
        <button onClick={() => sendEvent("removeConn", "172-0-0-3232235622-5173")}>Remove Connection TCP</button>

        <button onClick={() => sendEvent("mouseMove", "100,100")}>Mouse Move</button>
        <button onClick={() => sendEvent("mouseLeft", "click")}>Mouse Left Click</button>
        <button onClick={() => sendEvent("mouseRight", "click")}>Mouse Right Click</button>
        <button onClick={() => sendEvent("mouseScroll", "120")}>Mouse Scroll</button>
        <button onClick={() => sendEvent("keyDown", "65")}>Key Down 'A'</button>
        <button onClick={() => sendEvent("keyUp", "65")}>Key Up 'A'</button>
        <button onClick={() => sendEvent("close", "current")}>Close App</button>

        {/* Example sending text as binary message */}
        <button onClick={() => sendMessage({ type: 1, payload: "Hello UDP!" })}>Send UDP Message</button>
        <button onClick={() => sendMessage({ type: 172, payload: "Hello TCP!" })}>Send TCP Message</button>
      </div>

      <div
        style={{
          background: "#111",
          color: "#0f0",
          padding: 10,
          height: "60vh",
          overflowY: "scroll",
          fontFamily: "monospace",
        }}
      >
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
