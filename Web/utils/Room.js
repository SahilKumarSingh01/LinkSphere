import { RingBuffer } from "./RingBuffer.js";
import { MsgType } from "@utils/MessageTypes";

export const Role = Object.freeze({
  MASTER: "master",
  FOLLOWER: "follower",
  CANDIDATE: "candidate"
});

export const PeerStatus = Object.freeze({
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected"
});

export class Room {
  constructor() {
    this.sampleRate = 0;
    this.intervalMs = 20;
    this.samplesPerInterval = 0;

    this.messageHandler = null;

    this.selfIP = null;
    this.selfPort = null;
    this.name = "";
    this.photo = "";


    this.role = Role.FOLLOWER;
    this.currentMasterIP = null;
    this.currentMasterPort = null;

    this.peers = new Map(); // ip -> { ip, port, role, status }
    this.buffers = new Map();

    this.lastSeenMaster = 0;
    this.clientTimeout = null;
    this.clientTimeoutMs = 1000;

    this.electionTimer = null;
    this.masterTimer = null;
  }

  async init(messageHandler, role, knownPeers = [], sampleRate = 8000) {
    this.sampleRate = sampleRate;
    this.samplesPerInterval = Math.floor(
      (sampleRate * this.intervalMs) / 1000
    );

    this.messageHandler = messageHandler;

    this.selfIP = this.messageHandler.getDefaultIP();
    this.selfPort = this.messageHandler.getTCPPort();

    this.role = role;

    for (const peer of knownPeers) {
      this.connect(peer);
      
    }

    if (this.role === Role.MASTER) {
      this.currentMasterIP = this.selfIP;
      this.currentMasterPort = this.selfPort;
    }

    this.messageHandler.setOnMessageReceive(
      MsgType.CONNECT_REQUEST,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this._onConnectRequest(srcIP, srcPort, dstIP, dstPort, type, payload)
    );

    this.messageHandler.setOnMessageReceive(
      MsgType.CONNECT_RESPONSE,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this._onConnectResponse(srcIP, srcPort, dstIP, dstPort, type, payload)
    );

  }

  connect(peer) {
    const existing = this.peers.get(peer.ip);
    if (existing && existing.status === PeerStatus.CONNECTING) return;

    const timeout = setTimeout(() => {
      const p = this.peers.get(peer.ip);
      if (p && p.status === PeerStatus.CONNECTING) {
        this.peers.delete(peer.ip);
      }
    }, 3000);

    this.peers.set(peer.ip, {
      ip: peer.ip,
      port: peer.port,
      role: peer.role ?? Role.FOLLOWER,
      name: peer.name ?? "",
      photo: peer.photo ?? "",
      status: PeerStatus.CONNECTING,
      timeout
    });

    const payload = new TextEncoder().encode(
      JSON.stringify({
        ip: this.selfIP,
        port: this.selfPort,
        role: this.role,
        name: this.name ?? "",
        photo: this.photo ?? "",
        master: this.currentMasterIP
          ? { ip: this.currentMasterIP, port: this.currentMasterPort }
          : null
      })
    );

    this.messageHandler.sendMessage(
      0,
      peer.ip,
      peer.port,
      MsgType.CONNECT_REQUEST,
      payload
    );
  }

  _onConnectRequest(srcIP, srcPort, _dIP, _dPort, _type, payload) {
    const data = JSON.parse(new TextDecoder().decode(payload));
    
    const peer = {
      ip: srcIP,
      port: data.port,          // incoming port from peer (not necessarily same as srcPort)
      role: data.role ?? Role.FOLLOWER,
      name: data.name ?? "",
      photo: data.photo ?? "",
      status: PeerStatus.CONNECTED,
      timeout: null
    };

    if (data.role===Role.MASTER) {
      this.currentMasterIP = srcIP;
      this.currentMasterPort = data.port; // only set master if peer says it is master
    }

    this.peers.set(srcIP, peer);

    const responsePayload = new TextEncoder().encode(
      JSON.stringify({
        ip: this.selfIP,
        port: this.selfPort,
        role: this.role,
        name: this.name ?? "",
        photo: this.photo ?? "",
        master: this.currentMasterIP
          ? { ip: this.currentMasterIP, port: this.currentMasterPort }
          : null
      })
    );

    this.messageHandler.sendMessage(
      0,        // ephemeral port, let handler pick random
      srcIP,
      data.port,
      MsgType.CONNECT_RESPONSE,
      responsePayload
    );

    if (data.master) {
      this.updateMaster(data.master.ip, data.master.port); // only trust master's own info
    }
    this.messageHandler.clearPendingTCP(srcIP,srcPort,_dIP,_dPort);
  }

  _onConnectResponse(srcIP, srcPort, _dIP, _dPort, _type, payload) {
    const data = JSON.parse(new TextDecoder().decode(payload));
    const peer = this.peers.get(srcIP);
    if (!peer) return;

    if (peer.timeout) clearTimeout(peer.timeout); // clears timeout for connecting peer

    peer.port = srcPort;    // use the actual TCP port used for response
    peer.role = data.role ?? null;
    peer.name = data.name ?? "";
    peer.photo = data.photo ?? "";
    peer.status = PeerStatus.CONNECTED;
    peer.timeout = null;

    if (data.master) {
      this.updateMaster(data.master.ip, data.master.port);
    }
    this.messageHandler.clearPendingTCP(srcIP,srcPort,_dIP,_dPort);
  }

  updateMaster(ip, port) {
    // if same as current master, nothing to do
    if (this.currentMasterIP === ip && this.currentMasterPort === port) return;

    // reset master info
    this.currentMasterIP = null;
    this.currentMasterPort = null;

    // if peer already exists, remove if connected, skip if connecting
    if (this.peers.has(ip)) {
      const peer = this.peers.get(ip);
      if (peer.status === PeerStatus.CONNECTING) return; // still waiting for handshake
      if (peer.status === PeerStatus.CONNECTED) {
        if (peer.timeout) clearTimeout(peer.timeout); // cancel any pending timeout
        this.peers.delete(ip); // remove old master to re-verify liveness
      }
    }

    // attempt a fresh connect to confirm liveness
    this.connect({
      ip,
      port,
      role: Role.MASTER
    });
  }




}
