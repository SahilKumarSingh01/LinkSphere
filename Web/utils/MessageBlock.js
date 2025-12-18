export class MessageBlock {
    constructor(input) {
        if (typeof input === "number") {
            if (input < 17) throw new Error("Buffer size must be at least 17 bytes");
            this._buffer = new Uint8Array(input);
            this.setTotalSize(input); // initialize totalSize automatically
        } else if (input instanceof Uint8Array) {
            if (input.length < 17) throw new Error("Invalid message size");
            this._buffer = new Uint8Array(input); // copy existing data
        } else {
            throw new Error("Constructor argument must be a number or Uint8Array");
        }
    }


    // --- getters ---
    getTotalSize() {
        return (this._buffer[0] << 24) | (this._buffer[1] << 16) | (this._buffer[2] << 8) | this._buffer[3];
    }

    getType() {
        return this._buffer[4];
    }

    getSrcIP() {
        return (this._buffer[5] << 24) | (this._buffer[6] << 16) | (this._buffer[7] << 8) | this._buffer[8];
    }

    getSrcPort() {
        return (this._buffer[9] << 8) | this._buffer[10];
    }

    getDstIP() {
        return (this._buffer[11] << 24) | (this._buffer[12] << 16) | (this._buffer[13] << 8) | this._buffer[14];
    }

    getDstPort() {
        return (this._buffer[15] << 8) | this._buffer[16];
    }

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
        return `${this._buffer[5]}.${this._buffer[6]}.${this._buffer[7]}.${this._buffer[8]}`;
    }

    getDstString() {
        return `${this._buffer[11]}.${this._buffer[12]}.${this._buffer[13]}.${this._buffer[14]}`;
    }

    // --- setters ---
    setType(newType) {
        this._buffer[4] = newType;
    }

    setSrc(ipBytes, port) {
        this._buffer.set(ipBytes.slice(0, 4), 5);
        this._buffer[9] = (port >> 8) & 0xFF;
        this._buffer[10] = port & 0xFF;
    }

    setDst(ipBytes, port) {
        this._buffer.set(ipBytes.slice(0, 4), 11);
        this._buffer[15] = (port >> 8) & 0xFF;
        this._buffer[16] = port & 0xFF;
    }

    setPayload(payload) {
        const newTotal = payload.length + 17;
        if (newTotal > this._buffer.length) throw new Error("Payload size exceeds allocated buffer");

        this._buffer.set(payload, 17);
        this.setTotalSize(newTotal);
    }

    setTotalSize(newSize) {
        if (newSize < 17) throw new Error("Total size too small");
        this._buffer[0] = (newSize >> 24) & 0xFF;
        this._buffer[1] = (newSize >> 16) & 0xFF;
        this._buffer[2] = (newSize >> 8) & 0xFF;
        this._buffer[3] = newSize & 0xFF;
    }

    setSrcString(ipPort) {
        const [ip, port] = ipPort.split(":");
        const bytes = ip.split(".").map(Number);
        this.setSrc(bytes, parseInt(port));
    }

    setDstString(ipPort) {
        const [ip, port] = ipPort.split(":");
        const bytes = ip.split(".").map(Number);
        this.setDst(bytes, parseInt(port));
    }
}
