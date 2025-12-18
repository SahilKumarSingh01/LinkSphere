#pragma once
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <vector>
#include <string>
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

