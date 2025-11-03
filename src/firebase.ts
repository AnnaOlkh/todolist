import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyCz6b7fb5C1igJUmYz20ILQ01H_HZsGz_s',
  authDomain: 'to-do-list-52b01.firebaseapp.com',
  projectId: 'to-do-list-52b01',
  storageBucket: 'to-do-list-52b01.firebasestorage.app',
  messagingSenderId: '106495455099',
  appId: '1:106495455099:web:311f6bd006df9f3ba817de',
  measurementId: 'G-VEMFNEK2E0',
};
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
