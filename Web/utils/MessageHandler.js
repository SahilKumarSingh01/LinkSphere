import { MessageChannel } from "./MessageChannel.js";
import { MessageBlock } from "./MessageBlock.js";
// import { MsgType } from "./MessageTypes.js";

export default class MessageHandler {
    constructor() {
        this.channel = null;
        // this.listeners = new Set();
        // this.notificationsEnabled = true;
                // callbacks
        this.onMessageReceiveHandler = new Map();
        this.onNotification = null;
          // notification event handlers
        this.notificationHandlers = new Map();
        this.port=null;
        this.localIPs = [];
        this.defaultIP = null; // stores { ip, interface }


        this._init();

    }

    /* ---------------- INIT ---------------- */

    async _init() {
        const sharedPtr = window.chrome?.webview?.sharedBuffer;
        if (!sharedPtr) {
            console.warn("[MessageHandler] No shared buffer");
            return;
        }

        const arr = new Uint8Array(sharedPtr);
        this.channel = new MessageChannel(arr, arr.length, false);

        window.chrome.webview.addEventListener(
            "message",
            this._onHostSignal.bind(this)
        );

        console.log("[MessageHandler] Initialized");
        // Register automatic IpAssigned handler
        this.setNotificationHandler("IpAssigned", (msg) => {
            const [ip, iface] = msg.split("|");
            if (!ip || this.localIPs.some(e => e.ip === ip)) return;

            const obj = { ip, interface: iface || null };
            this.localIPs.push(obj);
            if (!this.defaultIP) this.defaultIP = obj;
        });


        // start server automatically
        this.port = 5173;
        this.sendNotification("getIp-private");
        this.tryStartServer();
    }
    getAllIPs() {
        return this.localIPs;
    }
    getDefaultIP() {
        return this.defaultIP;
    }
    setDefaultIP(index) {
        if (index < 0 || index >= this.localIPs.length) return false;
        this.defaultIP = this.localIPs[index];
        return true;
    }


    tryStartServer() {
        const port = this.port;

        const cleanup = () => {
            this.notificationHandlers.delete("serverStarted");
            this.notificationHandlers.delete("serverFailed");
        };

        this.setNotificationHandler("serverStarted", (param) => {
            if (param === String(port)) {
                console.log(`[MessageHandler] Server started at port ${port}`);
                cleanup();
            }
        });

        this.setNotificationHandler("serverFailed", (param) => {
            if (param === String(port)) {
                cleanup();
                this.port++;
                setTimeout(() => this.tryStartServer(), 0);
            }
        });

        this.sendNotification(`startTCP-${port}`);
    }


    /* ---------------- HOST → JS ---------------- */

    _onHostSignal(event) {
        // console.log("we are getting an event");
        if (event.data !== "dataReady") {
            const msg = String(event.data);
            const i = msg.indexOf("-");
            const handler =
                i !== -1 && this.notificationHandlers.get(msg.slice(0, i));

            if (handler) {
                handler(msg.slice(i + 1));
                return;
            }
            // fallback
            if (this.onNotification) {
                this.onNotification(msg);
            }
        }

        if (!this.channel) return;

        while (true) {
            const size = this.channel.sizeofNextMessage();
            if (size <= 0) break;

            const buf = new Uint8Array(size);
            this.channel.readBuf(buf, size);

            try {
                const block = new MessageBlock(buf);
                const handler = this.onMessageReceiveHandler.get(block.getType());
                if(!handler)continue;
                handler({
                    src: [
                        (block.getSrcIP() >>> 24) & 0xFF,
                        (block.getSrcIP() >>> 16) & 0xFF,
                        (block.getSrcIP() >>> 8) & 0xFF,
                        block.getSrcIP() & 0xFF
                    ],
                    srcPort: block.getSrcPort(),
                    dst: [
                        (block.getDstIP() >>> 24) & 0xFF,
                        (block.getDstIP() >>> 16) & 0xFF,
                        (block.getDstIP() >>> 8) & 0xFF,
                        block.getDstIP() & 0xFF
                    ],
                    dstPort: block.getDstPort(),
                    type: block.getType(),
                    payload: block.getPayload()
                })
                // this._emit(msg);
            } catch (e) {
                console.error("[MessageHandler] Invalid message", e);
            }
        }
    }

