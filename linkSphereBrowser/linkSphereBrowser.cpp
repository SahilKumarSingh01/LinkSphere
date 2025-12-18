#include <cstdint>
#include <cstring>
#include <iostream>
#include <thread>
#include <chrono>
#include <string>
#include <unordered_map>
#include <functional>
#include <vector>
#include <sstream>

#include "NetworkManager.h"
#include "BrowserWithMessaging.h"
#include "MessageBlock.h"
#include "MouseKeyboardControls.h"
#include "getLocalIPs.h"
#include "buildOfflinePage.h"

BrowserWithMessaging* g_browser = nullptr;
NetworkManager* g_net = nullptr;

static std::unordered_map<std::wstring, std::function<void(const std::wstring&)>> notificationHandlers;

static void setEventHandler(const std::wstring& e, std::function<void(const std::wstring&)> h) {
    notificationHandlers[e] = std::move(h);
}

void onNotification(const std::wstring& m) {
    size_t p = m.find(L'-');
    if (p != std::wstring::npos) {
        auto it = notificationHandlers.find(m.substr(0, p));
        if (it != notificationHandlers.end()) return it->second(m.substr(p + 1));
    }
    std::wcout << L"[NOTIFY] " << m << std::endl;
}

void printDataInHex(const uint8_t* d, size_t s) {
    for (size_t i = 0; i < s; ++i)
        std::cout << std::hex << std::setw(2) << std::setfill('0') << (int)d[i] << " ";
    std::cout << std::dec << std::endl;
}

void onBrowserMessage(const BYTE* d, uint32_t s) { if (g_net) g_net->sendMessage(d, s); }
void onNetworkMessage(const uint8_t* d, uint32_t s) { if (g_browser) g_browser->sendMessage(d, s); }

void handleError(const char* t) {
    if (!g_browser) return;
    int sz = MultiByteToWideChar(CP_UTF8, 0, t, -1, nullptr, 0);
    std::wstring w(sz, 0);
    MultiByteToWideChar(CP_UTF8, 0, t, -1, &w[0], sz);
    if (!w.empty() && w.back() == L'\0') w.pop_back();
    g_browser->notify(w.c_str());
}

int main() {
    std::wstring url = L"http://localhost:3000/testing";

    BrowserWithMessaging browser(url, L"LinkSphere", 1000, 700, IDI_WINDOWSPROJECT1);
    g_browser = &browser;

    NetworkManager net;
    g_net = &net;

    net.setErrorCallback(handleError);
    net.setMessageCallback(onNetworkMessage);
    browser.setOnReceiveCallback(onBrowserMessage);
    browser.setOnNotificationCallback(onNotification);

    setEventHandler(L"startTCP", [](const std::wstring& p) {
        if (g_net && g_browser && g_net->startTCPServer((uint16_t)std::stoi(p)))
            g_browser->notify((L"serverStarted-" + p).c_str());
        });

    setEventHandler(L"getIp", [](const std::wstring&) {
        if (!g_browser) return;
        for (auto& ip : getLocalIPs()) g_browser->notify((L"IpAssigned-" + ip).c_str());
        });

    setEventHandler(L"mouseMove", [](const std::wstring& p) {
        int x = 0, y = 0; swscanf_s(p.c_str(), L"%d,%d", &x, &y); moveMouse(x, y);
        });

    setEventHandler(L"mouseLeft", [](const std::wstring&) { leftClick(); });
    setEventHandler(L"mouseRight", [](const std::wstring&) { rightClick(); });
    setEventHandler(L"mouseScroll", [](const std::wstring& p) { scrollMouse(std::stoi(p)); });
    setEventHandler(L"keyDown", [](const std::wstring& p) { keyDown((WORD)std::stoi(p)); });
    setEventHandler(L"keyUp", [](const std::wstring& p) { keyUp((WORD)std::stoi(p)); });
    setEventHandler(L"keyPress", [](const std::wstring& p) { keyPress((WORD)std::stoi(p)); });

    setEventHandler(L"removeConn", [](const std::wstring& p) {
        if (!g_net) return;
        int t, sp, dp; wchar_t sip[64]{}, dip[64]{};
        if (swscanf_s(p.c_str(), L"%d-%63[^-]-%d-%63[^-]-%d",
            &t, sip, (unsigned)_countof(sip),
            &sp, dip, (unsigned)_countof(dip), &dp) != 5) return;
        if (g_browser)
            g_browser->notify(
                g_net->removeConnection(
                    (uint8_t)t,
                    { sip, sip + wcslen(sip) }, (uint16_t)sp,
                    { dip, dip + wcslen(dip) }, (uint16_t)dp
                ) ? L"connectionRemoved" : L"connectionNotFound"
            );
        });

    setEventHandler(L"close", [](const std::wstring&) { if (g_browser) g_browser->close(); });

    browser.setOfflinePageCallback([url](int ec) { return buildOfflinePage(url, ec); });

    while (g_browser->isOpen())
        std::this_thread::sleep_for(std::chrono::seconds(1));

    return 0;
}
