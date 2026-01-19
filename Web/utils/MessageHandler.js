import { MessageChannel } from "./MessageChannel.js";
import { MessageBlock } from "./MessageBlock.js";

export default class MessageHandler {
    constructor() {
        this.channel = null;
        this.notificationHandlers = new Map(); // string -> Set<function>
        this.onMessageReceiveHandler = new Map(); // number -> function
        this.onNotification = null;
        this._err = null;
        this._conn = null;

        
        this.port = -1;
        this.localIPs = [];
        this.defaultIP=0;
        const arr = new Uint8Array(window.chrome.webview.sharedBuffer);
        this.channel = new MessageChannel(arr, arr.length, false);
        window.chrome.webview.addEventListener("message", this._onHostSignal.bind(this));
        this.setNotificationHandler("close", () => { this.sendNotification("close-current") });
        this.setNotificationHandler("connected", p => {
            console.log("client is connected",p);
            const [s, d] = p.split("::");
            if (!s || !d) return;
            const f = x => {
                const [i, o] = x.split(":");
                return { ip: i, port: +o };
            };
            const a = f(s), b = f(d);
            this.pendingTCP ??= new Map();
            this.pendingTCP.set(p, setTimeout(
            async () => await this.removeConn((1<<7),a.ip, a.port, b.ip, b.port),
                30000
            ));
        });

    }

    getDefaultIP = () => this.iptoi(this.defaultIP.split('.'));

    
    clearPendingTCP(srcIP, srcPort, destIP, destPort) {
        if (!this.pendingTCP) return;

        const key = `${destIP}:${destPort}::${srcIP}:${srcPort}`;
        const t = this.pendingTCP.get(key);
        if (!t) return;

        clearTimeout(t);
        this.pendingTCP.delete(key);
    }


    /* ---------------- INIT ---------------- */

    // init: Initializes message channel, sets up event listeners, handles IP assignment
    // No input, no return
    // Example: automatically called in constructor
    async init() {
        await this.refreshIps();

        // Try to start TCP server starting from 5173
        let port = 5173;
        while (true) {
            const result = await this.openExclusiveTCP(port);
            if (result !== -1) break;
            port++;
        }
    }


    /* ---------------- HOST → JS ---------------- */

    // _onHostSignal: Handles incoming messages and notifications from native host
    // Input: event (MessageEvent), Output: none
    // Example: called by 'message' event listener
    
    async _onHostSignal(event) {
        const msg = String(event.data);

        /* -------- NOTIFICATIONS -------- */
        if (msg !== "dataReady") {
            const sep = msg.indexOf("-");
            const key = sep !== -1 ? msg.slice(0, sep) : msg;
            const payload = sep !== -1 ? msg.slice(sep + 1) : "";
            // console.log("messsage received",msg,payload);
            const handlers = this.notificationHandlers.get(key);
            if (handlers) {
                for (const h of handlers)
                    setTimeout(() => h(payload), 0); // fully independent
                return;
            }

            if (this.onNotification)
                return setTimeout(() => this.onNotification(msg), 0);
        }

        if (!this.channel) return;

        /* -------- MESSAGES -------- */
        let size;
        while ((size = await this.channel.sizeofNextMessage()) > 0) {
            const buf = new Uint8Array(size);
            await this.channel.readBuf(buf, size);

            setTimeout(() => {
                try {
                    const block = new MessageBlock(buf);
                    const handler = this.onMessageReceiveHandler.get(block.getType());
                    if (!handler) return;
                    setTimeout(() => handler(
                        block.getSrcIP(),
                        block.getSrcPort(),
                        block.getDstIP(),
                        block.getDstPort(),
                        block.getType(),
                        block.getPayload()
                    ), 0); // each handler isolated
                } catch (e) {
                    console.error("[MessageHandler] Invalid message", e);
                }
            }, 0);
        }
    }


    // sendMessage: Sends a message block to native
    // Input:  srcPort, dst, dstPort, type, payload (string or Uint8Array)
    // Output: boolean (true if sent, false if buffer full)
    // Example: sendMessage( 5173, 3232235522, 6000, 1, "Hello")
    async sendMessage( srcPort, dst, dstPort, type, payload) {
        if (!this.channel) return false;

        const payloadBytes = payload instanceof Uint8Array ? payload : new TextEncoder().encode(payload);
        const totalSize = 17 + payloadBytes.length;

        const msg = new MessageBlock(totalSize);
        msg.setType(type);
        msg.setSrc(0, srcPort);//selection of src doesn't matter anymore
        msg.setDst(dst, dstPort);
        msg.setPayload(payloadBytes);

        const written = await this.channel.writeBuf(msg.getRawData(), totalSize);
        if (written <= 0) {
            console.error("[MessageHandler] Buffer full");
            return false;
        }

        window.chrome.webview.postMessage("dataReady");
        return true;
    }

