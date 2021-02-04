import * as Poseidon from './poseidon.js';
import EdDSA from './eddsa.js';
import { Order } from '../types';
import { signatureToHex } from './formatter.js';


export function signOrder(order: Order, keyPair:any) : Order {

 // Calculate hash
 const hasher = Poseidon.createHash(12, 6, 53);
 const inputs = [
   order.exchange,
   order.storageId,
   order.accountId,
   order.sellToken.tokenId,
   order.buyToken.tokenId,
   order.sellToken.volume,
   order.buyToken.volume,
   order.validUntil,
   order.maxFeeBips,
   order.fillAmountBOrS ? 1 : 0,
   ''
 ];

  var hash = hasher(inputs).toString(10);

  // Create signature
  const signature = EdDSA.sign(keyPair.secretKey, hash);

  order.eddsaSignature = signatureToHex(signature);

  return order;
}
