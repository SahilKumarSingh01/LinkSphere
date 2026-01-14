export class MessageBlock {
    constructor(input) {
        if (typeof input === "number") {
            if (input < 17) throw new Error("Buffer size must be at least 17 bytes");
            this._buffer = new Uint8Array(input);
            this.setTotalSize(input);
        } else if (input instanceof Uint8Array) {
            if (input.length < 17) throw new Error("Invalid message size");
            this._buffer = new Uint8Array(input);
        } else {
            throw new Error("Constructor argument must be a number or Uint8Array");
        }
    }

    // layout:
    // 0–3   srcIP
    // 4–5   srcPort
    // 6–9   dstIP
    // 10–11 dstPort
    // 12–15 totalSize
    // 16    type
    // 17+   payload

    // --- getters ---
    getSrcIP() {
        return (
            (this._buffer[0] << 24) |
            (this._buffer[1] << 16) |
            (this._buffer[2] << 8) |
            this._buffer[3]
        ) >>> 0;
    }

    getSrcPort() {
        return (this._buffer[4] << 8) | this._buffer[5];
    }

    getDstIP() {
        return (
            (this._buffer[6] << 24) |
            (this._buffer[7] << 16) |
            (this._buffer[8] << 8) |
            this._buffer[9]
        ) >>> 0;
    }

    getDstPort() {
        return (this._buffer[10] << 8) | this._buffer[11];
    }

    getTotalSize() {
        return (
            (this._buffer[12] << 24) |
            (this._buffer[13] << 16) |
            (this._buffer[14] << 8) |
            this._buffer[15]
        );
    }

    getType() {
        return this._buffer[16];
    }zzz

    getPayload() {
        return this._buffer.subarray(17);
    }

    getPayloadSize() {
        return this.getTotalSize() - 17;
    }

    getRawData() {
        return this._buffer;
    }

    getSrcString() {
        return `${this._buffer[0]}.${this._buffer[1]}.${this._buffer[2]}.${this._buffer[3]}`;
    }

    getDstString() {
        return `${this._buffer[6]}.${this._buffer[7]}.${this._buffer[8]}.${this._buffer[9]}`;
    }

    // --- setters ---
    setSrc(ipNum, port) {
        this._buffer[0] = (ipNum >>> 24) & 0xFF;
        this._buffer[1] = (ipNum >>> 16) & 0xFF;
        this._buffer[2] = (ipNum >>> 8) & 0xFF;
        this._buffer[3] = ipNum & 0xFF;

        this._buffer[4] = (port >> 8) & 0xFF;
        this._buffer[5] = port & 0xFF;
    }

    setDst(ipNum, port) {
        this._buffer[6] = (ipNum >>> 24) & 0xFF;
        this._buffer[7] = (ipNum >>> 16) & 0xFF;
        this._buffer[8] = (ipNum >>> 8) & 0xFF;
        this._buffer[9] = ipNum & 0xFF;

        this._buffer[10] = (port >> 8) & 0xFF;
        this._buffer[11] = port & 0xFF;
    }

    setTotalSize(newSize) {
        if (newSize < 17) throw new Error("Total size too small");
        this._buffer[12] = (newSize >> 24) & 0xFF;
        this._buffer[13] = (newSize >> 16) & 0xFF;
        this._buffer[14] = (newSize >> 8) & 0xFF;
        this._buffer[15] = newSize & 0xFF;
    }

    setType(newType) {
        this._buffer[16] = newType;
    }

    setPayload(payload) {
        const newTotal = payload.length + 17;
        if (newTotal > this._buffer.length)
            throw new Error("Payload size exceeds allocated buffer");

        this._buffer.set(payload, 17);
        this.setTotalSize(newTotal);
    }

    setSrcString(ipPort) {
        const [ip, port] = ipPort.split(":");
        const [a, b, c, d] = ip.split(".").map(Number);
        const ipNum = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
        this.setSrc(ipNum, parseInt(port, 10));
    }

    setDstString(ipPort) {
        const [ip, port] = ipPort.split(":");
        const [a, b, c, d] = ip.split(".").map(Number);
        const ipNum = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
        this.setDst(ipNum, parseInt(port, 10));
    }
}
