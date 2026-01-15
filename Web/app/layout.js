import "@styles/global.css";
import Navbar from "@components/Navbar";
import { MessageHandlerProvider } from "@context/MessageHandler.jsx";
import { PresenceManagerProvider } from "@context/PresenceManager.jsx";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="no-scrollbar">
      <body className="min-h-screen flex flex-col">
        <MessageHandlerProvider>
          <PresenceManagerProvider>
              {/* Navbar at the top */}
              <Navbar />
              {/* Children fill remaining space */}
                {children}
          </PresenceManagerProvider>
        </MessageHandlerProvider>
      </body>
    </html>
  );
}
