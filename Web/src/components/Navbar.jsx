import { useNavigate } from 'react-router-dom';
import { FaInfoCircle } from 'react-icons/fa';
import styles from '../styles/Navbar.module.css';

const Navbar = () => {
  const navigate = useNavigate();

  return (
    <nav className={styles.navbar}>
      <div className={styles.brand} onClick={() => navigate('/')}>
        LinkSphere
      </div>
      <div className={styles.iconWrapper} onClick={() => navigate('/about')}>
        <FaInfoCircle className={styles.icon} />
      </div>
    </nav>
  );
};

export default Navbar;
