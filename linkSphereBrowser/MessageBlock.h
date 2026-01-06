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
        setTotalSize(size);
    }

    MessageBlock(uint32_t totalSize) {
        if (totalSize < 17)
            throw std::runtime_error("Total size must be at least 17");

        dataStorage = std::make_unique<uint8_t[]>(totalSize);
        updateInternalPointers();
        setTotalSize(totalSize);
    }
    
    MessageBlock() {
        MessageBlock(17);
    }




    uint8_t* getNetMsgWritePtr() {

        return rawData + 12;
    }

    void finalizeNetMsg() {
    }



    // --- accessors ---
    uint32_t getTotalSize() const {
        return (totalSize[0] << 24) | (totalSize[1] << 16) |
            (totalSize[2] << 8) | totalSize[3];
    }

    uint8_t getType() const { return type; }

    uint32_t getSrcIP() const {
        return (uint32_t(src[0]) << 24) | (uint32_t(src[1]) << 16) |
            (uint32_t(src[2]) << 8) | uint32_t(src[3]);
    }

    uint16_t getSrcPort() const { return (src[4] << 8) | src[5]; }

    uint32_t getDstIP() const {
        return (uint32_t(dst[0]) << 24) | (uint32_t(dst[1]) << 16) |
            (uint32_t(dst[2]) << 8) | uint32_t(dst[3]);
    }

    uint16_t getDstPort() const { return (dst[4] << 8) | dst[5]; }

    const uint8_t* getPayload() const { return payload; }

    uint32_t getPayloadSize() const { return getTotalSize() - 17; }

    uint32_t getNetMsgSize() const { return getTotalSize()-12; }

    const uint8_t* getRawData() const { return rawData; }

    const uint8_t* getNetMsg() const { return rawData + 12; }

    // --- setters ---
    void setSrcPort(uint16_t port) {
        src[4] = (port >> 8) & 0xFF;
        src[5] = port & 0xFF;
    }

    void setDstPort(uint16_t port) {
        dst[4] = (port >> 8) & 0xFF;
        dst[5] = port & 0xFF;
    }

    void setType(uint8_t newType) {
        type = newType;
        typePtr[0] = newType;
    }

    void setSrc(const uint8_t* newSrc, uint16_t port) {
        std::memcpy(src, newSrc, 4);
        setSrcPort(port);
    }

    void setDst(const uint8_t* newDst, uint16_t port) {
        std::memcpy(dst, newDst, 4);
        setDstPort(port);
    }

    void setPayload(const uint8_t* newPayload, uint32_t size) {
        uint32_t newTotal = size + 17;
        auto newBuffer = std::make_unique<uint8_t[]>(newTotal);

        // copy headers + type
        std::memcpy(newBuffer.get(), rawData, 12);
        newBuffer[16] = type;

        // copy new payload
        std::memcpy(newBuffer.get() + 17, newPayload, size);

        dataStorage = std::move(newBuffer);
        rawData = dataStorage.get();
        updateInternalPointers();
        setTotalSize(newTotal);
    }


    // copies network message into internal buffer (starting at totalSize)
    void setNetMsg(const uint8_t* netPtr, uint32_t netSize) {
        uint32_t newSize = netSize + 12;

        dataStorage = std::make_unique<uint8_t[]>(newSize);
        rawData = dataStorage.get();

        std::memcpy(rawData + 12, netPtr, netSize);
        updateInternalPointers();
        setTotalSize(newSize);

    }

    void setTotalSize(uint32_t newSize) {
        if (newSize < 17)
            throw std::runtime_error("Total size too small");

        totalSize[0] = (newSize >> 24) & 0xFF;
        totalSize[1] = (newSize >> 16) & 0xFF;
        totalSize[2] = (newSize >> 8) & 0xFF;
        totalSize[3] = newSize & 0xFF;
    }

    // ----------------- STRING GETTERS -----------------
    std::string getSrcString() const {
        std::stringstream ss;
        ss << (int)src[0] << "." << (int)src[1] << "."
            << (int)src[2] << "." << (int)src[3];
        return ss.str();
    }

    std::string getDstString() const {
        std::stringstream ss;
        ss << (int)dst[0] << "." << (int)dst[1] << "."
            << (int)dst[2] << "." << (int)dst[3];
        return ss.str();
    }

    void setSrcIP(uint32_t ip) {
        src[0] = (ip >> 24) & 0xFF;
        src[1] = (ip >> 16) & 0xFF;
        src[2] = (ip >> 8) & 0xFF;
        src[3] = ip & 0xFF;
    }

    void setDstIP(uint32_t ip) {
        dst[0] = (ip >> 24) & 0xFF;
        dst[1] = (ip >> 16) & 0xFF;
        dst[2] = (ip >> 8) & 0xFF;
        dst[3] = ip & 0xFF;
    }

    // ----------------- STRING SETTERS -----------------
    void setSrc(const std::string& ipPort) {
        uint32_t a, b, c, d, port;
        char dot, colon;
        std::stringstream ss(ipPort);
        ss >> a >> dot >> b >> dot >> c >> dot >> d >> colon >> port;
        uint8_t tmp[4] = { (uint8_t)a, (uint8_t)b, (uint8_t)c, (uint8_t)d };
        setSrc(tmp, (uint16_t)port);
    }

    void setDst(const std::string& ipPort) {
        uint32_t a, b, c, d, port;
        char dot, colon;
        std::stringstream ss(ipPort);
        ss >> a >> dot >> b >> dot >> c >> dot >> d >> colon >> port;
        uint8_t tmp[4] = { (uint8_t)a, (uint8_t)b, (uint8_t)c, (uint8_t)d };
        setDst(tmp, (uint16_t)port);
    }

private:
    void updateInternalPointers() {
        rawData = dataStorage.get();
        src = rawData;          // 0–5
        dst = rawData + 6;      // 6–11
        totalSize = rawData + 12;     // 12–15
        typePtr = rawData + 16;     // 16
        type = typePtr[0];
        payload = rawData + 17;     // 17+
    }

private:
    std::unique_ptr<uint8_t[]> dataStorage;
    uint8_t* rawData{};
    uint8_t  type{};
    uint8_t* typePtr{};
    uint8_t* src{};
    uint8_t* dst{};
    uint8_t* totalSize{};
    uint8_t* payload{};
};
