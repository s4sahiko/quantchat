import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  increment,
  limit,
  addDoc,
  collectionGroup
} from 'firebase/firestore';
import { db } from './config';

export const collections = {
  accounts: collection(db, 'accounts'),
  activeNumbers: collection(db, 'active_numbers'),
  burnedNumbers: collection(db, 'burned_numbers'),
  messages: (chatId) => collection(db, `messages/${chatId}/msgs`),
  groups: collection(db, 'groups'),
  groupMessages: (groupId) => collection(db, `groups/${groupId}/msgs`),
  statuses: collection(db, 'statuses'),
  erasureLog: collection(db, 'erasure_log'),
  chatRequests: collection(db, 'chat_requests'),
  contacts: (qc) => collection(db, `accounts/${qc}/contacts`),
};

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export {
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  increment,
  limit,
  addDoc,
  collection,
  collectionGroup,
  db
};

