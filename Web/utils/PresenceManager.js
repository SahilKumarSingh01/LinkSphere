import axios from "axios";
import { MsgType } from "@utils/MessageTypes";
import { AuthManager } from "./AuthManager.js";
import pako from "pako";


export class PresenceManager {
  constructor(messageHandler) {
    this.messageHandler = messageHandler;

    /* ---------------- CONFIG ---------------- */
 
    this.projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    this.apiKey    = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    /* ---------------- PRESENCE STATE ---------------- */
    this.discoveryPort = -1;
    this.organisationName =  null;
    this.privateIP = this.messageHandler.getDefaultIP();
    this.localUsers= new Map();
    this.accUpdates=[];// it will be json nothing else
    this.messageHandler.setOnMessageReceive(MsgType.DISCOVERY,this.onDiscoveryMessage.bind(this));
    this.periodUpdateTimer=null;
    this.onUserUpdate=null;
    this.activated=false;
    this.removeInactiveTimer = null;

  }
  
  async activate(){
    if(this.activated)
        return;
    await this.pushMyPresence();
    await this.fetchAllUsers();
    this.periodUpdateTimer= setInterval(this.sendPeriodicUpdate.bind(this), 10*1000);
    this.removeInactiveTimer = setInterval(this.removeInactive.bind(this), 60 * 1000); // run every 1 minute

  }
  
  removeInactive(){
    const now = Date.now();
    let removed = false;

    for (const [ip, user] of this.localUsers) {
        if (now - user.lastSeen > 60 * 1000) { // 1 minute inactivity
            this.localUsers.delete(ip);
            removed = true;
        }
    }

    if (removed && this.onUserUpdate) {
        setTimeout(() => this.onUserUpdate([...this.localUsers.values()]), 0);
    }
  }
  
  setOrganisation(name) { this.organisationName = name; }

  getOrganisation() { return this.organisationName; }

  setOnUserUpdate(cb){this.onUserUpdate=cb;}

  async _initUDPConnection() {
    if (!this.messageHandler ) throw new Error("messageHandler is not defined");

    let port = this.messageHandler.getTCPPort();
    let success = false;

    while (!success) {
      try {
        const result = await this.messageHandler.createConn(
          MsgType.DISCOVERY,
          this.messageHandler.iptoi([127, 0, 0, 1]),
          port,
          this.messageHandler.iptoi([0, 0, 0, 0]),
          port
        );

        if (result === 1) {
          success = true;
          console.log(`[UDP] Connection established:127.0.0.1:${port} → 0.0.0.0:${port}`);
        } else port++;
      } catch {
        port++;
      }
    }

    this.discoveryPort = port;
  }
  getDefaultPresence(){
    const DEFAULT_PRESENCE = {
      tcpPort: this.messageHandler.getTCPPort(),
      privateIP: this.privateIP,
      discoveryPort: this.discoveryPort,
      lastSeen: Date.now()
    };
    return DEFAULT_PRESENCE;
  }

  /* ---------------- FIREBASE PRESENCE ---------------- */
  async updateMyPresence(myInfoUpdate = {}) {
    let stored = localStorage.getItem("myPresence");
    let data = stored ? JSON.parse(stored) : null;
    
    data = {...this.getDefaultPresence(),userInfo:{...data?.userInfo,...myInfoUpdate} };
    localStorage.setItem("myPresence", JSON.stringify(data));
    this.localUsers.set(data.privateIP,data);
    if(this.onUserUpdate)
      setTimeout(this.onUserUpdate([...this.localUsers.values()]),0);
  }

  async pushMyPresence(){
    if(this.discoveryPort==-1)
      await this._initUDPConnection();
    let stored = localStorage.getItem("myPresence");
    let data = stored ? JSON.parse(stored) : null;

    data = {...this.getDefaultPresence(),userInfo:{...data?.userInfo} };
    localStorage.setItem("myPresence", JSON.stringify(data));

        // Send entire object as string to Firestore
    const cred=await AuthManager.getAuthCred(
      this.organisationName,
      this.privateIP
    );

    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}` +
      `/lastSeen/${cred.username}`;

    return axios.patch(
      url,
      {
        fields: {
          presence: { stringValue: JSON.stringify(data) },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${cred.idToken}`,
          "Content-Type": "application/json",
        },
      }
    );


  }
  
  getMyPresence() {
    let stored = localStorage.getItem("myPresence");
    let data = stored ? JSON.parse(stored) : null;
    return data;

  }

  async fetchAllUsers() {
    const cred=await AuthManager.getAuthCred(
      this.organisationName,
      this.privateIP
    );

    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}/lastSeen`;

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${cred.idToken}` },
    });
    // Each document has a `fields.presence.stringValue`
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    for (const doc of res.data.documents || []) {
      if (!doc.updateTime) continue;
      if (Date.parse(doc.updateTime) < cutoff) continue;

      const raw = doc.fields?.presence?.stringValue;
      if (!raw) continue;

      try {
        const presence = JSON.parse(raw);
        const key = presence?.privateIP;
        if (!key) continue;
        this.localUsers.set(key, presence);
      } catch {
        // skip invalid json
      }
    }
    if(this.onUserUpdate)
      setTimeout(this.onUserUpdate([...this.localUsers.values()]),0);
    return [...this.localUsers.values()];

  }


  /* ---------------- NETWORK / GOSSIP ---------------- */
  async sendPeriodicUpdate() {
    // if (!this.MyDiscCred?.username) return;
  
    const now = Date.now();
    const myUpdate = await this.getMyPresence();
    if(!myUpdate)return;
    myUpdate.lastSeen=now;

    this.localUsers.set(this.privateIP, myUpdate);
    this.accUpdates.push(myUpdate);

    const peers = [...this.localUsers.keys()];//.filter(ip => ip !== this.privateIP); //remove this comment 
    const targets = this.pickRandom(peers, 3);

    // const payload = JSON.stringify(this.accUpdates);
    const jsonStr = JSON.stringify(this.accUpdates);
    const payload = pako.deflate(jsonStr); // ✅ Uint8Array
    // console.log("here you see reduction ",jsonStr,jsonStr.length,payload.length);

    targets.forEach(t => {
      this.messageHandler.sendMessage(
        this.discoveryPort,
        t,
        this.localUsers.get(t).discoveryPort,
        MsgType.DISCOVERY,
        payload,
      );
    });
    // console.log("send period updates is called ",this.accUpdates,targets);
    this.accUpdates=[];
  }


  onDiscoveryMessage(srcIP,srcPort,dstIP,dstPort,type, payload) {
    // const decoded = new TextDecoder().decode(payload);
    // const updates = JSON.parse(decoded);
    const decompressedStr = pako.inflate(payload, { to: "string" });
    const updates = JSON.parse(decompressedStr);

    console.log("update received",updates);

    updates.forEach(u => {
      const existing = this.localUsers.get(u.privateIP);
      if (!existing || u.lastSeen > existing.lastSeen) {
        this.localUsers.set(u.privateIP, {...existing,...u});
        this.accUpdates.push(u);
      }
      
    });
    if(this.onUserUpdate)
      setTimeout(this.onUserUpdate([...this.localUsers.values()]),0);
  }

  /* ---------------- HELPERS ---------------- */
  pickRandom(arr, n) {
    const copy = [...arr];
    const out = [];
    while (out.length < n && copy.length) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  }

}
