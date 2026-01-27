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
    this.mixerBuffer=new Map();

    this.vote=new Set();

    this.encoder=null;//new OpusEncoder();
    this.decoder=null;//new OpusDecoder();

    this.micInterval=null;
    this.masterTimeout=null;
    this.mixerInterval=null;
    this.muteMic=false;   

    this.running=null;
  }

  async broadcastPeerUpdate(update,type){
    if(!this.running)return;
    const payload=new TextEncoder().encode(JSON.stringify(update));
    for (const [_, peer] of this.peers) {
      if (peer.status === PeerStatus.CONNECTED) {
        await this.messageHandler.sendMessage(0,peer.ip,peer.port,type,payload);
      }
    }
  }
  

  init(messageHandler,stream,roomId,name="",photo="") {
    if(this.running===false)return;
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
      console.log("this.masterTimeout  is called from init");
      this.startElection(); //it only runs if no master is selected in this period
    },500);//this is so all initial client connects

    this.messageHandler.setOnMessageReceive(MsgType.CONNECT_REQUEST,this._onConnect.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.CONNECT_REPLY,this._onConnect.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.CAST_VOTE,this.onVote.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.AUDIO_MIX,this.onMixAudioReceive.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.CLIENT_AUDIO,this.onClientAudioReceived.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.PEER_CONNECTED,this.onPeerUpdate.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.PEER_REMOVED,this.onPeerUpdate.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.ALL_PEERS,this.onAllPeersReceive.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.GET_ALL_PEERS,this.onAllPeersRequest.bind(this));

    this.running=true;
  }
  
  onAllPeersReceive(srcIP, srcPort, _dIP, _dPort, _type, payload) {
    if(!this.running ||srcIP!==this.currentMasterIP)return;
    const data = JSON.parse(new TextDecoder().decode(payload));
    for(const peer of data)
      this.addClient(peer);
  }

  onAllPeersRequest(srcIP, srcPort, _dIP, _dPort, _type, ___) {
    if(!this.running ||this.selfIP!==this.currentMasterIP)return;
    const peer=this.peers.get(srcIP);
    if(!peer)return;
    const payload = new TextEncoder().encode(JSON.stringify(this.getPeers()));
    this.messageHandler.sendMessage(0,peer.ip,peer.port,MsgType.ALL_PEERS,payload);
  }

  onPeerUpdate(srcIP, srcPort, _dIP, _dPort, _type, payload) {
    if(!this.running ||srcIP!==this.currentMasterIP)return;
    const data = JSON.parse(new TextDecoder().decode(payload));
    if(_type===MsgType.PEER_CONNECTED){
      if(this.peers.get(data.ip)?.status!==PeerStatus.CONNECTED)
        this.connect({ip:data.ip,port:data.port,name:data.name,photo:data.photo});
    }else if(_type===MsgType.PEER_REMOVED){
      console.log("we are removing from here");
      this.remove(data.ip);
    }
  }

  getPeers(){
    if(!this.running)return [];
    return [...this.peers.values()];
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

  async addClient({ ip, port, name = "", photo = "" }) {
    if (!this.running) return;

    const existing = this.peers.get(ip);

    if (existing) {
      existing.port = port;
      existing.name = name;
      existing.photo = photo;
      return;
    }
    await this.connect({ ip, port, name, photo });
  }

  async connect({ ip, port, name, photo }) {
    if(!this.running||!ip ||!port)return;

    const existing = this.peers.get(ip);
    if (existing && existing.status === PeerStatus.CONNECTING) return;
    console.log("connect is called for",{ ip, port, name, photo });
    const updatedPeer = {
      ip: ip,
      port: port,
      randomPort: existing?.randomPort ?? null,
      status: PeerStatus.CONNECTING,
      name: name ?? existing?.name ?? "",
      photo: photo ?? existing?.photo ?? "",
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

    this.peers.set(ip, updatedPeer);

    const payload = new TextEncoder().encode(
      JSON.stringify({
        ip: this.selfIP,
        port: this.selfPort,
        name: this.name ?? "",
        photo: this.photo ?? "",
        roomId: this.roomId??null,
        master: { ip: this.currentMasterIP, port: this.currentMasterPort }
      })
    );

    this.messageHandler.sendMessage(0,ip,port,MsgType.CONNECT_REQUEST,payload);
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

    this.peers.set(srcIP, peer);

    
    if(data.master.ip&&data.master.ip!==this.currentMasterIP){
      if(this.currentMasterIP===this.selfIP)
        this.stopServer();
      if(srcIP===data.master.ip){
        this.currentMasterIP = srcIP;
        this.currentMasterPort = data.port;
        console.log("really current master",this.currentMasterIP);
        this.onServerConnect();
      }else{
        this.currentMasterIP = null;
        this.currentMasterPort = null;
        this.connect({ip:data.master.ip,port:data.master.port});
      }
    }
    
    if(_type==MsgType.CONNECT_REQUEST){
        const payload = new TextEncoder().encode(
        JSON.stringify({
          ip: this.selfIP,
          port: this.selfPort,
          name: this.name ?? "",
          photo: this.photo ?? "",
          roomId: this.roomId??null,
          master: { ip: this.currentMasterIP, port: this.currentMasterPort }
          })
        );

        this.messageHandler.sendMessage(0,peer.ip,peer.port,MsgType.CONNECT_REPLY,payload);
      }

    if(this.selfIP===this.currentMasterIP)
        this._addClientToMixer(peer);

    this.messageHandler.clearPendingTCP(srcIP, srcPort, _dIP, _dPort);
  }
  
  onServerConnect(){
    if(!this.running) return;
    console.log("on server connect is called");
    clearInterval(this.micInterval);
    clearTimeout(this.masterTimeout);

    this.masterTimeout=setTimeout(()=>{
      this.startElection();
    },500);

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
    }, 20);

    this.encoder.onData((packet)=>{
      if(!this.currentMasterIP)return;
      this.messageHandler.sendMessage(0,this.currentMasterIP,this.currentMasterPort,MsgType.CLIENT_AUDIO,packet)
    })

    this.decoder.onData((pcm48)=>{
      this.speaker.writeSamples(pcm48);
    })
    this.messageHandler.sendMessage(0,this.currentMasterIP,this.currentMasterPort,MsgType.GET_ALL_PEERS,[]);
  }
  
  onMixAudioReceive(srcIP, srcPort, dstIP, dstPort, type, payload){
    if(!this.running||srcIP!==this.currentMasterIP)return;
    
    this.decoder.writePacket(payload);

    clearTimeout(this.masterTimeout);
    this.masterTimeout=setTimeout(()=>{
      console.log("this.masterTimeout  is called from onMixAudioReceive");
      this.startElection();
    },200);
       
  }

  onClientAudioReceived(srcIP, srcPort, dstIP, dstPort, type, payload){
    if(!this.running || this.currentMasterIP!==this.selfIP)return;

    const mixInfo=this.mixerBuffer.get(srcIP);
    if(!mixInfo)return;

    mixInfo.decoder.writePacket(payload);

    clearTimeout(mixInfo.clientTimeout);
    mixInfo.clientTimeout=setTimeout(()=>{console.log("on client audio received removed is called");this.remove(srcIP)},200);

  }

  async _addClientToMixer({ip ,port,name,photo}){
    if(!this.running||this.mixerBuffer.get(ip))return;
    let mixInfo= {};
    console.log("client is added to mixer",ip);

    mixInfo.encoder=new OpusEncoder();
    mixInfo.decoder=new OpusDecoder();
    mixInfo.audioBuf=new RingBuffer(960*10);  //200ms
    mixInfo.out=new Float32Array(960);
    mixInfo.clientTimeout=setTimeout(()=>{console.log("add client to mixer removed is called");this.remove(ip)},200);
    this.mixerBuffer.set(ip,mixInfo);
    

    mixInfo.decoder.onData((pcm48)=>{
      mixInfo.audioBuf.writeSamples(pcm48)
    })

    mixInfo.encoder.onData((mixedAudio)=>{
      this.messageHandler.sendMessage(0,ip,port,MsgType.AUDIO_MIX,mixedAudio)
    })
    await this.broadcastPeerUpdate({ip,port,name,photo},MsgType.PEER_CONNECTED);
  }

  startMixer() {
    if(!this.running)return
    clearInterval(this.mixerInterval);
    this.mix = this.mix?this.mix:new Float32Array(960);
    this.mixerInterval = setInterval(() => {
      if(!this.running)return
      
      for (const [, mixInfo] of this.mixerBuffer) {
        mixInfo.out.fill(0);
        const read=mixInfo.audioBuf.readSamples(mixInfo.out);
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

  stopServer(){
    if(!this.running)return
    clearInterval(this.mixerInterval);
    for(const [ip,_] of this.mixerBuffer)
      this.removeClientFromMixer();
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
      this.broadcastPeerUpdate({peerIP},MsgType.PEER_REMOVED);
    }
  }

  remove(peerIP){
    if(!this.running) return;
    const peer=this.peers.get(peerIP);
    if(!peer)return;  //because only remove function can remove peer from peers map so if its not there means remove is already called
    this.messageHandler.removeConn(MsgType.TCP,this.selfIP,0,peer.ip,peer.port);
    this.messageHandler.removeConn(MsgType.TCP,this.selfIP,this.selfPort,peer.ip,peer.randomPort);
    console.log("remove for this is called",peerIP);
  
    this.peers.delete(peerIP);

    if(peer.senderConn){
      this.messageHandler.detachConnHandler(MsgType.TCP,0,peer.ip,peer.port,peer.senderConn);
      peer.senderConn=null;
    }
    if(peer.receiverConn){
      this.messageHandler.detachConnHandler(MsgType.TCP,this.selfPort,peer.ip,peer.randomPort,peer.receiverConn);
      peer.receiverConn=null;
    }
    this.vote.delete(peerIP);
    this.removeClientFromMixer(peerIP);
      // throw new Error("remove is called");

  }

  async startElection() {
    if(!this.running)return;
    console.log("🔹 Starting election process...");
    if(this.currentMasterIP===this.selfIP)
      this.stopServer();
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
      if(!this.running)return;


      let ip = 0;
      console.log(`🔹 Starting candidate selection. Initial candidate IP: ${ip}`);

      for (const [_, peer] of this.peers) {
        if (peer.status === PeerStatus.CONNECTED) {
          ip = ip > peer.ip ? ip : peer.ip;
        } else {
          console.log(`⚠️ Peer not connected: ${peer.ip}`);
        }
      }

      const candidate = this.peers.get(ip);
      if(!candidate)
        continue;

      const payload = new TextEncoder().encode(JSON.stringify({}));
      console.log(`🔹 Sending vote to candidate ${candidate.ip}:${candidate.port}`);

      this.messageHandler.sendMessage(0, candidate.ip, candidate.port, MsgType.CAST_VOTE, payload);

      console.log("⏳ Waiting 200ms for votes to be cast...");
      await new Promise((resolve) => setTimeout(resolve, 200));
      if(!this.running)return;
    }

    console.log("✅ Election complete! Master elected:", this.currentMasterIP, this.currentMasterPort);
  }

  
  onVote(srcIP, srcPort, dstIP, dstPort, type, payload){
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

    if((currentActive/2)<totalVote ){
        this.currentMasterIP=this.selfIP;
        this.currentMasterPort=this.selfPort;
        this.startMixer();
        this.onServerConnect();//this is client side function try to remove from here
        for(const ip of this.vote){
          const peer=this.peers.get(ip);
          this.connect(peer);
        }
    }

  }
  
  stop() {
    if(this.running!==true){
        this.running=false;
        return;
    }

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
      this.messageHandler.removeMessageHandler(MsgType.PEER_CONNECTED);
      this.messageHandler.removeMessageHandler(MsgType.PEER_REMOVED);
      this.messageHandler.removeMessageHandler(MsgType.ALL_PEERS);
      this.messageHandler.removeMessageHandler(MsgType.GET_ALL_PEERS);
    }

    if(this.masterTimeout) {
      clearTimeout(this.masterTimeout);
      console.log("master is removed");
    }

    if (this.encoder != null)
      this.encoder.stop();

    if (this.decoder != null)
      this.decoder.stop();

    for (const [ip, peer] of this.peers)
      this.remove(peer.ip);

    if (this.peers)
      this.peers.clear();
    if(this.vote)
      this.vote.clear();
    
    if(this.masterTimeout) 
      clearTimeout(this.masterTimeout);

    this.vote=null;
    this.messageHandler = null;
    this.speaker = null;
    this.micInterval=null;
    this.microphone = null;
    this.encoder = null;
    this.decoder = null;
    this.peers = null;
    this.mixerBuffer=null;
    this.masterTimeout=null;
    this.mixerInterval=null;
    this.mix=null;
    this.running=false;
  }


}
