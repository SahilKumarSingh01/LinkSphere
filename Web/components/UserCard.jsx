"use client"
import React from 'react';

const UserCard = ({ imageLink, name, description }) => {
  return (
    <div className="bg-[#231E39] text-[#B3B8CD]  rounded-2xl shadow-2xl px-6 py-4 w-[93%] max-w-md flex items-center space-x-4 border border-white">
      <div className='h-4'></div>
      {/* Profile Picture */}
      <div className='w-1'></div>
      <div className="p-1.5 rounded-full border-2 border-[#03BFCB] shadow-lg shadow-cyan-500/20">
        <img
          className="w-20 h-20 rounded-full object-cover"
          src={
            imageLink
              ? imageLink
              : "image/defaultPic.jpg"
          }
          alt="Profile"
        />
      </div>
       <div className='w-2'></div>

      {/* Name and Description */}
      <div className="flex flex-col justify-center">
        <h2 className="text-white text-lg font-bold tracking-tight">{name}</h2>
        <p className="text-sm text-slate-400 mt-1 ">{description}</p>
      </div>

    </div>
  );
};

export default UserCard;
