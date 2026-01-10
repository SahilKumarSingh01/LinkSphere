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
    ThreadPool* threadPool;
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
        notifyNetworkEvent=ecb;
        WSADATA wsa;
        if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
            if (notifyNetworkEvent) notifyNetworkEvent("error-WSAStartup failed");
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
        ConnectionContext* ctx = nullptr;

        {
            std::lock_guard<std::mutex> lock(mapMutex);
            auto it = connectionMap.find(key);
            if (it != connectionMap.end()) {
                ctx = it->second;
                connectionMap.erase(it);
            }
        }

        if (!ctx) {
            // Notify failure if nothing was found
            if (notifyNetworkEvent) {
                std::string proto = (type & 0x80) ? "tcp" : "udp";
                notifyNetworkEvent((proto + "::" + std::to_string(srcPort) + "::" +
                    std::to_string(dstIP) + ":" + std::to_string(dstPort) +
                    "-removeConn-failed").c_str());
            }
            return false;
        }

        // Stop the connection
        stopConnection(ctx);

        // Notify success
        if (notifyNetworkEvent) {
            std::string proto = ctx->isTCP ? "tcp" : "udp";
            notifyNetworkEvent((proto + "::" + std::to_string(ctx->srcPort) + "::" +
                std::to_string(ctx->destIP) + ":" + std::to_string(ctx->destPort) +
                "-removeConn-success").c_str());
        }

        return true;
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
            if (notifyNetworkEvent) notifyNetworkEvent("error-TCP Server: Failed to create socket");
            return false;
        }
        // Disable Nagle
        BOOL flag = TRUE;
        setsockopt(tcpServerSock, IPPROTO_TCP, TCP_NODELAY,
            (char*)&flag, sizeof(flag));

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        addr.sin_addr.s_addr = INADDR_ANY;
        BOOL opt = TRUE;
        setsockopt(tcpServerSock, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));

        if (bind(tcpServerSock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
            int errCode = WSAGetLastError();
            if (notifyNetworkEvent) notifyNetworkEvent(("error-TCP Server bind failed. OS Error: " + getOSErrorString(errCode)).c_str());
            return false;
        }
        if (listen(tcpServerSock, SOMAXCONN) == SOCKET_ERROR) {
            int errCode = WSAGetLastError();
            if (notifyNetworkEvent) notifyNetworkEvent(("error-TCP Server listen failed. OS Error: " + getOSErrorString(errCode)).c_str());
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
                if (notifyNetworkEvent) notifyNetworkEvent(("error-TCP accept failed. OS Error: " + getOSErrorString(errCode)).c_str());
                continue;
            }

            sockaddr_in peer{}, local{};
            int peerLen = sizeof(peer);
            int localLen = sizeof(local);

            if (getpeername(clientSock, (sockaddr*)&peer, &peerLen) != 0 ||
                getsockname(clientSock, (sockaddr*)&local, &localLen) != 0) {
                int errCode = WSAGetLastError();
                if (notifyNetworkEvent)
                    notifyNetworkEvent(("error-TCP endpoint discovery failed. OS Error: " + getOSErrorString(errCode)).c_str());
                closesocket(clientSock);
                continue;
            }

            uint32_t destIP = ntohl(peer.sin_addr.s_addr);    // network byte order
            uint16_t destPort = ntohs(peer.sin_port);    // host order

            uint32_t srcIP = ntohl(local.sin_addr.s_addr);   // network byte order
            uint16_t srcPort = ntohs(local.sin_port);   // host order


            ConnectionContext* ctx = new ConnectionContext();
            ctx->sock = clientSock;
            ctx->isTCP = true;
            ctx->isClient = false;
            ctx->destIP = destIP;
            ctx->destPort = destPort;
            ctx->srcIP = srcIP;
            ctx->srcPort = listeningPort;

            ConnKey k = makeKey((1<<7), srcIP, listeningPort, destIP, destPort);;
            {
                std::lock_guard<std::mutex> lock(mapMutex);
                connectionMap[k] = ctx;
            }
            // Notify about new connection using ThreadPool safely
            if (notifyNetworkEvent) {
                std::string s = "connected-" + std::to_string(srcIP) + ":" + std::to_string(ctx->srcPort) +
                    "::" + std::to_string(destIP) + ":" + std::to_string(ctx->destPort);


                // Capture ws by value
                threadPool->enqueue([cb = notifyNetworkEvent, s]() {
                    cb(s.c_str());
                    });
            }

            ctx->senderThread = std::thread([this, ctx]() { tcpSender(ctx); });
            ctx->receiverThread = std::thread([this, ctx]() { tcpReceiver(ctx); });
        }
    }

public:

    ConnectionContext* createConnection(uint8_t type,uint32_t srcIP, uint16_t srcPort,uint32_t dstIP, uint16_t dstPort, bool notifyOnExist = true){

        ConnKey key = makeKey(type, srcIP, srcPort, dstIP, dstPort);

        // -------- fast path: lookup only --------
        {
            std::lock_guard<std::mutex> lock(mapMutex);
            auto it = connectionMap.find(key);
            if (it != connectionMap.end() && it->second->running) {
                if (notifyOnExist && notifyNetworkEvent &&!(it->second->isTCP && it->second->connectEvent)) {
                    ConnectionContext* ctx = it->second;
                    notifyNetworkEvent(( std::string(ctx->isTCP ? "tcp" : "udp") + "::" + std::to_string(srcPort) + "::" 
                        +std::to_string(dstIP) + ":" +std::to_string(dstPort) +"-createConn-success").c_str());
                }
                return it->second;
            }
            else if (it != connectionMap.end()) {
                stopConnection(it->second);
                connectionMap.erase(it);
            }
        }

        // -------- slow path: create outside lock --------
        if (type & 0x80 && srcPort != 0) {
            emitConnectionError("tcp", srcPort, dstIP, dstPort, "createConn-failed");
            return nullptr;
        }

        ConnectionContext* ctx = (type & 0x80)? createTCP( dstIP, dstPort) : createUDP(srcPort);

        // -------- publish under lock --------
        {
            std::lock_guard<std::mutex> lock(mapMutex);
            auto it = connectionMap.find(key);
            if (it != connectionMap.end()) {
                // There’s already a connection, so discard the new one
                if (ctx) stopConnection(ctx);  // clean up the new connection we were about to insert
                ctx = nullptr;                 // make sure we don't accidentally use it
            }
            else {
                // No existing connection, insert the new one
                connectionMap[key] = ctx;
            }
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
            msg->getDstIP(), msg->getDstPort(),
            false
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
                if (!dispatcherRunning) {
                    for (MessageBlock* m : incomingQueue)
                        delete m;
                    incomingQueue.clear();
                    return;
                }
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
        std::vector<ConnectionContext*> toStop;
        {
            std::lock_guard<std::mutex> lock(mapMutex);
            for (auto& p : connectionMap)
                toStop.push_back(p.second);
            connectionMap.clear();
        }
        for (auto* ctx : toStop)
            stopConnection(ctx);
        stopTCPServer();
    }
}; 