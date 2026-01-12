'use client'
import { useState, useRef, useEffect } from "react";
import { Microphone, Speaker, OpusDecoder, OpusEncoder } from "@utils/audio";
import { RingBuffer } from "@utils/RingBuffer";
import WaveformVisualizer from "@components/WaveformVisualizer";

const out = new Float32Array(512);

const Home = () => {
  const [started, setStarted] = useState(false);
  const chunkRef = useRef(null);

  const micRef = useRef(null);
  const speakerRef = useRef(null);
  const encoderRef = useRef(null);
  const decoderRef = useRef(null);

  const ringBufferRef = useRef(new RingBuffer(8000));

  const startAudio = async () => {
    setStarted(true);

    encoderRef.current = new OpusEncoder();
    decoderRef.current = new OpusDecoder();

    encoderRef.current.onData((packet) => {
      // console.log("encoder data",packet.length);
      decoderRef.current.writePacket(packet);
    });

    decoderRef.current.onData((pcm48) => {
      // console.log("decoder data",pcm48.length);
     // ringBufferRef.current.writeSamples(pcm48);
     speakerRef.current.writeSamples(pcm48);
     chunkRef.current=pcm48;
      // while (ringBufferRef.current.availableToRead() >= 512) {
      //   ringBufferRef.current.readSamples(out);
      //   chunkRef.current = out;
      //   speakerRef.current.writeSamples(out);
      // }
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = new Microphone(stream);
      speakerRef.current = new Speaker();

      const interval = 1000;

      setInterval(() => {
        try {
          const available = micRef.current.availableToRead();
          console.log("available", available);

          if (available > 0) {
            const buffer = new Float32Array(available);
            const read = micRef.current.readSamples(buffer);

            if (read > 0) {
              encoderRef.current.writeSamples(buffer);
            }
          }
        } catch (err) {
          console.error("[AUDIO LOOP ERROR]", err);
        }
      }, interval);
    } catch (err) {
      console.error("[MIC INIT ERROR]", err);
    }

  };

  const handleDeviceChange = async () => {
    if (micRef.current) {
      micRef.current.stop();
      micRef.current = null;
    }
    if (speakerRef.current) {
      speakerRef.current.stop();
      speakerRef.current = null;
    }
    startAudio();
  };

  useEffect(() => {
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Audio Test</h1>

      {!started && (
        <button onClick={startAudio}>
          Allow Microphone & Start
        </button>
      )}

      {started && <p>Microphone running...</p>}

      <WaveformVisualizer chunk={chunkRef} />
    </main>
  );
};

export default Home;
