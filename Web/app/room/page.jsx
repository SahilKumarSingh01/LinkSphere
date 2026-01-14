'use client'
import { useState, useRef, useEffect } from "react";
import { Microphone, Speaker, OpusDecoder, OpusEncoder } from "@utils/audio";
import { RingBuffer } from "@utils/RingBuffer";
import { useMessageHandler } from "@context/MessageHandler.jsx";
import WaveformVisualizer from "@components/WaveformVisualizer";

const out = new Float32Array(512);

const Home = () => {
  const [started, setStarted] = useState(false);
  const chunkRef = useRef(null);

  const micRef = useRef(null);
  const speakerRef = useRef(null);
  const encoderRef = useRef(null);
  const decoderRef = useRef(null);
  const handler = useMessageHandler();
  const ringBufferRef = useRef(new RingBuffer(8000));
  // console.log("handler availabe",handler);
  useEffect(()=>{
    console.log("handler availabe",handler);
    // console.log("this function is called");
  },[handler]);
  const startAudio = async () => {
    if(started){
      speakerRef.current.stop();
      encoderRef.current.stop();
      decoderRef.current.stop();
      micRef.current.stop();
      setStarted(false);
      return;
    }
    setStarted(true);
      // console.log("handler availabe",handler);


    encoderRef.current = new OpusEncoder();
    decoderRef.current = new OpusDecoder();
    handler.setOnMessageReceive(
          200,
          (srcIP, srcPort, dstIP, dstPort, type, payload) =>
            // this.onVote(srcIP, srcPort, dstIP, dstPort, type, payload)
          {decoderRef.current.writePacket(payload);}
        );
    encoderRef.current.onData((packet) => {
      // console.log("we are sending",packet);
      handler.sendMessage(0,3232235621,5173,200,packet);

      // console.log("encoder data",packet);
      // decoderRef.current.writePacket(packet);

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

      {(
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
