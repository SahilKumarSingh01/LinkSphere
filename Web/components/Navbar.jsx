import Link from "next/link";
import { FaInfoCircle } from "react-icons/fa";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-btn-primary text-text-primary shadow-md">
      <Link
        href="/"
        className="text-2xl font-bold hover:text-text-secondary transition-colors"
      >
        LinkSphere
      </Link>

      <Link
        href="/about"
        className="p-2 rounded hover:bg-btn-primary-hover transition-colors"
      >
        <FaInfoCircle className="w-6 h-6" />
      </Link>
    </nav>
  );
}
