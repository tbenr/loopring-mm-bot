import * as Poseidon from './poseidon';
import EdDSA from './eddsa';
import { NewOrder } from '../types';
import { signatureToHex } from './formatter';


export function signOrder(order: NewOrder, keyPair:any) : NewOrder {

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
