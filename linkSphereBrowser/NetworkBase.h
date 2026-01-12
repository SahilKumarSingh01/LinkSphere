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

    uint32_t srcIP{ 0 };
    uint32_t destIP{ 0 };
    uint16_t srcPort{ 0 };
    uint16_t destPort{ 0 };

    SOCKET sock = INVALID_SOCKET;
    bool isTCP{false};
    bool isClient{false};

    std::atomic<bool> running{ true };
    WSAEVENT interruptEvent = nullptr;
    WSAEVENT connectEvent = nullptr;


    std::vector<MessageBlock*> outgoingQueue;
    std::mutex outgoingMutex;
    std::condition_variable outgoingCV;
};

class NetworkBase {
protected:
    std::vector<MessageBlock*> incomingQueue;
    std::mutex incomingMutex;
    std::condition_variable incomingCV;

    void (*notifyNetworkEvent)(const char* text) = nullptr;
public:
    void setNetworkNotifyCallback(void (*ecb)(const char* text)) {
        notifyNetworkEvent = ecb;
    }


    void emitConnectionError(
        const char* proto, uint16_t srcPort,
        uint32_t destIP, uint16_t destPort,
        const char* errorEvent
    ) {
        if (!notifyNetworkEvent) return;

        notifyNetworkEvent((
            std::string(proto) + "::" + std::to_string(srcPort) + "::" +
            std::to_string(destIP) + ":" + std::to_string(destPort) + "-" +
            errorEvent + "-" +
            getOSErrorString(WSAGetLastError())
            ).c_str());
    }


    // --------------------------------------------------------------
    // TCP CREATE + THREADS
    // --------------------------------------------------------------

   // ---------------- TCP CREATION ----------------

    ConnectionContext* createTCP(uint32_t destIP, uint16_t destPort) {
        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (s == INVALID_SOCKET) {
            emitConnectionError("tcp", 0, destIP, destPort, "createConn-failed");
            return nullptr;
        }

        BOOL flag = TRUE;
        if (setsockopt(s, IPPROTO_TCP, TCP_NODELAY, (char*)&flag, sizeof(flag)) == SOCKET_ERROR) {
            emitConnectionError("tcp", 0, destIP, destPort, "createConn-failed");
        }

        u_long nonBlocking = 1;
        if (ioctlsocket(s, FIONBIO, &nonBlocking) == SOCKET_ERROR) {
            emitConnectionError("tcp", 0, destIP, destPort, "createConn-failed");
            closesocket(s);
            return nullptr;
        }

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(destPort);
        addr.sin_addr.s_addr = htonl(destIP);

        int r = connect(s, (sockaddr*)&addr, sizeof(addr));
        if (r == SOCKET_ERROR) {
            int err = WSAGetLastError();
            if (err != WSAEWOULDBLOCK && err != WSAEINPROGRESS) {
                emitConnectionError("tcp", 0, destIP, destPort, "createConn-failed");
                closesocket(s);
                return nullptr;
            }
        }

        ConnectionContext* ctx = new ConnectionContext();
        ctx->sock = s;
        ctx->destIP = destIP;
        ctx->destPort = destPort;
        ctx->isTCP = true;
        ctx->isClient = true;
        ctx->running = true;

        ctx->connectEvent = WSACreateEvent();
        ctx->interruptEvent = WSACreateEvent();

        if (!ctx->connectEvent || !ctx->interruptEvent ||
            WSAEventSelect(s, ctx->connectEvent, FD_CONNECT | FD_CLOSE) == SOCKET_ERROR) {

            emitConnectionError("tcp", 0, destIP, destPort, "createConn-failed");
            closesocket(s);
            delete ctx;
            return nullptr;
        }

        ctx->senderThread = std::thread([this, ctx]() {
            if (!waitTillConnectOrInterrupt(ctx)) return;
            tcpSender(ctx);
            });

        ctx->receiverThread = std::thread([this, ctx]() {
            if (!waitUntilConnected(ctx)) return;
            tcpReceiver(ctx);
            });

        return ctx;
    }


    // ---------------- CONNECT WAIT ----------------

