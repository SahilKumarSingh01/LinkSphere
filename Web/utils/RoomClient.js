import { MsgType } from "@utils/MessageTypes";
import { Microphone, Speaker, OpusDecoder, OpusEncoder } from "@utils/audio";

export class RoomClient {
  constructor() {
    this.messageHandler = null;

    this.currentMasterIP = null;
    this.currentMasterPort = null;

    this.microphone = null;
    this.speaker = null;

    this.encoder = null;
    this.decoder = null;

    this.micInterval = null;
    this.masterTimeout = null;

    this.muteMic = false;
    this.running = null;

    // callbacks
    this.onServerDisconnect = null;
  }

  setOnServerDisconnect(cb) {
    this.onServerDisconnect = cb;
  }

  init(messageHandler, stream) {
    if (this.running===false) return;

    this.messageHandler = messageHandler;
    this.masterTimeout=setTimeout(()=>{
      if (this.onServerDisconnect) this.onServerDisconnect();
    },500);//this is so all initial client connects

    this.encoder = new OpusEncoder();
    this.decoder = new OpusDecoder();

    this.speaker = new Speaker();
    this.microphone = new Microphone(stream);

    this.messageHandler.setOnMessageReceive(MsgType.AUDIO_MIX,this.onMixAudioReceive.bind(this));

    this.running = true;
  }

  mute() {
    this.muteMic = true;
  }

  unmute() {
    this.muteMic = false;
  }

  refreshAudio(stream) {
    if (!this.running) return;

    if (this.speaker) this.speaker.stop();
    if (this.microphone) this.microphone.stop();

    this.speaker = new Speaker();
    this.microphone = new Microphone(stream);
  }

  onServerConnect( masterIP, masterPort) {
    if (!this.running) return;

    clearInterval(this.micInterval);
    clearTimeout(this.masterTimeout);
    
    this.currentMasterIP = masterIP;
    this.currentMasterPort = masterPort;

    this.masterTimeout = setTimeout(() => {
      if (this.onServerDisconnect) this.onServerDisconnect();
    }, 500);

    this.micInterval = setInterval(() => {
      const available = this.microphone.availableToRead();
      if (available > 0) {
        const buffer = new Float32Array(available);
        const read = this.microphone.readSamples(buffer);

        if (this.muteMic) buffer.fill(0);
        if (read > 0) this.encoder.writeSamples(buffer);
      }
    }, 20);

    this.encoder.onData((packet) => {
      if (!this.currentMasterIP) return;
      this.messageHandler.sendMessage(0,this.currentMasterIP,this.currentMasterPort,MsgType.CLIENT_AUDIO,packet);
    });

    this.decoder.onData((pcm48) => {
      this.speaker.writeSamples(pcm48);
    });

  }

  onMixAudioReceive(srcIP, _srcPort, _dstIP, _dstPort, _type, payload) {
    if (!this.running || srcIP !== this.currentMasterIP) return;

    this.decoder.writePacket(payload);

    clearTimeout(this.masterTimeout);
    this.masterTimeout = setTimeout(() => {
      clearInterval(this.micInterval);
      if (this.onServerDisconnect) this.onServerDisconnect();
    }, 200);
  }

  stop() {
    if (!this.running) return;

    clearInterval(this.micInterval);
    clearTimeout(this.masterTimeout);

    if (this.microphone) this.microphone.stop();
    if (this.speaker) this.speaker.stop();

    if (this.encoder) this.encoder.stop();
    if (this.decoder) this.decoder.stop();

    this.microphone = null;
    this.speaker = null;
    this.encoder = null;
    this.decoder = null;

    if (this.messageHandler) {
      this.messageHandler.removeMessageHandler(MsgType.AUDIO_MIX);
    }

    this.micInterval = null;
    this.masterTimeout = null;

    this.messageHandler = null;
    this.running = false;
  }
}
