import { useState, useRef } from "react";
import { Microphone, Speaker } from "../utils/audio";
import WaveformVisualizer from "../components/WaveformVisualizer";

const Home = () => {
  const [started, setStarted] = useState(false);
  const chunkRef = useRef(null);
  const micRef = useRef(null);
  const speakerRef = useRef(null);

  const startAudio = async () => {
    const mic = new Microphone();
    const speaker = new Speaker();

    await mic.init();
    micRef.current = mic;
    speakerRef.current = speaker;
    setStarted(true);

    setInterval(() => {
      const buffer = new Float32Array(mic.availableToRead()); // chunk size
      const read = mic.readSamples(buffer);
      if (read > 0) {
        chunkRef.current = buffer;
        speaker.writeSamples(buffer);
      }
    }, 150);

  };

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
