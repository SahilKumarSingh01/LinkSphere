import React from 'react'
import { db } from '../lib/firebase.js';
const imageUploaderHandler= async(base64String,organisationName="iit-k",uid="112.32.32.1:::1")=> {
  
  try {
    
    const url={base64String};
    const userRef = db.collection("organisation").doc(organisationName).collection("roomPhoto").doc(uid);
    const res=await userRef.set(url);
    return res;
  } catch (error) {
    return error;
  }
  
}

export default imageUploaderHandler
