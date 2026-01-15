import 'server-only'
import admin from "firebase-admin";
import { db } from '../../../lib/firebase.js';

export async function POST(req) {
  try {
    //  console.log("backend called",req);
    const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") ||"unknown";
    const body=await req.json();
    let {privateIP,organisationName,userInfo={}}= body;
    
    if(!privateIP || !organisationName)
    {
       return new Response(
         "PrivateIP And organisationName Needed",
         {
          status:400,
          headers:{"Content-Type":"application/json"}
         }
       );
    }
    organisationName=organisationName.toLowerCase();
    
    //console.log("ip:",ip," privateIP:",privateIP," organisationName:",organisationName);
    const uid = privateIP+":"+ip;
    // console.log(ip,privateIp);
    // 1️⃣ Create custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // 2️⃣ Create Firestore document immediately
    const userRef = db.collection("organisation").doc(organisationName).collection("lastSeen").doc(uid);
    const picRef = db.collection("organisation").doc(organisationName).collection("pic").doc(uid);

    await Promise.all[userRef.set(userInfo, { merge: true }),picRef.set({})]; // merge: true ensures we don't overwrite existing fields

    return new Response(
      JSON.stringify({ 
        token: customToken,
        userId:uid
       }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.log(err);
    return new Response(
      JSON.stringify({ error: "Failed to create custom token or user doc" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
