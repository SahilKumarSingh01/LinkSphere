import { RingBuffer } from "./RingBuffer.js";
import { MsgType } from "@utils/MessageTypes";
import { Microphone, Speaker, OpusDecoder, OpusEncoder } from "@utils/audio";
import { Mutex } from "@utils/Mutex.js"; 
import { AtomicInt } from "./AtomicInt.js";


export const PeerStatus = Object.freeze({
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected"
});

export class Room {
  constructor() {
    console.log("log room is created ");
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

    this.encoder=null;//new OpusEncoder();
    this.decoder=null;//new OpusDecoder();

    this.micInterval=null;
    this.masterTimeout=null;
    this.mixerInterval=null;
    this.muteMic=false;   

    this.running=null;
    this.exLock = new Mutex();


  }

  async init(messageHandler,stream,roomId,name="",photo="") {//this can't be made async 
    await this.exLock.lock();
    if(this.running===false){
      this.exLock.unlock();
      return;
    }
    this.name=name;
    this.photo=photo;
    this.messageHandler = messageHandler;
    this.encoder=new OpusEncoder();
    this.decoder=new OpusDecoder();
    this.selfIP = this.messageHandler.getDefaultIP();
    this.selfPort = this.messageHandler.getTCPPort();
    this.roomId=roomId;

    this.speaker=new Speaker();
    this.microphone=new Microphone(stream);

    this.masterTimeout=setTimeout(()=>{
      this.startElection();
      console.log("master election is called");
    },100);
    console.log("master is set");

    
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
        // console.log("received",payload);
        this.onMixAudioRecieve(payload);
        
      }
    );

    this.messageHandler.setOnMessageReceive(
      MsgType.CLIENT_AUDIO,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>{
        if(this.currentMasterIP!==this.selfIP)
          return;
        const mixInfo=this.mixerBuffer.get(srcIP);

        if(mixInfo.debt.get()>0)
           mixInfo.debt.update(-2*960);
        else
          mixInfo.decoder.writePacket(payload);
      }
    );
    this.running=true;
    this.exLock.unlock();
    console.log("init is called ....");
  }
  
  addClient({ ip, port, name = "", photo = "" }) {
    if (!ip||!this.messageHandler||!this.running) return;

    const existing = this.peers.get(ip);

    if (existing) {
      existing.port = port;
      existing.name = name;
      existing.photo = photo;
      return;
    }

    this.connect({ ip, port, name, photo });
  }


  async stop() {
    await this.exLock.lock();
    if(this.running!==true){
        this.running=false;
        this.exLock.unlock();
        return;
    }


    await new Promise((resolve)=>setTimeout(resolve,1000));
    if (this.speaker != null) {
      this.speaker.stop();
      console.log("we destroyed speaker here");
    }

    if(this.micInterval)
      clearInterval(this.micInterval);
    if(this.mixerInterval)
      clearInterval(this.mixerInterval);

    if (this.microphone != null) 
      this.microphone.stop();

    if (this.messageHandler) {
      this.messageHandler.removeMessageHandler(MsgType.CONNECT_REQUEST);
      this.messageHandler.removeMessageHandler(MsgType.CONNECT_REPLY);
      this.messageHandler.removeMessageHandler(MsgType.CAST_VOTE);
      this.messageHandler.removeMessageHandler(MsgType.AUDIO_MIX);
      this.messageHandler.removeMessageHandler(MsgType.CLIENT_AUDIO);
    }

    if(this.masterTimeout) {
      clearTimeout(this.masterTimeout);
      console.log("master is removed");
    }

    if (this.encoder != null)
      await this.encoder.stop();

    if (this.decoder != null)
      await this.decoder.stop();

    for (const [ip, peer] of this.peers)
      await this.remove(peer.ip);

    if (this.peers)
      this.peers.clear();
    
    if(this.masterTimeout) {
      clearTimeout(this.masterTimeout);
      console.log("master is removed");
    }

      this.messageHandler = null;
      this.speaker = null;
      this.micInterval=null;
      this.microphone = null;
      this.encoder = null;
      this.decoder = null;
      this.peers = null;
      this.masterTimeout=null;
      this.mixerInterval=null;
      this.mix=null;
    
    
    this.exLock.unlock();

  }

  unmute(){
    this.muteMic=false;
  }
  mute(){
    this.muteMic=true;
  }

  refreshAudio(stream){
    if(!this.running)return ;
    if(this.speaker!=null)
       this.speaker.stop();
       
    if(this.microphone!=null)
       this.microphone.stop();

    this.speaker=new Speaker();
    this.microphone=new Microphone(stream);
  }

  async remove(peerIP){

    if(!this.running) return;
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
      await mixInfo.encoder.stop();
      await mixInfo.decoder.stop();
      this.mixerBuffer.delete(peer.ip);
    }
  }

  connect(peer) {
    if(!this.running)return;
    const existing = this.peers.get(peer.ip);
    if (existing && existing.status === PeerStatus.CONNECTING) return;

    const updatedPeer = {
      ip: peer.ip,
      port: peer.port,
      randomPort: existing?.randomPort ?? null,
      status: PeerStatus.CONNECTING,
      name: peer.name ?? existing?.name ?? "",
      photo: peer.photo ?? existing?.photo ?? "",
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
    if(!this.running)return;
    const data = JSON.parse(new TextDecoder().decode(payload));
    if(data.roomId!==this.roomId)
      return this.remove(srcIP);//remove if it exist otherwise it auto remove by pendingtcp
    const existing = this.peers.get(srcIP);
    const peer = {
      ip: srcIP,
      port: data.port ?? existing?.port ?? null,
      randomPort: srcPort,
      status: PeerStatus.CONNECTED,
      name: data.name ?? existing?.name ?? "",
      photo: data.photo ?? existing?.photo ?? "",
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
    if(!this.running||this.currentMasterIP===null|| this.currentMasterPort===null ) return;
    
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
      if(!this.running)return;
      let mixInfo=this.mixerBuffer.get(peer.ip) || {};

      if(mixInfo?.encoder)
        mixInfo.encoder.stop();
      if(mixInfo?.decoder)
        mixInfo.decoder.stop();

      mixInfo.debt=new AtomicInt(0);
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
        // console.log("audio send",mixedAudio);
      })

      
  }

  onMixAudioRecieve(payload){
    if(!this.running)return;
    const debt=this.speaker.getDebt();

    if(debt>0)
        this.speaker.updateDebt(-2*960);
    else
        this.decoder.writePacket(payload);

    if(this.masterTimeout) 
      clearTimeout(this.masterTimeout);
    this.masterTimeout=setTimeout(()=>{
    this.startElection();
    },100);
       
  }

  ///// Election Part
