import "@styles/global.css";
import Navbar from "@components/Navbar";
import { MessageHandlerProvider } from "@context/MessageHandler.jsx";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MessageHandlerProvider>
          <Navbar />
          {children}
        </MessageHandlerProvider>
      </body>
    </html>
  );
}
