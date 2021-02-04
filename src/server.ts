import { Config, Order } from './types'
import WebSocket from 'ws'
import BigNumber from 'bignumber.js'
import moment, { min } from 'moment'
const clients = require('restify-clients')
const config = require('../config.json') as Config
const exchange = require('./sign/exchange.js')

var tokens: any;
var markets: any;
var wsApiKey: string | undefined;
var wsClient: any;
var lastPoll: moment.Moment | undefined;
var initialized = false;
var marketMinStep: BigNumber

// market and tokens of the configured pair
var market: any;
var baseToken: any;
var quoteToken: any;
var baseTokenUnallocated: BigNumber | 'loading' | undefined;
var quoteTokenUnallocated: BigNumber | 'loading' | undefined;
var openOrders: any;
var maxBid: BigNumber | undefined;
var minAsk: BigNumber | undefined;
var nextStorageIdbaseToken: number | 'loading' | undefined;
var nextStorageIdquoteToken: number | 'loading' | undefined;

var maxBuyPrice = new BigNumber(config.maxBuyPrice);
var minSellPrice = new BigNumber(config.minSellPrice);

if(maxBuyPrice.isNaN() || minSellPrice.isNaN()) {
    console.error('maxBuyPrice and minSellPrice MUST be configured.')
    process.exit()
}

var outgoingSellOrder: Order | undefined
var outgoingBuyrder: Order | undefined

console.log(`initializing rest client (${config.restAPIBaseUrl})`)
var client = clients.createJsonClient({
    url: config.restAPIBaseUrl,
    version: '~1.0'
});

var sub = {
    "op": "sub",
    "sequence": 10000,
    "apiKey": config.account.apiKey,
    "unsubscribeAll": true,
    "topics": [
        {
            "topic": "account"
        },
        {
            "topic": "orderbook",
            "market": config.pair,
            "level": 0,
            "snapshot": true,
            "count": 2
        }
    ]
}