    bool waitTillConnectOrInterrupt(ConnectionContext* ctx) {
        WSAEVENT events[2] = {
            ctx->connectEvent,
            ctx->interruptEvent
        };

        DWORD w = WSAWaitForMultipleEvents(2, events, FALSE, INFINITE, FALSE);
        if (w != WSA_WAIT_EVENT_0) {
            emitConnectionError("tcp", 0, ctx->destIP, ctx->destPort, "createConn-failed");
            ctx->running = false;
            WSASetEvent(ctx->interruptEvent);
            return false;
        }

        WSANETWORKEVENTS ne{};
        if (WSAEnumNetworkEvents(ctx->sock, ctx->connectEvent, &ne) == SOCKET_ERROR ||
            ne.iErrorCode[FD_CONNECT_BIT] != 0) {

            emitConnectionError("tcp", 0, ctx->destIP, ctx->destPort, "createConn-failed");
            ctx->running = false;
            WSASetEvent(ctx->interruptEvent);
            return false;
        }

        WSAEventSelect(ctx->sock, NULL, 0);
        u_long blocking = 0;
        ioctlsocket(ctx->sock, FIONBIO, &blocking);

        // SUCCESS EVENT
        if (notifyNetworkEvent) {
            notifyNetworkEvent((
                std::string("tcp::0::") +
                std::to_string(ctx->destIP) + ":" +
                std::to_string(ctx->destPort) +
                "-createConn-success"
                ).c_str());
        }

        WSACloseEvent(ctx->connectEvent);
        ctx->connectEvent = NULL;
        ctx->running = true;
        WSASetEvent(ctx->interruptEvent);
        return true;
    }


    bool waitUntilConnected(ConnectionContext* ctx) {
        WaitForSingleObject(ctx->interruptEvent, WSA_INFINITE);
        return ctx->running;
    }


    // --------------------------------------------------------------
    // UDP CREATE + THREADS
    // --------------------------------------------------------------
    ConnectionContext* createUDP(uint16_t srcPort)
    {
        SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
        if (s == INVALID_SOCKET) {
            emitConnectionError("udp", srcPort, 0, 0, "createConn-failed");
            return nullptr;
        }

        int opt = 1;
        if (setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt)) == SOCKET_ERROR) {
            emitConnectionError("udp", srcPort, 0, 0, "createConn-failed");
        }

        sockaddr_in srcAddr{};
        srcAddr.sin_family = AF_INET;
        srcAddr.sin_port = htons(srcPort);
        srcAddr.sin_addr.s_addr = INADDR_ANY;

        if (bind(s, (sockaddr*)&srcAddr, sizeof(srcAddr)) == SOCKET_ERROR) {
            emitConnectionError("udp", srcPort, 0, 0, "createConn-failed");
            closesocket(s);
            return nullptr;
        }

        ConnectionContext* ctx = new ConnectionContext();
        ctx->sock = s;
        ctx->srcPort = srcPort;
        ctx->isTCP = false;
        ctx->running = true;

        // SUCCESS EVENT
        if (notifyNetworkEvent) {
            notifyNetworkEvent((
                std::string("udp::") +
                std::to_string(srcPort) +
                "::0:0-createConn-success"
                ).c_str());
        }

        ctx->senderThread = std::thread([this, ctx]() { udpSender(ctx); });
        ctx->receiverThread = std::thread([this, ctx]() { udpReceiver(ctx); });

        return ctx;
    }



