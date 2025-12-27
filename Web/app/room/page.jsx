'use client'
import { useState, useRef, useEffect } from "react";
import { Microphone, Speaker } from "@utils/audio";
import WaveformVisualizer from "@components/WaveformVisualizer";

const Home = () => {
  const [started, setStarted] = useState(false);
  const chunkRef = useRef(null);
  const micRef = useRef(null);
  const speakerRef = useRef(null);

  const startAudio = async () => {
    console.log("hello how are you this function is called");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log(stream);
    const mic = new Microphone(stream); 
    const speaker = new Speaker();

    micRef.current = mic;
    speakerRef.current = speaker;
    setStarted(true);

    setInterval(() => {
      const available = mic.availableToRead();
      if (available > 0) {
        const buffer = new Float32Array(available);
        const read = mic.readSamples(buffer);
        if (read > 0) {
          chunkRef.current = buffer;
          speaker.writeSamples(buffer);
        }
      }
    }, 200);
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
