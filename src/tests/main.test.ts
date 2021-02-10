import BigNumber from "bignumber.js";
import { assert, expect } from "chai";
import { MarketState } from "../marketState";
import { Strategy } from "../strategy";
import { Config, Market, Notification, NotificationTopic, Side, Token } from "../types";
import { RestClientStub } from "./restClientStub";

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
    minimum: "5000000000000000000", //5 DAI
    maximum: "200000000000000000000000", //200K DAI
    dust: "250000000000000000", //0.25 DAI
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
    minimum: "5000000", //5 USDT
    maximum: "200000000000", //200K USDT
    dust: "250000", //0.25 USDT
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
      "accountAddress": "0x0",
      "accountId": 0,
      "apiKey": "...",
      "publicKeyX": "0x0",
      "publicKeyY": "0x0",
      "privateKey": "0x0"
  },
  "pair": "DAI-USDT",
  "maxBuyPrice": "1.0002",
  "minSellPrice": "0.9998",
  "reconnectWsAfterMissedPingSeconds": 60
}

describe('MarketState getCounterpartAmount', function() {
    let testRestClient = new RestClientStub(testConfig)
    let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);

    it('test getCounterpartAmount buy', function() {
      let ammount = new BigNumber('1000000') // 1 USDT
      let price = new BigNumber(0.5) // 0.5 price

      let r = ms.getCounterpartAmount(ammount,price,Side.Buy);
      expect(r).equal('2000000000000000000'); // 2 DAI
    });

    it('test getCounterpartAmount sell - check integer result', function() {
      let ammount = new BigNumber('1000000000000000010') // 1 DAI plus dust
      let price = new BigNumber(0.33) // 0.33 price

      let r = ms.getCounterpartAmount(ammount,price,Side.Sell);
      expect(r).equal('330000');
    }); 
  });

let accountNotificationTopic: NotificationTopic  = {topic: 'account'}
let orderbookNotificationTopic: NotificationTopic  = {topic: 'orderbook', market: testMarket.market}

// 500 DAI
let add500DAINotification: Notification =
{
  topic: accountNotificationTopic,
  "ts": 1584717910000,
  "data": {
    "accountId": 0,
    "totalAmount": "600000000000000000000",
    "tokenId": testBaseToken.tokenId,
    "amountLocked": "100000000000000000000"
  }
}

// 500 USDT
let add500USDTNotification: Notification =
{
  topic: accountNotificationTopic,
  "ts": 1584717910000,
  "data": {
    "accountId": 0,
    "totalAmount": "700000000",
    "tokenId": testQuoteToken.tokenId,
    "amountLocked": "200000000"
  }
}

let completeOrderbookNotification: Notification =
{
  topic: orderbookNotificationTopic,
  "ts": 1584717910000,
  "endVersion": 1,
  "data": {
    "bids": [
      [
        "0.9998",  //price
        "456781000000000",  //size
        "3015000000000",  //volume
        "4"  //count
      ]
    ],
    "asks": [
      [
        "1.0000",
        "456781000000000000",
        "301500000000000",
        "2"
      ]
    ]
  }
}

let askOnlyOrderbookNotification: Notification =
{
  topic: orderbookNotificationTopic,
  "ts": 1584717910000,
  "endVersion": 2,
  "data": {
    "bids": [
    ],
    "asks": [
      [
        "1.5",
        "456781000000000000",
        "301500000000000",
        "2"
      ]
    ]
  }
}

let bidsOnlyOrderbookNotification: Notification =
{
  topic: orderbookNotificationTopic,
  "ts": 1584717910000,
  "endVersion": 3,
  "data": {
    "bids": [
      [
        "0.1",
        "456781000000000000",
        "301500000000000",
        "2"
      ]
    ],
    "asks": [
    ]
  }
}

