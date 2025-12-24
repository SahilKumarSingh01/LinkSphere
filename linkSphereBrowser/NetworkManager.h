#pragma once
#include <iostream>
#include "NetworkBase.h"
#include <map>
#include <string>
#include <vector>
#include <mutex>
#include <atomic>
#include <thread>
#include <winsock2.h>
#include <ws2tcpip.h>
#include "ThreadPool.h"

//using namespace std;
#pragma comment(lib, "ws2_32.lib")

//#include <iostream>/*
//using namespace std;*/
struct ConnKey {
    uint32_t dstIP;
    uint16_t dstPort;
    uint16_t srcPort;
    uint8_t  type; // 0 = UDP, 1 = TCP

    bool operator<(const ConnKey& o) const {
        return std::tie(dstIP, dstPort, srcPort, type) <
            std::tie(o.dstIP, o.dstPort, o.srcPort, o.type);
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
    uint16_t listeningPort{ 0 };
    ThreadPool *threadPool;
    void (*onClientConnect)(const std::wstring& info) = nullptr;
private:
    ConnKey makeKey(uint8_t t, uint32_t /*srcIP*/, uint16_t sp,
        uint32_t dstIP, uint16_t dp)
    {
        ConnKey k{};
        k.type = (t >> 7) & 1;   // only 8th bit
        k.srcPort = sp;

        if (k.type) {               // TCP
            k.dstIP = dstIP;
            k.dstPort = dp;
        }
        else {                    // UDP
            k.dstIP = 0;
            k.dstPort = 0;
        }

        return k;
    }




public:
    NetworkManager(void (*mcb)(const uint8_t* data, uint32_t size)=nullptr, void (*ecb)(const char* text)=nullptr){
        threadPool = new ThreadPool(4);
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
        delete threadPool;
        WSACleanup();
    }

    bool removeConnection(uint8_t type, uint32_t srcIP, uint16_t srcPort, uint32_t dstIP, uint16_t dstPort) {
        ConnKey key = makeKey(type, srcIP, srcPort, dstIP, dstPort);
        //std::cout << "this function is called" << std::endl;
        std::lock_guard<std::mutex> lock(mapMutex);
        //std::cout << "lock is acquired" << std::endl;
        auto it = connectionMap.find(key);
        if (it == connectionMap.end()) return false;
        connectionMap.erase(it);
        //std::cout << "we erase it from map first " << std::endl;
        if (it->second) stopConnection(it->second);
        
        //std::cout << "this function ended after deletion" << std::endl;
        return true;
    }
    void setClientConnectCallback(void (*cb)(const std::wstring& info)) {
        onClientConnect = cb;
    }

    bool removeConnection(uint8_t type, const std::string& srcIp, uint16_t srcPort, const std::string& dstIp, uint16_t dstPort) {
        uint32_t srcIP{}, dstIP{};
        if (inet_pton(AF_INET, srcIp.c_str(), &srcIP) != 1) return false;
        if (inet_pton(AF_INET, dstIp.c_str(), &dstIP) != 1) return false;
        return removeConnection(type, srcIP, srcPort, dstIP, dstPort);
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

            ConnKey k = makeKey((1<<7), srcIP, listeningPort, dstIP, clientPort);;
            {
                std::lock_guard<std::mutex> lock(mapMutex);
                connectionMap[k] = ctx;
            }
            // Notify about new connection using ThreadPool safely
            if (onClientConnect) {
                std::wstring ws = std::wstring(ctx->srcIP.begin(), ctx->srcIP.end()) + L":" +
                    std::to_wstring(ctx->srcPort) + L"::" +
                    std::wstring(ctx->destIP.begin(), ctx->destIP.end()) + L":" +
                    std::to_wstring(ctx->destPort);

                // Capture ws by value
                threadPool->enqueue([cb = onClientConnect, ws]() {
                    cb(ws);
                    });
            }

            ctx->senderThread = std::thread([this, ctx]() { tcpSender(ctx); });
            ctx->receiverThread = std::thread([this, ctx]() { tcpReceiver(ctx); });
        }
    }

public:
    static std::string ipToString(uint32_t ip) {
        unsigned char bytes[4];
        bytes[0] = (ip >> 24) & 0xFF;
        bytes[1] = (ip >> 16) & 0xFF;
        bytes[2] = (ip >> 8) & 0xFF;
        bytes[3] = ip & 0xFF;

        char buf[16];
        snprintf(buf, sizeof(buf), "%u.%u.%u.%u", bytes[0], bytes[1], bytes[2], bytes[3]);
        return std::string(buf);
    }

    ConnectionContext* createConnection(uint8_t type,uint32_t srcIP, uint16_t srcPort,uint32_t dstIP, uint16_t dstPort){

        ConnKey key = makeKey(type, srcIP, srcPort, dstIP, dstPort);

        // -------- fast path: lookup only --------
        {
            std::lock_guard<std::mutex> lock(mapMutex);
            auto it = connectionMap.find(key);
            if (it != connectionMap.end() && it->second->running)
                return it->second;
            else if (it != connectionMap.end()) {
                stopConnection(it->second);
                connectionMap.erase(it);
            }
        }
        const std::string srcIPstr(ipToString(srcIP));
        const std::string dstIPsrc(ipToString(dstIP));
        // -------- slow path: create outside lock --------
        if (type & 0x80 && srcPort != 0) {
            if (onError)
                onError(("No active TCP connection for " + srcIPstr + ":" + std::to_string(srcPort) + " -> " + dstIPsrc + ":" + std::to_string(dstPort)).c_str());
            return nullptr;
        }

        ConnectionContext* ctx = (type & 0x80)? createTCP(srcIPstr, srcPort, dstIPsrc, dstPort) : createUDP(srcIPstr, srcPort, dstIPsrc, dstPort);

        if (!ctx) {
            if (onError)
                onError(("Failed to create connection for " + srcIPstr + ":" + std::to_string(srcPort) + " -> " + dstIPsrc + ":" + std::to_string(dstPort)).c_str());
            return nullptr;
        }

        // -------- publish under lock --------
        {
            std::lock_guard<std::mutex> lock(mapMutex);
            connectionMap[key] = ctx;
        }

        return ctx;
    }

    ConnectionContext* createConnection(uint8_t type,
        const std::string& srcIp, uint16_t srcPort,
        const std::string& dstIp, uint16_t dstPort)
    {
        uint32_t srcIP{}, dstIP{};
        if (inet_pton(AF_INET, srcIp.c_str(), &srcIP) != 1) return nullptr;
        if (inet_pton(AF_INET, dstIp.c_str(), &dstIP) != 1) return nullptr;

        return createConnection(type, srcIP, srcPort, dstIP, dstPort);
    }


    bool sendMessage(const BYTE* rawData, uint32_t size)
    {
        if (size < 17) return false;

        MessageBlock* msg = new MessageBlock(rawData, size);

        // -------- get or create connection --------
        ConnectionContext* ctx = createConnection(
            msg->getType(),
            msg->getSrcIP(), msg->getSrcPort(),
            msg->getDstIP(), msg->getDstPort()
        );

        if (!ctx) {
            delete msg;
            return false;
        }

        // -------- enqueue message --------
        {
            std::lock_guard<std::mutex> lock(ctx->outgoingMutex);
            ctx->outgoingQueue.push_back(msg);
        }

        ctx->outgoingCV.notify_one();
        return true;
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
                threadPool->enqueue([this, msg]() {
                    if (msg && onMessageReceive) onMessageReceive(msg->getRawData(), msg->getTotalSize()); //you need to update this 
                    delete msg;
                });
                
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