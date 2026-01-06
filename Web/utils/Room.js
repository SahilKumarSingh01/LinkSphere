import { RingBuffer } from "./RingBuffer.js";
import { MsgType } from "@utils/MessageTypes";

export const Role = Object.freeze({
  MASTER: "master",
  FOLLOWER: "follower",
  CANDIDATE: "candidate"
});

export class Room {
  constructor({
    name = "",
    photo = "",
    peerIp,
    peerPort,
    sampleRate = 48000,
    intervalMs = 20,
    messageHandler
  }) {
    this.peerIp = peerIp;
    this.peerPort = peerPort;
    this._meta = { name, photo };

    this.role = Role.FOLLOWER;
    this.currentMasterIP = null;
    this.currentMasterPort = null;

    this.sampleRate = sampleRate;
    this.intervalMs = intervalMs;
    this.samplesPerInterval = Math.floor(sampleRate * intervalMs / 1000);

    this.buffers = new Map(); // Master only: peerIp -> RingBuffer
    this.peers = new Map();   // All peers: peerIp -> { ip, port }

    this.lastSeenMaster = 0;
    this.clientTimeout = null;
    this.clientTimeoutMs = 1000;
    this.electionTimer = null;
    this.masterTimer = null;

    this.messageHandler = messageHandler;

    this._bindControlPlane();

    // Room connect handler
    this.messageHandler.setOnMessageReceive(
      MsgType.ROOM_CONNECT,
      (srcIP, srcPort, dstIP, dstPort, type, payload) => 
        this._onClientConnect(srcIP, srcPort, dstIP, dstPort, type, payload)
    );

    // Client order (optional, for backward compatibility)
    this.messageHandler.setOnMessageReceive(
      MsgType.CLIENT_ORDER_ASSIGN,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this._handleClientOrderAssign(srcIP, srcPort, dstIP, dstPort, type, payload)
    );

    // Master correction
    this.messageHandler.setOnMessageReceive(
      MsgType.MASTER_CORRECTION,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this._handleMasterCorrection(srcIP, srcPort, dstIP, dstPort, type, payload)
    );

    // Mixed audio frames reset client timeout
    this.messageHandler.setOnMessageReceive(
      MsgType.MIXED_AUDIO_FRAME,
      (srcIP, _srcPort, _dstIP, _dstPort, _type, payload) => {
        this._resetClientTimeout();
      }
    );
  }

  /* ---------------- Client Timeout ---------------- */
  _resetClientTimeout() {
    if (this.clientTimeout) clearTimeout(this.clientTimeout);
    this.clientTimeout = setTimeout(() => {
      console.log("[Room] Client timeout, starting election...");
      this.startElection();
    }, this.clientTimeoutMs);
  }
  
  ipToString(ip) {
      // if ip is already string, return
      if (typeof ip === "string") return ip;

      // if ip is number, convert to IPv4 string
      return ((ip >>> 24) & 0xFF) + "." +
              ((ip >>> 16) & 0xFF) + "." +
              ((ip >>> 8) & 0xFF) + "." +
              (ip & 0xFF);
      }
  /* ---------------- Client Connect ---------------- */
  _onClientConnect(srcIP, _srcPort, _dstIP, _dstPort, _type, payload) {
    try {
      const decoder = new TextDecoder();
      const data = JSON.parse(decoder.decode(payload));
      const clientPort = data.tcpPort;
      if (!clientPort) throw new Error("TCP port missing in ROOM_CONNECT payload");

      // Build key in same order as stored in pendingTCP
      const key = `${this.ipToString(this._dstIP)}:${this._dstPort}::${this.ipToString(srcIP)}:${_srcPort}`;
      this.messageHandler.clearPendingTCP(key);


      console.log(`[Room] Client connected: ${srcIP}:${clientPort}`);

      // Maintain peers for all cases
      this.peers.set(srcIP, { ip: srcIP, port: clientPort });

      // Only Master allocates buffers
      if (this.role === Role.MASTER && !this.buffers.has(srcIP)) {
        this.buffers.set(
          srcIP,
          { buffer: new RingBuffer(this.samplesPerInterval * 10), memberPort: clientPort }
        );
      }

      // Build peer list to send (only Master sends full list)
      const peersList = [];
      for (const [peerIP, peer] of this.peers) {
        peersList.push({ ip: peer.ip, port: peer.port });
      }

      const encoder = new TextEncoder();
      const payloadToSend = encoder.encode(JSON.stringify({
        peers: this.role === Role.MASTER ? peersList : [],
        role: this.role,
        master: this.currentMasterIP ? { ip: this.currentMasterIP, port: this.currentMasterPort } : null
      }));

      this.messageHandler.sendMessage(
        this.peerIp,
        0,
        srcIP,
        clientPort,
        MsgType.CONNECTION_ACCEPTED,
        payloadToSend
      );

    } catch (e) {
      console.error("[Room] Invalid ROOM_CONNECT payload", e);
    }
  }

