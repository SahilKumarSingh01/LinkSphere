import { RingBuffer } from "./RingBuffer.js";
import { MsgType } from "@utils/MessageTypes";
import { Microphone, Speaker, OpusDecoder, OpusEncoder } from "@utils/audio";

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
    this.roomId=null;

    this.currentMasterIP = null;
    this.currentMasterPort = null;
// Map of active peers in this room.
// Key   : peer IP (string)
// Value : {
//   ip           : peer IP address
//   port         : peer well-known TCP port (used for outgoing connections)
//   randomPort   : peer ephemeral TCP port (used for incoming connections)
//   status       : PeerStatus.CONNECTING | CONNECTED | DISCONNECTED
//   senderConn   : TCP handler for outgoing connection (self -> peer.port), attached once
//   receiverConn : TCP handler for incoming connection (peer.randomPort -> selfPort), attached once
//   name         : peer display name
//   photo        : peer avatar / metadata
// }
    this.peers = new Map();
    this.buffers = new Map();
    this.mixerBuffer=new Map();

    this.lastSeenMaster = 0;
    this.clientTimeout = null;
    this.clientTimeoutMs = 1000;

    this.electionTimer = null;
    this.masterTimer = null;

    this.vote=new Set();

    this.encoder=new OpusEncoder();
    this.decoder=new OpusDecoder();

    this.micInterval=null;
    this.masterTimeout=null;
    this.mixerInterval=null;
    this.muteMic=false;

  }

  async init(messageHandler, knownPeers = [], sampleRate = 8000,stream,roomId,isMaster=false) {
    this.sampleRate = sampleRate;
    this.samplesPerInterval = Math.floor(
      (sampleRate * this.intervalMs) / 1000
    );

    this.messageHandler = messageHandler;

    this.selfIP = this.messageHandler.getDefaultIP();
    this.selfPort = this.messageHandler.getTCPPort();
    this.roomId=roomId;

    this.speaker=new Speaker();
    this.microphone=new Microphone(stream);

    for (const peer of knownPeers) {
      this.connect(peer);
    }

    if (isMaster) {
      this.currentMasterIP = this.selfIP;
      this.currentMasterPort = this.selfPort;
      this.startMixer();
    }

    this.messageHandler.setOnMessageReceive(
      MsgType.CONNECT_REQUEST,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this._onConnect(srcIP, srcPort, dstIP, dstPort, type, payload)
    );
    this.messageHandler.setOnMessageReceive(
      MsgType.CONNECT_REPLY,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this._onConnect(srcIP, srcPort, dstIP, dstPort, type, payload)
    );

     this.messageHandler.setOnMessageReceive(
      MsgType.CAST_VOTE,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this.onVote(srcIP, srcPort, dstIP, dstPort, type, payload)
    );

    this.messageHandler.setOnMessageReceive(
      MsgType.AUDIO_MIX,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>{
        if(srcIP!==this.currentMasterIP) return;
        this.onMixAudioRecieve(payload);
      }
    );

    this.messageHandler.setOnMessageReceive(
      MsgType.CLIENT_AUDIO,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>{
        if(this.currentMasterIP!==this.selfIP)
          return;

        this.mixerBuffer.get(srcIP)?.decoder.writeSamples(payload);
      }
    );

  }

  stop(){

      if(this.speaker!=null)
       this.speaker.stop();
       
      if(this.microphone!=null)
       this.microphone.stop();

      if(this.encoder!=null)
        this.encoder.stop();

      if(this.decoder!=null)
        this.decoder.stop();

      if(this.micInterval)
        clearInterval(this.micInterval);

      for(const [ip,peer] of this.peers)
        this.remove(peer.ip);
      this.messageHandler.removeMessageHandler(MsgType.CONNECT_REQUEST);
      this.messageHandler.removeMessageHandler(MsgType.CONNECT_REPLY);
      this.messageHandler.removeMessageHandler(MsgType.CAST_VOTE);
      this.messageHandler.removeMessageHandler(MsgType.AUDIO_MIX);
      this.messageHandler.removeMessageHandler(MsgType.CLIENT_AUDIO);

  }
  unmute(){
    this.muteMic=false;
  }
  mute(){
    this.muteMic=true;
  }

  refreshAudio(stream){
    if(this.speaker!=null)
       this.speaker.stop();
       
    if(this.microphone!=null)
       this.microphone.stop();

    this.speaker=new Speaker();
    this.microphone=new Microphone(stream);
  }

  remove(peerIP){
    const peer=this.peers.get(peerIP);
    if(!peer)return;
    this.messageHandler.removeConn(MsgType.TCP,this.selfIP,0,peer.ip,peer.port);
    this.messageHandler.removeConn(MsgType.TCP,this.selfIP,this.selfPort,peer.ip,peer.randomPort);

    this.peers.delete(peer.ip);
    if(peer.senderConn){
      this.messageHandler.detachConnHandler(MsgType.TCP,0,peer.ip,peer.port,peer.senderConn);
      peer.senderConn=null;
    }
    if(peer.receiverConn){
      this.messageHandler.detachConnHandler(MsgType.TCP,this.selfPort,peer.ip,peer.randomPort,peer.receiverConn);
      peer.receiverConn=null;
    }

    const mixInfo=this.mixerBuffer.get(peer.ip);
    if(mixInfo){
      mixInfo.encoder.stop();
      mixInfo.decoder.stop();
      this.mixerBuffer.delete(peer.ip);
    }
  }

  connect(peer) {
    const existing = this.peers.get(peer.ip);
    if (existing && existing.status === PeerStatus.CONNECTING) return;

    const updatedPeer = {
      // identity
      ip: peer.ip,
      port: peer.port,

      // connection state
      randomPort: existing?.randomPort ?? null,
      status: PeerStatus.CONNECTING,

      // metadata
      name: peer.name ?? existing?.name ?? "",
      photo: peer.photo ?? existing?.photo ?? "",

      // handlers (must persist)
      senderConn: existing?.senderConn ?? null,
      receiverConn: existing?.receiverConn ?? null,
    };

    if(!updatedPeer.senderConn){
      updatedPeer.senderConn = (msg) => {
        const arr = msg.split("-");
        if (arr[1] === "failed" || arr[1] === "close")
          this.remove(updatedPeer.ip);
      };
      this.messageHandler.attachConnHandler(MsgType.TCP,0,updatedPeer.ip,updatedPeer.port,updatedPeer.senderConn);
    }

    this.peers.set(peer.ip, updatedPeer);

    const payload = new TextEncoder().encode(
      JSON.stringify({
        ip: this.selfIP,
        port: this.selfPort,
        name: this.name ?? "",
        photo: this.photo ?? "",
        roomId: this.roomId??null,
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

  _onConnect(srcIP, srcPort, _dIP, _dPort, _type, payload) {
    const data = JSON.parse(new TextDecoder().decode(payload));
    if(data.roomId!==this.roomId)
      return this.remove(srcIP);//remove if it exist otherwise it auto remove by pendingtcp
    const existing = this.peers.get(srcIP);
    const peer = {
      // identity
      ip: srcIP,
      port: data.port ?? existing?.port ?? null,
      randomPort: srcPort,

      // state
      status: PeerStatus.CONNECTED,

      // metadata
      name: data.name ?? existing?.name ?? "",
      photo: data.photo ?? existing?.photo ?? "",

      // handlers (persistent)
      senderConn: existing?.senderConn ?? null,
      receiverConn: existing?.receiverConn ?? null,
    };

    if(!peer.receiverConn){
      peer.receiverConn = (msg) => {
        const arr = msg.split("-");
        if (arr[1] === "failed" || arr[1] === "close")
          this.remove(peer.ip);
      };
      this.messageHandler.attachConnHandler(MsgType.TCP,this.selfPort,peer.ip,peer.randomPort,peer.receiverConn);
    }

    if(_type==MsgType.CONNECT_REQUEST){
        const payload = new TextEncoder().encode(
        JSON.stringify({
          ip: this.selfIP,
          port: this.selfPort,
          name: this.name ?? "",
          photo: this.photo ?? "",
          roomId: this.roomId??null,
          master: this.currentMasterIP
            ? { ip: this.currentMasterIP, port: this.currentMasterPort }
            : null
          })
        );

        this.messageHandler.sendMessage(
          0,
          peer.ip,
          peer.port,
          MsgType.CONNECT_REPLY,
          payload
        );
      }

    this.peers.set(srcIP, peer);

    if(this.selfIP===this.currentMasterIP)
        this._addClientToMixer(peer)
       

    if (data.master) {
      if(srcIP===data.master.ip){
        this.currentMasterIP = srcIP;
        this.currentMasterPort = data.port;
        this.onServerConnect();
      }else if(data.master.ip!==this.currentMasterIP){
        this.currentMasterIP = null;
        this.currentMasterPort = null;
        this.connect({ip:data.master.ip,port:data.master.port});
      }
    }

    this.messageHandler.clearPendingTCP(srcIP, srcPort, _dIP, _dPort);
  }
  
  onServerConnect(){
    if(this.currentMasterIP===null || this.currentMasterPort===null) return;
    
    if(this.micInterval)
        clearInterval(this.micInterval);
    const interval = 20;

    this.micInterval= setInterval(() => {
      const available = this.microphone.availableToRead();
      if (available > 0) {
        const buffer = new Float32Array(available);
        const read = this.microphone.readSamples(buffer);
        if(this.muteMic)
          buffer.fill(0);

        if (read > 0)
          this.encoder.writeSamples(buffer);
      }
    }, interval);

    this.encoder.onData((packet)=>{
      this.messageHandler.sendMessage(
        0,
        this.currentMasterIP,
        this.currentMasterPort,
        MsgType.CLIENT_AUDIO,
        packet
      )
    })

    this.decoder.onData((pcm48)=>{
      this.speaker.writeSamples(pcm48);
    })

  }

  _addClientToMixer(peer){

      let mixInfo=this.mixerBuffer.get(peer.ip) || {};

      if(mixInfo?.encoder)
        mixInfo.encoder.stop();
      if(mixInfo?.decoder)
        mixInfo.decoder.stop();

      mixInfo.encoder=new OpusEncoder();
      mixInfo.decoder=new OpusDecoder();
      mixInfo.audioBuf=new RingBuffer(48000);
      mixInfo.out=new Float32Array(960);
      this.mixerBuffer.set(peer.ip,mixInfo);

      mixInfo.decoder.onData((pcm48)=>{
        mixInfo.audioBuf.writeSamples(pcm48)
      })

      mixInfo.encoder.onData((mixedAudio)=>{
        this.messageHandler.sendMessage(
          0,
          peer.ip,
          peer.port,
          MsgType.AUDIO_MIX,
          mixedAudio
        )
      })

      
  }

  onMixAudioRecieve(payload){
    this.decoder.writePacket(payload);
    if(this.masterTimeout) 
      clearTimeout(this.masterTimeout);
    this.masterTimeout=setTimeout(()=>{
    this.startElection();
    },100);
       
  }

  ///// Election Part

  async startElection(){

    this.currentMasterIP=null;
    this.currentMasterPort=null;
    this.vote.clear();
    while(this.currentMasterIP===null){

      this.vote.clear();

      for (const [ip,peer] of this.peers) 
        this.connect(peer);

      await new Promise((resolve,reject)=>{
        setTimeout(()=>{resolve();},200)
      })

      let ip=this.selfIP;

      for(const [_,peer] of this.peers){
          if(peer.status===PeerStatus.CONNECTED)  
            ip = ip > peer.ip ? ip : peer.ip;
      }

      const candidate=(ip===this.selfIP?{
            ip: this.selfIP,
            port: this.selfPort,
            name: this.name ?? "",
            photo: this.photo ?? "",
  
      }:this.peers.get(ip));

      const payload= new TextEncoder().encode(JSON.stringify({}));

      this.messageHandler.sendMessage(0,candidate.ip,candidate.port,MsgType.CAST_VOTE,payload);    

      await new Promise((resolve,reject)=>{
        setTimeout(()=>{resolve();},200)
      })
    }
  }
  
  async onVote(srcIP, srcPort, dstIP, dstPort, type, payload){

    if(this.currentMasterIP!=null){
        let peer=this.peers.get(srcIP);
        this.connect(peer);
        return;
    }
    this.vote.add(srcIP);
    let currentActive=0;
    for(const [ip,peer] of this.peers){
        if(peer.status===PeerStatus.CONNECTED)
          currentActive++;
    }

    let totalVote=this.vote.size;

    if((currentActive/2)<totalVote && this.currentMasterIP===null){

        this.currentMasterIP=this.selfIP;
        this.currentMasterPort=this.selfPort;
        this.startMixer();

        for(const ip of this.vote){
          const peer=this.peers.get(ip);
          this.connect(peer);
        }

    }

  }

  startMixer() {
    if (this.mixerInterval)
      clearInterval(this.mixerInterval);

    this.mixerInterval = setInterval(() => {
      const mix = new Float32Array(960);

      // 1. read once from all buffers
      for (const [, mixInfo] of this.mixerBuffer) {
        mixInfo.out.fill(0);
        mixInfo.audioBuf.readSamples(mixInfo.out);
      }

      // 2. build global mix
      mix.fill(0);
      for (const [, mixInfo] of this.mixerBuffer) {
        for (let i = 0; i < 960; i++) {
          mix[i] += mixInfo.out[i];
        }
      }

      // 3. personalized mix (mix - self)
      for (const [, mixInfo] of this.mixerBuffer) {
        for (let i = 0; i < 960; i++) {
          mixInfo.out[i] = mix[i] - mixInfo.out[i];
        }
        mixInfo.encoder.writeSamples(mixInfo.out);
      }

    }, 20);
  }


}
