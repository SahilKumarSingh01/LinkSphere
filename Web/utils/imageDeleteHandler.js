import React from 'react'
import ImageCompresser from './ImageCompresser'
import { db } from '../lib/firebase.js';
const imageDeleteHandler= async(organisationName="iit-k",uid="112.32.32.1:::1")=> {
  
  try {
    const userRef = db.collection("organisation").doc(organisationName).collection("roomPhoto").doc(uid);
    const res=await userRef.delete();
    return res;
  } catch (error) {
    return error;
  }
  
}

export default imageDeleteHandler;
