const AboutPage = () => {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary py-12 scale-in">
      {/* Centered "card" with secondary background */}
      <div className="max-w-4xl mx-auto px-6 py-12 bg-bg-secondary rounded-xl shadow-lg">
        <h1 className="text-4xl font-bold mb-6 text-text-primary">
          About LinkSphere
        </h1>

        <p className="text-lg mb-4 text-text-secondary">
          <strong>LinkSphere</strong> is a private, peer-to-peer audio chat platform designed for secure communication within your own network.
        </p>

        <p className="text-base mb-6 text-text-tertiary">
          Users can create rooms, join friends, and have real-time conversations without any servers handling your audio—everything runs directly between peers.
        </p>

        <div className="mb-6">
          <h2 className="text-2xl font-semibold mb-3 text-text-primary">Current Features</h2>
          <ul className="list-disc list-inside space-y-2 text-text-secondary">
            <li>Create and join private audio rooms</li>
            <li>Real-time peer-to-peer voice communication</li>
            <li>Minimal latency for smooth conversations</li>
          </ul>
        </div>

        <p className="text-base mb-6 text-text-tertiary">
          More features are planned, including multi-room support, user presence indicators, and improved audio quality. Suggestions are always welcome.
        </p>

        <p className="text-sm text-text-secondary">
          Built by <strong>Sahil Kumar Singh</strong> and <strong>Sachin Patel</strong> at MNNIT Allahabad
        </p>
      </div>
    </div>
  );
};

export default AboutPage;
