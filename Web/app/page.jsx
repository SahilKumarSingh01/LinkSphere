"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="flex-1 bg-bg-primary text-text-primary pt-24 overflow-hidden">
      {/* Hero Section */}
      <section className="scale-in max-w-6xl mx-auto px-6 flex flex-col items-center text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          Private Audio.
          <br />
          <span className="text-text-secondary">Zero Middlemen.</span>
        </h1>

        <p className="text-lg md:text-xl text-text-tertiary max-w-2xl mb-10">
          LinkSphere is a peer-to-peer audio chat platform where your voice stays
          between you and your friends. No servers. No surveillance.
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => router.push("/get-started")}
            className="px-8 py-3 rounded-lg bg-btn-primary text-white font-semibold hover:bg-btn-primary-hover active:bg-btn-primary-active"
          >
            Get Started
          </button>

          <button
            onClick={() => router.push("/about")}
            className="px-8 py-3 rounded-lg bg-bg-secondary text-text-primary font-semibold hover:bg-bg-tertiary"
          >
            Learn More
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 mt-32 grid md:grid-cols-3 gap-8">
        <div
          className="scale-in bg-bg-secondary rounded-xl p-6 shadow-lg "
          style={{ animationDelay: "0.5s" }}
        >
          <h3 className="text-2xl font-semibold mb-3">Peer-to-Peer</h3>
          <p className="text-text-tertiary">
            Audio flows directly between participants without centralized servers.
          </p>
        </div>

        <div
          className="scale-in bg-bg-secondary rounded-xl p-6 shadow-lg"
          style={{ animationDelay: "0.6s" }}
        >
          <h3 className="text-2xl font-semibold mb-3">Private Rooms</h3>
          <p className="text-text-tertiary">
            Invite-only rooms for conversations that stay inside your circle.
          </p>
        </div>

        <div
          className="scale-in bg-bg-secondary rounded-xl p-6 shadow-lg"
          style={{ animationDelay: "0.7s" }}
        >
          <h3 className="text-2xl font-semibold mb-3">Low Latency</h3>
          <p className="text-text-tertiary">
            Optimized real-time audio for smooth and natural communication.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 mt-32 mb-24">
        <div
          className="scale-in bg-bg-secondary rounded-2xl p-10 text-center shadow-xl"
          style={{ animationDelay: "0.8s" }}
        >
          <h2 className="text-4xl font-bold mb-4">
            Talk Without Compromise
          </h2>
          <p className="text-text-tertiary mb-8">
            Create your first room and experience truly private audio conversations.
          </p>
          <button
            onClick={() => router.push("/get-started")}
            className="px-10 py-4 rounded-lg bg-btn-primary text-white font-semibold hover:bg-btn-primary-hover active:bg-btn-primary-active"
          >
            Create a Room
          </button>
        </div>
      </section>
    </main>
  );
}
