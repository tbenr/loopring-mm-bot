import BigNumber from "bignumber.js";
import { expect } from "chai";
import { MarketState } from "../marketState";
import { RestClient } from "../restClient";
import { Config, Market, Side, Token } from "../types";

let testMarket:Market =
{
  market: "DAI-USDT",
  baseTokenId: 5,
  quoteTokenId: 3,
  precisionForPrice: 4,
  orderbookAggLevels: 2,
  enabled: true,
}

let testBaseToken:Token =
{
  type: "ERC20",
  tokenId: 5,
  symbol: "DAI",
  name: "Dai Stablecoin",
  address: "0x6b175474e89094c44da98b954eedeac495271d0f",
  decimals: 18,
  precision: 3,
  orderAmounts: {
    minimum: "5000000000000000000",
    maximum: "200000000000000000000000",
    dust: "250000000000000000",
  },
  fastWithdrawLimit: "100000000000000000000000",
  enabled: true,
}

let testQuoteToken:Token =
{
  type: "ERC20",
  tokenId: 3,
  symbol: "USDT",
  name: "Tether USD",
  address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  decimals: 6,
  precision: 2,
  orderAmounts: {
    minimum: "5000000",
    maximum: "200000000000",
    dust: "250000",
  },
  fastWithdrawLimit: "100000000000",
  enabled: true,
}

let testConfig:Config =
{
  "restAPIBaseUrl": "https://api3.loopring.io",
  "wsBaseUrl": "wss://ws.api3.loopring.io",
  "account": {
      "exchangeName": "Loopring Exchange v2",
      "exchangeAddress": "0x0BABA1Ad5bE3a5C0a66E7ac838a129Bf948f1eA4",
      "accountAddress": "0x...",
      "accountId": 0,
      "apiKey": "...",
      "publicKeyX": "0x...",
      "publicKeyY": "0x...",
      "privateKey": "0x..."
  },
  "pair": "DAI-USDT",
  "maxBuyPrice": "1.0002",
  "minSellPrice": "1.0000",
  "reconnectWsAfterMissedPingSeconds": 60
}

let testRestClient = new RestClient(testConfig)

describe('Market State', function() {
    let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
    it('test getCounterpartAmount buy', function() {
      let ammount = new BigNumber('1000000') // 1 USDT
      let price = new BigNumber(0.5) // 0.5 price

      let r = ms.getCounterpartAmount(ammount,price,Side.Buy);
      expect(r).equal('2000000000000000000'); // 2 DAI
    });

    it('test getCounterpartAmount sell', function() {
      let ammount = new BigNumber('1000000000000000010') // 1 DAI plus dust
      let price = new BigNumber(0.33) // 0.33 price

      let r = ms.getCounterpartAmount(ammount,price,Side.Sell);
      expect(r).equal('330000');
    }); 
  });