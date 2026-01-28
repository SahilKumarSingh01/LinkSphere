import { MsgType } from "@utils/MessageTypes";
import { OpusDecoder, OpusEncoder } from "@utils/audio";
import { RoomServer } from "./RoomServer.js";
import { RoomClient } from "./RoomClient.js";

export const PeerStatus = Object.freeze({
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected"
});

export class Room {
  constructor() {
    console.log("log room is created ");
    this.messageHandler=null;

    this.selfIP=null;
    this.selfPort=null;
    this.name="";
    this.photo="";
    this.roomId=null;

    this.currentMasterIP=null;
    this.currentMasterPort=null;

    this.peers=new Map();
    this.vote=new Set();

    this.client=new RoomClient(); // RoomClient
    this.server=new RoomServer(); // RoomServer

    this.running=null;
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
    
    this.client.init(messageHandler,stream);
    this.client.setOnServerDisconnect(this.startElection.bind(this));
    this.server.init(messageHandler,this.broadcastPeerUpdate.bind(this));

    this.messageHandler.setOnMessageReceive(MsgType.CONNECT_REQUEST,this._onConnect.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.CONNECT_REPLY,this._onConnect.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.CAST_VOTE,this.onVote.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.PEER_CONNECTED,this.onPeerUpdate.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.PEER_REMOVED,this.onPeerUpdate.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.ALL_PEERS,this.onAllPeersReceive.bind(this));
    this.messageHandler.setOnMessageReceive(MsgType.GET_ALL_PEERS,this.onAllPeersRequest.bind(this));

    this.running=true;
  }
  
  onAllPeersReceive(srcIP, srcPort, _dIP, _dPort, _type, payload) {
    if(!this.running ||srcIP!==this.currentMasterIP)return;
    const data = JSON.parse(new TextDecoder().decode(payload));
    data.forEach(peer =>this.addClient(peer));
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
      // console.log("we are removing from here");
      this.remove(data.ip);
    }
  }

  getPeers(){
    if(!this.running)return [];
    return [...this.peers.values()];
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

  getSelfInfo(){
    return {
        ip: this.selfIP,
        port: this.selfPort,
        name: this.name ?? "",
        photo: this.photo ?? "",
        roomId: this.roomId??null,
        master: { ip: this.currentMasterIP, port: this.currentMasterPort }
      }
  }

  async connect({ ip, port, name, photo }) {
    if(!this.running||!ip ||!port)return;

    const existing = this.peers.get(ip);
    if (existing && existing.status === PeerStatus.CONNECTING) return;
    // console.log("connect is called for",{ ip, port, name, photo });
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

    const payload = new TextEncoder().encode(JSON.stringify(this.getSelfInfo()));

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
        this.server.stopServer();
      if(srcIP===data.master.ip){
        this.currentMasterIP = srcIP;
        this.currentMasterPort = data.port;
        this.client.onServerConnect(this.currentMasterIP,this.currentMasterPort);
      }else{
        this.currentMasterIP = null;
        this.currentMasterPort = null;
        this.connect({ip:data.master.ip,port:data.master.port});
      }
    }
    
    if(_type==MsgType.CONNECT_REQUEST){
        const payload = new TextEncoder().encode(JSON.stringify(this.getSelfInfo()));
        this.messageHandler.sendMessage(0,peer.ip,peer.port,MsgType.CONNECT_REPLY,payload);
      }

    if(this.selfIP===this.currentMasterIP)
        this.server.addClientToMixer(peer);

    this.messageHandler.clearPendingTCP(srcIP, srcPort, _dIP, _dPort);
  }
    
  unmute(){this.client.unmute();}

  mute(){this.client.mute();}

  refreshAudio(stream){return this.client.refreshAudio(stream);}

  async broadcastPeerUpdate(update,type){
    if(!this.running||this.currentMasterIP!==this.selfIP)return;
    const payload=new TextEncoder().encode(JSON.stringify(update));
    for (const [_, peer] of this.peers) {
      if (peer.status === PeerStatus.CONNECTED) {
        await this.messageHandler.sendMessage(0,peer.ip,peer.port,type,payload);
      }
    }
  }

  remove(peerIP){
    if(!this.running) return;
    const peer=this.peers.get(peerIP);
    if(!peer)return;  //because only remove function can remove peer from peers map so if its not there means remove is already called
    this.messageHandler.removeConn(MsgType.TCP,this.selfIP,0,peer.ip,peer.port);
    this.messageHandler.removeConn(MsgType.TCP,this.selfIP,this.selfPort,peer.ip,peer.randomPort);

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
    this.server.removeClientFromMixer(peerIP);
  }

  async startElection() {
    if(!this.running)return;
    if(this.currentMasterIP===this.selfIP)
      this.server.stopServer();
    this.currentMasterIP = null;
    this.currentMasterPort = null;

    while (this.running&&this.currentMasterIP === null) {
      this.vote.clear();
      this.connect({ip: this.selfIP,port: this.selfPort,name: this.name ?? "",photo: this.photo ?? ""});

      for (const [ip, peer] of this.peers)
        this.connect(peer);

      await new Promise((resolve) => setTimeout(resolve, 200));
      if(!(this.running&&this.currentMasterIP === null))break;

      let ip = 0;

      for (const [_, peer] of this.peers) {
        if (peer.status === PeerStatus.CONNECTED) {
          ip = ip > peer.ip ? ip : peer.ip;
        } else {
          // console.log(`⚠️ Peer not connected: ${peer.ip}`);
        }
      }

      const candidate = this.peers.get(ip);
      if(!candidate)
        continue;

      const payload = new TextEncoder().encode(JSON.stringify({}));

      this.messageHandler.sendMessage(0, candidate.ip, candidate.port, MsgType.CAST_VOTE, payload);

      await new Promise((resolve) => setTimeout(resolve, 200));
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
        this.server.startMixer();
        this.client.onServerConnect(this.currentMasterIP,this.currentMasterPort);//this is client side function try to remove from here
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
    this.currentMasterIP=null;  //so that we no longer perform server function
    this.currentMasterPort=null;//so that we no longer perform server function
    
    this.client.stop();
    this.server.stop();

    if (this.messageHandler) {
      this.messageHandler.removeMessageHandler(MsgType.CONNECT_REQUEST);
      this.messageHandler.removeMessageHandler(MsgType.CONNECT_REPLY);
      this.messageHandler.removeMessageHandler(MsgType.CAST_VOTE);
      this.messageHandler.removeMessageHandler(MsgType.PEER_CONNECTED);
      this.messageHandler.removeMessageHandler(MsgType.PEER_REMOVED);
      this.messageHandler.removeMessageHandler(MsgType.ALL_PEERS);
      this.messageHandler.removeMessageHandler(MsgType.GET_ALL_PEERS);
    }
  
    for (const [ip, peer] of this.peers)
      this.remove(peer.ip);

    if (this.peers)
      this.peers.clear();

    if(this.vote)
      this.vote.clear();

    this.vote=null;
    this.messageHandler = null;
    this.peers = null;
    this.running=false;
  }
}