    // sendNotification: Sends simple string notification to native
    // Input: data (string, default: "dataReady"), Output: none
    // Example: sendNotification("close-current")
    sendNotification(data = "dataReady") {
        window.chrome.webview.postMessage(data);
    }

    // refreshIps: Requests current IPs from native
    // No input, no return
    // Example: refreshIps()
    refreshIps() {
        return new Promise((resolve, reject) => {
            this.localIPs = [];

            const handler = (msg) => {
            if (msg === "done") {
                this.removeNotificationHandler("IpAssigned", handler);
                resolve(this.localIPs);
                // console.log(this.localIPs);
                return;
            }

            const [ip, iface,type] = msg.split("|");
            if (type === "default")this.defaultIP = ip;

            if (!ip || this.localIPs.some(e => e.ip === ip)) return;

            this.localIPs.push({ ip, interface: iface || null ,type});
            };

            this.setNotificationHandler("IpAssigned", handler);
            this.sendNotification("getIp-private");
        });
    }


    // getAllIPs: Returns array of assigned IPs
    // Output: Array of {ip, interface}
    // Example: getAllIPs() => [{ip:"192.168.0.10", interface:"eth0"}]
    getAllIPs = () => this.localIPs;


    // getTCPPort: Returns current TCP server port
    // Output: number
    // Example: getTCPPort() => 5173
    getTCPPort = () => this.port;

    // iptoi: Converts array [x1,x2,x3,x4] to integer
    // Input: array of 4 numbers, Output: number
    // Example: iptoi([192,168,0,1]) => 3232235521
    iptoi = ip => ((ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3]) >>> 0;

    // itoip: Converts integer to array of 4 numbers
    // Input: number, Output: array of 4 numbers
    // Example: itoip(3232235521) => [192,168,0,1]
    itoip = n => [n >>> 24, n >>> 16 & 0xff, n >>> 8 & 0xff, n & 0xff];

    /* ---------------- HANDLER REGISTRATION ---------------- */

    // setNotificationHandler: Adds a handler for a notification event
    // Multiple handlers per event are supported
    // Input: event (string), handler (function)
    setNotificationHandler(event, handler) {
        if (!this.notificationHandlers.has(event))
            this.notificationHandlers.set(event, new Set());
        this.notificationHandlers.get(event).add(handler);
    }

    // setOnMessageReceive: Adds a handler for a message type
    // Multiple handlers per type are supported
    // Input: type (number), callback (function)
    setOnMessageReceive(type, callback) {
        if (!callback)return;

        this.onMessageReceiveHandler.set(type,callback);
    }


    /* ---------------- REMOVE HANDLERS ---------------- */

    // removeNotificationHandler: Removes a specific handler for a notification
    // If handler is not provided, does nothing
    // Input: event (string), handler (function)
    removeNotificationHandler(event, handler) {
        const set = this.notificationHandlers.get(event);
        if (!set) return;

        set.delete(handler);
        if (set.size === 0)
            this.notificationHandlers.delete(event);
    }

    // removeMessageHandler: Removes a specific handler for a message type
    // Input: type (number),
    removeMessageHandler(type) {
        this.onMessageReceiveHandler.delete(type);
    }


    /* ---------------- TCP CONTROL ---------------- */

    // openExclusiveTCP: Tries to start TCP server on given port
    // Input: port (number)
    // Output: Promise<number> (port if success, -1 if fail)
    // Example: await openExclusiveTCP(5173)
    openExclusiveTCP(port) {
        return new Promise((resolve) => {
            const cleanup = () => {
                this.notificationHandlers.delete("serverStarted");
                this.notificationHandlers.delete("serverFailed");
            };

            this.setNotificationHandler("serverStarted", (param) => {
                if (param === String(port)) {
                    cleanup();
                    this.port = port;
                    resolve(port);
                }
            });

            this.setNotificationHandler("serverFailed", (param) => {
                if (param === String(port)) {
                    cleanup();
                    this.port = -1;
                    resolve(-1);
                }
            });

            this.sendNotification(`startTCP-${port}`);
        });
    }

