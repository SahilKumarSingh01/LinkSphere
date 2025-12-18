export class RingBuffer {
  constructor(size) {
    this.buffer = new Float32Array(size)
    this.size = size
    this.writeIndex = 0
    this.readIndex = 0
  }

  // Write function — only touches writeIndex
  writeSamples(samplesIn) {
    for (let s of samplesIn) {
      const nextWrite = (this.writeIndex + 1) % this.size

      // Drop if buffer is full
      if (nextWrite === this.readIndex) break

      this.buffer[this.writeIndex] = s
      this.writeIndex = nextWrite
    }
  }

  // Read function — only touches readIndex
  readSamples(sampleOut) {
    const available = (this.writeIndex - this.readIndex + this.size) % this.size
    const toRead = Math.min(sampleOut.length, available)

    for (let i = 0; i < toRead; i++) {
      sampleOut[i] = this.buffer[this.readIndex]
      this.readIndex = (this.readIndex + 1) % this.size
    }

    return toRead
  }
  availableToRead(){
    return (this.writeIndex - this.readIndex + this.size) % this.size;
  }
  availableToWrite(){
    return (this.size-1-this.availableToRead());
  }
}
