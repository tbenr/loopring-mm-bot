import BigNumber from "bignumber.js";
import { EventEmitter } from 'events';
import { MarketState } from "./marketState";
import { RestClient } from "./restClient";
import { Config, Order, OrderResult, Side } from "./types";

export declare interface Strategy {
    on(event: 'newOrderSubmitted', listener: (order: Order, side: Side, result: OrderResult) => void): this;
    on(event: string, listener: Function): this;
}

export class Strategy extends EventEmitter {
    private _marketState: MarketState
    private _restClient: RestClient
    private _config: Config

    private _outgoingSellOrder: Order | undefined
    private _outgoingSellOrderSubmitted: boolean
    private _outgoingBuyOrder: Order | undefined
    private _outgoingBuyOrderSubmitted: boolean

    constructor(marketState: MarketState, config: Config, restClient: RestClient) {
        super();

        this._marketState = marketState;
        this._config = config;
        this._restClient = restClient;

        this._outgoingSellOrderSubmitted = false;
        this._outgoingBuyOrderSubmitted = false;
    }

    get outgoingSellOrder() {
        return this._outgoingSellOrder;
    }

    get outgoingBuyOrder() {
        return this._outgoingBuyOrder;
    }

    private prepareOrder(type: Side): Order | undefined {
        let price: BigNumber;

        if (!this._marketState.initialized)
            return undefined;
    
        console.log(`preparing ${type} order`)
        switch(type) {
            case Side.Buy:
                if (!this._marketState.minAsk ||
                    !this._marketState.quoteTokenUnallocated.isAvailable) return undefined;
    
                price = BigNumber.minimum(this._marketState.minAsk.minus(this._marketState.marketMinStep), this._marketState.maxBuyPrice);
                return this._marketState.prepareNewOrder(this._marketState.quoteTokenUnallocated.value,price,type)
            
            case Side.Sell:
                if (!this._marketState.maxBid ||
                    !this._marketState.baseTokenUnallocated.isAvailable) return undefined;
                
                price = BigNumber.minimum(this._marketState.maxBid.minus(this._marketState.marketMinStep), this._marketState.minSellPrice);
                return this._marketState.prepareNewOrder(this._marketState.baseTokenUnallocated.value,price,type)
        }

        throw new Error('inconsistent state')
    }

    applyStrategy() {
        if (!this.outgoingSellOrder &&
            this._marketState.baseTokenUnallocated.isAvailable &&
            this._marketState.baseTokenUnallocated.value.isGreaterThanOrEqualTo(this._marketState.baseToken.orderAmounts.minimum)) {

            this._outgoingSellOrder = this.prepareOrder(Side.Sell)
            console.debug('prepared sell order', this.outgoingSellOrder)
        }

        if (!this._outgoingBuyOrder &&
            this._marketState.quoteTokenUnallocated.isAvailable &&
            this._marketState.quoteTokenUnallocated.value.isGreaterThanOrEqualTo(this._marketState.quoteToken.orderAmounts.minimum)) {

            this._outgoingBuyOrder = this.prepareOrder(Side.Buy)
            console.debug('prepared buy order', this._outgoingBuyOrder)
        }
    }

    submitOutgoingOrders() {
        if (this.outgoingSellOrder && !this._outgoingSellOrderSubmitted) {
            this._restClient.submitOrder(this.outgoingSellOrder)
                .then((r: OrderResult) => {
                    this.emit('newOrderSubmitted', this.outgoingSellOrder,Side.Sell,r);
                })
                .catch(e => {
                    console.error(`error submitting sell order: ${e.resultInfo}`)
                })
                .finally(() => {
                    this._outgoingSellOrder = undefined;
                    this._outgoingSellOrderSubmitted = false
                })
        }

        if (this._outgoingBuyOrder && !this._outgoingBuyOrderSubmitted) {
            this._restClient.submitOrder(this._outgoingBuyOrder)
                .then((r: OrderResult) => {
                    this.emit('newOrderSubmitted', this.outgoingSellOrder,Side.Buy,r);
                })
                .catch(e => {
                    console.error(`error submitting buy order: ${e.resultInfo}`)
                })
                .finally(() => {
                    this._outgoingBuyOrder = undefined;
                })
        }

    }

    poll() {
        this.applyStrategy()
        this.submitOutgoingOrders()
    }
}