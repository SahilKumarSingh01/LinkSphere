export class Mutex {
  constructor() {
    this.locked = false;
    this.waiters = [];
  }

  lock() {
    console.log("lock acquired");
    return new Promise(resolve => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.waiters.push(resolve);
      }
    });
  }

  unlock() {
    console.log("lock release");
    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      next();
    } else {
      this.locked = false;
    }
  }
}
