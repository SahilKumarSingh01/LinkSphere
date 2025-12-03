import org.java_websocket.server.WebSocketServer;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.json.JSONObject;

import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class MultiClientWebSocketServer extends WebSocketServer {

    private final Map<String, WebSocket> clientMap = Collections.synchronizedMap(new HashMap<>());
    private WebSocket master = null; // master client

    private final AudioCore audioCore;

    public MultiClientWebSocketServer(int port, int recvBufferSize, int sendBufferSize, int mixIntervalMs) {
        super(new InetSocketAddress(port));
        this.audioCore = new AudioCore(recvBufferSize, sendBufferSize, mixIntervalMs);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        String addr = conn.getRemoteSocketAddress().getAddress().getHostAddress();
;
        clientMap.put(addr, conn);

         if (addr.equals("0:0:0:0:0:0:0:1") || addr.equals("127.0.0.1")) {
            master = conn;
            audioCore.addClient(conn);
            System.out.println("Master client connected: " + addr);
        } else {
            System.out.println("Client connected: " + addr);
        }
        // Add to AudioCore
        //you need to remove this line remember fdlfdsljfsdfoiejwopjfpdjj pjdsdjfklsjdlf dsjlkfjsdlkjfklsjf ls
        audioCore.addClient(conn);

        // Assume logic to set master if this is the special client
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        clientMap.values().remove(conn);

        // Remove from AudioCore
        audioCore.removeClient(conn);

        if (conn == master) {
            System.out.println("Master client disconnected: " + conn.getRemoteSocketAddress());
            master = null;
        } else {
            System.out.println("Client disconnected: " + conn.getRemoteSocketAddress());
        }
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        try {
            JSONObject json = new JSONObject(message);

            if (conn == master) {
                // Message from master → handle toSend/status
                if (!json.has("toSend")) return;

                String targetAddr = json.getString("toSend");
                WebSocket targetClient = clientMap.get(targetAddr);

                if (targetClient != null && targetClient.isOpen()) {
                    targetClient.send(json.toString());

                    if (json.has("status") && json.getString("status").equalsIgnoreCase("closing")) {
                        targetClient.close();
                        clientMap.remove(targetAddr);
                        audioCore.removeClient(targetClient);
                        System.out.println("Closed client: " + targetAddr);
                    }
                    if (json.has("status") && json.getString("status").equalsIgnoreCase("connecting")) {
                        audioCore.addClient(targetClient);
                        System.out.println("Added target client to AudioCore: " + targetAddr);
                    }
                }
                
                return;
            }

            // Forward normal client messages to master
            if (master != null && master.isOpen()) {
                JSONObject forwardJson;

                try {
                    forwardJson = new JSONObject(message);
                } catch (Exception e) {
                    // If not JSON, wrap it
                    forwardJson = new JSONObject();
                    forwardJson.put("msg", message);
                }

                // Add the "from" field
                String fromAddr = conn.getRemoteSocketAddress().getAddress().getHostAddress();
                forwardJson.put("from", fromAddr);

                master.send(forwardJson.toString());
            } else {
                // Master not connected → notify client and close
                JSONObject resp = new JSONObject();
                resp.put("status", "closing");
                resp.put("msg", "client is not connected");

                conn.send(resp.toString());
                conn.close();
                clientMap.values().remove(conn);
                audioCore.removeClient(conn);
                System.out.println("Closed client because master is not connected: " + conn.getRemoteSocketAddress());
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onMessage(WebSocket conn, ByteBuffer message) {
        // Forward binary audio to AudioCore
        byte[] data = new byte[message.remaining()];
        message.get(data);
        audioCore.onAudioData(conn, data);
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        ex.printStackTrace();
        if (conn != null) {
            clientMap.values().remove(conn);
            audioCore.removeClient(conn);
        }
    }

    @Override
    public void onStart() {
        System.out.println("WebSocket server started on port: " + getPort());
    }

    public static void main(String[] args) {
        int port = 3000;
        int recvBufferSize = 1024 * 16; // 16 KB receive buffer
        int sendBufferSize = 1024 * 16; // 16 KB send buffer
        int mixIntervalMs = 20; // 20 ms mix interval

        MultiClientWebSocketServer server = new MultiClientWebSocketServer(port, recvBufferSize, sendBufferSize, mixIntervalMs);
        server.start();
    }

    // Optional: externally set master
    public void setMaster(WebSocket masterConn) {
        this.master = masterConn;
        System.out.println("Master client set: " + masterConn.getRemoteSocketAddress());
    }
}
