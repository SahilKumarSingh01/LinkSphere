"use client";

import { useEffect, useState } from "react";
import { useMessageHandler } from "@context/MessageHandler.jsx";

export default function NativeInteractiveTest() {
  const handler = useMessageHandler();
  const [logs, setLogs] = useState([]);

  const log = (msg) => setLogs((prev) => [...prev, msg]);

  useEffect(() => {
    if (!handler) return;

    // General fallback
    handler.setOnNotification((msg) => log(`[NOTIFICATION] ${msg}`));

    // TCP server events
    handler.setNotificationHandler("serverStarted", (param) =>
      log(`[TCP] Server started at port ${param}`)
    );
    handler.setNotificationHandler("serverFailed", (param) =>
      log(`[TCP] Server failed at port ${param}`)
    );

    // IP assignment
    handler.setNotificationHandler("IpAssigned", (param) =>
      log(`[IP] Assigned: ${param}`)
    );

    // Key & mouse listeners
    const addEvent = (type, fn) => window.addEventListener(type, fn);
    const removeEvent = (type, fn) => window.removeEventListener(type, fn);

    const handleKeyDown = (e) => log(`[KEY_DOWN] ${e.key} (${e.keyCode})`);
    const handleKeyUp = (e) => log(`[KEY_UP] ${e.key} (${e.keyCode})`);
    const handleMouseDown = (e) => log(`[MOUSE_DOWN] Button: ${e.button}`);
    const handleMouseUp = (e) => log(`[MOUSE_UP] Button: ${e.button}`);
    const handleMouseMove = (e) => log(`[MOUSE_MOVE] X:${e.clientX}, Y:${e.clientY}`);
    const handleWheel = (e) => log(`[MOUSE_WHEEL] Delta:${e.deltaY}`);

    addEvent("keydown", handleKeyDown);
    addEvent("keyup", handleKeyUp);
    // addEvent("mousedown", handleMouseDown);
    // addEvent("mouseup", handleMouseUp);
    // // addEvent("mousemove", handleMouseMove);
    // addEvent("wheel", handleWheel);

    // Message receiving
    const registerMessageHandlers = () => {
      if (!handler) return;
      const udpTypes = [1], tcpTypes = [172];

      udpTypes.forEach((type) =>
        handler.setOnMessageReceive(type, (src, srcPort, dst, dstPort, type, payload) => {
          log(`[UDP_MSG] ${handler.itoip(src)}:${srcPort} → ${dst}:${dstPort} | ${new TextDecoder().decode(payload)}`);
        })
      );

      tcpTypes.forEach((type) =>
        handler.setOnMessageReceive(type, (src, srcPort, dst, dstPort, type, payload) => {
          log(`[TCP_MSG] ${handler.itoip(src)}:${srcPort} → ${dst}:${dstPort} | ${new TextDecoder().decode(payload)}`);
        })
      );
    };

    registerMessageHandlers();

    return () => {
      ["keydown","keyup","mousedown","mouseup","mousemove","wheel"].forEach((t, i) => {
        removeEvent(t, [handleKeyDown, handleKeyUp, handleMouseDown, handleMouseUp, handleMouseMove, handleWheel][i]);
      });
    };
  }, [handler]);

  // === Handlers ===
  const startTCPServer = async (port) => {
    const p = await handler.openExclusiveTCP(port);
    log(`[TCP] Attempted port ${port}, result: ${p}`);
  };

  const createConnection = async (type, sip, sp, dip, dp) => {
    log("connection is called");
    const r = await handler.createConn(type, sip, sp, dip, dp);
    log(`[CREATE_CONN] ${type & 0x80 ? "TCP" : "UDPhh"} ${r ? "Success" : "Fail"} ${sip}:${sp} → ${dip}:${dp}`);
  };

  const removeConnection = async (type, sip, sp, dip, dp) => {
    const r = await handler.removeConn(type, sip, sp, dip, dp);
    log(`[REMOVE_CONN] ${type & 0x80 ? "TCP" : "UDP"} ${r ? "Success" : "Fail"} ${sip}:${sp} → ${dip}:${dp}`);
  };

  const addSendFailHandler = (type, sp, dip, dp) =>
    handler.onSendFailed(type, sp, dip, dp, (msg) => log(`[SEND_FAIL] ${type & 0x80 ? "TCP" : "UDP"} ${sp}→${dip}:${dp} | ${msg}`));

  const addRecvFailHandler = (type, sp, dip, dp) =>
    handler.onRecvFailed(type, sp, dip, dp, (msg) => log(`[RECV_FAIL] ${type & 0x80 ? "TCP" : "UDP"} ${sp}→${dip}:${dp} | ${msg}`));

  const sendMessage = ({ type, payload }) => {
    if (!handler) return;
    const srcIP = 0x7F000001;
    const dstIP = 172467315;
    const srcPort = type >= 128 ? 0 : 5000;
    const dstPort = type >= 128 ? 5173 : 5000;
    handler.sendMessage(srcPort, dstIP, dstPort, type, new TextEncoder().encode(payload));
    log(`[SEND_MSG] Type ${type} | Payload: ${payload}`);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Native Interactive Test</h1>
      <p>Click buttons to test native actions. Logs show input/events.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <button onClick={() => startTCPServer(5173)}>Start TCP Server</button>
        <button onClick={() => handler.refreshIps().then(ips => log(`[IP] Refreshed: ${JSON.stringify(ips)}`))}>Get Local IPs</button>

        <button onClick={() => createConnection(1, 0, 5000, 3232235622, 5000)}>Create UDP</button>
        <button onClick={() => removeConnection(1, 0, 5000, 3232235622, 5000)}>Remove UDP</button>
        <button onClick={() => createConnection(1<<7, 0, 0, 3232235622, 5173)}>Create TCP</button>
        <button onClick={() => removeConnection(1<<7, 0, 0, 3232235622, 5173)}>Remove TCP</button>
{/* 
        <button onClick={() => addSendFailHandler(1, 5000, 3232235622, 5000)}>UDP Send Fail</button>
        <button onClick={() => addRecvFailHandler(1, 5000, 3232235622, 5000)}>UDP Recv Fail</button>
        <button onClick={() => addSendFailHandler(1<<7, 0, 3232235622, 5173)}>TCP Send Fail</button>
        <button onClick={() => addRecvFailHandler(1<<7, 0, 3232235622, 5173)}>TCP Recv Fail</button> */}

        <button onClick={() => handler.mouseMove(100, 100)}>Mouse Move</button>
        <button onClick={() => handler.mouseLeft()}>Mouse Left</button>
        <button onClick={() => handler.mouseRight()}>Mouse Right</button>
        <button onClick={() => handler.mouseScroll(120)}>Mouse Scroll</button>
        <button onClick={() => handler.keyDown(65)}>Key Down 'A'</button>
        <button onClick={() => handler.keyUp(65)}>Key Up 'A'</button>
        <button onClick={() => handler.keyPress(65)}>Key Press 'A'</button>

        <button onClick={() => handler.sendNotification("close-current")}>Close App</button>

        <button onClick={() => sendMessage({ type: 1, payload: "Hello UDP!" })}>Send UDP Msg</button>
        <button onClick={() => sendMessage({ type: 172, payload: "Hello TCP!" })}>Send TCP Msg</button>
      </div>

      <div style={{
        background: "#111",
        color: "#0f0",
        padding: 10,
        height: "60vh",
        overflowY: "scroll",
        fontFamily: "monospace"
      }}>
        {logs.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
