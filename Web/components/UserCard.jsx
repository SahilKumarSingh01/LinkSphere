"use client"
import React from 'react';

const UserCard = ({ imageLink, name}) => {
  return (
    <div className="bg-bg-tertiary text-text-secondary rounded-xl shadow-2xl px-2  py-2 w-[93%] max-w-md flex items-center space-x-4 border border-border-color">
      {/* Profile Picture */}
     
      <div className=" rounded-full border-2 border-[#03BFCB] shadow-lg shadow-cyan-500/20">
        <img
          className="w-12 h-12 rounded-full object-cover"
          src={
            imageLink
              ? imageLink
              : "image/defaultPic.jpg"
          }
          alt="Profile"
        />
      </div>
       

      {/* Name and Description */}
      <div className="flex flex-col justify-center">
        <h2 className=" text-lg font-bold tracking-tight">{name}</h2>
        <h2 className=" text-lg font-bold tracking-tight">{name}</h2>
      </div>

    </div>
  );
};

export default UserCard;
