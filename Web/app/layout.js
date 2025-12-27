import "@styles/global.css";
import Navbar from "@components/Navbar";
import { MessageHandlerProvider } from "@context/MessageHandler.jsx";
import { PresenceManagerProvider } from "@context/PresenceManager.jsx";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MessageHandlerProvider>
          <PresenceManagerProvider>
            <Navbar />
            {children}
          </PresenceManagerProvider>
        </MessageHandlerProvider>
      </body>
    </html>
  );
}
