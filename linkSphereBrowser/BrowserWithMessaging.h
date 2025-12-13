#include <thread>
#include <chrono>
#include <mutex>
#include <condition_variable>
#include "BrowserWindow.h"
#include "MessageChannel.h"

#define WM_SEND_TO_WEBVIEW (WM_APP + 123)
using namespace std;
class BrowserWithMessaging : public BrowserWindow {
public:
    using BinaryMessageCallback = void(*)(const BYTE* data, uint32_t size);

    BrowserWithMessaging(
        const std::wstring& url,
        const std::wstring& title = L"Provenix",
        int width = 1000,
        int height = 700,
        int resourceId = 0
    ) : BrowserWindow(url, title, width, height, resourceId) {
    }

    ~BrowserWithMessaging() {
        stopReceiverThread();
    }

    int sendMessage(const BYTE* data, uint32_t size) {
        if (!channel) return 0;
        int a= channel->writeBuf(data, size);
        notify();
        return a;
    }

    void setOnReceiveCallback(BinaryMessageCallback cb) {
        onReceive = cb;
        stopReceiverThread();
        // Start polling thread
        startReceiverThread();
    }
    void setOnNotificationCallback(void (*cb)(const std::wstring&)) {
        onNotification = cb;

    }


    void notify(const wchar_t* msg = L"dataReady\0") {
        PostMessageW(hWnd, WM_SEND_TO_WEBVIEW, 0, (LPARAM)_wcsdup(msg));
    }
private:

    wil::com_ptr<ICoreWebView2SharedBuffer> sharedBuffer;
    BYTE* sharedPtr = nullptr;

    std::unique_ptr<MessageChannel> channel;
    BinaryMessageCallback onReceive = nullptr;
    void (*onNotification)(const std::wstring&) = nullptr;
    std::mutex g_mutex;
    std::condition_variable g_cv;
    std::thread receiverThread;
    bool g_running=1;

    void onContentLoading()
    {
        EventRegistrationToken navToken;
        webview->add_ContentLoading(
            Callback<ICoreWebView2ContentLoadingEventHandler>(
                [this](ICoreWebView2* sender, ICoreWebView2ContentLoadingEventArgs*) -> HRESULT{
                    // Setup shared buffer listener in JS
                    sender->ExecuteScript(
                        LR"(
                            const onceHandler = (event) => {
                                chrome.webview.sharedBuffer = event.getBuffer();
                                window.chrome.webview.removeEventListener("sharedbufferreceived", onceHandler);
                            };
                            window.chrome.webview.addEventListener("sharedbufferreceived", onceHandler);
                        )",
                        Callback<ICoreWebView2ExecuteScriptCompletedHandler>([this](HRESULT, LPCWSTR) -> HRESULT {
                            // Initialize shared memory once script is injected
                            this->setupSharedMemory(true);
                            return S_OK;
                        }).Get()
                    );

                    // Listen for messages from JS
                    this->webview->add_WebMessageReceived(
                        Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                            [this](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT
                            {
                                wil::unique_cotaskmem_string msg;
                                args->TryGetWebMessageAsString(&msg);

                                std::wstring message(msg.get());
                                if (message == L"dataReady") {
                                    // Notify the receiver thread that new data is available
                                    lock_guard<mutex> lock(g_mutex);/*
                                    cout << "we receive that event" << endl;*/
                                    g_cv.notify_one();
                                    
                                }else if(onNotification)
                                    onNotification(message);
                                //cout << "it goes out of scope" << endl;
                                return S_OK;
                            }
                        ).Get(),
                        nullptr
                    );

                    return S_OK;
                }
            ).Get(),
            &navToken
        );
    }


    HRESULT onWebViewControllerCreated(HRESULT hr, ICoreWebView2Controller* ctl) {

        HRESULT result = BrowserWindow::onWebViewControllerCreated(hr, ctl);
        if (FAILED(result)) return result;

        onContentLoading();         //passed shared memory buffer;

        return result;
    }

    void startReceiverThread() {
        g_running = 1;
        receiverThread = std::thread([this] {
            std::unique_lock<std::mutex> lock(g_mutex);
            //cout << "thread started" << endl;
            while (g_running) {
                //cout << "we enter the loop" << endl;
                // Wait until JS signals that data is available
                g_cv.wait(lock);
                //cout << "unlock\n";
                // Process all messages in the channel
                while (channel && channel->availableToRead() > 0) {
                    uint32_t msgSize = channel->sizeofNextMessage();
                    if (msgSize == 0) break;

                    BYTE* buffer = new BYTE[msgSize];
                    int readBytes = channel->readBuf(buffer, msgSize);

                    if (readBytes > 0)
                        onReceive(buffer, readBytes);

                    delete[] buffer;
                }
            }
            //cout << "thread ended" << endl;
            });
    }


    void setupSharedMemory(bool isLeftMaster = true) {
        if (!env || !webview) return;

        wil::com_ptr<ICoreWebView2Environment12> env12;
        if (FAILED(env->QueryInterface(IID_PPV_ARGS(&env12))) || !env12) return;

        wil::com_ptr<ICoreWebView2_17> webview17;
        if (FAILED(webview->QueryInterface(IID_PPV_ARGS(&webview17))) || !webview17) return;

        UINT32 size = 10 * 1024 * 1024;
        if (FAILED(env12->CreateSharedBuffer(size, &sharedBuffer)) || !sharedBuffer) return;
        if (FAILED(sharedBuffer->get_Buffer(&sharedPtr)) || !sharedPtr) return;

        if (FAILED(webview17->PostSharedBufferToScript(sharedBuffer.get(),
            COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_WRITE, nullptr))) return;

        channel = std::make_unique<MessageChannel>(sharedPtr, size, isLeftMaster);

    }

    void stopReceiverThread() {
        g_running = false;              // tell thread to exit
        g_cv.notify_one();              // wake it up if waiting
        if (receiverThread.joinable())  // wait until it exits
            receiverThread.join();
    }

    LRESULT wndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) override {
        switch (msg) {
        case WM_SEND_TO_WEBVIEW:
        {
            wchar_t* text = (wchar_t*)lParam;
            if (webview) {
                webview->PostWebMessageAsString(text);
            }
            free(text);
            break;
        }
        case WM_SIZE:
            break;
        case WM_TIMER:
            break;
        case WM_DESTROY:
            PostQuitMessage(0);
            break;
        }
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }
};
