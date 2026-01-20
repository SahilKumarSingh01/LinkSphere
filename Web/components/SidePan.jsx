"use client";
import React, { useEffect, useRef } from "react";
import UserCard from "./UserCard";
import { useSidePan } from "@context/SidePanContext.jsx";

const onlineUserList = [
  { name: "user1", image: "/image/boy.jpg" },
  { name: "user2", image: "/image/girl.jpg" },
  { name: "user3" },
  { name: "user4", image: "/image/boy.jpg" },
  { name: "user5", image: "/image/boy.jpg" },
  { name: "user6", image: "/image/girl.jpg" },
  { name: "user7", image: "/image/girl.jpg" },
  { name: "user8" },
];

function SidePan() {
  const { isSidePanOpen, setIsSidePanOpen } = useSidePan();
  const scrollRef = useRef(null);

  // Prevent body scroll when cursor is over sidePan
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const wheelHandler = (e) => {
      const delta = e.deltaY;
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;

      // If scrolling up at top or down at bottom, prevent body scroll
      if ((delta < 0 && scrollTop === 0) || (delta > 0 && scrollTop + clientHeight >= scrollHeight)) {
        e.preventDefault();
      }
      // else let the sidePan scroll normally
    };

    el.addEventListener("wheel", wheelHandler, { passive: false });

    return () => {
      el.removeEventListener("wheel", wheelHandler);
    };
  }, [isSidePanOpen]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => setIsSidePanOpen(false)}
        className={`
          fixed top-2 bottom-1 inset-x-0 bg-bg-secondary z-40
          transition-opacity duration-300 
          ${isSidePanOpen ? "opacity-10" : "opacity-0 pointer-events-none"}
        `}
      />

      {/* SidePan */}
      <aside
        className={`
          fixed top-2 bottom-1 right-1 z-50
          w-96
          bg-bg-secondary
          shadow-2xl
          border border-border-color
          rounded-xl 
          transform transition-transform duration-300
          ${isSidePanOpen ? "translate-x-0" : "translate-x-[110%]"}
        `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
          <h2 className="text-text-primary text-lg font-semibold">Online Users</h2>
          <button onClick={() => setIsSidePanOpen(false)} className="text-text-primary text-xl">
            ✕
          </button>
        </div>

        {/* Content with controlled scrolling */}
        <div
          ref={scrollRef}
          className="flex flex-col p-3 overflow-y-auto h-[calc(100%-56px)] gap-1.5 items-center no-scrollbar"
        >
          {onlineUserList.map((user, index) => (
            <UserCard key={index} imageLink={user.image} name={user.name} />
          ))}
        </div>
      </aside>
    </>
  );
}

export default SidePan;
