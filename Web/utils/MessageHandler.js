import { MessageChannel } from "./MessageChannel.js";
import { MessageBlock } from "./MessageBlock.js";

export default class MessageHandler {
    constructor() {
        this.channel = null;
        this.onMessageReceiveHandler = new Map();
        this.onNotification = null;
        this.notificationHandlers = new Map();
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
                3000
            ));
        });

    }

    getDefaultIP = () => this.defaultIP;

    
    clearPendingTCP(p) {
        if (!this.pendingTCP) return;
        const t = this.pendingTCP.get(p);
        if (!t) return;
        clearTimeout(t);
        this.pendingTCP.delete(p);
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

        // Handle notifications first
        if (msg !== "dataReady") {
            const sep = msg.indexOf("-");
            const handler = sep !== -1 ? this.notificationHandlers.get(msg.slice(0, sep)) : null;
            if (handler) return handler(msg.slice(sep + 1));
            if (this.onNotification) return this.onNotification(msg);
        }

        if (!this.channel) return;

        // Process all messages in buffer
        let size;
        while ((size = await this.channel.sizeofNextMessage()) > 0) {
            const buf = new Uint8Array(size);
            await this.channel.readBuf(buf, size);
            setTimeout(() => {
                try {
                    const block = new MessageBlock(buf);
                    const handler = this.onMessageReceiveHandler.get(block.getType());
                    if (!handler) return;

                    handler(block.getSrcIP(),block.getSrcPort(),block.getDstIP(),
                        block.getDstPort(),block.getType(), block.getPayload());
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
                console.log(this.localIPs);
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

    /* ---------------- REMOVE HANDLERS ---------------- */

    // removeMessageHandler: Removes handler for a message type
    // Input: type (number)
    // Example: removeMessageHandler(1)
    removeMessageHandler(type) { this.onMessageReceiveHandler.delete(type); }

    // removeNotificationHandler: Removes handler for a notification
    // Input: event (string)
    // Example: removeNotificationHandler("IpAssigned")
    removeNotificationHandler(event) { this.notificationHandlers.delete(event); }

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
    mouseLeft = () => this.sendNotification("mouseLeft");
    mouseRight = () => this.sendNotification("mouseRight");
    mouseScroll = d => this.sendNotification(`mouseScroll-${d}`); // Example: mouseScroll(5)
    keyDown = k => this.sendNotification(`keyDown-${k}`); // Example: keyDown(65)
    keyUp = k => this.sendNotification(`keyUp-${k}`); // Example: keyUp(65)
    keyPress = k => this.sendNotification(`keyPress-${k}`); // Example: keyPress(65)

    /* ---------------- CONNECTION CONTROL ---------------- */

    // createConn: Requests native to create connection
    // Input: type, srcIP, srcPort, dstIP, dstPort
    // Output: Promise<number> (1 if success, 0 if fail)
    // Example: await createConn(1, 3232235521, 5173, 3232235522, 6000)
    createConn(type, sip, sp, dip, dp) {
        return new Promise((resolve) => {
            const key = `${type}::${sip}:${sp}::${dip}:${dp}`;

            const handler = (param) => {
                this.removeNotificationHandler(key);
                resolve(param.endsWith("create-success") ? 1 : 0);
            };

            this.setNotificationHandler(key, handler);
            this.sendNotification(`createConn-${type}-${sip}-${sp}-${dip}-${dp}`);
        });
    }

    // onSendFailed: Sets/removes callback for a send failure for a connection
    // Input: type, srcIP, srcPort, dstIP, dstPort, cb (function or null)
    // Example: onSendFailed(1, 3232235521, 5173, 3232235522, 6000, cb)
    onSendFailed(type, srcIP, srcPort, dstIP, dstPort, cb) {
        const key = `${type}::${srcIP}:${srcPort}::${dstIP}:${dstPort}`;
        if (cb) this.setNotificationHandler(key, cb);
        else this.removeNotificationHandler(key);
    }

    // removeConn: Requests native to remove connection
    // Input: type, srcIP, srcPort, dstIP, dstPort
    // Output: Promise<number> (1 if success, 0 if fail)
    // Example: await removeConn(1, 3232235521, 5173, 3232235522, 6000)
    removeConn(type, sip, sp, dip, dp) {
        return new Promise((resolve) => {
            const key = `${type}::${sip}:${sp}::${dip}:${dp}`;

            const handler = (param) => {
                this.removeNotificationHandler(key);
                resolve(param.endsWith("removeConn-success") ? 1 : 0);
            };

            this.setNotificationHandler(key, handler);
            this.sendNotification(`removeConn-${type}-${sip}-${sp}-${dip}-${dp}`);
        });
    }


    /* ---------------- HANDLER REGISTRATION ---------------- */

    // setNotificationHandler: Sets handler for a specific notification
    // Input: event (string), handler (function receiving notification payload as string)
    // Example: setNotificationHandler("IpAssigned", msg => console.log(msg))
    // Notification payload examples:
    // "IpAssigned" => "192.168.0.10|eth0"
    // "serverStarted" => "5173"
    // "Error" => "Failed to start server"
    setNotificationHandler(event, handler) { this.notificationHandlers.set(event, handler); }

    // setOnMessageReceive: Sets handler for a message type
    // Input: type (number), callback (function receiving positional message arguments)
    // Example: setOnMessageReceive(1, (src, srcPort, dst, dstPort, type, payload) => console.log(src, dst, payload))
    // Callback argument format:
    // src: number (IP as integer)
    // srcPort: number
    // dst: number (IP as integer)
    // dstPort: number
    // type: number
    // payload: Uint8Array
    setOnMessageReceive(type, callback) { this.onMessageReceiveHandler.set(type, callback); }

    // setOnNotification: Sets fallback handler for unknown notifications
    // Input: callback (function receiving raw notification string)
    // Example: setOnNotification(msg => console.log(msg))
    // msg could be any notification string sent by native, e.g., "dataReady", "close-current"
    setOnNotification(callback) { this.onNotification = callback; }


    /* ---------------- CALLBACKS ---------------- */

    // onError: Sets or removes callback for errors
    // Input: cb (function receiving error message string) or null
    // Example: onError(msg => console.log(msg))
    // Error messages could be "Failed to start server", "Connection lost", etc.
    onError(cb) { cb ? this.setNotificationHandler("Error", cb) : this.removeNotificationHandler("Error"); }

    // onClientConnected: Sets or removes callback for client connection
    // Input: cb (function receiving client info as string) or null
    // Example: onClientConnected(msg => console.log(msg))
    // msg could be "3232235522:6000" (client IP and port)
    onClientConnected(cb) { cb ? this.setNotificationHandler("connected", cb) : this.removeNotificationHandler("connected"); }

}
