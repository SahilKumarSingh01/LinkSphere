export class PresenceManager {
  constructor(messageHandler) {
    this.messageHandler = messageHandler;

    this.localStatus = new Map();      // key = "ip:port"
    this.updateReceived = new Map();   // changes to forward
    this.myIpPort = "";                 // e.g. "127.0.0.1:5173"
    this.username = "";                 // unique id from cookie/SSC

    this.cookies = null;
  }

  /** Fetch cookie data and initialize localStatus */
  async initFromCookies() {
    this.cookies = await this.fetchCookies();

    this.cookies.orgUsers.forEach(user => {
      const key = `${user.ip}:${user.port}`;
      this.localStatus.set(key, { ...user, lastSeen: -1 });
      this.updateReceived.set(key, { ...user, lastSeen: -1 });
    });

    this.username = this.cookies.myId;
    this.myIpPort = this.getOwnIpPort();
  }

  /** Send presence updates to 3 random online users */
  sendPeriodicUpdate() {
    const online = Array.from(this.localStatus.values()).filter(u => u.lastSeen !== -1);
    const targets = this.pickRandom(online, 3);

    // include own update
    const myUpdate = this.localStatus.get(this.myIpPort);
    this.updateReceived.set(this.myIpPort, myUpdate);

    const payload = JSON.stringify(Array.from(this.updateReceived.values()));

    targets.forEach(target => {
      this.messageHandler.sendMessage({
        src: this.myIp(),
        srcPort: this.myPort(),
        dst: this.parseIp(target.ip),
        dstPort: target.port,
        type: 0x51, // JSON type
        payload,
      });
    });

    this.updateReceived.clear();
  }

  /** Handle incoming network updates */
  handleNetworkUpdate(jsonData) {
    const updates = JSON.parse(jsonData);

    updates.forEach(u => {
      const key = `${u.ip}:${u.port}`;
      const existing = this.localStatus.get(key);

      if (existing) {
        existing.lastSeen = u.lastSeen;
        existing.username = u.username;
        Object.assign(existing, u);
      } else {
        this.localStatus.set(key, { ...u });
      }

      this.updateReceived.set(key, { ...u });
    });
  }

  /** Helpers */
  async fetchCookies() {
    return {
      orgUsers: [
        { ip: "127.0.0.1", port: 5173, lastSeen: 0, username: "userA" },
        { ip: "127.0.0.2", port: 5173, lastSeen: 0, username: "userB" },
      ],
      myId: "me123",
    };
  }

  pickRandom(arr, n) {
    const copy = [...arr];
    const result = [];
    while (result.length < n && copy.length > 0) {
      const idx = Math.floor(Math.random() * copy.length);
      result.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return result;
  }

  myIp() {
    return this.myIpPort.split(":")[0].split(".").map(Number);
  }

  myPort() {
    return Number(this.myIpPort.split(":")[1]);
  }

  parseIp(ip) {
    return ip.split(".").map(Number);
  }

  getOwnIpPort() {
    return this.cookies?.orgUsers[0]
      ? `${this.cookies.orgUsers[0].ip}:${this.cookies.orgUsers[0].port}`
      : "127.0.0.1:5173";
  }
}
