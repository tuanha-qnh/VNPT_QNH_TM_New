
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  getDoc,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCcHAEparoAlnn47JWGB0cXYD_opdfd5XE",
  authDomain: "task-manager-99a19.firebaseapp.com",
  projectId: "task-manager-99a19",
  storageBucket: "task-manager-99a19.firebasestorage.app",
  messagingSenderId: "223177187508",
  appId: "1:223177187508:web:5617a47052c9e295e0b7e1",
  measurementId: "G-5QHXWXKGWG"
};

let db: any = null;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    // Enable offline persistence to handle connectivity issues
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
             console.warn('Persistence failed: Multiple tabs open.');
        } else if (err.code == 'unimplemented') {
             console.warn('Persistence failed: Browser not supported.');
        }
    });
} catch (e) {
    console.error("Firebase init failed", e);
}

export const dbClient = {
    async getAll(colName: string) {
        if (!db) return [];
        try {
            const querySnapshot = await getDocs(collection(db, colName));
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error getting all from ${colName}:`, error);
            // Return empty array to allow app to continue rendering even if offline/failed
            return [];
        }
    },
    
    async getById(colName: string, id: string) {
        if (!db) return null;
        try {
            const docRef = doc(db, colName, id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            } else {
                return null;
            }
        } catch (error) {
            console.error(`Error getting by id ${colName}/${id}:`, error);
            return null;
        }
    },

    async getByFilter(colName: string, field: string, value: any) {
        if (!db) return [];
        try {
            const q = query(collection(db, colName), where(field, "==", value));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error filtering ${colName}:`, error);
            return [];
        }
    },

    async upsert(colName: string, id: string, data: any) {
        if (!db) return;
        try {
            await setDoc(doc(db, colName, id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (error) {
            console.error(`Error upserting ${colName}/${id}:`, error);
            throw error;
        }
    },

    async update(colName: string, id: string, data: any) {
        if (!db) return;
        try {
            await updateDoc(doc(db, colName, id), data);
        } catch (error) {
            console.error(`Error updating ${colName}/${id}:`, error);
            throw error;
        }
    },

    async delete(colName: string, id: string) {
        if (!db) return;
        try {
            await deleteDoc(doc(db, colName, id));
        } catch (error) {
            console.error(`Error deleting ${colName}/${id}:`, error);
            throw error;
        }
    }
};