let emptyOrderbookNotification: Notification =
{
  topic: orderbookNotificationTopic,
  "ts": 1584717910000,
  "endVersion": 4,
  "data": {
    "bids": [
    ],
    "asks": [
    ]
  }
}

  describe('MarketState initialization', function() {
    it('initialization empty', async function() {
      let testRestClient = new RestClientStub(testConfig,false)
      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.false
    });

    it('initialization with balances', async function() {
      let testRestClient = new RestClientStub(testConfig)
      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.false
    });

    it('initialization with storageids', async function() {
      let testRestClient = new RestClientStub(testConfig, false)

      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.false
    });

    it('initialization with storageids and balance', async function() {
      let testRestClient = new RestClientStub(testConfig)

      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.true
    });

    it('late initialization with immediate storageids but late balance', async function() {
      let testRestClient = new RestClientStub(testConfig, false)

      // 50DAI
      testRestClient.setBalance(testBaseToken,'500000000000000000000','0')

      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.false

      ms.consumeNotification(add500USDTNotification);

      expect(ms.initialized).to.be.true
      
    });
  })


  describe('Strategy', function() {

    it('MarketState not initialized -> no orders', async function() {
      let testRestClient = new RestClientStub(testConfig)
      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.false
      let s = new Strategy(ms,testConfig,testRestClient)
      s.poll();
      expect(s.outgoingBuyOrder).to.be.undefined
      expect(s.outgoingSellOrder).to.be.undefined
    });

    it('empty balances - no orderbook -> no orders', async function() {
      let testRestClient = new RestClientStub(testConfig)
      
      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.true

      let s = new Strategy(ms,testConfig,testRestClient)
      s.poll();
      expect(s.outgoingBuyOrder).to.be.undefined
      expect(s.outgoingSellOrder).to.be.undefined
    });

    it('empty balances - orderbook -> no orders', async function() {
      let testRestClient = new RestClientStub(testConfig)
      
      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.true

      let s = new Strategy(ms,testConfig,testRestClient)

      ms.consumeNotification(completeOrderbookNotification);

      s.poll();
      expect(s.outgoingBuyOrder).to.be.undefined
      expect(s.outgoingSellOrder).to.be.undefined
    });

    it('orders generated with funds in base and quote token and orderbook present -> SELL & BUY', async function() {
      let testRestClient = new RestClientStub(testConfig)
      
      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      testRestClient.setBalance(testQuoteToken,'50000000','0')

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.true
      let s = new Strategy(ms,testConfig,testRestClient)
      ms.consumeNotification(completeOrderbookNotification);
      ms.consumeNotification(add500DAINotification);
      s.poll();

      expect(s.outgoingBuyOrder).to.deep.include({
        exchange: '0x0BABA1Ad5bE3a5C0a66E7ac838a129Bf948f1eA4',
        accountId: 0,
        storageId: 2,
        sellToken: { tokenId: '3', volume: '50000000' },
        buyToken: { tokenId: '5', volume: '50005000500050005000' },
        allOrNone: false,
        fillAmountBOrS: true,
        orderType: 'MAKER_ONLY',
      })

      expect(s.outgoingSellOrder).to.deep.include({
        exchange: '0x0BABA1Ad5bE3a5C0a66E7ac838a129Bf948f1eA4',
        accountId: 0,
        storageId: 4,
        sellToken: { tokenId: '5', volume: '500000000000000000000' },
        buyToken: { tokenId: '3', volume: '499950000' },
        allOrNone: false,
        fillAmountBOrS: false,
        orderType: 'MAKER_ONLY'
      })
    });

    it('buy only with maxBuyPrice hit', async function() {
      let testRestClient = new RestClientStub(testConfig)
      
      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      testRestClient.setBalance(testBaseToken,'500000000000000000000','0')
      testRestClient.setBalance(testQuoteToken,'50000000','0')

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.true
      let s = new Strategy(ms,testConfig,testRestClient)
      ms.consumeNotification(askOnlyOrderbookNotification);
      s.poll();

      expect(s.outgoingBuyOrder).to.deep.include({
        exchange: '0x0BABA1Ad5bE3a5C0a66E7ac838a129Bf948f1eA4',
        accountId: 0,
        storageId: 2,
        sellToken: { tokenId: '3', volume: '50000000' },
        buyToken: { tokenId: '5', volume: '49990001999600079984' },
        allOrNone: false,
        fillAmountBOrS: true,
        orderType: 'MAKER_ONLY',
      })

      expect(s.outgoingSellOrder).to.be.undefined
    });

    it('sell only with minSellPrice hit', async function() {
      let testRestClient = new RestClientStub(testConfig)
      
      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      testRestClient.setBalance(testBaseToken,'500000000000000000000','0')
      testRestClient.setBalance(testQuoteToken,'50000000','0')

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.true
      let s = new Strategy(ms,testConfig,testRestClient)
      ms.consumeNotification(bidsOnlyOrderbookNotification);
      s.poll();

      expect(s.outgoingBuyOrder).to.be.undefined

      expect(s.outgoingSellOrder).to.deep.include({
        exchange: '0x0BABA1Ad5bE3a5C0a66E7ac838a129Bf948f1eA4',
        accountId: 0,
        storageId: 4,
        sellToken: { tokenId: '5', volume: '500000000000000000000' },
        buyToken: { tokenId: '3', volume: '499900000' },
        allOrNone: false,
        fillAmountBOrS: false,
        orderType: 'MAKER_ONLY'
      })
    });

    it('empty orderbook notification', async function() {
      let testRestClient = new RestClientStub(testConfig)
      
      testRestClient.setStorageId(testQuoteToken.tokenId,2)
      testRestClient.setStorageId(testBaseToken.tokenId,4)

      testRestClient.setBalance(testBaseToken,'500000000000000000000','0')
      testRestClient.setBalance(testQuoteToken,'50000000','0')

      let ms = new MarketState(testMarket,testBaseToken,testQuoteToken,testConfig, testRestClient);
      let i = await ms.initialize();
      expect(i).to.be.true
      let s = new Strategy(ms,testConfig,testRestClient)
      ms.consumeNotification(emptyOrderbookNotification);
      s.poll();

      expect(s.outgoingBuyOrder).to.be.undefined

      expect(s.outgoingSellOrder).to.be.undefined
    });
  });