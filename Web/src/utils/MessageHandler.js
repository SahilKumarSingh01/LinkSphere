import { MessageChannel } from "./MessageChannel.js";
import { MessageBlock } from "./MessageBlock.js";

class MessageHandler {
    constructor() {
        this.channel = null;
        // this.listeners = new Set();
        // this.notificationsEnabled = true;
                // callbacks
        this.onMessageReceive = null;
        this.onNotification = null;
          // notification event handlers
        this.notificationHandlers = new Map();
        this.localIP=null;
        this.port=null;
        this.interface=null;

        this._init();
    }

    /* ---------------- INIT ---------------- */

    _init() {
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
            const parts = msg.split("|"); // split IP and interface
            this.localIP = parts[0] || null;
            this.interface = parts[1] || null;

            console.log("[MessageHandler] Stored local IP:", this.localIP);
            console.log("[MessageHandler] Interface type:", this.interface);
        });

        // start server automatically
        this.port = 5173;
        this.sendNotification("getIp-private");
        this.tryStartServer();
    }

    tryStartServer() {
        const port = this.port;

        // set temporary handler for this attempt
        this.setNotificationHandler("serverStarted", (param) => {
            if (param === String(port)) {
                console.log(`[MessageHandler] Server started at port ${port}`);
                // remove this handler after success
                this.notificationHandlers.delete("serverStarted");
            }
        });

        // send request using existing sendNotification
        this.sendNotification(`startTCP-${port}`);

        // retry after 100ms if server hasn't started
        setTimeout(() => {
            // check if handler still exists → means no success yet
            if (this.notificationHandlers.has("serverStarted")) {
                this.notificationHandlers.delete("serverStarted");
                this.port++; // try next port
                this.tryStartServer();
            }
        }, 100);
    }

    /* ---------------- HOST → JS ---------------- */

    _onHostSignal(event) {
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
                this.onMessageReceive({
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


    setOnMessageReceive(callback) {
        this.onMessageReceive = callback;
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
        window.chrome.webview.postMessage(data);
    }
}

/* ---------------- SINGLETON EXPORT ---------------- */

export const messageHandler = new MessageHandler();
