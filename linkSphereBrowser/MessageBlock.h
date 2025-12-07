#pragma once
#include <cstdint>      // for uint8_t, uint16_t, uint32_t
#include <cstring>      // for std::memcpy
#include <memory>       // for std::unique_ptr
#include <stdexcept> 
class MessageBlock {
public:
    // construct from external data + total size
    MessageBlock(const uint8_t* dataPtr, uint32_t totalSize)
        : totalSize(totalSize){

        if (totalSize < 13) throw std::runtime_error("Invalid message size");

        // make internal copy
        dataStorage = std::make_unique<uint8_t[]>(totalSize);
        std::memcpy(dataStorage.get(), dataPtr, totalSize);

        // set raw pointer to internal storage
        rawData = dataStorage.get();

        // set internal pointers for header/payload
        type = rawData[0];
        src = rawData + 1;
        dst = rawData + 7;
        payload = rawData + 13;
        payloadSize = totalSize - 13;
    }

    // --- accessors ---
    uint8_t getType() const { return type; }          // 0=TCP, 1=UDP
    const uint8_t* getSrcIP() const { return src; }
    uint16_t getSrcPort() const { return (src[4] << 8) | src[5]; }
    const uint8_t* getDstIP() const { return dst; }
    uint16_t getDstPort() const { return (dst[4] << 8) | dst[5]; }
    const uint8_t* getPayload() const { return payload; }
    uint32_t getPayloadSize() const { return payloadSize; }
    const uint8_t* getRawData() const { return rawData; }
    uint32_t getTotalSize() const { return totalSize; }

private:
    std::unique_ptr<uint8_t[]> dataStorage; // owns memory
    uint8_t* rawData;                        // raw pointer to internal copy
    uint8_t type;
    uint8_t* src;
    uint8_t* dst;
    uint8_t* payload;
    uint32_t payloadSize;
    uint32_t totalSize;
};
