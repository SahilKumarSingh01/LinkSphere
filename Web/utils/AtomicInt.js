import { Mutex } from "@utils/Mutex.js"; 

export class AtomicInt {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.mutex = new Mutex();
  }

  async update(delta) {
    await this.mutex.lock();
    try {
      this.value += delta;
      return this.value;
    } finally {
      this.mutex.unlock();
    }
  }

  get() {
    return this.value;
  }
}
