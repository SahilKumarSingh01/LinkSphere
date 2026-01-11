// audio.js (8 kHz mic + speaker using RingBuffer)
import { RingBuffer } from './RingBuffer.js';

export class Microphone {
  constructor(stream, bufferSize = 96000) {
    if (!stream) throw new Error("Microphone requires a MediaStream.");

    this.stream = stream;
    this.ringBuffer = new RingBuffer(bufferSize);

    this.audioCtx = new (window.AudioContext)({ sampleRate: 48000 });
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
  constructor(bufferSize = 96000) {
    this.ringBuffer = new RingBuffer(bufferSize);
    this.audioCtx = new (window.AudioContext)({ sampleRate: 48000 });
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

export class OpusEncoder {
  constructor() {
    this.encoder = new AudioEncoder({
      output: (chunk) => {
        const p = new Uint8Array(chunk.byteLength);
        chunk.copyTo(p);

        const b = new ArrayBuffer(13 + p.length);
        const v = new DataView(b);
        v.setUint8(0, chunk.type === "key" ? 0 : 1);
        v.setBigUint64(1, BigInt(chunk.timestamp));
        v.setUint32(9, chunk.duration || 0);
        new Uint8Array(b, 13).set(p);

        this.onDataCb?.(new Uint8Array(b));
      },
      error: console.error
    });

    this.encoder.configure({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrateMode: "variable",
      opus: {
        application: "voip",
        signal: "voice",
        complexity: 5,
        frameDuration: 20_000,
      }
    });
  }

  writeSamples(f32) {
    const audioData = new AudioData({
      format: "f32",
      sampleRate: 48000,
      numberOfFrames: f32.length,
      numberOfChannels: 1,
      timestamp: performance.now() * 1000,
      data: f32,
    });
    this.encoder.encode(audioData);
  }

  onData(cb) {
    this.onDataCb = cb;
  }

  async stop() {
    if (!this.encoder) return;
    await this.encoder.flush();   // encode remaining frames
    this.encoder.close();         // release codec
    this.encoder = null;
    this.onDataCb = null;
  }
}

export class OpusDecoder {
  constructor() {
    this.decoder = new AudioDecoder({
      output: (audioData) => {
        const pcm = new Float32Array(audioData.numberOfFrames);
        audioData.copyTo(pcm, { planeIndex: 0 });
        this.onPcmCb?.(pcm);
      },
      error: console.error
    });

    this.decoder.configure({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 1,
    });
  }

  writePacket(uint8) {
    const v = new DataView(uint8.buffer);
    const chunk = new EncodedAudioChunk({
      type: v.getUint8(0) ? "delta" : "key",
      timestamp: Number(v.getBigUint64(1)),
      duration: v.getUint32(9),
      data: uint8.slice(13)
    });
    this.decoder.decode(chunk);
  }

  onData(cb) {
    this.onPcmCb = cb;
  }

  async stop() {
    if (!this.decoder) return;
    await this.decoder.flush();   // drain decoded audio
    this.decoder.close();         // release codec
    this.decoder = null;
    this.onPcmCb = null;
  }
}
