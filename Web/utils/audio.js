// audio.js (8 kHz mic + speaker using RingBuffer)
import { RingBuffer } from './RingBuffer.js';
export class Microphone {
  constructor(stream, bufferSize = 96000) {
    if (!stream) throw new Error("Microphone requires a MediaStream.");

    this.stream = stream;
    this.ringBuffer = new RingBuffer(bufferSize);
    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    this.source = this.audioCtx.createMediaStreamSource(this.stream);

    const microphoneWorklet = `
      class MicrophoneProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0];
          if (input && input[0]) {
            this.port.postMessage(input[0]);
          }
          return true;
        }
      }
      registerProcessor("microphone-processor", MicrophoneProcessor);
    `;

    const blob = new Blob([microphoneWorklet], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);

    this.ready = this.audioCtx.audioWorklet
      .addModule(url)
      .then(() => {
        this.worklet = new AudioWorkletNode(this.audioCtx, "microphone-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1
        });

        this.worklet.port.onmessage = (e) => {
          this.ringBuffer.writeSamples(e.data);
        };

        this.source.connect(this.worklet);
      });
  }

  readSamples(outputBuffer) {
    return this.ringBuffer.readSamples(outputBuffer);
  }

  availableToRead() {
    return this.ringBuffer.availableToRead();
  }

  stop() {
    if (this.source) this.source.disconnect();
    if (this.worklet) this.worklet.disconnect();
    if (this.audioCtx) this.audioCtx.close();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
  }
}

export class Speaker {
  constructor(bufferSize = 96000) {
    this.ringBuffer = new RingBuffer(bufferSize);
    this.audioCtx = new AudioContext({ sampleRate: 48000 });

    const speakerWorklet = `
      class SpeakerProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = [];
          this.port.onmessage = (e) => this.buffer.push(...e.data);
        }

        process(_, outputs) {
          const output = outputs[0][0];
          let i = 0;
          while (i < output.length && this.buffer.length > 0) {
            output[i++] = this.buffer.shift();
          }
          if (i < output.length) output.fill(0, i);
          return true;
        }
      }
      registerProcessor("speaker-processor", SpeakerProcessor);
    `;

    const blob = new Blob([speakerWorklet], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);

    this.ready = this.audioCtx.audioWorklet
      .addModule(url)
      .then(() => {
        this.worklet = new AudioWorkletNode(this.audioCtx, "speaker-processor", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          channelCount: 1
        });
        this.worklet.connect(this.audioCtx.destination);
      });
  }

  writeSamples(samples) {
    const written = this.ringBuffer.writeSamples(samples);
    const temp = new Float32Array(samples.length);
    this.ringBuffer.readSamples(temp);
    if (this.worklet) this.worklet.port.postMessage(temp);
    return written;
  }

  stop() {
    if (this.worklet) this.worklet.disconnect();
    if (this.audioCtx) this.audioCtx.close();
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
    const v = new DataView(
    uint8.buffer,
    uint8.byteOffset,
    uint8.byteLength
  );;
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