    /* ---------------- MOUSE & KEYBOARD ---------------- */

    mouseMove = (x, y) => this.sendNotification(`mouseMove-${x},${y}`); // Example: mouseMove(100, 200)
    mouseLeft = () => this.sendNotification("mouseLeft-click");
    mouseRight = () => this.sendNotification("mouseRight-click");
    mouseScroll = d => this.sendNotification(`mouseScroll-${d}`); // Example: mouseScroll(5)
    keyDown = k => this.sendNotification(`keyDown-${k}`); // Example: keyDown(65)
    keyUp = k => this.sendNotification(`keyUp-${k}`); // Example: keyUp(65)
    keyPress = k => this.sendNotification(`keyPress-${k}`); // Example: keyPress(65)

    /* ---------------- CONNECTION CONTROL ---------------- */

    /* ================= CONNECTION-SCOPED NOTIFICATIONS ================= */

    /*
    Key format (SAME everywhere):
    proto::srcPort::dstIP:dstPort

    proto = "tcp" | "udp"
    */

    /* ---------- INTERNAL HELPERS ---------- */

   // Attach handler for a specific connection
    attachConnHandler(type, sp, dip, dp, handler) {
        const proto = type & 0x80 ? "tcp" : "udp";
        const key = proto === "udp" ? `${proto}::${sp}::0:0` : `${proto}::${sp}::${dip}:${dp}`;
        this.setNotificationHandler(key, handler);
    }

    // Remove handler for a specific connection
    detachConnHandler(type, sp, dip, dp, handler) {
        const proto = type & 0x80 ? "tcp" : "udp";
        const key = proto === "udp" ? `${proto}::${sp}::0:0` : `${proto}::${sp}::${dip}:${dp}`;
        this.removeNotificationHandler(key, handler);
    }

    // Create connection, resolves 1 if success, 0 if fail
    createConn(type, sip, sp, dip, dp) {
        return new Promise(resolve => {
            const proto = type & 0x80 ? "tcp" : "udp";
            const key = proto === "udp" ? `${proto}::${sp}::0:0` : `${proto}::${sp}::${dip}:${dp}`;
            const handler = msg => {
                this.removeNotificationHandler(key, handler);
                resolve(msg.endsWith("createConn-success") ? 1 : 0);
            };
            this.setNotificationHandler(key, handler);
            this.sendNotification(`createConn-${type}-${sip}-${sp}-${proto === "udp" ? 0 : dip}-${proto === "udp" ? 0 : dp}`);
        });
    }

    // Remove connection, resolves 1 if success, 0 if fail
    removeConn(type, sip, sp, dip, dp) {
        return new Promise(resolve => {
            const proto = type & 0x80 ? "tcp" : "udp";
            const key = proto === "udp" ? `${proto}::${sp}::0:0` : `${proto}::${sp}::${dip}:${dp}`;
            const handler = msg => {
                this.removeNotificationHandler(key, handler);
                resolve(msg.endsWith("removeConn-success") ? 1 : 0);
            };
            this.setNotificationHandler(key, handler);
            this.sendNotification(`removeConn-${type}-${sip}-${sp}-${proto === "udp" ? 0 : dip}-${proto === "udp" ? 0 : dp}`);
        });
    }




    /* ---------------- HANDLER REGISTRATION ---------------- */

    // setOnNotification: Sets fallback handler for unknown notifications
    // Input: callback (function receiving raw notification string)
    // Example: setOnNotification(msg => console.log(msg))
    // msg could be any notification string sent by native, e.g., "dataReady", "close-current"
    setOnNotification(callback) { this.onNotification = callback; }


    /* ---------------- CALLBACKS ---------------- */

    // Sets or replaces the error callback; removes the old one if present
    onError(cb) {
        if (this._err) this.removeNotificationHandler("error", this._err);
        this._err = cb;
        if (cb) this.setNotificationHandler("error", cb);
    }

    // Sets or replaces the client-connected callback; removes the old one if present
    onClientConnected(cb) {
        if (this._conn) this.removeNotificationHandler("connected", this._conn);
        this._conn = cb;
        if (cb) this.setNotificationHandler("connected", cb);
    }

}
