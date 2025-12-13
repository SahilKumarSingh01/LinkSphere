#include <cstdint>
#include <cstring>
#include <iostream>
#include <thread>
#include <chrono>
#include <string>

#include <unordered_map>
#include <functional>

#include "NetworkManager.h"
#include "BrowserWithMessaging.h"
#include "MessageBlock.h"

// -----------------------------------------
// MAIN (TEST MODE: MessageBlock only)
// -----------------------------------------
#include <winsock2.h>
#include <iphlpapi.h>
#include <vector>
#include <sstream>
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "ws2_32.lib")

// Helper function to get local IPs
std::wstring getInterfaceTypeName(ULONG ifType) {
    switch (ifType) {
    case IF_TYPE_ETHERNET_CSMACD:   return L"Ethernet";
    case IF_TYPE_IEEE80211:         return L"Wi-Fi";
    case IF_TYPE_SOFTWARE_LOOPBACK: return L"Loopback";
    case IF_TYPE_TUNNEL:            return L"Tunnel";
    case IF_TYPE_PPP:               return L"PPP";
    default:                        return L"Other";
    }
}

// Returns vector of wstrings: "IP|InterfaceType"
std::vector<std::wstring> getLocalIPs() {
    std::vector<std::wstring> ips;

    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
        return ips;

    ULONG bufferSize = 15000;
    std::vector<char> buffer(bufferSize);
    PIP_ADAPTER_ADDRESSES adapters = reinterpret_cast<PIP_ADAPTER_ADDRESSES>(buffer.data());

    if (GetAdaptersAddresses(AF_INET, 0, nullptr, adapters, &bufferSize) == ERROR_BUFFER_OVERFLOW) {
        buffer.resize(bufferSize);
        adapters = reinterpret_cast<PIP_ADAPTER_ADDRESSES>(buffer.data());
    }

    if (GetAdaptersAddresses(AF_INET, 0, nullptr, adapters, &bufferSize) == NO_ERROR) {
        for (PIP_ADAPTER_ADDRESSES adapter = adapters; adapter != nullptr; adapter = adapter->Next) {
            if (adapter->OperStatus != IfOperStatusUp) continue;

            std::wstring interfaceType = getInterfaceTypeName(adapter->IfType);

            for (PIP_ADAPTER_UNICAST_ADDRESS ua = adapter->FirstUnicastAddress; ua != nullptr; ua = ua->Next) {
                SOCKADDR_IN* sa_in = reinterpret_cast<SOCKADDR_IN*>(ua->Address.lpSockaddr);
                char ip[INET_ADDRSTRLEN] = { 0 };
                inet_ntop(AF_INET, &(sa_in->sin_addr), ip, INET_ADDRSTRLEN);

                std::wstring wip(ip, ip + strlen(ip));
                ips.push_back(wip + L"|" + interfaceType);
            }
        }
    }

    WSACleanup();
    return ips;
}

BrowserWithMessaging* g_browser = nullptr;
NetworkManager* g_net = nullptr;

static std::unordered_map<std::wstring, std::function<void(const std::wstring&)>> notificationHandlers;

// register handler
static void setEventHandler(
    const std::wstring& event,
    std::function<void(const std::wstring&)> handler
) {
    notificationHandlers[event] = std::move(handler);
}

// notification entry point
void onNotification(const std::wstring& message) {
    // split on first '-'
    size_t pos = message.find(L'-');

    if (pos != std::wstring::npos) {
        std::wstring event = message.substr(0, pos);
        std::wstring param = message.substr(pos + 1);

        auto it = notificationHandlers.find(event);
        if (it != notificationHandlers.end()) {
            it->second(param);
            return;
        }
    }

    // default fallback
    std::wcout << L"[NOTIFY] " << message << std::endl;
}

// Example for raw data
void printDataInHex(const uint8_t* data, size_t size) {
    for (size_t i = 0; i < size; ++i) {
        std::cout << std::hex << std::setw(2) << std::setfill('0')
            << static_cast<int>(data[i]) << " ";
    }
    std::cout << std::dec << std::endl;
}
// Browser → MessageBlock (TEST)
void onBrowserMessage(const BYTE* data, uint32_t size) {
    if (g_net)
        g_net->sendMessage(data, size);
}

// Network → MessageBlock (TEST)
void onNetworkMessage(const uint8_t* data, uint32_t size) {
    if (g_browser)
        g_browser->sendMessage(data, size);
}

// Static function to handle errors
void handleError(const char* text) {
    if (!g_browser) return;

    int size_needed = MultiByteToWideChar(CP_UTF8, 0, text, -1, nullptr, 0);
    std::wstring wmsg(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, text, -1, &wmsg[0], size_needed);
    if (!wmsg.empty() && wmsg.back() == L'\0')
        wmsg.pop_back();

    g_browser->notify(wmsg.c_str());
}

int main() {
    BrowserWithMessaging browser(
        L"http://localhost:5173/testing",
        L"LinkSphere",
        1000,
        700,
        IDI_WINDOWSPROJECT1
    );
    g_browser = &browser;

    NetworkManager net; // 
    g_net = &net;

    net.setErrorCallback(handleError);
    net.setMessageCallback(onNetworkMessage);
    browser.setOnReceiveCallback(onBrowserMessage);
    browser.setOnNotificationCallback(onNotification);

    setEventHandler(L"startTCP", [](const std::wstring& param) {
        uint16_t port = static_cast<uint16_t>(std::stoi(param));

        if (g_net&&g_net->startTCPServer(port)) {
            if(g_browser)g_browser->notify(std::wstring(L"serverStarted-"+param).c_str());
        }
     });
    setEventHandler(L"getIp", [](const std::wstring& param) {
        if (!g_browser) return;
        cout << "this function is called\n";
        std::vector<std::wstring> ips = getLocalIPs();
        for (const auto& ip : ips) {
            g_browser->notify((L"IpAssigned-" + ip).c_str());
        }
        });


    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    return 0;
}
