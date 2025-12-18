import Link from "next/link";
import { FaInfoCircle } from "react-icons/fa";
import styles from "@styles/Navbar.module.css";

export default function Navbar() {
  return (
    <nav className={styles.navbar}>
      <Link href="/" className={styles.brand}>
        LinkSphere
      </Link>

      <Link href="/about" className={styles.iconWrapper}>
        <FaInfoCircle className={styles.icon} />
      </Link>
    </nav>
  );
}