async startElection() {
  if(!this.running)return;
  console.log("🔹 Starting election process...");
  
  this.currentMasterIP = null;
  this.currentMasterPort = null;
  this.vote.clear();

  while (this.running&&this.currentMasterIP === null) {
    console.log("🔸 New election round started.");
    this.vote.clear();
    this.connect({ip: this.selfIP,port: this.selfPort,name: this.name ?? "",photo: this.photo ?? ""});

    for (const [ip, peer] of this.peers) {
      console.log(`🔹 Connecting to peer: ${ip}`);
      this.connect(peer);
    }

    console.log("⏳ Waiting 200ms for connections to stabilize...");
    await new Promise((resolve) => setTimeout(resolve, 200));

    let ip = 0;
    console.log(`🔹 Starting candidate selection. Initial candidate IP: ${ip}`);

    for (const [_, peer] of this.peers) {
      if (peer.status === PeerStatus.CONNECTED) {
        console.log(`🔹 Peer connected: ${peer.ip}. Comparing IPs...`);
        ip = ip > peer.ip ? ip : peer.ip;
        console.log(`🔹 Current highest IP candidate: ${ip}`);
      } else {
        console.log(`⚠️ Peer not connected: ${peer.ip}`);
      }
    }

    const candidate = this.peers.get(ip);
    if(!candidate)
      continue;
    console.log("🔹 Selected candidate for this round:", candidate);

    const payload = new TextEncoder().encode(JSON.stringify({}));
    console.log(`🔹 Sending vote to candidate ${candidate.ip}:${candidate.port}`);

    this.messageHandler.sendMessage(0, candidate.ip, candidate.port, MsgType.CAST_VOTE, payload);

    console.log("⏳ Waiting 200ms for votes to be cast...");
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log("🔹 End of election round. Current master IP:", this.currentMasterIP);
  }

  console.log("✅ Election complete! Master elected:", this.currentMasterIP, this.currentMasterPort);
}

  
  async onVote(srcIP, srcPort, dstIP, dstPort, type, payload){
    if(!this.running)return;
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
    if(!this.running)return
    if (this.mixerInterval)
      clearInterval(this.mixerInterval);
    this.mix = this.mix?this.mix:new Float32Array(960);
    this.mixerInterval = setInterval(() => {
      if(!this.running)return
      
      for (const [, mixInfo] of this.mixerBuffer) {
        mixInfo.out.fill(0);
        const read=mixInfo.audioBuf.readSamples(mixInfo.out);
        mixInfo.debt.update(mixInfo.out.length-read);
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


}
