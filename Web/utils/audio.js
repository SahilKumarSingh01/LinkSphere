// audio.js (8 kHz mic + speaker using RingBuffer)
import { RingBuffer } from './RingBuffer.js';

export class Microphone {
  constructor(stream, bufferSize = 960*10) {
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
  constructor(bufferSize = 960*10) {
    this.ringBuffer = new RingBuffer(bufferSize);
    this.audioCtx = new (window.AudioContext)({ sampleRate: 48000 });
    this.processor = this.audioCtx.createScriptProcessor(512, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      const read = this.ringBuffer.readSamples(output);

      if (read < output.length){
        // console.warn(`Speaker underflow: needed ${output.length}, got ${read}`);
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
  }
}

export class OpusEncoder {
    constructor() {
      this.HEADER_SIZE = 13;
      this.MAX_PAYLOAD = 4096;

      // One-time allocations
      this.buffer = new ArrayBuffer(this.HEADER_SIZE + this.MAX_PAYLOAD);
      this.view = new DataView(this.buffer);
      this.bytes = new Uint8Array(this.buffer);

      this.encoder = new AudioEncoder({
        output: (chunk) => {
          const payloadLen = chunk.byteLength;
          if (payloadLen > this.MAX_PAYLOAD) return;

          this.view.setUint8(0, chunk.type === "key" ? 0 : 1);
          this.view.setBigUint64(1, BigInt(chunk.timestamp));
          this.view.setUint32(9, chunk.duration || 0);

          chunk.copyTo(this.bytes.subarray(this.HEADER_SIZE));

          this.onDataCb?.(
            this.bytes.subarray(0, this.HEADER_SIZE + payloadLen)
          );
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

  stop() {
    if (!this.encoder) return;
    this.encoder.close();         // release codec
    this.encoder = null;
    this.onDataCb = null;
  }
}

export class OpusDecoder {
  constructor() {
    this.buffer=new Float32Array(960);
    this.decoder = new AudioDecoder({
      output: (audioData) => {
        audioData.copyTo(this.buffer, { planeIndex: 0 });
        this.onPcmCb?.(this.buffer);
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
    const v = new DataView(
    uint8.buffer,
    uint8.byteOffset,
    uint8.byteLength
  );;
    const chunk = new EncodedAudioChunk({
      type: v.getUint8(0) ? "delta" : "key",
      timestamp: performance.now() * 1000,//Number(v.getBigUint64(1)),
      duration: v.getUint32(9),
      data: uint8.slice(13)
    });
    this.decoder.decode(chunk);
  }

  onData(cb) {
    this.onPcmCb = cb;
  }

  stop() {
    if (!this.decoder) return;
    this.decoder.close();         // release codec
    this.decoder = null;
    this.onPcmCb = null;
  }
}
