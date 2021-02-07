import BigNumber from "bignumber.js";
import { EventEmitter } from 'events';
import moment from "moment";
import { RestClient } from "./restClient";
import { Config, LoadableValue, Market, Notification, Order, OrderBook, Side, Token } from "./types";
import { signOrder } from './sign/exchange'

export declare interface MarketState {
    on(event: 'maxBidChanged', listener: (maxBid: BigNumber | undefined) => void): this;
    on(event: 'minAskChanged', listener: (minAsk: BigNumber | undefined) => void): this;
    on(event: 'baseTokenUnallocatedChanged', listener: (unallocated: BigNumber) => void): this;
    on(event: 'quoteTokenUnallocatedChanged', listener: (unallocated: BigNumber) => void): this;
    on(event: string, listener: Function): this;
}

export class MarketState extends EventEmitter {
    private _restClient: RestClient;
    private _market: Market;
    private _orderBook: OrderBook | undefined;
    private _lastOrderBookVersion: number | undefined;
    private _maxBid: BigNumber | undefined;
    private _minAsk: BigNumber | undefined;
    private _openOrders: any;

    private _config: Config;

    private baseTokenUnit: BigNumber;
    private quoteTokenUnit: BigNumber;

    private _initialized: boolean;

    public baseTokenUnallocated: LoadableValue<BigNumber>;
    public quoteTokenUnallocated: LoadableValue<BigNumber>;
    public nextStorageIdbaseToken: LoadableValue<number>;
    public nextStorageIdquoteToken: LoadableValue<number>;

    readonly marketMinStep: BigNumber
    readonly maxBuyPrice: BigNumber;
    readonly minSellPrice: BigNumber;
    readonly baseToken: Token;
    readonly quoteToken: Token;

    constructor(market: Market, baseToken: Token, quoteToken: Token, config: Config, restClient: RestClient) {
        super();
        this._config = config;

        this._restClient = restClient;
        this._market = market;
        this.maxBuyPrice = new BigNumber(config.maxBuyPrice);
        this.minSellPrice = new BigNumber(config.minSellPrice);
        this.baseTokenUnallocated = new LoadableValue<BigNumber>();
        this.quoteTokenUnallocated = new LoadableValue<BigNumber>();
        this.nextStorageIdbaseToken = new LoadableValue<number>();
        this.nextStorageIdquoteToken = new LoadableValue<number>();

        this.baseToken = baseToken;
        this.quoteToken = quoteToken;

        this.baseTokenUnit = new BigNumber(10).exponentiatedBy(baseToken.decimals)
        this.quoteTokenUnit = new BigNumber(10).exponentiatedBy(quoteToken.decimals)

        this.marketMinStep = new BigNumber(10).pow(-this.market.precisionForPrice);

        this._initialized = false;

        if (this.maxBuyPrice.isNaN() || this.minSellPrice.isNaN()) {
            console.error('maxBuyPrice and minSellPrice MUST be configured.')
            process.exit()
        }
    }

    get market(): Market {
        return this._market
    }

    get orderBook(): OrderBook | undefined {
        return this._orderBook;
    }

    get minAsk(): BigNumber | undefined {
        return this._minAsk;
    }

    get maxBid(): BigNumber | undefined {
        return this._maxBid;
    }

    updateOrderBook(orderbook: OrderBook | undefined, version?: number) {
        if (orderbook && (!this._lastOrderBookVersion || !version || version > this._lastOrderBookVersion)) {
            this._orderBook = orderbook;

            let __maxBid: string | undefined = undefined;
            let __minAsk: string | undefined = undefined;
            if (orderbook.bids.length > 0) __maxBid = orderbook.bids[0][0]
            if (orderbook.asks.length > 0) __minAsk = orderbook.asks[0][0]

            if ((__maxBid && this._maxBid && !this._maxBid.isEqualTo(__maxBid)) ||
                (!__maxBid && this._maxBid) ||
                (__maxBid && !this._maxBid)) {
                this._maxBid = __maxBid !== undefined ? new BigNumber(__maxBid) : undefined
                this.emit('maxBidChanged', __maxBid);
            }

            if ((__minAsk && this._minAsk && !this._minAsk.isEqualTo(__minAsk)) ||
                (!__minAsk && this._minAsk) ||
                (__minAsk && !this._minAsk)) {
                this._minAsk = __minAsk !== undefined ? new BigNumber(__minAsk) : undefined
                this.emit('minAskChanged', __minAsk);
            }
        }
    }

    get openOrders(): any {
        return this._openOrders;
    }

    set openOrders(oo: any) {
        this._openOrders = oo;
    }

    updateUnallocatedBalance(tokenId: number, total: BigNumber.Value, locked: BigNumber.Value) {
        const unallocated = new BigNumber(total).minus(locked);
        if (tokenId === this.baseToken.tokenId) {
            this.baseTokenUnallocated.set(unallocated)
            this.emit('baseTokenUnallocatedChanged', unallocated);
        } else if (tokenId === this.quoteToken.tokenId) {
            this.quoteTokenUnallocated.set(unallocated)
            this.emit('quoteTokenUnallocatedChanged', unallocated);
        }
    }

    updateStorageId(tokenId: number, storageData: any) {
        if (storageData?.orderId) {
            if (tokenId === this.baseToken.tokenId)
                this.nextStorageIdbaseToken.set(storageData.orderId)
            else if (tokenId === this.quoteToken.tokenId)
                this.nextStorageIdquoteToken.set(storageData.orderId)
            console.log(`nextStorageId for ${tokenId} updated (${storageData.orderId})`)
        } else {
            if (tokenId === this.baseToken.tokenId) {
                this.nextStorageIdbaseToken.unset()
            } else if (tokenId === this.quoteToken.tokenId) {
                this.nextStorageIdquoteToken.unset()
            }
        }
    }

