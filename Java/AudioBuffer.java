public class AudioBuffer {
    public final byte[] recvBuffer;     // incoming audio data
    public final byte[] sendBuffer;     // outgoing mixed audio data

    public int recvWritePos = 0;
    public int recvReadPos  = 0;

    public int sendWritePos = 0;
    public int sendReadPos  = 0;

    public long totalRecvWritten = 0;   // total bytes written to recvBuffer
    public long totalSendWritten = 0;   // total bytes written to sendBuffer

    public final int recvCapacity;
    public final int sendCapacity;

    public AudioBuffer(int recvSize, int sendSize) {
        this.recvCapacity = recvSize;
        this.sendCapacity = sendSize;
        this.recvBuffer = new byte[recvSize];
        this.sendBuffer = new byte[sendSize];
    }
}
