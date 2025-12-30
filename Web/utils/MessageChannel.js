import { Mutex } from "@utils/Mutex.js"; 
export class MessageChannel {
    constructor(sharedPtr, totalSize, isLeftMaster) {
        if (!sharedPtr) throw "null";
        if (totalSize < 18) throw "small";
        const half = Math.floor(totalSize / 2);

        const leftDataRegionSize = half - 9;
        const rightDataRegionSize = totalSize - half - 9;

        if (leftDataRegionSize < 4 || rightDataRegionSize < 4) throw "tiny";

        // --- Left pointers ---
        const leftFlag = 0;
        const leftRead = 1;
        const leftWrite = 5;
        const leftData = 9;

        // --- Right pointers ---
        const rightFlag = half + 0;
        const rightRead = half + 1;
        const rightWrite = half + 5;
        const rightData = half + 9;

        this.shared = sharedPtr;

        if (isLeftMaster) {
            this.masterFlag = leftFlag;
            this.masterWrite = leftWrite;
            this.masterData = leftData;
            this.masterDataRegionSize = leftDataRegionSize;

            this.masterRead = rightRead;

            this.slaveFlag = rightFlag;
            this.slaveWrite = rightWrite;
            this.slaveData = rightData;
            this.slaveRead = leftRead;
            this.slaveDataRegionSize = rightDataRegionSize;
        } else {
            this.masterFlag = rightFlag;
            this.masterWrite = rightWrite;
            this.masterData = rightData;
            this.masterDataRegionSize = rightDataRegionSize;

            this.masterRead = leftRead;

            this.slaveFlag = leftFlag;
            this.slaveWrite = leftWrite;
            this.slaveData = leftData;
            this.slaveRead = rightRead;
            this.slaveDataRegionSize = leftDataRegionSize;
        }
        this.readLock = new Mutex();
        this.writeLock = new Mutex();
        console.log(Mutex);

    }

    // --- Master writing ---
    async availableToWrite() {
        await this.writeLock.lock();
        try {
            return this.availableToWriteUnsafe();
        } finally {
            this.writeLock.unlock();
        }
    }

    availableToWriteUnsafe() {
        const r = this.load32(this.slaveRead);
        const w = this.load32(this.masterWrite);

        const used = (w >= r)
            ? (w - r)
            : (this.masterDataRegionSize - (r - w));

        return this.masterDataRegionSize - 1 - used;
    }

    async writeBuf(src, size) {
        await this.writeLock.lock();
        try {
            if (!src || size === 0 || this.availableToWriteUnsafe() < size + 4)
                return 0;

            let w = this.load32(this.masterWrite);

            this.writeRegion(
                this.masterData,
                this.masterDataRegionSize,
                w,
                this.u32ToBytes(size),
                4
            );
            w = (w + 4) % this.masterDataRegionSize;

            this.writeRegion(
                this.masterData,
                this.masterDataRegionSize,
                w,
                src,
                size
            );
            w = (w + size) % this.masterDataRegionSize;

            this.store32(this.masterWrite, w);
            this.shared[this.masterFlag] |= 1;
            return size;
        } finally {
            this.writeLock.unlock();
        }

    }


    // --- Master reading ---
    async availableToRead() {
        await this.readLock.lock();
        try {
            return this.availableToReadUnsafe();
        } finally {
            this.readLock.unlock();
        }
    }

    availableToReadUnsafe() {
        const r = this.load32(this.masterRead);
        const w = this.load32(this.slaveWrite);

        return (w >= r)
            ? (w - r)
            : (this.slaveDataRegionSize - (r - w));
    }

    async sizeofNextMessage() {
        await this.readLock.lock();
        try {
            if (this.availableToReadUnsafe() < 4) return 0;

            const r = this.load32(this.masterRead);
            return this.read32Wrapped(
                this.slaveData,
                this.slaveDataRegionSize,
                r
            );
        } finally {
            this.readLock.unlock();
        }
    }

    async readBuf(dst, maxLen) {
        await this.readLock.lock();
        try {
            const avail = this.availableToReadUnsafe();
            if (avail < 4) return 0;

            let r = this.load32(this.masterRead);
            let sz = this.read32Wrapped(
                this.slaveData,
                this.slaveDataRegionSize,
                r
            );

            if (sz === 0 || sz > maxLen) return 0;
            if (avail < sz + 4) return 0;

            r = (r + 4) % this.slaveDataRegionSize;

            this.readRegion(
                this.slaveData,
                this.slaveDataRegionSize,
                r,
                dst,
                sz
            );
            r = (r + sz) % this.slaveDataRegionSize;

            this.store32(this.masterRead, r);
            this.shared[this.slaveFlag] = 1;

            return sz;
        } finally {
            this.readLock.unlock();
        }
    }


    getMasterFlagPtr() {
        return this.masterFlag;
    }

    getSlaveFlagPtr() {
        return this.slaveFlag;
    }

    // --- Helpers ---
    load32(off) {
        return (this.shared[off] |
               (this.shared[off + 1] << 8) |
               (this.shared[off + 2] << 16) |
               (this.shared[off + 3] << 24)) >>> 0;
    }

    store32(off, v) {
        this.shared[off] = v & 0xFF;
        this.shared[off + 1] = (v >> 8) & 0xFF;
        this.shared[off + 2] = (v >> 16) & 0xFF;
        this.shared[off + 3] = (v >> 24) & 0xFF;
    }

    u32ToBytes(v) {
        return new Uint8Array([
            v & 0xFF,
            (v >> 8) & 0xFF,
            (v >> 16) & 0xFF,
            (v >> 24) & 0xFF
        ]);
    }

    writeRegion(baseOff, size, off, src, cnt) {
        const first = (cnt < size - off) ? cnt : (size - off);

        this.shared.set(src.slice(0, first), baseOff + off);
        if (cnt > first) {
            this.shared.set(src.slice(first, cnt), baseOff);
        }
    }

    readRegion(baseOff, size, off, dst, cnt) {
        const first = (cnt < size - off) ? cnt : (size - off);

        dst.set(this.shared.slice(baseOff + off, baseOff + off + first), 0);
        if (cnt > first) {
            dst.set(this.shared.slice(baseOff, baseOff + (cnt - first)), first);
        }
    }

    read32Wrapped(baseOff, size, off) {
        const buf = new Uint8Array(4);
        this.readRegion(baseOff, size, off, buf, 4);

        return (
            buf[0] |
            (buf[1] << 8) |
            (buf[2] << 16) |
            (buf[3] << 24)
        ) >>> 0;
    }
}
