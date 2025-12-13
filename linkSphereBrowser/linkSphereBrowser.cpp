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
        g_net->sendMessage(const_cast<uint8_t*>(data), size);
}

// Network → MessageBlock (TEST)
void onNetworkMessage(const uint8_t* data, uint32_t size) {
    if (g_browser)
        g_browser->sendMessage(const_cast<BYTE*>(data), size);
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

    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    return 0;
}
