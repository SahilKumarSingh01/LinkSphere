"use client"
import React from 'react';

const RoomCard = ({imageLink,name,description}) => {
  return (
   
    <div className="bg-[#231E39] text-[#B3B8CD] rounded-2xl shadow-2xl px-6 py-12 w-full max-w-xs min-h-57.5   text-center relative overflow-hidden flex flex-col items-center">
      
      <div className='h-2'></div>
      <div className="flex justify-center mt-10 mb-8">
        <div className="p-1.5 rounded-full border-2 border-[#03BFCB] shadow-lg shadow-cyan-500/20">
          <img
            className="w-28 h-28 rounded-full object-cover"
            src={imageLink? imageLink:"image/defaultGroupPic.png"}
            alt="Profile"
          />
        </div>
      </div>

      {/* Name and Location Fields */}
      <div className="mb-6">
        <h2 className="text-white text-2xl font-bold tracking-tight">{name}</h2>
       
      </div>

      {/* Description Field */}
      <div className="grow">
        <p className="text-sm leading-relaxed px-2 text-slate-400">
          {description}
        </p>
      </div>

      <div className='h-3'></div>
    </div>
  );
};

export default RoomCard;