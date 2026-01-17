'use client'
import React from 'react'
import RoomCard from '@components/RoomCard'
import { useSidePan } from '@context/SidePanContext';
import { BsFillPersonLinesFill } from "react-icons/bs";
import SidePan from '@components/SidePan.jsx';

function page() {
  const {isSidePanOpen,setIsSidePanOpen}=useSidePan();
  return (
    <>
      <div className='bg-bg-primary min-h-screen'>
      <div className='p-4 '>
        <h2 className="text-text-primary text-2xl font-extrabold text-center ">See which Group is currently active</h2>
      </div>
        <div className='flex flex-wrap gap-10 flex-row  pt-10 px-15 lg:px-30   pb-5  '>
            <RoomCard/>
            <RoomCard/>
            <RoomCard/>
            <RoomCard/>
            <RoomCard/>
            <RoomCard/>
            <RoomCard/>
        </div>
        <div 
        className='fixed z-50'>
          <SidePan/>
        </div>
        {!isSidePanOpen?
        <div className="group fixed bottom-10 right-1 lg:right-5 mr-1 z-50">
        <BsFillPersonLinesFill 
          className="cursor-pointer text-react-icon"
          size={40}
          onClick={()=>setIsSidePanOpen(true)}
        />

          <div className="
          absolute z-10 right-full mr-2 top-1/2 -translate-y-1/2
          whitespace-nowrap rounded-md bg-bg-tertiary px-3 py-1.5
          text-text-primary shadow-lg
          opacity-0
          cursor-pointer
          pointer-events-none
          transition-all duration-150 delay-200
          group-hover:opacity-100 
          group-hover:pointer-events-auto
        ">
          Online User
        </div>


      </div>:null};


      </div>
    </>
  )
}

export default page
