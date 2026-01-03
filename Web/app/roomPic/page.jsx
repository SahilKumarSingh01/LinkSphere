"use client"
import React from 'react'
import { useState } from 'react'
import ImageCompresser from '@utils/ImageCompresser';
import axios from 'axios';
function RoomPic() {
    const [image,setImage]=useState(null);
    const [url,setUrl]=useState(null);
    const submitHandler=async ()=>{
        try {
            if(!image) return;
        console.log("image:",image);
    
        const base64String=await ImageCompresser(image);
        setUrl(base64String);
        //console.log("base64:",base64String);
        const formData = new FormData();
        formData.append("base64String", base64String);

        const res = await axios.patch("http://localhost:3000/api/token",formData);
        console.log("res:",res);
        } catch (error) {
            console.log(error.message);
        }

    }
  return (
    <>
    <div className='text-center text-black'>
        <h1>Image uploader</h1>
    </div>

   <div className='flex flex-col items-center'>
        <input 
    onChange={(e)=>setImage(e.target.files[0])}
    type="file" />
    
    <button
    
    onClick={submitHandler}
    >submit</button>
</div>
    {url && <div>
        <h1>Compresses image</h1>
        <img src={url} alt="compressedImage" />
    </div>}

    </>
    
  )
}

export default RoomPic;
