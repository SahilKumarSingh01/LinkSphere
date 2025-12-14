#pragma once
#include "NetworkBase.h"
#include <map>
#include <string>
#include <vector>
#include <mutex>
#include <atomic>
#include <thread>
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")

//#include <iostream>/*
//using namespace std;*/
struct ConnKey {
    uint8_t  type;     
    uint32_t srcIP;
    uint16_t srcPort;
    uint32_t dstIP;
    uint16_t dstPort;

    bool operator<(const ConnKey& other) const {
        return std::tie(type, srcIP, srcPort, dstIP, dstPort) <
            std::tie(other.type, other.srcIP, other.srcPort, other.dstIP, other.dstPort);
    }
};

class NetworkManager : public NetworkBase {
private:
    std::map<ConnKey, ConnectionContext*> connectionMap;
    std::mutex mapMutex;

    std::thread dispatcherThread;
    std::atomic<bool> dispatcherRunning{ true };
    void (*onMessageReceive)(const uint8_t* data, uint32_t size) = nullptr;

    SOCKET tcpServerSock = INVALID_SOCKET;
    std::thread tcpServerThread;
    std::atomic<bool> serverRunning{ false };
    uint16_t listeningPort;

private:
    ConnKey makeKey(uint8_t t, uint32_t srcIP, uint16_t sp, uint32_t dstIP, uint16_t dp) {
        ConnKey k{};
        k.srcIP = srcIP;
        k.srcPort = sp;
        k.dstIP = dstIP;
        k.dstPort = dp;
        k.type = t;
        return k;
    }


public:
    NetworkManager(void (*mcb)(const uint8_t* data, uint32_t size)=nullptr, void (*ecb)(const char* text)=nullptr) {
        
        onMessageReceive=mcb;
        onError=ecb;
        WSADATA wsa;
        if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
            if (onError) onError("WSAStartup failed");
        }

        dispatcherThread = std::thread([this]() { dispatcherLoop(); });
        //startTCPServer();
    }

    ~NetworkManager() {
        shutdownAll();

        dispatcherRunning = false;
        incomingCV.notify_all();

        serverRunning = false;

        if (tcpServerSock != INVALID_SOCKET) closesocket(tcpServerSock);

        if (tcpServerThread.joinable()) tcpServerThread.join();
        if (dispatcherThread.joinable()) dispatcherThread.join();

        WSACleanup();
    }

    void setMessageCallback(void (*cb)(const uint8_t* data, uint32_t size)) {
        onMessageReceive = cb;
    }

    bool startTCPServer(uint16_t port) {
        if (serverRunning) {
            if (listeningPort == port)
                return true;
            else stopTCPServer();
        }

        tcpServerSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (tcpServerSock == INVALID_SOCKET) {
            if (onError) onError("TCP Server: Failed to create socket");
            return false;
        }

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        addr.sin_addr.s_addr = INADDR_ANY;
        BOOL opt = TRUE;
        setsockopt(tcpServerSock, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));

        if (bind(tcpServerSock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
            int errCode = WSAGetLastError();
            if (onError) onError(("TCP Server bind failed. OS Error: " + getOSErrorString(errCode)).c_str());
            return false;
        }
        if (listen(tcpServerSock, SOMAXCONN) == SOCKET_ERROR) {
            int errCode = WSAGetLastError();
            if (onError) onError(("TCP Server listen failed. OS Error: " + getOSErrorString(errCode)).c_str());
            return false;
        }
        listeningPort = port;
        serverRunning = true;
        tcpServerThread = std::thread([this]() { tcpAcceptLoop(); });
        return true;
    }

