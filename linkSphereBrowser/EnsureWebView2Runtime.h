#pragma once

#define WEBVIEW2_USE_STATIC_LIBRARY

#include <windows.h>
#include <wrl.h>
#include <WebView2.h>

#include <iostream>
#include <string>
#include <vector>

#include "resource.h"


//// Link these libraries in Project Properties or via pragma
//#pragma comment(lib, "WebView2Loader.lib")
//#pragma comment(lib, "shlwapi.lib")

bool EnsureWebView2Runtime() {
    LPWSTR versionInfo = nullptr;

    // 1. Check if already installed
    HRESULT hr = GetAvailableCoreWebView2BrowserVersionString(nullptr, &versionInfo);
    if (SUCCEEDED(hr) && versionInfo != nullptr) {
        CoTaskMemFree(versionInfo);
        return true; // Already installed, we're good!
    }

    // 2. Not installed. Locate the embedded EXE in resources
    HRSRC hRes = FindResource(NULL, MAKEINTRESOURCE(IDR_WV2_INSTALLER), RT_RCDATA);
    if (!hRes) return false;

    HGLOBAL hData = LoadResource(NULL, hRes);
    DWORD size = SizeofResource(NULL, hRes);
    void* pData = LockResource(hData);

    // 3. Create a temp path to drop the installer
    wchar_t tempPath[MAX_PATH];
    wchar_t fullPath[MAX_PATH];
    GetTempPath(MAX_PATH, tempPath);
    GetTempFileName(tempPath, L"WV2", 0, fullPath);
    // Rename to .exe for ShellExecute to work correctly
    std::wstring exePath = std::wstring(fullPath) + L".exe";

    // 4. Write the embedded bytes to the temp file
    HANDLE hFile = CreateFile(exePath.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE) return false;

    DWORD written;
    WriteFile(hFile, pData, size, &written, NULL);
    CloseHandle(hFile);

    // 5. Run the installer and WAIT for it to finish
    SHELLEXECUTEINFO sei = { sizeof(sei) };
    sei.fMask = SEE_MASK_NOCLOSEPROCESS;
    sei.lpVerb = L"runas"; // Elevate to Admin
    sei.lpFile = exePath.c_str();
    sei.lpParameters = L" /install"; // Silent install
    sei.nShow = SW_SHOWNORMAL;

    if (ShellExecuteEx(&sei)) {
        WaitForSingleObject(sei.hProcess, INFINITE);
        CloseHandle(sei.hProcess);
    }

    // 6. Cleanup the temp file
    DeleteFile(exePath.c_str());
    DeleteFile(fullPath); // Clean up the original temp name too

    // 7. Final Verification
    hr = GetAvailableCoreWebView2BrowserVersionString(nullptr, &versionInfo);
    if (SUCCEEDED(hr) && versionInfo != nullptr) {
        CoTaskMemFree(versionInfo);
        return true;
    }

    return false; // Everything failed
}