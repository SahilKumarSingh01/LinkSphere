#include <cstdint>
#include <cstring>
using BYTE = uint8_t;

class MessageChannel
{
public:
    MessageChannel(BYTE* sharedPtr, size_t totalSize, bool isLeftMaster)
    {
        if (!sharedPtr) throw "null";
        if (totalSize < 18) throw "small";

        size_t half = totalSize / 2;

        uint32_t leftDataRegionSize = (uint32_t)(half - 9);
        uint32_t rightDataRegionSize = (uint32_t)(totalSize - half - 9);

        if (leftDataRegionSize < 4 || rightDataRegionSize < 4) throw "tiny";

        // --- Left pointers ---
        BYTE* leftFlag = sharedPtr + 0;
        BYTE* leftRead = sharedPtr + 1;
        BYTE* leftWrite = sharedPtr + 5;
        BYTE* leftData = sharedPtr + 9;

        // --- Right pointers ---
        BYTE* rightFlag = sharedPtr + half + 0;
        BYTE* rightRead = sharedPtr + half + 1;
        BYTE* rightWrite = sharedPtr + half + 5;
        BYTE* rightData = sharedPtr + half + 9;

        // --- Assign master/slave ---
        if (isLeftMaster)
        {
            masterFlag = leftFlag;
            masterWrite = leftWrite;
            masterData = leftData;
            masterDataRegionSize = leftDataRegionSize;

            masterRead = rightRead; // master reads from right

            slaveFlag = rightFlag;
            slaveWrite = rightWrite;
            slaveData = rightData;
            slaveRead = leftRead;
            slaveDataRegionSize = rightDataRegionSize;
        }
        else
        {
            masterFlag = rightFlag;
            masterWrite = rightWrite;
            masterData = rightData;
            masterDataRegionSize = rightDataRegionSize;

            masterRead = leftRead;  // master reads from left

            slaveFlag = leftFlag;
            slaveWrite = leftWrite;
            slaveData = leftData;
            slaveRead = rightRead;
            slaveDataRegionSize = leftDataRegionSize;
        }

        // Optional initialization if process owns shared memory
        /*
        memset(masterFlag, 0, 1);
        memset(slaveFlag, 0, 1);
        store32(masterWrite, 0);
        store32(masterRead, 0);
        store32(slaveWrite, 0);
        store32(slaveRead, 0);
        */
    }

    // --- Master writing ---
    size_t availableToWrite() const
    {
        uint32_t r = load32(slaveRead);  // what slave has read
        uint32_t w = load32(masterWrite);

        uint32_t used = (w >= r) ? (w - r) : (masterDataRegionSize - (r - w));//-1 to differ empty and full
        return masterDataRegionSize - 1 - used;// as four bytes is needed for size of data; 
    }

    int writeBuf(const BYTE* src, uint32_t size)
    {
        if (!src || size == 0 || availableToWrite() < size + 4 ) return 0; 

        uint32_t w = load32(masterWrite);

        writeRegion(masterData, masterDataRegionSize, w, (BYTE*)&size, 4);
        w = (w + 4) % masterDataRegionSize;

        writeRegion(masterData, masterDataRegionSize, w, src, size);
        w = (w + size) % masterDataRegionSize;

        store32(masterWrite, w);
        *masterFlag |= 1;

        return size;
    }


    // --- Master reading from slave ---
    size_t availableToRead() const
    {
        uint32_t r = load32(masterRead);
        uint32_t w = load32(slaveWrite);

        return (w >= r) ? (w - r) : (slaveDataRegionSize - (r - w));
    }

    uint32_t sizeofNextMessage() const
    {
        if (availableToRead() < 4) return 0;

        uint32_t r = load32(masterRead);
        uint32_t sz = 0;

        // read 4-byte header safely using readRegion
        readRegion(slaveData, slaveDataRegionSize, r, (BYTE*)&sz, 4);

        return sz;
    }


    int readBuf(BYTE* dst, uint32_t maxLen)
    {
        uint32_t avail = (uint32_t)availableToRead();
        if (avail < 4) return 0; // not enough for header

        uint32_t r = load32(masterRead);
        uint32_t sz = 0;

        // read 4-byte header safely
        readRegion(slaveData, slaveDataRegionSize, r, (BYTE*)&sz, 4);

        if (sz == 0 || sz > maxLen) return 0;
        if (avail < sz + 4) return 0;

        r = (r + 4) % slaveDataRegionSize;

        // read message payload
        readRegion(slaveData, slaveDataRegionSize, r, dst, sz);
        r = (r + sz) % slaveDataRegionSize;

        store32(masterRead, r);
        *slaveFlag = 1; // optional notification

        return sz; // return actual bytes read
    }

    BYTE *getMasterFlagPtr() {
        return masterFlag;
    }

    BYTE* getSlaveFlagPtr() const {
        return slaveFlag;
    }

private:

    // --- Master/Slave pointers ---
    BYTE* masterFlag;
    BYTE* masterRead;    // master reads from slave
    BYTE* masterWrite;   // master writes to own region
    BYTE* masterData;
    uint32_t masterDataRegionSize;

    BYTE* slaveFlag;
    BYTE* slaveRead;     // unused by master
    BYTE* slaveWrite;    // slave writes here
    BYTE* slaveData;
    uint32_t slaveDataRegionSize;

    // --- Helpers ---
    static uint32_t load32(BYTE* p)
    {
        uint32_t v;
        memcpy(&v, p, 4);
        return v;
    }

    static void store32(BYTE* p, uint32_t v)
    {
        memcpy(p, &v, 4);
    }

    static void writeRegion(BYTE* base, uint32_t size, uint32_t off, const BYTE* src, uint32_t cnt)
    {
        uint32_t first = (cnt < size - off) ? cnt : (size - off);
        memcpy(base + off, src, first);
        if (cnt > first) memcpy(base, src + first, cnt - first);
    }

    static void readRegion(const BYTE* base, uint32_t size, uint32_t off, BYTE* dst, uint32_t cnt)
    {
        uint32_t first = (cnt < size - off) ? cnt : (size - off);
        memcpy(dst, base + off, first);
        if (cnt > first) memcpy(dst + first, base, cnt - first);
    }
};
