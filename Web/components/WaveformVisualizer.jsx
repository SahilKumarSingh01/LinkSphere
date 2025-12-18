import { useEffect, useRef } from "react";

const WaveformVisualizer = ({ chunk }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      requestAnimationFrame(draw);
      if (!chunk?.current) return;

      const data = chunk.current;
      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#0f0";
      ctx.beginPath();

      const sliceWidth = width / data.length;
      let x = 0;

      for (let i = 0; i < data.length; i++) {
        const y = (0.5 - data[i] / 2) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
    };

    draw();
  }, [chunk]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={150}
      style={{
        marginTop: "1rem",
        border: "1px solid #444",
        background: "#111",
        display: "block"
      }}
    />
  );
};

export default WaveformVisualizer;