  /* ---------------- Master Correction ---------------- */
  _handleMasterCorrection(srcIP, _srcPort, _dstIP, _dstPort, _type, payload) {
    try {
      const decoder = new TextDecoder();
      const data = JSON.parse(decoder.decode(payload));
      if (data.ip && data.port !== undefined) {
        this.currentMasterIP = data.ip;
        this.currentMasterPort = data.port;

        this.role = (this.peerIp === this.currentMasterIP && this.peerPort === this.currentMasterPort)
          ? Role.MASTER
          : Role.FOLLOWER;

        this.lastSeenMaster = Date.now();
        console.log(`[Room] Master corrected: ${this.currentMasterIP}:${this.currentMasterPort}, role: ${this.role}`);
      }
    } catch (e) {
      console.error("[Room] Failed to handle MASTER_CORRECTION", e);
    }
  }


  /* ---------------- Control Plane ---------------- */
  _bindControlPlane() {
    this.messageHandler.setOnMessageReceive(
      MsgType.HEARTBEAT,
      (src) => this._onHeartbeat(src)
    );
  }

  _onHeartbeat(srcPeer) {
    if (srcPeer === this.currentMasterIP) {
      this.lastSeenMaster = Date.now();
    }
  }

  /* ---------------- Liveness ---------------- */
  checkMasterTimeout(timeout = 500) {
    if (!this.currentMasterIP) return true;
    return Date.now() - this.lastSeenMaster > timeout;
  }

  /* ---------------- Election ---------------- */
  startElection() {
    if (this.role !== Role.FOLLOWER) return;

    this.role = Role.CANDIDATE;
    this._stopElection();

    const delay = (this.myOrder || 0) * 50; // deterministic delay

    this.electionTimer = setTimeout(() => {
      this._becomeMaster();
    }, delay);
  }

  _stopElection() {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  _becomeMaster() {
    this.role = Role.MASTER;
    this.currentMasterIP = this.peerIp;
    this.currentMasterPort = this.peerPort;
    this.lastSeenMaster = Date.now();

    // Broadcast master info (ip + port)
    this.messageHandler.broadcast(
      MsgType.MASTER_ANNOUNCE,
      { ip: this.currentMasterIP, port: this.currentMasterPort }
    );

    this._startMaster();
  }

  /* ---------------- Master Audio ---------------- */
  _startMaster() {
    this.messageHandler.setOnMessageReceive(
      MsgType.AUDIO_FRAME,
      (src, _, __, ___, payload) => {
        if (!this.buffers.has(src)) {
          this.buffers.set(
            src,
            new RingBuffer(this.samplesPerInterval * 10)
          );
        }
        this.buffers.get(src).buffer.writeSamples(new Float32Array(payload));
      }
    );

    this.masterTimer = setInterval(() => this._runMaster(), this.intervalMs);
  }

  _stopMaster() {
    if (this.masterTimer) {
      clearInterval(this.masterTimer);
      this.masterTimer = null;
    }
    this.buffers.clear();
  }

  _runMaster() {
    if (this.buffers.size === 0) return;

    const mixed = new Float32Array(this.samplesPerInterval);
    for (const buf of this.buffers.values()) {
      const frame = new Float32Array(this.samplesPerInterval);
      buf.buffer.readSamples(frame);
      for (let i = 0; i < mixed.length; i++) mixed[i] += frame[i];
    }

    this.messageHandler.broadcast(
      MsgType.MIXED_AUDIO_FRAME,
      mixed.buffer
    );
  }
}
