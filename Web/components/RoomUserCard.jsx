"use client";
import React from "react";

function RoomUserCard({ name, profilePic, size }) {
  const initial = name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div
      className="group relative flex items-center justify-center transition-all duration-300 p-2"
      style={{
        width: `calc(var(--spacing) * ${size})`,
        height: `calc(var(--spacing) * ${size})`,
      }}
    >
      {/* Full-size circular avatar */}
      <div className="w-full h-full rounded-full overflow-hidden shadow-btn-primary shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:shadow-btn-primary group-hover:scale-[1.02] flex items-center justify-center">
        {profilePic ? (
          <img
            className="w-full h-full object-cover"
            src={profilePic}
            alt="ProfilePic"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-btn-primary to-btn-primary-active flex items-center justify-center text-text-primary font-bold text-xl">
            {initial}
          </div>
        )}
      </div>

      {/* Hover Name */}
      <div className="absolute z-10 top-full mt-2 left-1/2 -translate-x-1/2 bg-bg-tertiary px-3 py-1.5 text-text-primary opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-hover:delay-500 duration-150 whitespace-nowrap">
        {name}
      </div>
    </div>
  );
}

export default RoomUserCard;
