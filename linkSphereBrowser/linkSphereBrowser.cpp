#include <cstdint>
#include <cstring>
#include <iostream>
#include <thread>
#include <chrono>
#include <string>
#include "NetworkManager.h"

// -----------------------------------------
// Callbacks
// -----------------------------------------

void onReceive(const uint8_t* data, uint32_t size) {
    if (size < 17) {
        std::cout << "[RECV] Invalid message\n";
        return;
    }

    // Rebuild the message block
    MessageBlock msg(data, size);

    // Extract payload
    const uint8_t* payload = msg.getPayload();
    uint32_t payloadSize = msg.getPayloadSize();

    // Convert payload to string ONLY
    std::string text((const char*)payload, payloadSize);

    std::cout << "[RECV] " << text << std::endl;
}


void onError(const char* t) {
    std::cout << "[ERR] " << t << std::endl;
}

// -----------------------------------------
// Helper: Build a message buffer
// -----------------------------------------
uint8_t* makeMessage(
    uint8_t type,
    const std::string& srcIP,
    uint16_t srcPort,
    const std::string& dstIP,
    uint16_t dstPort,
    const std::string& payload,
    uint32_t& outSize
) {
    uint32_t pay = payload.size();
    outSize = pay + 17;

    uint8_t* buf = new uint8_t[outSize];

    // total size
    buf[0] = (outSize >> 24) & 0xFF;
    buf[1] = (outSize >> 16) & 0xFF;
    buf[2] = (outSize >> 8) & 0xFF;
    buf[3] = outSize & 0xFF;

    // type
    buf[4] = type;

    // src IP
    uint8_t sip[4];
    sscanf_s(srcIP.c_str(), "%hhu.%hhu.%hhu.%hhu", &sip[0], &sip[1], &sip[2], &sip[3]);
    buf[5] = sip[0]; buf[6] = sip[1]; buf[7] = sip[2]; buf[8] = sip[3];

    // src port
    buf[9] = (srcPort >> 8) & 0xFF;
    buf[10] = srcPort & 0xFF;

    // dst IP
    uint8_t dip[4];
    sscanf_s(dstIP.c_str(), "%hhu.%hhu.%hhu.%hhu", &dip[0], &dip[1], &dip[2], &dip[3]);
    buf[11] = dip[0]; buf[12] = dip[1]; buf[13] = dip[2]; buf[14] = dip[3];

    // dst port
    buf[15] = (dstPort >> 8) & 0xFF;
    buf[16] = dstPort & 0xFF;

    // payload
    memcpy(buf + 17, payload.data(), pay);

    return buf;
}

// -----------------------------------------
// Individual Tests
// -----------------------------------------

void testTCP(NetworkManager& net, uint16_t port) {
    uint32_t size;
    uint8_t* msg = makeMessage(
        1,
        "10.87.117.115", 0, // src
        "127.0.0.1", port,  // dst
        "TCP Test Message",
        size
    );
    net.sendMessage(msg, size);
}

void testUDP(NetworkManager& net, uint16_t port) {
    uint32_t size;
    std::string big(63000, 'A');
    uint8_t* msg = makeMessage(
        0,
        "10.87.117.115", 5000,
        "127.0.0.1", 5000,
        big,
        size
    );
    net.sendMessage(msg, size);
}

void testInvalidType(NetworkManager& net, uint16_t port) {
    uint32_t size;
    uint8_t* msg = makeMessage(
        9,                      // invalid
        "10.87.117.115", 0,
        "127.0.0.1", port,
        "InvalidType",
        size
    );
    net.sendMessage(msg, size);
}

void testMissingConnection(NetworkManager& net, uint16_t port) {
    uint32_t size;
    uint8_t* msg = makeMessage(
        1,
        "8.8.8.8", 443,         // srcPort != 0 → trigger error
        "127.0.0.1", port,
        "ShouldFail",
        size
    );
    net.sendMessage(msg, size);
}

void testSpam(NetworkManager& net, uint16_t port) {
    for (int i = 0; i < 50; i++) {
        uint32_t size;
        uint8_t* msg = makeMessage(
            1,
            "127.0.0.1", 0,
            "127.0.0.1", port,
            "Spam-" + std::to_string(i),
            size
        );
        net.sendMessage(msg, size);
    }
}

void testLarge(NetworkManager& net, uint16_t port) {
    std::string big(40000, 'A'); // 40KB

    uint32_t size;
    uint8_t* msg = makeMessage(
        1,
        "127.0.0.1", 0,
        "127.0.0.1", port,
        big,
        size
    );
    net.sendMessage(msg, size);
}

// -----------------------------------------
// MAIN
// -----------------------------------------

int main() {
    uint16_t port = 5000;

    NetworkManager net(port);
    net.setMessageCallback(onReceive);
    net.onError = onError;

    // ----------------------------
    // CHOOSE TESTS HERE:
    // ----------------------------

    testTCP(net, port);
    //std::this_thread::sleep_for(std::chrono::seconds(10));
    testUDP(net, port);
    testInvalidType(net, port);
    testMissingConnection(net, port);
    testSpam(net, port);
    testLarge(net, port);

    // Block forever
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    return 0;
} 