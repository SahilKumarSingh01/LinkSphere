import { MsgType } from "@utils/MessageTypes";
import { RingBuffer } from "./RingBuffer.js";
import { OpusDecoder, OpusEncoder } from "@utils/audio";

export class RoomServer {
  constructor() {
    this.messageHandler = null;
    this.broadcast = null;

    this.mixerBuffer = new Map();
    this.mixerInterval = null;
    this.mix = null;

    this.running = null;
  }

  init(messageHandler, broadcastPeerUpdate) {
    if (this.running===false) return;

    this.messageHandler = messageHandler;
    this.broadcast = broadcastPeerUpdate;

    this.messageHandler.setOnMessageReceive(MsgType.CLIENT_AUDIO,this.onClientAudioReceived.bind(this));

    this.running = true;
  }

  addClientToMixer({ ip, port, name, photo }) {
    if (!this.running || this.mixerBuffer.has(ip)) return;

    const mixInfo = {};

    mixInfo.encoder = new OpusEncoder();
    mixInfo.decoder = new OpusDecoder();
    mixInfo.audioBuf = new RingBuffer(960 * 10);
    mixInfo.out = new Float32Array(960);

    mixInfo.clientTimeout = setTimeout(() => {
      this.removeClientFromMixer(ip);
    }, 500);

    mixInfo.decoder.onData((pcm48) => {
      mixInfo.audioBuf.writeSamples(pcm48);
    });

    mixInfo.encoder.onData((mixedAudio) => {
      this.messageHandler.sendMessage(0,ip,port,MsgType.AUDIO_MIX,mixedAudio);
    });

    this.mixerBuffer.set(ip, mixInfo);

    this.broadcast({ ip, port, name, photo },MsgType.PEER_CONNECTED);
  }

  onClientAudioReceived(srcIP, srcPort, dstIP, dstPort, type, payload) {
    if (!this.running) return;

    const mixInfo = this.mixerBuffer.get(srcIP);
    if (!mixInfo) return;

    mixInfo.decoder.writePacket(payload);

    clearTimeout(mixInfo.clientTimeout);
    mixInfo.clientTimeout = setTimeout(() => {
      this.removeClientFromMixer(srcIP);
    }, 200);
  }


  startMixer() {
    if (!this.running) return;

    clearInterval(this.mixerInterval);
    this.mix = this.mix || new Float32Array(960);

    this.mixerInterval = setInterval(() => {
      if (!this.running) return;

      for (const [, mixInfo] of this.mixerBuffer) {
        mixInfo.out.fill(0);
        mixInfo.audioBuf.readSamples(mixInfo.out);
      }

      this.mix.fill(0);
      for (const [, mixInfo] of this.mixerBuffer) {
        for (let i = 0; i < 960; i++) {
          this.mix[i] += mixInfo.out[i];
        }
      }

      for (const [, mixInfo] of this.mixerBuffer) {
        for (let i = 0; i < 960; i++) {
          mixInfo.out[i] = this.mix[i] - mixInfo.out[i];
        }
        mixInfo.encoder.writeSamples(mixInfo.out);
      }
    }, 20);
  }

  stopServer() {
    if (!this.running) return;

    clearInterval(this.mixerInterval);
    for (const [ip] of this.mixerBuffer) {
      this.removeClientFromMixer(ip);
    }
  }

  removeClientFromMixer(peerIP){
    if(!this.running) return;
    const mixInfo=this.mixerBuffer.get(peerIP);
    if(mixInfo){
      clearTimeout(mixInfo.clientTimeout);
      mixInfo.encoder.stop();
      mixInfo.decoder.stop();
      mixInfo.encoder=null;
      mixInfo.decoder=null;
      mixInfo.audioBuf=null;
      mixInfo.out=null;
      mixInfo.clientTimeout=null;
      this.mixerBuffer.delete(peerIP);
      this.broadcast({peerIP},MsgType.PEER_REMOVED);
    }
  }

  stop() {
    if (!this.running) return;

    this.stopServer();

    if(this.messageHandler){
        this.messageHandler.removeMessageHandler(MsgType.CLIENT_AUDIO);
    }

    this.mixerBuffer.clear();
    this.messageHandler = null;
    this.broadcast = null;
    this.mix = null;

    this.running = false;
  }
}
