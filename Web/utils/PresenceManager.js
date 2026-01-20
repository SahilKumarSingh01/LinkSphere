import axios from "axios";
import { MsgType } from "@utils/MessageTypes";

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
    this.periodUpdateTimer= setInterval(this.sendPeriodicUpdate.bind(this), 10*1000);
    // this._init({displayName:"hello how are you"});
    // console.log("its constructor is called",this.messageHandler.getAllIPs());
  }
  
  getLocalUsers(){return this.localUsers;}

  setOrganisation(name) { this.organisationName = name; }

  getOrganisation() { return this.organisationName; }

  // getIP() { return this.privateIP; }

  // setIP = (index) => {
  //   const ip = this.messageHandler.getAllIPs()?.[index]?.ip;
  //   return ip ? (this.privateIP === ip ? true : (this.privateIP = ip, this.updateMyPresence(), true)) : false;
  // };


  async _initUDPConnection() {
    if (!this.organisationName) throw new Error("organisationName is not defined");

    if (!this.messageHandler ) return;

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


  /* ---------------- FIREBASE PRESENCE ---------------- */
  async updateMyPresence(myInfoUpdate = {}) {
    if(this.discoveryPort==-1)
      await this._initUDPConnection();
    const now = Date.now();

    const DEFAULT_PRESENCE = {
      tcpPort: this.messageHandler.getTCPPort(),
      privateIP: this.privateIP,
      discoveryPort: this.discoveryPort,
      lastSeen: now
    };

    let stored = localStorage.getItem("myPresence");
    let data = stored ? JSON.parse(stored) : null;

    if (!data || !data.MyDiscCred?.idToken) {
      const renewed = await this.renewToken({presence:JSON.stringify({...DEFAULT_PRESENCE,userInfo:myInfoUpdate})});;

      data = {
        MyDiscCred: {
          idToken: renewed.idToken,
          refreshToken: renewed.refreshToken,
          expiresIn: renewed.expiresIn,
          customToken: renewed.customToken,
          username: renewed.username
        },
        
      };
    }

    // Refresh token if expired
    if (Date.now() >= data.MyDiscCred.expiresIn) {
      const refreshed = await this.refreshToken();
      data.MyDiscCred.idToken = refreshed.idToken;
      data.MyDiscCred.refreshToken = refreshed.refreshToken;
      data.MyDiscCred.expiresIn = refreshed.expiresIn;
    }

    // Merge any incoming updates into MyDiscInfo
    data.MyDiscInfo = { ...data.MyDiscInfo,...DEFAULT_PRESENCE,userInfo:{...data.MyDiscInfo?.userInfo,...myInfoUpdate} };
    data.MyDiscInfo.lastSeen = now;

    localStorage.setItem("myPresence", JSON.stringify(data));
    // Send entire object as string to Firestore
    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}` +
      `/lastSeen/${data.MyDiscCred.username}`;

    return axios.patch(
      url,
      {
        fields: {
          presence: { stringValue: JSON.stringify(data.MyDiscInfo) },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${data.MyDiscCred.idToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  }
  async getMyPresence() {
    // 1️⃣ Try localStorage first
    let stored = localStorage.getItem("myPresence");
    let data = stored ? JSON.parse(stored) : null;

    if (data?.MyDiscInfo) {
      return data.MyDiscInfo;
    }

    // 2️⃣ If no local presence, fetch from Firestore
    if (!data?.MyDiscCred?.idToken || !data?.MyDiscCred?.username) {
      return null;
    }

    // Refresh token if expired
    if (Date.now() >= data.MyDiscCred.expiresIn) {
      const refreshed = await this.refreshToken();
      data.MyDiscCred.idToken = refreshed.idToken;
      data.MyDiscCred.refreshToken = refreshed.refreshToken;
      data.MyDiscCred.expiresIn = refreshed.expiresIn;
      localStorage.setItem("myPresence", JSON.stringify(data));
    }

    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}` +
      `/lastSeen/${data.MyDiscCred.username}`;

    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${data.MyDiscCred.idToken}`,
        },
      });

      const raw = res.data?.fields?.presence?.stringValue;
      if (!raw) return null;

      const presence = JSON.parse(raw);

      // 3️⃣ Cache it back to localStorage
      data.MyDiscInfo = presence;
      localStorage.setItem("myPresence", JSON.stringify(data));

      return presence;
    } catch (err) {
      console.error("Failed to fetch my presence:", err);
      return null;
    }
  }



  async renewToken(userInfo = {}) {
    const resCustom = await axios.post("/api/token", {
      organisationName: this.organisationName,
      privateIP: this.privateIP,
      userInfo,
    });

    const customToken = resCustom.data.token;
    const userId = resCustom.data.userId;
    const username = userId; // simple identity for now

    const resExchange = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${this.apiKey}`,
      {
        token: customToken,
        returnSecureToken: true,
      }
    );

    const idToken = resExchange.data.idToken;
    const refreshToken = resExchange.data.refreshToken;
    const expiresInSec = Number(resExchange.data.expiresIn) || 3600; // fallback 1h
    const expiresIn = Date.now() + expiresInSec * 1000 - 2 * 60 * 1000; // minus 2 min

    return { userId, username, customToken, idToken, refreshToken, expiresIn };
  }


  async refreshToken() {
    let stored = localStorage.getItem("myPresence");
    let data = stored ? JSON.parse(stored) : null;

    if (!data?.MyDiscCred?.refreshToken) return;

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", data.MyDiscCred.refreshToken);

    const res = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const expiresInSec = Number(res.data.expiresIn) || 3600;
    const expiresIn = Date.now() + expiresInSec * 1000 - 2 * 60 * 1000;

    return {
      idToken: res.data.idToken,
      refreshToken: res.data.refreshToken,
      expiresIn
    };
  }


  async fetchAllUsers() {
    let stored = localStorage.getItem("myPresence");
    let data = stored ? JSON.parse(stored) : null;

    if (!data?.MyDiscCred?.idToken) return;

    // Refresh token if expired
    if (Date.now() >= data.MyDiscCred.expiresIn) {
      const refreshed = await this.refreshToken();
      data.MyDiscCred.idToken = refreshed.idToken;
      data.MyDiscCred.refreshToken = refreshed.refreshToken;
      data.MyDiscCred.expiresIn = refreshed.expiresIn;
      localStorage.setItem("myPresence", JSON.stringify(data));
    }

    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}/lastSeen`;

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${data.MyDiscCred.idToken}` },
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
    return [...this.localUsers.values()];

  }


  /* ---------------- NETWORK / GOSSIP ---------------- */
  sendPeriodicUpdate() {
    // if (!this.MyDiscCred?.username) return;
  
    const now = Date.now();
    const myUpdate = this.localUsers.get(this.privateIP);
    if(!myUpdate)return;
    myUpdate.lastSeen=now;

    this.localUsers.set(this.privateIP, myUpdate);
    this.accUpdates.push(myUpdate);

    const peers = [...this.localUsers.keys()];//.filter(ip => ip !== this.privateIP); //remove this comment 
    const targets = this.pickRandom(peers, 3);

    const payload = JSON.stringify(this.accUpdates);

    targets.forEach(t => {
      this.messageHandler.sendMessage(
        this.discoveryPort,
        this.ipToInt(t),
        this.localUsers.get(t).discoveryPort,
        MsgType.DISCOVERY,
        payload,
      );
    });
    console.log("send period updates is called ",this.accUpdates,targets);
    this.accUpdates=[];
  }


  onDiscoveryMessage(srcIP,srcPort,dstIP,dstPort,type, payload) {

    if(type!=MsgType.DISCOVERY)
      throw "Wrong type of message receive in discovery";
    const decoded = new TextDecoder().decode(payload);
    const updates = JSON.parse(decoded);
    const now = Date.now();
    console.log("update received",updates);

    updates.forEach(u => {
      const existing = this.localUsers.get(u.privateIP);
      if (!existing || u.lastSeen > existing.lastSeen) {
        this.localUsers.set(u.privateIP, {...existing,...u});
        this.accUpdates.push(u);
      }
      
    });

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

  ipToInt(ip) {
    return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
  }
}
