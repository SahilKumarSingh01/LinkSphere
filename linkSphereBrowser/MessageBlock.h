#pragma once
#include <cstdint>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <sstream>

class MessageBlock {
public:
    // construct from external data
    MessageBlock(const uint8_t* dataPtr, uint32_t size)
    {
        if (size < 17)
            throw std::runtime_error("Invalid message size");

        dataStorage = std::make_unique<uint8_t[]>(size);
        std::memcpy(dataStorage.get(), dataPtr, size);

        rawData = dataStorage.get();
        updateInternalPointers();
    }

    // --- accessors ---
    uint32_t getTotalSize() const {
        return (rawData[0] << 24) | (rawData[1] << 16) | (rawData[2] << 8) | rawData[3];
    }

    uint8_t getType() const { return type; }

    // Return IP as uint32_t in network byte order
    uint32_t getSrcIP() const {
        return (uint32_t(src[0]) << 24) | (uint32_t(src[1]) << 16) | (uint32_t(src[2]) << 8) | uint32_t(src[3]);
    }
    uint16_t getSrcPort() const { return (src[4] << 8) | src[5]; }

    uint32_t getDstIP() const {
        return (uint32_t(dst[0]) << 24) | (uint32_t(dst[1]) << 16) | (uint32_t(dst[2]) << 8) | uint32_t(dst[3]);
    }
    uint16_t getDstPort() const { return (dst[4] << 8) | dst[5]; }

    const uint8_t* getPayload() const { return payload; }
    uint32_t getPayloadSize() const { return getTotalSize() - 17; }

    const uint8_t* getRawData() const { return rawData; }

    // --- setters ---
    void setType(uint8_t newType) {
        type = newType;
        rawData[4] = type;
    }

    void setSrc(const uint8_t* newSrc, uint16_t port) {
        std::memcpy(src, newSrc, 4);
        src[4] = (port >> 8) & 0xFF;
        src[5] = port & 0xFF;
    }

    void setDst(const uint8_t* newDst, uint16_t port) {
        std::memcpy(dst, newDst, 4);
        dst[4] = (port >> 8) & 0xFF;
        dst[5] = port & 0xFF;
    }

    void setPayload(const uint8_t* newPayload, uint32_t size) {
        uint32_t newTotal = size + 17;
        if (newTotal > getAllocatedSize())
            throw std::runtime_error("Payload size exceeds allocated buffer");

        std::memcpy(payload, newPayload, size);
        setTotalSize(newTotal);
        updateInternalPointers();
    }

    void setTotalSize(uint32_t newSize) {
        if (newSize < 17)
            throw std::runtime_error("Total size too small");

        rawData[0] = (newSize >> 24) & 0xFF;
        rawData[1] = (newSize >> 16) & 0xFF;
        rawData[2] = (newSize >> 8) & 0xFF;
        rawData[3] = newSize & 0xFF;
    }
    //addition
    // ----------------- STRING GETTERS -----------------

    std::string getSrcString() const {
        std::stringstream ss;
        ss << (int)src[0] << "."
            << (int)src[1] << "."
            << (int)src[2] << "."
            << (int)src[3] ;
        return ss.str();
    }

    std::string getDstString() const {
        std::stringstream ss;
        ss << (int)dst[0] << "."
            << (int)dst[1] << "."
            << (int)dst[2] << "."
            << (int)dst[3] ;
        return ss.str();
    }


    // ----------------- STRING SETTERS -----------------

    void setSrc(const std::string& ipPort) {
        uint32_t a, b, c, d;
        uint32_t port;
        char dot, colon;

        std::stringstream ss(ipPort);
        ss >> a >> dot >> b >> dot >> c >> dot >> d >> colon >> port;

        uint8_t tmp[4] = { (uint8_t)a, (uint8_t)b, (uint8_t)c, (uint8_t)d };
        setSrc(tmp, (uint16_t)port);
    }

    void setDst(const std::string& ipPort) {
        uint32_t a, b, c, d;
        uint32_t port;
        char dot, colon;

        std::stringstream ss(ipPort);
        ss >> a >> dot >> b >> dot >> c >> dot >> d >> colon >> port;

        uint8_t tmp[4] = { (uint8_t)a, (uint8_t)b, (uint8_t)c, (uint8_t)d };
        setDst(tmp, (uint16_t)port);
    }

private:
    void updateInternalPointers() {
        type = rawData[4];
        src = rawData + 5;
        dst = rawData + 11;
        payload = rawData + 17;
    }

    uint32_t getAllocatedSize() const {
        // just return the actual allocated buffer size
        return static_cast<uint32_t>(dataStorage ? sizeof(dataStorage) : 0);
    }

private:
    std::unique_ptr<uint8_t[]> dataStorage; // owns memory
    uint8_t* rawData;                        // points to internal storage
    uint8_t type;
    uint8_t* src;
    uint8_t* dst;
    uint8_t* payload;
};
