#pragma once
#include <wrl.h>
#include <wil/com.h>
#include <WebView2.h>
#include <string>
#include <thread>
//#include <iostream>
#include "Resource.h"

using namespace Microsoft::WRL;
//using namespace std;

class BrowserWindow {
public:
    BrowserWindow(
        const std::wstring& url,
        const std::wstring& title = L"Default Window",
        int width = 1000,
        int height = 700,
        int resourceId=0
    ) : url(url)
    {
        guiThread = std::thread([this, title, resourceId, width, height]() {
            this->initialize(title, resourceId, width, height);
            });
    }


    ~BrowserWindow() {
        if (guiThread.joinable()) guiThread.join();
    }

protected:
    HWND hWnd = nullptr;
    HINSTANCE hInstance = nullptr;
    std::wstring url;

    wil::com_ptr<ICoreWebView2Controller> controller;
    wil::com_ptr<ICoreWebView2> webview;
    wil::com_ptr<ICoreWebView2Environment> env;
    std::thread guiThread;


    void initialize(const std::wstring& title, int resourceId, int width, int height) {
        CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        initWindow(title, resourceId, width, height);
        initWebView();
        MSG msg;
        while (GetMessage(&msg, NULL, 0, 0)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        CoUninitialize();
    }


    void initWindow(const std::wstring& title,int resourceId,int width,int height) {
        hInstance = GetModuleHandle(NULL);

        // Register window class
        WNDCLASSEX wc = { 0 };

        // Set the size of the structure (MANDATORY for WNDCLASSEX)
        wc.cbSize = sizeof(WNDCLASSEX);

        wc.lpfnWndProc = BrowserWindow::wndProcStatic;
        wc.hInstance = hInstance;
        wc.lpszClassName = title.c_str();
        wc.hIcon = (HICON)LoadImage(GetModuleHandle(NULL), MAKEINTRESOURCE(resourceId), IMAGE_ICON, 32, 32, 0);         // Large icon
        wc.hIconSm = (HICON)LoadImage(GetModuleHandle(NULL), MAKEINTRESOURCE(resourceId), IMAGE_ICON, 16, 16, 0);;       // Dedicated small icon field (now available)
        wc.style = 0;               // Add styles like CS_HREDRAW | CS_VREDRAW if needed

        if (!RegisterClassEx(&wc))
        {
            std::cerr << "Fail to register" << std::endl;
        }

        // Create window (without resizable style)
        hWnd = CreateWindow(
            wc.lpszClassName,
            title.c_str(),
            WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX, // no WS_THICKFRAME
            CW_USEDEFAULT, CW_USEDEFAULT,
            width, height,
            nullptr, nullptr, hInstance, this
        );

        ShowWindow(hWnd, SW_SHOWNORMAL);
    }


    // ---------------- WebView2 initialization ----------------
    void initWebView() {
        createWebViewEnvironment();
    }

    void createWebViewEnvironment() {
        CreateCoreWebView2EnvironmentWithOptions(
            nullptr, nullptr, nullptr,
            Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                [this](HRESULT hr, ICoreWebView2Environment* env) -> HRESULT {
                    return onWebViewEnvironmentCreated(hr, env);
                }
            ).Get()
        );

    }

    HRESULT onWebViewEnvironmentCreated(HRESULT hr, ICoreWebView2Environment* env) {
        if (!env) return E_FAIL;
        this->env = env;
        createWebViewController(env);
        return S_OK;
    }

    void createWebViewController(ICoreWebView2Environment* env) {
        env->CreateCoreWebView2Controller(
            hWnd,
            Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                [this](HRESULT hr, ICoreWebView2Controller* ctl) -> HRESULT {
                    return onWebViewControllerCreated(hr, ctl);
                }
            ).Get()
        );
    }

    virtual HRESULT onWebViewControllerCreated(HRESULT hr, ICoreWebView2Controller* ctl) {
        if (!ctl) return E_FAIL;

        controller = ctl;
        controller->get_CoreWebView2(&webview);
        
        //disableBrowserFeatures(webview);                //uncomment it you stupid jdlkjfdl dskljdsklfjasljff ls dklfjslfjlk jskjfskjf ljdjfkldsjkflslfkljkjd kjsdkjfksjdfkdslkljfkdjf jsflsddjljl
        SetupWebViewPermissionHandler(webview);         //grant permission to all request
        // Resize WebView to window
        RECT rc;
        GetClientRect(hWnd, &rc);
        controller->put_Bounds(rc);
        // Navigate to default URL
        webview->Navigate(url.c_str());
        
        return S_OK;
    }

    void SetupWebViewPermissionHandler(wil::com_ptr<ICoreWebView2>& webview)
    {
        webview->add_PermissionRequested(
            Callback<ICoreWebView2PermissionRequestedEventHandler>(
                [](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* args) {
                    COREWEBVIEW2_PERMISSION_KIND kind;
                    args->get_PermissionKind(&kind);
                    //std::cout << "this function is called" << std::endl;

                    args->put_State(COREWEBVIEW2_PERMISSION_STATE_ALLOW);

                    return S_OK;
                }
            ).Get(),
            nullptr
        );
    }

    void disableBrowserFeatures(wil::com_ptr<ICoreWebView2>& webview) {
        if (!webview) return;

        wil::com_ptr<ICoreWebView2Settings> settings;
        webview->get_Settings(&settings);
        if (settings) {
            settings->put_AreDevToolsEnabled(FALSE);
            settings->put_IsStatusBarEnabled(FALSE);
            settings->put_AreDefaultContextMenusEnabled(FALSE);
            settings->put_AreHostObjectsAllowed(TRUE);
            settings->put_AreDefaultScriptDialogsEnabled(FALSE);
            settings->put_IsBuiltInErrorPageEnabled(FALSE);
            settings->put_IsZoomControlEnabled(FALSE);
        }

        wil::com_ptr<ICoreWebView2Settings3> settings3;
        if (SUCCEEDED(settings->QueryInterface(IID_PPV_ARGS(&settings3)))) {
            settings3->put_AreBrowserAcceleratorKeysEnabled(FALSE);
        }
    }


    virtual LRESULT wndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
        // Essential default handling for the base class
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }

    static LRESULT CALLBACK wndProcStatic(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
        //cout << "this is called" << endl;
        BrowserWindow* self = nullptr;
        if (msg == WM_NCCREATE) {
            CREATESTRUCT* cs = reinterpret_cast<CREATESTRUCT*>(lParam);
            self = reinterpret_cast<BrowserWindow*>(cs->lpCreateParams);
            SetWindowLongPtr(hWnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
            self->hWnd = hWnd;
        }
        else {
            self = reinterpret_cast<BrowserWindow*>(GetWindowLongPtr(hWnd, GWLP_USERDATA));
        }

        if (self) {
            return self->wndProc(hWnd, msg, wParam, lParam);
        }
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }
};