    getCounterpartAmount(amount: BigNumber, price: BigNumber, type: Side): string {
        if (type === Side.Buy) {
            let p = amount.dividedBy(this.quoteTokenUnit);
            let t = p.dividedBy(price);
            let r = t.multipliedBy(this.baseTokenUnit).toFixed(0);
            return r;
        } else {
            let p = amount.dividedBy(this.baseTokenUnit);
            let t = p.multipliedBy(price);
            let r = t.multipliedBy(this.quoteTokenUnit).toFixed(0);
            return r;
        }
    }

    initializeTESTING(baseStorageTokenId?:number, quoteStorageTokenId?:number) {
        this._initialized = true;
        if(baseStorageTokenId) this.nextStorageIdbaseToken.set(baseStorageTokenId);
        if(quoteStorageTokenId) this.nextStorageIdquoteToken.set(quoteStorageTokenId);
    }

    initialize() {
        this._initialized = false;
        this.updateBaseTokenStorageId()
        this.updateQuoteTokenStorageId()
        this.updateBalances()
        this.updateOpenOrders()
    }

    updateBaseTokenStorageId() {
        this.nextStorageIdbaseToken.update(async () => {
            return this._restClient.getStorageId(this.baseToken.tokenId)
        }).then(s => { console.log(`baseToken StorageId updated (${s})`) })
    }

    updateQuoteTokenStorageId() {
        this.nextStorageIdquoteToken.update(async () => {
            return this._restClient.getStorageId(this.quoteToken.tokenId)
        }).then(s => { console.log(`quoteToken StorageId updated (${s})`) })
    }

    updateBalances() {
        this._restClient.getBalances([this.baseToken.tokenId, this.quoteToken.tokenId])
            .then((obj: any) => {
                obj.forEach((bal: { tokenId: any; total: any; locked: any }) => {
                    this.updateUnallocatedBalance(bal.tokenId, bal.total, bal.locked)
                });
            })
            .catch(err => {
                console.error('error updating balances', err);
                this.quoteTokenUnallocated.unset();
                this.baseTokenUnallocated.unset();
            })
    }

    updateOpenOrders() {
        this._restClient.getOpenOrders(this.market)
            .then((obj: any) => {
                this.openOrders = obj.orders;
                console.log(`openOrders loaded (${this.openOrders.length})`);
            })
            .catch(err => {
                console.error('error getting open orders', err);
                this.openOrders = undefined;
            })
    }

    consumeNotification(notification: Notification) {
        var topic = notification.topic.topic;
        var data = notification.data;
    
        switch (topic) {
            case 'account':
                this.updateUnallocatedBalance(data.tokenId, data.totalAmount, data.amountLocked)
                break;
            case 'orderbook':
                if(this.market.market === notification.topic.market)
                    this.updateOrderBook(data,notification.endVersion);
    
                break;
        }
    }

    prepareNewOrder(amount: BigNumber, price: BigNumber, type: Side) {
        let storageId: number;

        storageId = type === Side.Buy ? this.nextStorageIdquoteToken.value : this.nextStorageIdbaseToken.value;

        return this.prepareOrder(storageId,amount,price,type);
    }

    prepareUpdateOrder(storageId: number, amount: BigNumber, price: BigNumber, type: Side) {
        // TODO
        return this.prepareOrder(storageId,amount,price,type);
    }
    
    private prepareOrder(storageId: number, amount: BigNumber, price: BigNumber, type: Side): Order | undefined {
        let sellTokenId: string;
        let sellTokenVolume: string;
        let buyTokenId: string;
        let buyTokenVolume: string;
    
        switch(type) {
            case Side.Buy:
                buyTokenId = String(this.baseToken.tokenId);
                sellTokenId = String(this.quoteToken.tokenId);
                if(amount.isGreaterThan(this.quoteTokenUnallocated.value)) {
                    console.error('trying to use more than avaibable amount')
                    return undefined;
                }
                sellTokenVolume = this.quoteTokenUnallocated.value.toFixed();
                buyTokenVolume = this.getCounterpartAmount(amount,price, type)
                break;

            case Side.Sell:
                buyTokenId = String(this.quoteToken.tokenId);
                sellTokenId = String(this.baseToken.tokenId);
                if(amount.isGreaterThan(this.baseTokenUnallocated.value)) {
                    console.error('trying to use more than avaibable amount')
                    return undefined;
                }
                sellTokenVolume = this.baseTokenUnallocated.value.toFixed();
                buyTokenVolume = this.getCounterpartAmount(amount, price, type)
                break;
            
                default:
                    throw new Error('inconsistent state')
        }
    
        let order: Order = {
            "exchange": this._config.account.exchangeAddress,
            "accountId": this._config.account.accountId,
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
            "fillAmountBOrS": type === Side.Buy,
            "validUntil": moment().add(2, 'month').utc().unix(),
            "maxFeeBips": 50,
            "orderType": "MAKER_ONLY"
        }
    
    
        return signOrder(order,
            {
                secretKey: this._config.account.privateKey,
                publicKeyX: this._config.account.publicKeyX,
                publicKeyY: this._config.account.publicKeyY
            });
    }

    get initialized(): boolean {
        if (this._initialized) return true;

        if (this.nextStorageIdbaseToken.isAvailable &&
            this.nextStorageIdbaseToken.isAvailable &&
            this.baseTokenUnallocated.isAvailable &&
            this.quoteTokenUnallocated.isAvailable) {

            this._initialized = true
            return true
        }

        return false;
    }
}