private:
    void stopTCPServer() {

        serverRunning = false;

        // Closing the listening socket will unblock accept()
        if (tcpServerSock != INVALID_SOCKET) {
            closesocket(tcpServerSock);
            tcpServerSock = INVALID_SOCKET;
        }

        // Join the accept loop thread
        if (tcpServerThread.joinable()) tcpServerThread.join();

        listeningPort = 0;
    }

    void tcpAcceptLoop() {
        while (serverRunning) {
            SOCKET clientSock = accept(tcpServerSock, nullptr, nullptr);
            if (!serverRunning) break;
            if (clientSock == INVALID_SOCKET) {
                int errCode = WSAGetLastError();
                if (onError) onError(("TCP accept failed. OS Error: " + getOSErrorString(errCode)).c_str());
                continue;
            }

            sockaddr_in clientAddr{};
            int len = sizeof(clientAddr);
            getpeername(clientSock, (sockaddr*)&clientAddr, &len);

            char ipStr[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &clientAddr.sin_addr, ipStr, sizeof(ipStr));
            uint16_t clientPort = ntohs(clientAddr.sin_port);
            uint32_t srcIP, dstIP;
            inet_pton(AF_INET, "127.0.0.1", (struct in_addr*)&srcIP);
            inet_pton(AF_INET, ipStr, (struct in_addr*)&dstIP);

            ConnectionContext* ctx = new ConnectionContext();
            ctx->sock = clientSock;
            ctx->isTCP = true;
            ctx->isClient = false;
            ctx->destIP = ipStr;
            ctx->destPort = clientPort;
            ctx->srcIP = "127.0.0.1";
            ctx->srcPort = listeningPort;

            ConnKey k = makeKey(1, srcIP, listeningPort, dstIP, clientPort);;
            {
                std::lock_guard<std::mutex> lock(mapMutex);
                connectionMap[k] = ctx;
            }

            ctx->senderThread = std::thread([this, ctx]() { tcpSender(ctx); });
            ctx->receiverThread = std::thread([this, ctx]() { tcpReceiver(ctx); });
        }
    }

public:
    void sendMessage(const BYTE* rawData, uint32_t size) {
        if (size < 17) return;

        MessageBlock* msg = new MessageBlock(rawData, size);

        ConnKey key = makeKey(
            msg->getType(),
            msg->getSrcIP(),
            msg->getSrcPort(),
            msg->getDstIP(),
            msg->getDstPort()
        );

        ConnectionContext* ctx = nullptr;
        {
            std::lock_guard<std::mutex> lock(mapMutex);
            auto it = connectionMap.find(key);

            if (it != connectionMap.end() && !it->second->running) {
                stopConnection(it->second);               // free context
                connectionMap.erase(it);         // remove from map
                it = connectionMap.end();        // explicitly mark as end
            }

            if (it == connectionMap.end()) {
                if (msg->getSrcPort() != 0 && msg->getType() == 1) {
                    if (onError) onError((
                        "No active TCP connection for " +msg->getSrcString() + ":" + std::to_string(msg->getSrcPort()) +
                        " -> " +msg->getDstString() + ":" + std::to_string(msg->getDstPort())).c_str());
                    delete msg;
                    return;
                }

                if (msg->getType() & 0x80)
                    ctx = createTCP(msg->getSrcString(), msg->getSrcPort(),msg->getDstString(), msg->getDstPort());

                else
                    ctx = createUDP(msg->getSrcString(), msg->getSrcPort(),msg->getDstString(), msg->getDstPort() );

                if (!ctx) {
                    if (onError) onError((
                        "Failed to create connection for " +msg->getSrcString() + ":" + std::to_string(msg->getSrcPort()) +
                        " -> " +msg->getDstString() + ":" + std::to_string(msg->getDstPort())
                        ).c_str());
                    delete msg;
                    return;
                }



                connectionMap[key] = ctx;
            }
            else {
                ctx = it->second;
            }
        }
        
        {
            std::lock_guard<std::mutex> lock(ctx->outgoingMutex);
            ctx->outgoingQueue.push_back(msg);
        }
        ctx->outgoingCV.notify_one();
    }

private:
    void dispatcherLoop() {
        while (dispatcherRunning) {
            std::vector<MessageBlock*> batch;
            {
                std::unique_lock<std::mutex> lock(incomingMutex);
                incomingCV.wait(lock, [this] { return !incomingQueue.empty() || !dispatcherRunning; });
                if (!dispatcherRunning) return;
                batch.swap(incomingQueue);
            }

            for (MessageBlock* msg : batch) {
                if (msg && onMessageReceive) onMessageReceive(msg->getRawData(), msg->getTotalSize()); //you need to update this 
                delete msg;
            }
        }
    }

public:
    void shutdownAll() {
        std::lock_guard<std::mutex> lock(mapMutex);
        for (auto& p : connectionMap) {
            ConnectionContext* ctx = p.second;
            if (ctx) stopConnection(ctx);
        }
        connectionMap.clear();
        stopTCPServer();
    }
}; 