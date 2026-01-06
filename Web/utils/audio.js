// audio.js (8 kHz mic + speaker using RingBuffer)
import { RingBuffer } from './RingBuffer.js';

export class Microphone {
  constructor(stream, bufferSize = 48000) {
    if (!stream) throw new Error("Microphone requires a MediaStream.");

    this.stream = stream;
    this.ringBuffer = new RingBuffer(bufferSize);

    this.audioCtx = new (window.AudioContext)({ sampleRate: 8000 });
    this.source = this.audioCtx.createMediaStreamSource(this.stream);

    this.processor = this.audioCtx.createScriptProcessor(512, 1, 1);
    this.source.connect(this.processor);
    this.processor.connect(this.audioCtx.destination);

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.ringBuffer.writeSamples(input);
    };
  }

  readSamples(outputBuffer) {
    return this.ringBuffer.readSamples(outputBuffer);
  }

  availableToRead(){
    return this.ringBuffer.availableToRead();
  }

  stop() {
    if (this.processor) this.processor.disconnect();
    if (this.source) this.source.disconnect();
    if (this.audioCtx) this.audioCtx.close();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
  }
}

export class Speaker {
  constructor(bufferSize = 48000) {
    this.ringBuffer = new RingBuffer(bufferSize);
    this.audioCtx = new (window.AudioContext)({ sampleRate: 8000 });
    this.processor = this.audioCtx.createScriptProcessor(512, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      const read = this.ringBuffer.readSamples(output);
      if (read < output.length){
        console.warn(`Speaker underflow: needed ${output.length}, got ${read}`);
        output.fill(0, read); // fill rest with silence
      }
    };
    this.processor.connect(this.audioCtx.destination);
  }

  writeSamples(samples) {
    return this.ringBuffer.writeSamples(samples);
  }

  stop() {
    if (this.processor) this.processor.disconnect();
    if (this.audioCtx) this.audioCtx.close();
    this.ringBuffer = null;
  }
}
