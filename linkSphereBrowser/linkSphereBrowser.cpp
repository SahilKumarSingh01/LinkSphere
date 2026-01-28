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
#include "EnsureWebView2Runtime.h"
//#include "ThreadPool.h"

//ThreadPool g_pool(4); // or std::thread::hardware_concurrency(
BrowserWithMessaging* g_browser = nullptr;
NetworkManager* g_net = nullptr;

static std::unordered_map<std::wstring, std::function<void(const std::wstring&)>> notificationHandlers;

static void setEventHandler(const std::wstring& e, std::function<void(const std::wstring&)> h) {
    notificationHandlers[e] = std::move(h);
}

void onNotification(const std::wstring& m) {
    size_t p = m.find(L'-');
    std::wcout << L"[NOTIFY] " << m << std::endl;
    //std::this_thread::sleep_for(std::chrono::seconds(5));
    //std::cout << "this function completed" << endl;


    if (p != std::wstring::npos) {
        auto it = notificationHandlers.find(m.substr(0, p));
        if (it != notificationHandlers.end()) {
            it->second(m.substr(p + 1));
            return;
        }
    }

    
}

void onBrowserMessage(const BYTE* d, uint32_t s) {
    if (!g_net) return;

    bool success = g_net->sendMessage(d, s);
    //std::cout << "message received from browser\n";
}

void onNetworkMessage(const uint8_t* d, uint32_t s) {
    if (!g_browser) return;

    g_browser->sendMessage(d, s);
    //std::cout << "message send to browser\n";
}

void notifyNetworkEvent(const char* t) {
    if (!g_browser) return;

    int sz = MultiByteToWideChar(CP_UTF8, 0, t, -1, nullptr, 0);
    std::wstring w(sz, 0);
    MultiByteToWideChar(CP_UTF8, 0, t, -1, &w[0], sz);
    if (!w.empty() && w.back() == L'\0') w.pop_back();

    g_browser->notify( w.c_str());
    std::cout << "to browser " << t << std::endl;
}

//void onClientConnect(const wstring & t) {
//    g_browser->notify((L"connected-"+t).c_str());
//}


int main() {
    if (!EnsureWebView2Runtime()) {
        MessageBox(NULL, L"Failed to install WebView2 Runtime. App will exit.", L"Error", MB_ICONERROR);
        return -1;  //when runtime don't exist
    }
    //std::cout<<std::thread::hardware_concurrency() << std::endl;;
    std::wstring url = L"https://link-sphere-dun.vercel.app/";

    BrowserWithMessaging browser(url, L"LinkSphere", 1000, 700, IDI_WINDOWSPROJECT1);
    g_browser = &browser;

    NetworkManager net;
    g_net = &net;
    net.setNetworkNotifyCallback(notifyNetworkEvent);
    net.setMessageCallback(onNetworkMessage);
    browser.setOnReceiveCallback(onBrowserMessage);
    browser.setOnNotificationCallback(onNotification);

    setEventHandler(L"startTCP", [](const std::wstring& p) {
        bool ok = g_net && g_browser &&g_net->startTCPServer((uint16_t)std::stoi(p));
        g_browser->notify(((ok ? L"serverStarted-" : L"serverFailed-") + p).c_str());
        });


    setEventHandler(L"getIp", [](const std::wstring&) {
        if (!g_browser) return;
        for (auto& ip : getLocalIPs()) g_browser->notify((L"IpAssigned-" + ip).c_str());
        g_browser->notify(L"IpAssigned-done");
        });

    setEventHandler(L"mouseMove", [](const std::wstring& p) {
        int x = 0, y = 0; swscanf_s(p.c_str(), L"%d,%d", &x, &y); moveMouse(x, y);
        });

    setEventHandler(L"mouseLeft", [](const std::wstring&) { leftClick(); });
    setEventHandler(L"mouseRight", [](const std::wstring&) { rightClick(); });
    setEventHandler(L"mouseScroll", [](const std::wstring& p) {scrollMouse(std::stoi(p)); });
    setEventHandler(L"keyDown", [](const std::wstring& p) { keyDown((WORD)std::stoi(p)); });
    setEventHandler(L"keyUp", [](const std::wstring& p) { keyUp((WORD)std::stoi(p)); });
    setEventHandler(L"keyPress", [](const std::wstring& p) { keyPress((WORD)std::stoi(p)); });

    setEventHandler(L"removeConn", [](const std::wstring& p) {
        if (!g_net || !g_browser) return;
        uint8_t t = 0; uint16_t sp = 0, dp = 0; uint32_t sip = 0, dip = 0;
        swscanf_s(p.c_str(), L"%hhu-%u-%hu-%u-%hu", &t, &sip, &sp, &dip, &dp);
        g_net->removeConnection(t, sip, sp, dip, dp);
        //cout << "we come out of function " << endl;
        });

    setEventHandler(L"createConn", [](const std::wstring& p) {
        if (!g_net || !g_browser) return;
        uint8_t t = 0; uint16_t sp = 0, dp = 0; uint32_t sip = 0, dip = 0;
        swscanf_s(p.c_str(), L"%hhu-%u-%hu-%u-%hu", &t, &sip, &sp, &dip, &dp);
        ConnectionContext* ctx = g_net->createConnection(t, sip, sp, dip, dp);
        });

    setEventHandler(L"close", [](const std::wstring&) { if (g_browser) g_browser->close(); });

    browser.setOfflinePageCallback([url](int ec) { return buildOfflinePage(url, ec); });

    while (g_browser->isOpen())
        std::this_thread::sleep_for(std::chrono::seconds(1));

    return 0;
}
