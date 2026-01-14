import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-primary text-text-primary px-6">
      {/* Brand */}
      <div className="flex items-center space-x-3 mb-8">
        <img src="/favicon.ico" alt="LinkSphere Logo" className="w-12 h-12" />
        <span className="text-2xl font-bold text-text-primary">LinkSphere</span>
      </div>

      {/* 404 Code */}
      <h1 className="text-7xl font-extrabold mb-4 text-text-primary">404</h1>
      <p className="text-lg mb-8 text-text-secondary text-center">
        Oops! The page you're looking for doesn't exist.
      </p>

      {/* Back to Home Link */}
      <Link
        href="/"
        className="px-6 py-3 bg-btn-primary text-white rounded-lg hover:bg-btn-primary-hover transition-colors"
      >
        ← Back to Home
      </Link>
    </div>
  );
}
