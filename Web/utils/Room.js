import { RingBuffer } from "./RingBuffer.js";
import { MsgType } from "@utils/MessageTypes";
import { Microphone, Speaker, OpusDecoder, OpusEncoder } from "@utils/audio";

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
    this.mixerBuffer=new Map();

    this.lastSeenMaster = 0;
    this.clientTimeout = null;
    this.clientTimeoutMs = 1000;

    this.electionTimer = null;
    this.masterTimer = null;

    this.vote=new Set();

    this.encoder=new OpusEncoder();
    this.decoder=new OpusDecoder();

    this.miceInterval=null;
    this.masterTimeout=null;
    this.mixerInterval=null;
   


  }

  async init(messageHandler, role, knownPeers = [], sampleRate = 8000,stream) {
    this.sampleRate = sampleRate;
    this.samplesPerInterval = Math.floor(
      (sampleRate * this.intervalMs) / 1000
    );

    this.messageHandler = messageHandler;

    this.selfIP = this.messageHandler.getDefaultIP();
    this.selfPort = this.messageHandler.getTCPPort();

    this.role = role;

     this.speaker=new Speaker();
    this.microphone=new Microphone(stream);

    for (const peer of knownPeers) {
      this.connect(peer);
      
    }

    if (this.role === Role.MASTER) {
      this.currentMasterIP = this.selfIP;
      this.currentMasterPort = this.selfPort;
      this.startMixer();
    }

    this.messageHandler.setOnMessageReceive(
      MsgType.CONNECT_REQUEST,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>
        this._onConnectRequest(srcIP, srcPort, dstIP, dstPort, type, payload)
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
      MsgType.CLINET_AUDIO,
      (srcIP, srcPort, dstIP, dstPort, type, payload) =>{
        if(this.currentMasterIP!==this.selfIP)
          return;

        this.mixerBuffer.get(srcIP)?.decoder.writeSamples(payload);
      }
    );

  }

  stop()
  {
       if(this.speaker!=null)
       this.speaker.stop();
       
     if(this.microphone!=null)
       this.microphone.stop();

      if(this.encoder!=null)
        this.encoder.stop();

      if(this.decoder!=null)
        this.decoder.stop();

      if(this.miceInterval)
        clearInterval(this.miceInterval);

      for(const [ip,peer] of this.peers)
        this.remove(peer);


  }

  refreshAudio(stream)
  {
    if(this.speaker!=null)
       this.speaker.stop();
       
    if(this.microphone!=null)
       this.microphone.stop();

    this.speaker=new Speaker();
    this.microphone=new Microphone(stream);
  }

  remove(peer){
    this.messageHandler.removeConn(MsgType.TCP,this.selfIP,this.selfPort,peer.ip,peer.port);
    this.peers.delete(peer.ip);
  }

  connect(peer) {
    const existing = this.peers.get(peer.ip);
    if (existing && existing.status === PeerStatus.CONNECTING) return;
    this.messageHandler.attachConnHandler(MsgType.TCP,0,peer.ip,peer.port,(msg)=>{
        const arr=msg.split('-');
        if(arr[1]==="failed"){
           this.remove(peer);
        }
    })

    this.peers.set(peer.ip, {
      ip: peer.ip,
      port: peer.port,
      role: peer.role ?? Role.FOLLOWER,
      name: peer.name ?? "",
      photo: peer.photo ?? "",
      status: PeerStatus.CONNECTING,
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

  onServerConnect()
  {
      if(this.currentMasterIP===null || this.currentMasterPort===null) return;
      
      if(this.miceInterval)
         clearInterval(this.miceInterval);
      const interval = 20;

      this.miceInterval= setInterval(() => {
      const available = this.microphone.availableToRead();
      if (available > 0) {
        const buffer = new Float32Array(available);
        const read = this.microphone.readSamples(buffer);

        if (read > 0) {
          this.encoder.writeSamples(buffer);
        }
      }
    }, interval);

    this.encoder.onData((packet)=>{
      this.messageHandler.sendMessage(
         0,
      this.currentMasterIP,
      this.currentMasterPort,
      MsgType.CLINET_AUDIO,
      packet
      )
    })

    this.decoder.onData((pcm48)=>{
      this.speaker.writeSamples(pcm48);
    })

  }

  _addClientToMixer(peer)
  {
      let mixInfo=this.mixerBuffer.get(peer.ip) || {};

      if(mixInfo?.encoder)
        mixInfo.encoder.stop();
      if(mixInfo?.decoder)
        mixInfo.decoder.stop();

      mixInfo.encoder=new OpusEncoder();
      mixInfo.decoder=new OpusDecoder();
      mixInfo.audioBuf=new RingBuffer(48000);
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

  

  

  _onConnectRequest(srcIP, srcPort, _dIP, _dPort, _type, payload) {
    const data = JSON.parse(new TextDecoder().decode(payload));

    let peer = {
        ip: srcIP,
        port: data.port,
        role: data.role ?? Role.FOLLOWER,
        name: data.name ?? "",
        photo: data.photo ?? "",
        status: PeerStatus.CONNECTED,
        
    };

    // send CONNECT_REQUEST back
    this.connect(peer);

    // mark as connected immediately
    // peer.status = PeerStatus.CONNECTED;
    this.peers.set(srcIP, peer);

    if(this.selfIP===this.currentMasterIP)
         this._addClientToMixer(peer)
       

    if (data.role === Role.MASTER) {
        this.currentMasterIP = srcIP;
        this.currentMasterPort = data.port;
        this.onServerConnect();
    }
    if (data.master) {
        this.updateMaster(data.master.ip, data.master.port);
    }

    this.messageHandler.clearPendingTCP(srcIP, srcPort, _dIP, _dPort);
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

  onMixAudioRecieve(payload)
  {
       this.decoder.writePacket(payload);
       if(this.masterTimeout) 
         clearTimeout(this.masterTimeout);
       this.masterTimeout=setTimeout(()=>{
        this.startElection();
       },100);
       
  }


  ///// Election Part

  async startElection()
  {
         

          this.currentMasterIP=null;
          this.currentMasterPort=null;
          this.vote.clear();
         while(this.currentMasterIP===null)
         {
           
            
            this.vote.clear();
            

            for (const [ip,peer] of this.peers) {
              this.connect(peer);
            }
            await new Promise((resolve,reject)=>{
              setTimeout(()=>{
                resolve();
              },200)
            })

            let ip=this.selfIP;

            for(const [_,peer] of this.peers)
            {
                if(peer.status==="CONNECTED")  
                  ip = ip > peer.ip ? ip : peer.ip;
            }

            const candidate=(ip===this.selfIP?{
                  ip: this.selfIP,
                  port: this.selfPort,
                  role: this.role,
                  name: this.name ?? "",
                  photo: this.photo ?? "",
        
            }:this.peers.get(ip));

            const payload= new TextEncoder().encode(
            JSON.stringify({
              
            })
          );

          this.messageHandler.sendMessage(0,candidate.ip,candidate.port,MsgType.CAST_VOTE,payload);    

          await new Promise((resolve,reject)=>{
              setTimeout(()=>{
                resolve();
              },200)
            })

      }



  }
  
  async onVote(srcIP, srcPort, dstIP, dstPort, type, payload)
  {
      
      if(this.currentMasterIP!=null)
      {
          let peer=this.peers.get(srcIP);
          this.connect(peer);
          return;
      }
      this.vote.add(srcIP);
      let currentActive=0;
      for(const [ip,peer] of this.peers)
      {
          if(peer.status==="CONNECTED")
          {
            currentActive++;
          }
      }

      let totalVote=this.vote.size;

      if((currentActive/2)<=totalVote && this.currentMasterIP===null)
      {
         this.currentMasterIP=this.selfIP;
         this.currentMasterPort=this.selfPort;
         this.startMixer();

         for(const ip of this.vote)
         {
            const peer=this.peers.get(ip);
            this.connect(peer);
         }

      }


  }

  startMixer()
  {
      if(this.mixerInterval)
        clearInterval(this.mixerInterval);

      this.mixerInterval=setInterval(()=>{
          const mix=new Float32Array(960),out=new Float32Array(960);
          for(const [ip,mixInfo] of this.mixerBuffer)
          {
              mix.fill(0);
              for(const [ip,innerMixInfo] of this.mixerBuffer)
              {
                  if(mixInfo===innerMixInfo) continue;
                  out.fill(0);
                  innerMixInfo.audioBuf.readSamples(out);
                  mix.forEach((v, i) => mix[i] = v + out[i]);
              }

              mixInfo.encoder.writeSamples(mix);

          }

      },20)
  }

}
