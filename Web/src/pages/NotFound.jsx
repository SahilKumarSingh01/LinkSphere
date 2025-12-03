import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../styles/NotFound.module.css';

const NotFound = () => {
  return (
    <div className={styles.container}>
      <div className={styles.brand}>
        <img src="/favicon.ico" alt="LinkSphere Logo" className={styles.logo} />
        <span className={styles.brandName}>LinkSphere</span>
      </div>
      <h1 className={styles.code}>404</h1>
      <p className={styles.message}>Oops! The page you’re looking for doesn’t exist.</p>
      <Link to="/" className={styles.homeLink}>← Back to Home</Link>
    </div>
  );
};

export default NotFound;