protected:
 /*   std::string getCtxString(ConnectionContext* ctx) {
        if (!ctx) return "Invalid Context";
        return "Src: " + std::to_string(ctx->srcIP) + ":" + std::to_string(ctx->srcPort) +
            " Dest: " + std::to_string(ctx->destIP) + ":" + std::to_string(ctx->destPort);
    }*/

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
                ctx->outgoingCV.wait(lock, [ctx]() {
                    return !ctx->running || !ctx->outgoingQueue.empty();
                    });

                if (!ctx->running) break;

                if (!ctx->outgoingQueue.empty()) {
                    msg = ctx->outgoingQueue.front();
                    ctx->outgoingQueue.erase(ctx->outgoingQueue.begin());
                }
            }

            if (!msg) continue;

            const char* ptr = reinterpret_cast<const char*>(msg->getNetMsg());
            int toSend = (int)msg->getNetMsgSize();
            bool failed = false;

            while (toSend > 0 && ctx->running) {
                int s = send(ctx->sock, ptr, toSend, 0);
                if (s == SOCKET_ERROR) {
                    emitConnectionError( "tcp",ctx->srcPort,ctx->destIP,ctx->destPort,"send-failed");
                    ctx->running = false;
                    failed = true;
                    break;
                }
                ptr += s;
                toSend -= s;
            }

            if (!failed && ctx->running) {
                if (notifyNetworkEvent) {
                    //notifyNetworkEvent((std::string("tcp::"+to_string(ctx->srcPort) + "::") + std::to_string(ctx->destIP) + ":" + std::to_string(ctx->destPort) + "-send-success").c_str());
                }
            }

            delete msg;
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
                    emitConnectionError("tcp", ctx->srcPort, ctx->destIP, ctx->destPort, "recv-failed");
                    ctx->running = false;
                    return;
                }
                if (r == 0) {
                    notifyNetworkEvent((std::string("tcp::"+to_string(ctx->srcPort) + "::") + std::to_string(ctx->destIP) + ":" + std::to_string(ctx->destPort) + "-socket-close").c_str());
                    shutdown(ctx->sock, SD_BOTH);   //for other side to know i am done too
                    ctx->running = false;
                    return;
                }
                received += r;
            }

            uint32_t totalSize = (sizeBuffer[0] << 24) | (sizeBuffer[1] << 16) | (sizeBuffer[2] << 8) | sizeBuffer[3];
            if (totalSize <17) continue;

            MessageBlock* mb = new MessageBlock(totalSize);
            mb->setDstPort(ctx->srcPort);                                       //this is the abstraction so sender need not to know which port they used to send but still receiver know where are they receiving
            mb->setSrcPort(ctx->destPort);
            mb->setSrcIP(ctx->destIP);
            mb->setDstIP(ctx->srcIP);
            uint32_t netMsgSize = mb->getNetMsgSize();
            uint8_t* ptr = mb->getNetMsgWritePtr();
            received = 4;
            while (received < netMsgSize && ctx->running) {
                int r = recv(ctx->sock, (char*)ptr + received, netMsgSize - received, 0);
                if (r < 0) {
                    emitConnectionError("tcp", ctx->srcPort, ctx->destIP, ctx->destPort, "recv-failed");
                    ctx->running = false;
                    delete mb;
                    return;
                }
                if (r == 0) {
                    shutdown(ctx->sock, SD_BOTH);   //for other side to know i am done too
                    delete mb;
                    return;
                }
                received += r;
            }

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
                const char* ptr = reinterpret_cast<const char*>(msg->getNetMsg());
                sockaddr_in addr{};
                addr.sin_family = AF_INET;
                addr.sin_port = htons(msg->getDstPort());
                addr.sin_addr.s_addr = htonl(msg->getDstIP()); // already uint32_t in network byte order

                int toSend = (int)msg->getNetMsgSize();
                bool failed = false;
                while (toSend > 0 && ctx->running) {
                    int s = sendto(ctx->sock, ptr, toSend, 0, (sockaddr*)&addr, sizeof(addr));
                    if (s == SOCKET_ERROR) {
                        emitConnectionError("udp", ctx->srcPort, ctx->destIP, ctx->destPort, "send-failed");
                        failed = true;
                        break;
                    }
                    ptr += s;
                    toSend -= s;
                }

                if (!failed && ctx->running) {
                    if (notifyNetworkEvent) {
                        //notifyNetworkEvent((std::string("udp::"+to_string(ctx->srcPort) + "::") + std::to_string(ctx->destIP) + ":" + std::to_string(ctx->destPort) + " - send - success").c_str());
                    }
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

        while (ctx->running) {
            int fromLen = sizeof(from);
            int r = recvfrom(ctx->sock, (char*)buffer, bufferSize, 0, (sockaddr*)&from, &fromLen);
            if (r == 0 && isLoopback(from)) {
                ctx->running = false;
                continue;
            }
            if (r == SOCKET_ERROR){
                emitConnectionError("udp", ctx->srcPort, ctx->destIP, ctx->destPort, "recv-failed");
                continue;
            }

            MessageBlock* mb = new MessageBlock();
            mb->setNetMsg((uint8_t*)buffer, r);

            if (from.ss_family == AF_INET) {
                sockaddr_in* a = (sockaddr_in*)&from;

                mb->setSrcIP(ntohl(a->sin_addr.s_addr));      // network order
                mb->setSrcPort(ntohs(a->sin_port));    // host order

                mb->setDstIP(ctx->srcIP);
                mb->setDstPort(ctx->srcPort);
            }
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
            if (ctx->isTCP) {
                WSASetEvent(ctx->interruptEvent);
                WSACloseEvent(ctx->interruptEvent);
                shutdown(to_close, SD_BOTH);
            }
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
