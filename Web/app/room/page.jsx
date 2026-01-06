'use client'
import { useState, useRef, useEffect } from "react";
import { Microphone, Speaker } from "@utils/audio";
import WaveformVisualizer from "@components/WaveformVisualizer";

const Home = () => {
  const [started, setStarted] = useState(false);
  const chunkRef = useRef(null);
  const micRef = useRef(null);
  const speakerRef = useRef(null);
  const encoderRef=useRef(null);
  const decoderRef = useRef(null);
  const resampleCtxRef=useRef(null);
  const pcmQueueRef = { current: [] };

  const opusEncoderConfig = {
        codec: "opus",
        sampleRate: 8000,          
        numberOfChannels: 1,       // mono
        bitrate: 16000,            // 16 kbps (perfect for 8k voice)
        opus: {
          application: "voip",     // optimized for speech
          signal: "voice",
          complexity: 5,           // good balance (0–10)
          // usedtx: true,            // silence suppression
          // useinbandfec: true,      // packet loss recovery
          frameDuration: 20_000       // us (best for 8k)
        }
      };

const opusDecoderConfig={
    codec: "opus",
    sampleRate: 48000,
    numberOfChannels: 1,
   
  }
 
  

  const encoderInit={
        output: (chunk) => {
          // console.log("Encoded chunk:", chunk);
          decoderRef.current.decode(chunk);
        
        },
        error: (e) => console.error(e),
      }



   const decoderInit = {
    output: async (audioData) => {
     
      const pcm8k = await resample48kTo8k(audioData);

      
      pcmQueueRef.current.push(pcm8k);

     
      let totalSamples = pcmQueueRef.current.reduce(
        (sum, chunk) => sum + chunk.length,
        0
      );

     
      while (totalSamples >= 512) {
        const out = new Float32Array(512);
        let offset = 0;

        while (offset < 512) {
          const chunk = pcmQueueRef.current[0];
          const needed = 512 - offset;

          if (chunk.length <= needed) {
            out.set(chunk, offset);
            offset += chunk.length;
            pcmQueueRef.current.shift();
          } else {
            out.set(chunk.subarray(0, needed), offset);
            pcmQueueRef.current[0] = chunk.subarray(needed);
            offset += needed;
          }
        }
        console.log("here we are ",out.length,);
        chunkRef.current=out;
        speakerRef.current.writeSamples(out);
        totalSamples -= 512;
      }

      console.log("decoded + queued:", pcm8k.length);
    },

    error: (e) => console.error("Decoder error:", e),
  };

  

  const resample48kTo8k=async(audioData)=> {
  const buffer = new AudioBuffer({
    length: audioData.numberOfFrames,
    sampleRate: 48000,
    numberOfChannels: 1,
  });

  const pcm48 = new Float32Array(audioData.numberOfFrames);
  audioData.copyTo(pcm48, { planeIndex: 0 });
  buffer.copyToChannel(pcm48, 0);

  const offline = new OfflineAudioContext(
  1,
  Math.ceil(buffer.duration * 8000),
  8000
);

const source = offline.createBufferSource();
source.buffer = buffer;
source.connect(offline.destination);
source.start();

const rendered = await offline.startRendering();
return rendered.getChannelData(0); 
}



  const startAudio = async () => {
      if (!("AudioEncoder" in window)) {
        console.error("WebCodecs AudioEncoder not supported");
        return;
      }

      console.log("hello this function is called");

      const encoder = new window.AudioEncoder(encoderInit);
      encoder.configure(opusEncoderConfig);
      encoderRef.current = encoder;

      const decoder= new window.AudioDecoder(decoderInit)
      decoder.configure(opusDecoderConfig);
      decoderRef.current=decoder;

      const resampleCtx = new AudioContext({ sampleRate: 8000 });
      resampleCtxRef.current=resampleCtx;
     
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mic = new Microphone(stream);
     const speaker = new Speaker();

      micRef.current = mic;
      speakerRef.current = speaker;
      setStarted(true);
      const interval=2000;
      setInterval(() => {
        const available = mic.availableToRead();
        if (available > 0) {
          const buffer = new Float32Array(available);
          const read = mic.readSamples(buffer);

          if (read > 0) {
            
            
            const audioData = new AudioData({
              format: "f32",
              sampleRate: 8000,
              numberOfFrames: read,
              numberOfChannels: 1,
              timestamp: performance.now() * 1000,
              data: buffer,
            });
          
            encoderRef.current.encode(audioData);
           
          }
        }
      }, interval);
    };


  const handleDeviceChange = async (newDeviceId) => {
    // stop old microphone
    if (micRef.current) {
      micRef.current.stop();
      micRef.current = null;
    }
    if(speakerRef.current){
      speakerRef.current.stop();
      speakerRef.current=null;
    }
    startAudio();
  };

  useEffect(()=>{
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  },[])


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