import { ref, set, onValue, remove, push, onDisconnect } from 'firebase/database';
import { rtdb } from './config';

export const rtdbRefs = {
  typing: (chatId, qcNumber) => ref(rtdb, `typing/${chatId}/${qcNumber}`),
  vanish: (chatId) => ref(rtdb, `vanish/${chatId}`),
  vanishState: (chatId) => ref(rtdb, `vanishState/${chatId}`),
  vanishMsg: (chatId, msgId) => ref(rtdb, `vanish/${chatId}/${msgId}`),
  presence: (qcNumber) => ref(rtdb, `presence/${qcNumber}`),
};

export { set, onValue, remove, push, onDisconnect, ref, rtdb };