    setNotificationHandler(event, handler) {
        this.notificationHandlers.set(event, handler);
    }


    setOnMessageReceive(type, callback) {
        // Check if the type exists in MsgType
        // if (!Object.values(MsgType).includes(type)) {
        //     console.warn(`[MessageHandler] Invalid message type: ${type}`);
        //     return;
        // }

        this.onMessageReceiveHandler.set(type, callback); // overwrite existing handler
    }

    setOnNotification(callback) {
        this.onNotification = callback;
    }

    sendMessage({
        src,
        srcPort,
        dst,
        dstPort,
        type,
        payload,
    }) {
        if (!this.channel) return false;

        const payloadBytes =
            payload instanceof Uint8Array
                ? payload
                : new TextEncoder().encode(payload);

        const totalSize = 17 + payloadBytes.length;
        console.log("totalSize of message", totalSize);

        // create MessageBlock directly with total size
        const msg = new MessageBlock(totalSize); // automatically sets totalSize
        msg.setType(type);
        msg.setSrc(src, srcPort);
        msg.setDst(dst, dstPort);
        msg.setPayload(payloadBytes);

        // write the internal buffer directly
        const written = this.channel.writeBuf(msg.getRawData(), totalSize);
        if (written <= 0) {
            console.error("[MessageHandler] Buffer full");
            return false;
        }
        window.chrome.webview.postMessage("dataReady");
        return true;
    }

    /* ---------------- NOTIFICATION CONTROL ---------------- */

    sendNotification(data = "dataReady") {
        console.log("Notification sedns",data);
        window.chrome.webview.postMessage(data);
    }
}

// /* ---------------- SINGLETON EXPORT ---------------- */

// export const messageHandler = new MessageHandler();

/*
TRANSPORT & MESSAGE CONVENTIONS
-------------------------------

1) Message Type (8th bit)
   - The 8th bit of `type` decides protocol:
     • 0 → UDP
     • 1 → TCP

2) TCP Behavior
   - `srcPort` has ONLY two valid values:
     • 0          → send as TCP client
     • this.port  → send as TCP server

   - Client mode:
     • If not connected, native auto-connects before sending.

   - Server mode:
     • No auto-connect.
     • Message is sent only if connection already exists.

3) UDP Behavior
   - UDP messages are always received on the SAME port
     from which the sender sent the UDP packet.
   - No connection state is maintained.
*/
/*
NATIVE EVENTS & PARAMS
---------------------

Event: startTCP
Param: <port>
Example: "startTCP-5173"
Effect:
- Starts TCP server on given port.
- Native responds with: "serverStarted-<port>" on success.

Event: getIp
Param: none
Example: "getIp"
Effect:
- Native sends one or more:
  "IpAssigned-<ip>|<interface>"

Event: mouseMove
Param: "<x>,<y>"
Example: "mouseMove-120,450"
Effect:
- Moves mouse to screen coordinates.

Event: mouseLeft
Param: none
Effect:
- Performs left mouse click.

Event: mouseRight
Param: none
Effect:
- Performs right mouse click.

Event: mouseScroll
Param: <delta>
Example: "mouseScroll--120"
Effect:
- Scrolls mouse wheel by delta.

Event: keyDown
Param: <virtualKeyCode>
Effect:
- Key down event.

Event: keyUp
Param: <virtualKeyCode>
Effect:
- Key up event.

Event: keyPress
Param: <virtualKeyCode>
Effect:
- Key press (down + up).

Event: removeConn
Param: "<type>-<srcIP>-<srcPort>-<dstIP>-<dstPort>"
Example:
"removeConn-1-192.168.1.10-5173-192.168.1.20-6000"
Effect:
- Removes TCP/UDP connection.
- Native responds with:
  • "connectionRemoved"
  • "connectionNotFound"

Event: close
Param: none
Effect:
- Closes native application.
*/
