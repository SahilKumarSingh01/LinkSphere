import org.java_websocket.server.DefaultSSLWebSocketServerFactory;
import org.java_websocket.server.WebSocketServer;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.json.JSONObject;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import java.io.FileInputStream;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.security.KeyStore;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class MultiClientWebSocketServer extends WebSocketServer {

    private final Map<String, WebSocket> clientMap =
            Collections.synchronizedMap(new HashMap<>());

    private WebSocket master = null;

    public MultiClientWebSocketServer(int port) {
        super(new InetSocketAddress(port));
        enableSSL();   // 🔐 Add TLS
    }

    private void enableSSL() {
        try {
            String keystorePath = "keystore.p12";   // your .p12 file
            String keystorePassword = "password";    // your password

            KeyStore ks = KeyStore.getInstance("PKCS12");
            FileInputStream fis = new FileInputStream(keystorePath);
            ks.load(fis, keystorePassword.toCharArray());

            KeyManagerFactory kmf = KeyManagerFactory.getInstance("SunX509");
            kmf.init(ks, keystorePassword.toCharArray());

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(kmf.getKeyManagers(), null, null);

            setWebSocketFactory(new DefaultSSLWebSocketServerFactory(sslContext));
            System.out.println("WSS enabled (TLS active)");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private String addrOf(WebSocket conn) {
        return conn.getRemoteSocketAddress().getAddress().getHostAddress();
    }

    private boolean isLocal(String addr) {
        return addr.equals("127.0.0.1") || addr.equals("0:0:0:0:0:0:0:1");
    }

    private void notifyMaster(String type, String who) {
        if (master != null && master.isOpen()) {
            JSONObject json = new JSONObject();
            json.put("type", type);
            json.put("addr", who);
            json.put("connection", "keep-alive");
            master.send(json.toString());
        }
    }

    private void sendBinaryToMaster(WebSocket sender, ByteBuffer data) {
        if (master == null || !master.isOpen() || sender == master) return;

        String addr = addrOf(sender);
        byte[] addrBytes = addr.getBytes();

        ByteBuffer out =
                ByteBuffer.allocate(1 + addrBytes.length + data.remaining());
        out.put((byte) addrBytes.length);
        out.put(addrBytes);
        out.put(data);
        out.flip();

        master.send(out);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        String addr = addrOf(conn);
        clientMap.put(addr, conn);

        if (isLocal(addr)) {
            master = conn;
            System.out.println("Master connected: " + addr);
        } else {
            System.out.println("Client connected: " + addr);
            notifyMaster("connected", addr);
        }
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        String addr = addrOf(conn);
        clientMap.values().remove(conn);

        if (conn == master) {
            master = null;
            System.out.println("Master disconnected");
        } else {
            System.out.println("Client disconnected: " + addr);
            notifyMaster("disconnected", addr);
        }
    }

    @Override
    public void onMessage(WebSocket conn, String msg) {
        try {
            JSONObject json = new JSONObject(msg);

            if (conn == master) {
                if (!json.has("toSend")) return;

                String targetAddr = json.getString("toSend");
                WebSocket target = clientMap.get(targetAddr);

                if (target == null || !target.isOpen()) return;

                String connHeader = json.optString("connection", "keep-alive");
                target.send(json.toString());

                if (connHeader.equalsIgnoreCase("close")) {
                    clientMap.values().remove(target);
                    target.close();
                }
                return;
            }

            if (master != null && master.isOpen()) {
                json.put("from", addrOf(conn));
                json.put("connection", "keep-alive");
                master.send(json.toString());
            } else {
                JSONObject resp = new JSONObject();
                resp.put("connection", "close");
                resp.put("msg", "master not connected");
                conn.send(resp.toString());
                conn.close();
                clientMap.values().remove(conn);
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onMessage(WebSocket conn, ByteBuffer data) {
        sendBinaryToMaster(conn, data);
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        ex.printStackTrace();
        if (conn != null) {
            clientMap.values().remove(conn);
        }
    }

    @Override
    public void onStart() {
        System.out.println("Secure WebSocket server running on port " + getPort());
    }

    public static void main(String[] args) {
        new MultiClientWebSocketServer(3000).start();
    }
}
