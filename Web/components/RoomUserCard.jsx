"use client"
import React from 'react'

function RoomUserCard({ name, profilePic, userCount }) {
  const sizeMap = {
    0: { card: "w-40 h-40 p-1" },
    1: { card: "w-28 h-28 p-1" },
    2: { card: "w-24 h-24 p-1" },
    3: {card: "w-17 h-17 p-1 "},
    4: { card: "w-15 h-15 p-1" },
  };

  const size = userCount > 4 ? sizeMap[4] : sizeMap[userCount];
 // console.log("userCount",userCount)
  return (
    <div
      className={`group relative  rounded-full flex items-center justify-center transition-all duration-300 ${size.card}`}
    >
      {/* Full-size circular avatar */}
      <div className="w-full h-full rounded-full overflow-hidden 
                      border border-[#03BFCB]
                      shadow-md shadow-cyan-500/20
                      transition-all duration-200
                      group-hover:shadow-cyan-400/60
                      group-hover:ring-2 group-hover:ring-[#03BFCB]/60
                      group-hover:scale-[1.03]">
        <img
          className="w-full h-full object-cover"
          src={profilePic || "image/defaultGroupPic.png"}
          alt="ProfilePic"
        />
      </div>

      {/* Hover Name */}
          <div className="absolute z-10 top-full mt-2 left-1/2 -translate-x-1/2 
                    whitespace-nowrap rounded-md bg-bg-tertiary px-3 py-1.5
                    text-text-primary shadow-lg
                    opacity-0 translate-y-1
                    pointer-events-none
                    transition-all duration-150 delay-300
                    group-hover:opacity-100 group-hover:translate-y-0 group-hover:delay-300
                    group-hover:pointer-events-auto
                    group-hover:duration-200">
      {name}
    </div>
    </div>
  );
}

export default RoomUserCard;