function getWsKey() {
    return new Promise((resolve, reject) => {
        client.get('/v3/ws/key',
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}

function getTokens() {
    return new Promise((resolve, reject) => {
        client.get('/api/v3/exchange/tokens',
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}

function getMarkets() {
    return new Promise((resolve, reject) => {
        client.get('/api/v3/exchange/markets',
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}

function getBalances() {
    return new Promise((resolve, reject) => {
        client.get(
            {
                path: `/api/v3/user/balances?accountId=${config.account.accountId}&tokens=${baseToken.tokenId},${quoteToken.tokenId}`,
                headers: { 'X-API-KEY': config.account.apiKey }
            },
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}

function getStorageId(rokenId: any) {
    return new Promise((resolve, reject) => {
        client.get(
            {
                path: `/api/v3/storageId?accountId=${config.account.accountId}&sellTokenId=${rokenId}`,
                headers: { 'X-API-KEY': config.account.apiKey }
            },
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}

function getOpenOrders() {
    return new Promise((resolve, reject) => {
        client.get(
            {
                path: `/api/v3/orders?accountId=${config.account.accountId}&market=${market.market}&status=processing`,
                headers: { 'X-API-KEY': config.account.apiKey }
            },
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}


function getOrderStatus(orderHash: string) {
    return new Promise((resolve, reject) => {
        client.get(
            {
                path: `/api/v3/orders?accountId=${config.account.accountId}&orderHash=${orderHash}`,
                headers: { 'X-API-KEY': config.account.apiKey }
            },
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}

async function updateStorageId(tokenId: number) {
    try {
        const obj:any = await getStorageId(tokenId)
        if (tokenId === baseToken.tokenId)
            nextStorageIdbaseToken = obj.orderId
        else if (tokenId === quoteToken.tokenId)
            nextStorageIdquoteToken = obj.orderId
        console.log(`nextStorageId for ${tokenId} updated (${obj.orderId})`)
    } catch (err) {
        console.error('error updating storageid', err)
        if (tokenId === baseToken.tokenId)
            nextStorageIdbaseToken = undefined
        else if (tokenId === quoteToken.tokenId)
            nextStorageIdquoteToken = undefined
    }
}


function getCounterpartAmount(fromToken: any, toToken: any, amount: BigNumber, price: BigNumber): BigNumber {
    let p = amount.dividedBy(10 ** fromToken.decimals);
    console.log(`from ${fromToken.symbol} amount ${p.toFixed()} (${amount.toFixed()})`)
    let t = p.multipliedBy(price);
    let r = t.multipliedBy(10 ** toToken.decimals);
    console.log(`price ${price.toFixed()}\nto ${toToken.symbol} amount ${t.toFixed()} (${r.toFixed()})`)
    return r;
}

function prepareOrder(type: 'buy' | 'sell'): Order | undefined {
    let storageId: number;
    let sellTokenId: string;
    let sellTokenVolume: string;
    let buyTokenId: string;
    let buyTokenVolume: string;
    let price: BigNumber;


    if (typeof (nextStorageIdquoteToken) !== 'number' ||
        typeof (nextStorageIdbaseToken) !== 'number' ||
        !maxBid ||
        !minAsk ||
        typeof (quoteTokenUnallocated) !== 'object' ||
        typeof (baseTokenUnallocated) !== 'object')
        return undefined;

    console.log(`preparing ${type} order`)
    if (type === 'buy') {
        storageId = nextStorageIdquoteToken;
        buyTokenId = baseToken.tokenId;
        sellTokenId = quoteToken.tokenId;
        price = BigNumber.minimum(minAsk.minus(marketMinStep), maxBuyPrice);
        sellTokenVolume = quoteTokenUnallocated.toFixed();
        buyTokenVolume = getCounterpartAmount(quoteToken, baseToken, quoteTokenUnallocated, price).toFixed();
    } else {
        storageId = nextStorageIdbaseToken;
        buyTokenId = quoteToken.tokenId;
        sellTokenId = baseToken.tokenId;
        price = BigNumber.maximum(maxBid.plus(marketMinStep),minSellPrice);
        sellTokenVolume = baseTokenUnallocated.toFixed();
        buyTokenVolume = getCounterpartAmount(baseToken, quoteToken, baseTokenUnallocated, price).toFixed();
    }

    let order: Order = {
        "exchange": config.account.exchangeAddress,
        "accountId": config.account.accountId,
        "storageId": storageId,
        "sellToken": {
            "tokenId": sellTokenId,
            "volume": sellTokenVolume
        },
        "buyToken": {
            "tokenId": buyTokenId,
            "volume": buyTokenVolume
        },
        "allOrNone": false,
        "fillAmountBOrS": type === 'buy',
        "validUntil": moment().add(2, 'month').utc().unix(),
        "maxFeeBips": 50,
        "orderType": "MAKER_ONLY"
    }


    return exchange.signOrder(order,
        {
            secretKey: config.account.privateKey,
            publicKeyX: config.account.publicKeyX,
            publicKeyY: config.account.publicKeyY
        }, baseToken, quoteToken);
}


function submitOrder(order: Order) {
    return new Promise((resolve, reject) => {
        client.post(
            {
                path: '/api/v3/order',
                headers: { 'X-API-KEY': config.account.apiKey }
            },
            order,
            (err: any, req: any, res: any, obj: any) => {
                if (err) reject(err)
                else resolve(obj);
            })
    })
}

function updateUnallocatedBalance(tokenId: any, total: BigNumber.Value, locked: BigNumber.Value) {

    const unallocated = new BigNumber(total).minus(locked);

    if (tokenId === baseToken.tokenId) {
        baseTokenUnallocated = unallocated
    } else if (tokenId === quoteToken.tokenId) {
        quoteTokenUnallocated = unallocated
    }
    updateStorageId(tokenId)
    console.log(`unallocated changed: ${tokenId} - ${unallocated.toString()}`)
}

function consumeNotification(notification: { topic: { topic: any }; data: any }) {
    var topic = notification.topic.topic;
    var data = notification.data;

    switch (topic) {
        case 'account':
            updateUnallocatedBalance(data.tokenId, data.totalAmount, data.amountLocked)
            break;
        case 'orderbook':
            var _minBid = undefined;
            var _maxAsk = undefined
            if (data.bids.length > 0) _minBid = data.bids[0][0]
            if (data.asks.length > 0) _maxAsk = data.asks[0][0]

            if ((_minBid && maxBid && !maxBid.isEqualTo(_minBid)) ||
                (!_minBid && maxBid) ||
                (_minBid && !maxBid)) {
                maxBid = _minBid ? new BigNumber(_minBid) : _minBid
                console.log('max bid changed: ' + _minBid)
            }

            if ((_maxAsk && minAsk && !minAsk.isEqualTo(_maxAsk)) ||
                (!_maxAsk && minAsk) ||
                (_maxAsk && !minAsk)) {
                minAsk = _maxAsk ? new BigNumber(_maxAsk) : _maxAsk
                console.log('min ask changed: ' + _maxAsk)
            }

            break;
    }
}


function mainpoll() {
    if (!initialized) {
        console.log('not yet initialized');

        // retrieve wsApiKey
        if (!wsApiKey) {
            console.log('loading wsApiKey...');
            wsApiKey = 'loading';
            getWsKey()
                .then((obj: any) => {
                    wsApiKey = obj.key;
                    console.log('wsApiKey loaded');
                })
                .catch(err => {
                    console.error('error getting wsApiKey',err);
                    wsApiKey = undefined;
                })
        }

        // retrieve token config
        if (!tokens) {
            console.log('loading tokens...');
            tokens = 'loading';

            getTokens()
                .then(obj => {
                    tokens = obj;

                    var pairTokens = config.pair.split('-');
                    if (pairTokens.length !== 2) throw new Error(`${config.pair} is invalid`);

                    // resolve tokenIds in pair
                    baseToken = tokens.find(function (e: { symbol: string }) {
                        return e.symbol === pairTokens[0];
                    });
                    if (!baseToken) throw new Error(`${pairTokens[0]} not found in tokens`);

                    quoteToken = tokens.find(function (e: { symbol: string }) {
                        return e.symbol === pairTokens[1];
                    });
                    if (!quoteToken) throw new Error(`${pairTokens[1]} not found in tokens`);

                    console.log('tokens loaded');
                })
                .catch(err => {
                    console.error('erro getting tokens config',err);
                    tokens = undefined;
                })
        }

        // retrieve market config
        if (!markets) {
            console.log('loading markets...');
            markets = 'loading';

            getMarkets()
                .then((obj: any) => {
                    markets = obj.markets;

                    market = markets.find((m: { market: string }) => { return m.market === config.pair });
                    if (!market) throw new Error(`${config.pair} is invalid`);

                    marketMinStep = new BigNumber(10).pow(-market.precisionForPrice);
                    console.log('market minstep: ', marketMinStep.toFixed())

                    console.log('markets loaded');
                })
                .catch(err => {
                    console.error('error getting markets config', err);
                    markets = undefined;
                })
        }

        // retrieve initial unallocated balances
        if ((!baseTokenUnallocated || !quoteTokenUnallocated) &&
            tokens && tokens !== 'loading') {
            console.log('loading unallocated balances...');
            baseTokenUnallocated = quoteTokenUnallocated = 'loading';

            getBalances()
                .then((obj: any) => {
                    obj.forEach((bal: { tokenId: any; total: any; locked: any }) => {
                        updateUnallocatedBalance(bal.tokenId, bal.total, bal.locked)
                    });

                    console.log('unallocated balances loaded');
                    console.log('baseTokenUnallocated', baseTokenUnallocated?.toString());
                    console.log('quoteTokenUnallocated', quoteTokenUnallocated?.toString());
                })
                .catch(err => {
                    console.error('error updating balances', err);
                    quoteTokenUnallocated = baseTokenUnallocated = undefined;
                })
        }

        // retrieve initial openOrders
        if (!openOrders &&
            markets && markets !== 'loading') {
            console.log('loading openOrders...');
            openOrders = 'loading';

            getOpenOrders()
                .then((obj: any) => {
                    openOrders = obj.orders;
                    console.log(`openOrders loaded (${openOrders.length})`);
                })
                .catch(err => {
                    console.error('error getting open orders', err);
                    openOrders = undefined;
                })
        }
    }

    if (!initialized &&
        wsApiKey && wsApiKey !== 'loading' &&
        tokens && tokens !== 'loading' &&
        markets && markets !== 'loading' &&
        baseTokenUnallocated && baseTokenUnallocated !== 'loading' &&
        quoteTokenUnallocated && quoteTokenUnallocated !== 'loading' &&
        nextStorageIdquoteToken && nextStorageIdquoteToken !== 'loading' &&
        nextStorageIdbaseToken && nextStorageIdbaseToken !== 'loading') {

        console.log('initialized');
        initialized = true;
    }

    // start wsclient
    if (!wsClient && initialized) {
        console.log(`connecting websocket... (${config.wsBaseUrl})`);

        wsClient = new WebSocket(`${config.wsBaseUrl}/v3/ws?wsApiKey=${wsApiKey}`);

        wsClient.on('error', function (e: any) {
            console.error('error connecting to websocket!', e);
        });

        wsClient.on('open', function open() {
            console.log('websocket connected!');
            console.log('subscribing to topics...');
            wsClient.send(JSON.stringify(sub));
            lastPoll = moment(); // set lastPoll to now
        });

        wsClient.on('message', function incoming(data: any) {
            switch (data) {
                case 'ping':
                    console.log('ping->pong');
                    wsClient.send('pong');
                    lastPoll = moment();
                    break;
                default:
                    const dataJson = JSON.parse(data);
                    if (dataJson.op === 'sub') {
                        if (dataJson.result.status === 'OK') console.log('subscription done!');
                        else throw new Error(`error subscribing to topics [${dataJson.result.error.code}]: ${dataJson.result.error.message}`)
                    } else {
                        consumeNotification(dataJson);
                    }
            }
        });
    }

    if (initialized) {
        // check poll from ws
        if (lastPoll) {
            var d = moment().diff(lastPoll, 'seconds');
            if (d > config.reconnectWsAfterMissedPingSeconds) {
                console.warn(`last websocket ping received more than ${config.reconnectWsAfterMissedPingSeconds} ago. Reconnecting...`);
                wsClient.terminate();
                lastPoll = undefined;
                wsClient = undefined;
                wsApiKey = undefined; // refresh it before reconnect
                baseTokenUnallocated = undefined; //refresh availble deposit
                quoteTokenUnallocated = undefined; //refresh availble deposit
                initialized = false;
            }
        }

        if (!outgoingSellOrder &&
            typeof (baseTokenUnallocated) === 'object' &&
            baseTokenUnallocated.isGreaterThanOrEqualTo(baseToken.orderAmounts.minimum)) {

            outgoingSellOrder = prepareOrder('sell')
            console.debug('sell order', outgoingSellOrder)
            if(outgoingSellOrder)
                submitOrder(outgoingSellOrder)
                .then((r:any) => {
                    console.log(`sell order submitted - status: ${r.status} hash: ${r.hash}`)
                })
                .catch(e => {
                    console.error(`error submitting sell order: ${e.resultInfo}`)
                })
                .finally(()=> {
                    outgoingSellOrder = undefined;
                })
        }

        if (!outgoingBuyrder &&
            typeof (quoteTokenUnallocated) === 'object' &&
            quoteTokenUnallocated.isGreaterThanOrEqualTo(quoteToken.orderAmounts.minimum)) {

            outgoingBuyrder = prepareOrder('buy')
            console.debug('buy order', outgoingBuyrder)
            if(outgoingBuyrder)
                submitOrder(outgoingBuyrder)
                .then((r:any) => {
                    console.log(`buy order submitted - status: ${r.status} hash: ${r.hash}`)
                })
                .catch(e => {
                    console.error(`error submitting buy order: ${e.resultInfo}`)
                })
                .finally(()=> {
                    outgoingBuyrder = undefined;
                })
        }
    }
}

let pollTimer = setInterval(mainpoll, 2000);


// on close
function onclose() {
    clearInterval(pollTimer);
    wsClient.terminate();
}

process.on('beforeExit', (code) => {
    console.log('Process beforeExit event with code: ', code);
});

process.once('SIGINT', function (code) {
    console.log('SIGINT received...', code);
    onclose();
});
process.once('SIGTERM', function (code) {
    console.log('SIGTERM received...', code);
    onclose();
});