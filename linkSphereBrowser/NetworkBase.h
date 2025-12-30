#pragma once
#include <winsock2.h>
#include <ws2tcpip.h>
#include <thread>
#include <vector>
#include <string>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include "MessageBlock.h"
#pragma comment(lib, "ws2_32.lib")

//#include <iostream>/*
//using namespace std;*/

struct ConnectionContext {
    std::thread senderThread;
    std::thread receiverThread;

    std::string srcIP;
    std::string destIP;
    uint16_t srcPort;
    uint16_t destPort;

    SOCKET sock = INVALID_SOCKET;
    bool isTCP{false};
    bool isClient{false};

    std::atomic<bool> running{ true };

    std::vector<MessageBlock*> outgoingQueue;
    std::mutex outgoingMutex;
    std::condition_variable outgoingCV;
};

class NetworkBase {
protected:
    std::vector<MessageBlock*> incomingQueue;
    std::mutex incomingMutex;
    std::condition_variable incomingCV;

    void (*onError)(const char* text) = nullptr;
public:
    void setErrorCallback(void (*ecb)(const char* text)) {
        onError = ecb;
    }

    // --------------------------------------------------------------
    // TCP CREATE + THREADS
    // --------------------------------------------------------------
    ConnectionContext* createTCP(const std::string& srcIP, uint16_t srcPort,
        const std::string& destIP, uint16_t destPort){
        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (s == INVALID_SOCKET) {
            if (onError) {
                onError("Failed to create TCP socket");
            }
            return nullptr;
        }

        // Disable Nagle
        BOOL flag = TRUE;
        setsockopt(s, IPPROTO_TCP, TCP_NODELAY,
            (char*)&flag, sizeof(flag));

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(destPort);
        inet_pton(AF_INET, destIP.c_str(), &addr.sin_addr);

        if (connect(s, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
            if (onError) {
                int errCode = WSAGetLastError();
                onError(("TCP connect failed. OS Error: " + getOSErrorString(errCode)).c_str());
            }
            closesocket(s);
            return nullptr;
        }

        ConnectionContext* ctx = new ConnectionContext();
        ctx->srcIP = srcIP;
        ctx->destIP = destIP;
        ctx->srcPort = srcPort;
        ctx->destPort = destPort;
        ctx->sock = s;
        ctx->isTCP = true;
        ctx->isClient = true;
        ctx->running = true;

        ctx->senderThread = std::thread([this, ctx]() { tcpSender(ctx); });
        ctx->receiverThread = std::thread([this, ctx]() { tcpReceiver(ctx); });

        return ctx;
    }

  
    // --------------------------------------------------------------
    // UDP CREATE + THREADS
    // --------------------------------------------------------------
    ConnectionContext* createUDP(const std::string& srcIP, uint16_t srcPort,
        const std::string& destIP, uint16_t destPort)
    {
        SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
        if (s == INVALID_SOCKET) {
            if (onError) {
                int errCode = WSAGetLastError();
                onError(("Failed to create UDP socket. OS Error: " + getOSErrorString(errCode)).c_str());
            }
            return nullptr;
        }

        sockaddr_in srcAddr{};
        srcAddr.sin_family = AF_INET;
        srcAddr.sin_port = htons(srcPort);
        srcAddr.sin_addr.s_addr = INADDR_ANY;

        if (bind(s, (sockaddr*)&srcAddr, sizeof(srcAddr)) == SOCKET_ERROR) {
            if (onError) {
                int errCode = WSAGetLastError();
                onError(("Failed to bind UDP socket. OS Error: " + getOSErrorString(errCode)).c_str());
            }
            closesocket(s);
            return nullptr;
        }

        ConnectionContext* ctx = new ConnectionContext();
        ctx->srcIP = srcIP;
        ctx->destIP = destIP;
        ctx->srcPort = srcPort;
        ctx->destPort = destPort;
        ctx->sock = s;
        ctx->isTCP = false;
        ctx->running = true;

        ctx->senderThread = std::thread([this, ctx]() { udpSender(ctx); });
        ctx->receiverThread = std::thread([this, ctx]() { udpReceiver(ctx); });

        return ctx;
    }


protected:
    std::string getCtxString(ConnectionContext* ctx) {
        if (!ctx) return "Invalid Context";
        return "Src: " + ctx->srcIP + ":" + std::to_string(ctx->srcPort) +
            " Dest: " + ctx->destIP + ":" + std::to_string(ctx->destPort);
    }

    std::string getOSErrorString(int code) {
        char* errMsg = nullptr;
        FormatMessageA(
            FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
            nullptr, code,
            MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
            (LPSTR)&errMsg, 0, nullptr
        );
        std::string msg = errMsg ? errMsg : "Unknown OS error";
        if (errMsg) LocalFree(errMsg);
        return msg;
    }

    // --------------------------------------------------------------
    // TCP SENDER
    // --------------------------------------------------------------
    void tcpSender(ConnectionContext* ctx) {
        while (ctx->running) {
            MessageBlock* msg = nullptr;
            {
                std::unique_lock<std::mutex> lock(ctx->outgoingMutex);
                ctx->outgoingCV.wait(lock, [ctx]() { return !ctx->running || !ctx->outgoingQueue.empty(); });

                if (!ctx->running) break;

                if (!ctx->outgoingQueue.empty()) {
                    msg = ctx->outgoingQueue.front();
                    ctx->outgoingQueue.erase(ctx->outgoingQueue.begin());
                }
            }

            if (msg) {
                const char* ptr = reinterpret_cast<const char*>(msg->getRawData());
                int toSend = (int)msg->getTotalSize();
                while (toSend > 0 && ctx->running) {
                    int s = send(ctx->sock, ptr, toSend, 0);
                    if (s == SOCKET_ERROR) {
                        if (onError) {
                            int errCode = WSAGetLastError();
                            onError((getCtxString(ctx) + " TCP send failed. OS Error: " + getOSErrorString(errCode)).c_str());
                        }
                        ctx->running = false;
                        break;
                    }
                    ptr += s;
                    toSend -= s;
                }
                delete msg;
            }
        }
    }

    // --------------------------------------------------------------
    // TCP RECEIVER
    // --------------------------------------------------------------
    void tcpReceiver(ConnectionContext* ctx) {
        while (ctx->running) {
            uint8_t sizeBuffer[4];
            int received = 0;
            while (received < 4 && ctx->running) {
                int r = recv(ctx->sock, (char*)sizeBuffer + received, 4 - received, 0);
                if (r < 0) {
                    int errCode = WSAGetLastError();
                    if (onError) onError((getCtxString(ctx) + " TCP recv body failed " + getOSErrorString(errCode)).c_str());
                    ctx->running = false;
                    return;
                }
                if (r == 0) {
                    shutdown(ctx->sock, SD_BOTH);   //for other side to know i am done too
                    return;
                }
                received += r;
            }

            uint32_t totalSize = (sizeBuffer[0] << 24) | (sizeBuffer[1] << 16) | (sizeBuffer[2] << 8) | sizeBuffer[3];
            if (totalSize < 17) continue;

            std::unique_ptr<uint8_t[]> fullBuffer(new uint8_t[totalSize]);
            std::memcpy(fullBuffer.get(), sizeBuffer, 4);

            received = 4;
            while (received < totalSize && ctx->running) {
                int r = recv(ctx->sock, (char*)fullBuffer.get() + received, totalSize - received, 0);
                if (r < 0) {
                    int errCode = WSAGetLastError();
                    if (onError) onError((getCtxString(ctx) + " TCP recv body failed "+ getOSErrorString(errCode)).c_str());
                    ctx->running = false;
                    return;
                }
                if (r == 0) {
                    shutdown(ctx->sock, SD_BOTH);   //for other side to know i am done too
                    return;
                }
                received += r;
            }

            MessageBlock* mb = new MessageBlock(fullBuffer.get(), totalSize);
            {
                std::lock_guard<std::mutex> lock(incomingMutex);
                incomingQueue.push_back(mb);
            }
            incomingCV.notify_one();
        }
    }

    // --------------------------------------------------------------
    // UDP SENDER
    // --------------------------------------------------------------
    void udpSender(ConnectionContext* ctx) {

        while (ctx->running) {
            MessageBlock* msg = nullptr;
            {
                std::unique_lock<std::mutex> lock(ctx->outgoingMutex);
                ctx->outgoingCV.wait(lock, [ctx]() { return !ctx->running || !ctx->outgoingQueue.empty(); });

                if (!ctx->running) break;

                if (!ctx->outgoingQueue.empty()) {
                    msg = ctx->outgoingQueue.front();
                    ctx->outgoingQueue.erase(ctx->outgoingQueue.begin());
                }
            }

            if (msg) {
                const char* ptr = reinterpret_cast<const char*>(msg->getRawData());
                sockaddr_in addr{};
                addr.sin_family = AF_INET;
                addr.sin_port = htons(msg->getDstPort());
                addr.sin_addr.s_addr = htonl(msg->getDstIP()); // already uint32_t in network byte order

                int toSend = (int)msg->getTotalSize();
                while (toSend > 0 && ctx->running) {
                    int s = sendto(ctx->sock, ptr, toSend, 0, (sockaddr*)&addr, sizeof(addr));
                    if (s == SOCKET_ERROR) {
                        int errCode = WSAGetLastError();
                        if (onError) onError((getCtxString(ctx) + " UDP sendto failed. OS Error: " + getOSErrorString(errCode)).c_str());
                        break;
                    }
                    ptr += s;
                    toSend -= s;
                }
                delete msg;
            }
        }
    }

    // --------------------------------------------------------------
    // UDP RECEIVER
    // --------------------------------------------------------------
    void udpReceiver(ConnectionContext* ctx) {
        const int bufferSize = 1024 * 64;
        uint8_t* buffer = new uint8_t[bufferSize];
    
        sockaddr_storage from{};
        int fromLen = sizeof(from);
        // Always allow reuse
        int opt = 1;
        setsockopt(ctx->sock, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));

        while (ctx->running) {
            int r = recvfrom(ctx->sock, (char*)buffer, bufferSize, 0, (sockaddr*)&from, &fromLen);
            if (r == 0 && isLoopback(from)) {
                ctx->running = false;
                continue;
            }
            if (r < 0) {
                //std::cout << "this happen" << std::endl;
                continue;
            }

            MessageBlock* mb = new MessageBlock(buffer, r);
            {
                std::lock_guard<std::mutex> lock(incomingMutex);
                incomingQueue.push_back(mb);
            }
            incomingCV.notify_one();
        }

        delete[] buffer;

    }
    bool isLoopback(const sockaddr_storage& addr) {
        if (addr.ss_family == AF_INET) {
            auto* a = (sockaddr_in*)&addr;
            uint32_t ip = ntohl(a->sin_addr.s_addr);
            return (ip & 0xFF000000) == 0x7F000000;
        }

        if (addr.ss_family == AF_INET6) {
            auto* a = (sockaddr_in6*)&addr;
            static const in6_addr loopback = IN6ADDR_LOOPBACK_INIT;
            return memcmp(&a->sin6_addr, &loopback, sizeof(in6_addr)) == 0;
        }

        return false;
    }

    void stopConnection(ConnectionContext* ctx) {
        if (!ctx) return;

        ctx->running = false;
        ctx->outgoingCV.notify_all();

        SOCKET to_close = ctx->sock;
        
        if (to_close != INVALID_SOCKET) {
            if(ctx->isTCP)shutdown(to_close, SD_BOTH);
            else {
                sockaddr_in a{};
                a.sin_family = AF_INET;
                a.sin_port = htons(ctx->srcPort);
                a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

                sendto(ctx->sock, nullptr, 0, 0, (sockaddr*)&a, sizeof(a));

            }
        }

        if (ctx->senderThread.joinable()) ctx->senderThread.join();

        if (ctx->receiverThread.joinable()) ctx->receiverThread.join();

        if (to_close != INVALID_SOCKET) { closesocket(to_close); }
        ctx->sock = INVALID_SOCKET;
        for (auto msg : ctx->outgoingQueue) delete msg;
        ctx->outgoingQueue.clear();

        delete ctx;
    }

};
