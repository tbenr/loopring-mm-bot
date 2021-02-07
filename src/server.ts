import BigNumber from 'bignumber.js'
import moment from 'moment'
import WebSocket from 'ws'
import { MarketState } from './marketState'
import { RestClient } from './restClient'
import { Strategy } from './strategy'
import { Config, LoadableValue, Market, Token } from './types'
const config = require('../config.json') as Config

var tokens = new LoadableValue<Token[]>();
var markets= new LoadableValue<Market[]>();
var wsApiKey = new LoadableValue<string>();
var restClient: RestClient;
var wsClient: any;
var lastPoll: moment.Moment | undefined;
var initialized = false;

var marketState: MarketState;
var strategy: Strategy;


// market and tokens of the configured pair
var market= new LoadableValue<Market>();
var baseToken: any;
var quoteToken: any;

var maxBuyPrice = new BigNumber(config.maxBuyPrice);
var minSellPrice = new BigNumber(config.minSellPrice);

if (maxBuyPrice.isNaN() || minSellPrice.isNaN()) {
    console.error('maxBuyPrice and minSellPrice MUST be configured.')
    process.exit()
}

console.log(`initializing rest client (${config.restAPIBaseUrl})`)
restClient = new RestClient(config);

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

function mainpoll() {
    if (!initialized) {
        console.log('not yet initialized');

        if (wsApiKey.canBeInitialized)
            wsApiKey.initialize(async () => { return restClient.getWsKey() })
                .then(() => console.log('wsApiKey loaded'))
                .catch(err => console.error('wsApiKey initialization error:', err));

        if (tokens.canBeInitialized)
            tokens.initialize(async () => { return restClient.getTokens() })
                .then(_tokens => {
                    var pairTokens = config.pair.split('-');
                    if (pairTokens.length !== 2) throw new Error(`${config.pair} is invalid`);

                    // resolve tokenIds in pair
                    baseToken = _tokens.find(t => {
                        return t.symbol === pairTokens[0];
                    });
                    if (!baseToken) throw new Error(`${pairTokens[0]} not found in tokens`);

                    quoteToken = _tokens.find(t => {
                        return t.symbol === pairTokens[1];
                    });
                    if (!quoteToken) throw new Error(`${pairTokens[1]} not found in tokens`);

                    console.log('tokens loaded');
                })
                .catch(err => console.error('tokens initialization error:', err));

        // retrieve market config
        if (markets.canBeInitialized)
            markets.initialize(async () => { return restClient.getMarkets() })
                .then(_markets => {
                    let marketFound = _markets.find(m => { return m.market === config.pair });
                    if (marketFound === undefined) throw new Error(`${config.pair} is invalid`);

                    console.log(`current configured market: ${marketFound.market}`)
                    market.set(marketFound);

                    console.log('markets loaded');
                })
                .catch(err => {
                    console.error('error getting markets config', err);
                })
    }

    if (!initialized &&
        wsApiKey.isAvailable &&
        tokens.isAvailable &&
        markets.isAvailable) {
        
        if(!marketState) { // instantiate only at first init
            marketState = new MarketState(market.value, baseToken, quoteToken, config, restClient)
            marketState.on('baseTokenUnallocatedChanged', (bn) => console.log(`baseTokenUnallocated changed: ${bn.toString()}`))
            marketState.on('quoteTokenUnallocatedChanged', (bn) => console.log(`quoteTokenUnallocated changed: ${bn.toString()}`))
            marketState.on('maxBidChanged', (bn) => console.log(`maxBid changed: ${bn?.toString()}`))
            marketState.on('minAskChanged', (bn) => console.log(`minAsk changed: ${bn?.toString()}`))
        }

        if(!strategy) {
            strategy = new Strategy(marketState,config,restClient)
        }

        marketState.initialize();
        console.log('initialized');
        initialized = true;
    }

    // start wsclient
    if (!wsClient && initialized && marketState.initialized) {
        console.log(`connecting websocket... (${config.wsBaseUrl})`);

        wsClient = new WebSocket(`${config.wsBaseUrl}/v3/ws?wsApiKey=${wsApiKey.value}`);

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
                    wsClient.send('pong');
                    lastPoll = moment();
                    break;
                default:
                    const dataJson = JSON.parse(data);
                    if (dataJson.op === 'sub') {
                        if (dataJson.result.status === 'OK') console.log('subscription done!');
                        else throw new Error(`error subscribing to topics [${dataJson.result.error.code}]: ${dataJson.result.error.message}`)
                    } else {
                        marketState.consumeNotification(dataJson)
                    }
            }
        });
    }

    if (wsClient && initialized) {
        // check poll from ws
        if (lastPoll) {
            var d = moment().diff(lastPoll, 'seconds');
            if (d > config.reconnectWsAfterMissedPingSeconds) {
                console.warn(`last websocket ping received more than ${config.reconnectWsAfterMissedPingSeconds} ago. Reconnecting...`);
                wsClient.terminate();
                lastPoll = undefined;
                wsClient = undefined;
                wsApiKey.unset(); // refresh it before reconnect
                initialized = false;
            }
        }

        // run a poll on strategy
        strategy.poll();
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