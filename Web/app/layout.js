import "@styles/global.css";
import Navbar from "@components/Navbar";
import { MessageHandlerProvider } from "@context/MessageHandler.jsx";
import { PresenceManagerProvider } from "@context/PresenceManager.jsx";
import { SidePanProvider } from "@context/SidePanContext.jsx";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MessageHandlerProvider>
          <PresenceManagerProvider>
            <SidePanProvider>
            <Navbar />
            {children}
            </SidePanProvider>
          </PresenceManagerProvider>
        </MessageHandlerProvider>
      </body>
    </html>
  );
}
