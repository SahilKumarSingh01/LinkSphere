import "server-only";

import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert({
          type: process.env.NEXT_FIREBASE_ADMIN_TYPE,
          project_id: process.env.NEXT_FIREBASE_ADMIN_PROJECT_ID,
          private_key_id: process.env.NEXT_FIREBASE_ADMIN_PRIVATE_KEY_ID,
          private_key: process.env.NEXT_FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          client_email: process.env.NEXT_FIREBASE_ADMIN_CLIENT_EMAIL,
          client_id: process.env.NEXT_FIREBASE_ADMIN_CLIENT_ID,
          auth_uri: process.env.NEXT_FIREBASE_ADMIN_AUTH_URI,
          token_uri: process.env.NEXT_FIREBASE_ADMIN_TOKEN_URI,
          auth_provider_x509_cert_url:
            process.env.NEXT_FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL,
          client_x509_cert_url:
            process.env.NEXT_FIREBASE_ADMIN_CLIENT_X509_CERT_URL,
          universe_domain:
            process.env.NEXT_FIREBASE_ADMIN_UNIVERSE_DOMAIN,
        }),
      })
    : getApp();

  const db =getFirestore(app) ;
 export {db};
