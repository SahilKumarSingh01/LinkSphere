import org.java_websocket.WebSocket;

import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class AudioCore {

    private final Map<WebSocket, AudioBuffer> bufferMap = new ConcurrentHashMap<>();
    private final ScheduledExecutorService mixerTimer;
    private final ExecutorService sendPool;

    private final int recvBufferSize;
    private final int sendBufferSize;
    private final int mixIntervalMs;

    private final int sampleRate = 8000; // 8kHz μ-law
    private final int bytesPerSample = 1; // μ-law 8-bit
    private final int frameBytes; // depends on timer interval

    public AudioCore(int recvBufferSize, int sendBufferSize, int mixIntervalMs) {
        this.recvBufferSize = recvBufferSize;
        this.sendBufferSize = sendBufferSize;
        this.mixIntervalMs = mixIntervalMs;
        this.frameBytes = (sampleRate * mixIntervalMs) / 1000 * bytesPerSample;

        this.sendPool = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
        this.mixerTimer = Executors.newSingleThreadScheduledExecutor();
        this.mixerTimer.scheduleAtFixedRate(this::mixAll, 0, mixIntervalMs, TimeUnit.MILLISECONDS);
    }

    public void addClient(WebSocket conn) {
        AudioBuffer buf = new AudioBuffer(recvBufferSize, sendBufferSize);
        bufferMap.put(conn, buf);
        startSendLoop(conn, buf);
    }

    public void removeClient(WebSocket conn) {
        bufferMap.remove(conn);
    }

    private void startSendLoop(WebSocket client, AudioBuffer buf) {
        sendPool.submit(() -> {
            while (!client.isClosed()) {
                int available = (int) (buf.sendWritePos - buf.sendReadPos);
                if (available < 0) available += buf.sendCapacity; // circular handling

                if (available > 0) {
                    byte[] dataToSend = new byte[available];

                    for (int i = 0; i < available; i++) {
                        int readPos = (buf.sendReadPos + i) % buf.sendCapacity;
                        dataToSend[i] = buf.sendBuffer[readPos];
                    }

                    buf.sendReadPos = (buf.sendReadPos + available) % buf.sendCapacity;

                    try {
                        client.send(ByteBuffer.wrap(dataToSend));
                    } catch (Exception e) {
                        e.printStackTrace();
                        break; // exit loop if client fails
                    }
                }

                try {
                    Thread.sleep(mixIntervalMs / 2); // adjust frequency
                } catch (InterruptedException ignored) {}
            }
        });
    }

    public void onAudioData(WebSocket conn, byte[] data) {
        AudioBuffer buf = bufferMap.get(conn);
        if (buf == null) return;

        int remaining = data.length;

        // Calculate free space in circular buffer
        int freeSpace = (buf.recvReadPos <= buf.recvWritePos)
            ? buf.recvCapacity - (buf.recvWritePos - buf.recvReadPos)
            : buf.recvReadPos - buf.recvWritePos;

        if (freeSpace <= 0) {
            // Buffer full, drop incoming data
            return;
        }

        int writable = Math.min(remaining, freeSpace);

        // Handle wrap-around
        int firstChunk = Math.min(writable, buf.recvCapacity - buf.recvWritePos);
        System.arraycopy(data, 0, buf.recvBuffer, buf.recvWritePos, firstChunk);
        buf.recvWritePos = (buf.recvWritePos + firstChunk) % buf.recvCapacity;

        int leftover = writable - firstChunk;
        if (leftover > 0) {
            System.arraycopy(data, firstChunk, buf.recvBuffer, buf.recvWritePos, leftover);
            buf.recvWritePos = (buf.recvWritePos + leftover) % buf.recvCapacity;
        }
    }


    // === MIXING CORE ===
    private void mixAll() {
        if (bufferMap.isEmpty()) return;

        int[] mergedLinear = new int[frameBytes];

        // Step 1: Accumulate each client's contribution
        for (AudioBuffer buf : bufferMap.values()) {
            int available = (buf.recvWritePos >= buf.recvReadPos)
                ? buf.recvWritePos - buf.recvReadPos
                : buf.recvCapacity - (buf.recvReadPos - buf.recvWritePos);

            for (int i = 0; i < frameBytes; i++) {
                int sample = 0; // default zero if underflow
                if (i < available) {
                    int readPos = (buf.recvReadPos + i) % buf.recvCapacity;
                    sample = muLawToLinear(buf.recvBuffer[readPos]);
                }
                mergedLinear[i] += sample;
            }
        }

        // Step 2: Mix for each client
        for (Map.Entry<WebSocket, AudioBuffer> entry : bufferMap.entrySet()) {
            AudioBuffer buf = entry.getValue();

            int available = (buf.recvWritePos >= buf.recvReadPos)
                ? buf.recvWritePos - buf.recvReadPos
                : buf.recvCapacity - (buf.recvReadPos - buf.recvWritePos);

            for (int i = 0; i < frameBytes; i++) {
                int selfSample = 0;
                if (i < available) {
                    int readPos = (buf.recvReadPos + i) % buf.recvCapacity;
                    selfSample = muLawToLinear(buf.recvBuffer[readPos]);
                }

                int mixedSample = mergedLinear[i] - selfSample;
                mixedSample = Math.max(-32768, Math.min(32767, mixedSample));

                int writePos = (buf.sendWritePos + i) % buf.sendCapacity;
                buf.sendBuffer[writePos] = linearToMuLaw(mixedSample);
            }

            buf.sendWritePos = (buf.sendWritePos + frameBytes) % buf.sendCapacity;
        }

        // Step 3: Advance recvReadPos safely
        for (AudioBuffer buf : bufferMap.values()) {
            int available = (buf.recvWritePos >= buf.recvReadPos)
                ? buf.recvWritePos - buf.recvReadPos
                : buf.recvCapacity - (buf.recvReadPos - buf.recvWritePos);

            int advance = Math.min(frameBytes, available);
            buf.recvReadPos = (buf.recvReadPos + advance) % buf.recvCapacity;
        }
    }



    // === μ-law conversion ===
    private int muLawToLinear(byte mu) {
        int muVal = mu & 0xFF;
        muVal = ~muVal;
        int sign = (muVal & 0x80);
        int exponent = (muVal & 0x70) >> 4;
        int mantissa = muVal & 0x0F;
        int sample = ((mantissa << 4) + 0x08) << (exponent + 2);
        return sign == 0 ? sample : -sample;
    }

    private byte linearToMuLaw(int sample) {
        final int MAX = 32635;
        int sign = (sample < 0) ? 0x80 : 0;
        if (sample < 0) sample = -sample;
        if (sample > MAX) sample = MAX;
        sample += 0x84;
        int exponent = 7;
        for (int expMask = 0x4000; (sample & expMask) == 0 && exponent > 0; exponent--, expMask >>= 1) {}
        int mantissa = (sample >> (exponent + 3)) & 0x0F;
        int muLawByte = ~(sign | (exponent << 4) | mantissa);
        return (byte) muLawByte;
    }

    public void shutdown() {
        mixerTimer.shutdownNow();
        sendPool.shutdownNow();
    }
}
