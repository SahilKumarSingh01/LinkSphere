#pragma once
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <vector>
#include <string>
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "ws2_32.lib")

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

// Returns vector of wstrings: "IP|InterfaceType" and adds "|default" for the default interface
std::vector<std::wstring> getLocalIPs() {
    std::vector<std::wstring> ips;

    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
        return ips;

    // Step 1: Find default interface (for a public IP, e.g., 8.8.8.8)
    ULONG defaultIfIndex = 0;
    sockaddr_in dest{};
    dest.sin_family = AF_INET;
    dest.sin_port = htons(53);
    inet_pton(AF_INET, "8.8.8.8", &dest.sin_addr);
    GetBestInterface(dest.sin_addr.s_addr, &defaultIfIndex);
 
    // Step 2: Enumerate adapters
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
            bool isDefault = (adapter->IfIndex == defaultIfIndex);

            for (PIP_ADAPTER_UNICAST_ADDRESS ua = adapter->FirstUnicastAddress; ua != nullptr; ua = ua->Next) {
                SOCKADDR_IN* sa_in = reinterpret_cast<SOCKADDR_IN*>(ua->Address.lpSockaddr);
                char ip[INET_ADDRSTRLEN] = { 0 };
                inet_ntop(AF_INET, &(sa_in->sin_addr), ip, INET_ADDRSTRLEN);

                std::wstring wip(ip, ip + strlen(ip));
                std::wstring entry = wip + L"|" + interfaceType;
                if (isDefault) entry += L"|default";

                ips.push_back(entry);
            }
        }
    }

    WSACleanup();
    return ips;
}
