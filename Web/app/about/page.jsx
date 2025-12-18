import styles from '@styles/AboutPage.module.css';

const AboutPage = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>About LinkSphere</h1>

      <p className={styles.description}>
        <strong>LinkSphere</strong> is a private, peer-to-peer audio chat platform designed for secure communication within your own network.
      </p>

      <p className={styles.text}>
        Users can create rooms, join friends, and have real-time conversations without any servers handling your audio—everything runs directly between peers.
      </p>

      <div className={styles.features}>
        <h2 className={styles.subheading}>Current Features</h2>
        <ul>
          <li>Create and join private audio rooms</li>
          <li>Real-time peer-to-peer voice communication</li>
          <li>Minimal latency for smooth conversations</li>
        </ul>
      </div>

      <p className={styles.text}>
        More features are planned, including multi-room support, user presence indicators, and improved audio quality. Suggestions are always welcome.
      </p>

      <p className={styles.footer}>
        Built by <strong>Sahil Kumar Singh</strong> and <strong>Sachin Patel</strong> at MNNIT Allahabad
      </p>
    </div>
  );
};

export default AboutPage;
