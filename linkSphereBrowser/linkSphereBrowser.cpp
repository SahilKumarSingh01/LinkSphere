#include "BrowserWindow.h"
#include "BrowserWithMessaging.h"
#include "Resource.h"
#include <iostream>
using namespace std;

int main() {
    BrowserWithMessaging browser(
        L"http://localhost:5173/testing",
        L"Provenix",
        1000,
        700,
        IDI_WINDOWSPROJECT1
    );

    // --- Set receive callback ---
    browser.setOnReceiveCallback(
        [](const BYTE* data, uint32_t size)->void
        {
            string s((const char*)data, size);
            cout << "[C++] Received from JS: " << s << endl;
        }
    );

    cout << "we are out of init" << endl;

    while (true) {
        wstring s;
        wcin >> s;
        browser.sendMessage((BYTE*)s.c_str(),s.size());
    }

    return 0;
}
