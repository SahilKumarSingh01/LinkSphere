'use client'
import { useState, useRef, useEffect } from "react";
import { Microphone, Speaker, OpusDecoder, OpusEncoder } from "@utils/audio";
import { RingBuffer } from "@utils/RingBuffer";
import WaveformVisualizer from "@components/WaveformVisualizer";
import { Room } from "@utils/Room";
import { useMessageHandler } from "@context/MessageHandler.jsx";
import MessageHandler from "@utils/MessageHandler";


const out = new Float32Array(512);

const Home = () => {
  const [started, setStarted] = useState(false);
  const chunkRef = useRef(null);

  const micRef = useRef(null);
  const speakerRef = useRef(null);
  const encoderRef = useRef(null);
  const decoderRef = useRef(null);
  const roomRef = useRef(new Room);
  const handler = useMessageHandler();
  // console.log("handler",handler);
  const knownPeer=[
    {
      port:5173,
      ip:172467315,
    },
    {
      port:5173,
      ip:172467453,
    }
  ]

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
  useEffect(()=>{
    (async()=>{
      try{
        if(handler){
          console.log("handler",handler)
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          roomRef.current.init(handler,knownPeer,stream,123456789,true);
        }
      }catch(e){
        console.log(e);
      }
    }
    )();
    return ()=>{roomRef.current.stop();};
  },[handler])

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
        <button onClick={()=>{roomRef.current.stop();}}>
          stop
        </button>
      )}

      {started && <p>Microphone running...</p>}

      <WaveformVisualizer chunk={chunkRef} />
    </main>
  );
};

export default Home;
