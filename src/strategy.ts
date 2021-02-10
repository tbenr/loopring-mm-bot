import BigNumber from "bignumber.js";
import { EventEmitter } from 'events';
import { MarketState } from "./marketState";
import { IRestClient } from "./restClient";
import { Config, NewOrder, NewOrderResult, Side } from "./types";

export declare interface Strategy {
    on(event: 'newOrderSubmitted', listener: (order: NewOrder, side: Side, result: NewOrderResult) => void): this;
    on(event: string, listener: Function): this;
}

export class Strategy extends EventEmitter {
    private _marketState: MarketState
    private _restClient: IRestClient
    private _config: Config

    private _outgoingSellOrder: NewOrder | undefined
    private _outgoingSellOrderSubmitted: boolean
    private _outgoingBuyOrder: NewOrder | undefined
    private _outgoingBuyOrderSubmitted: boolean

    constructor(marketState: MarketState, config: Config, restClient: IRestClient) {
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

    private prepareOrder(type: Side): NewOrder | undefined {
        let price: BigNumber;

        if (!this._marketState.initialized)
            return undefined;
    
        switch(type) {
            case Side.Buy:
                if (!this._marketState.minAsk ||
                    !this._marketState.quoteTokenUnallocated.isAvailable) return undefined;
    
                price = BigNumber.minimum(this._marketState.minAsk.minus(this._marketState.marketMinStep), this._marketState.maxBuyPrice);
                return this._marketState.prepareNewOrder(this._marketState.quoteTokenUnallocated.value,price,type)
            
            case Side.Sell:
                if (!this._marketState.maxBid ||
                    !this._marketState.baseTokenUnallocated.isAvailable) return undefined;
                
                price = BigNumber.maximum(this._marketState.maxBid.plus(this._marketState.marketMinStep), this._marketState.minSellPrice);
                return this._marketState.prepareNewOrder(this._marketState.baseTokenUnallocated.value,price,type)
        }

        throw new Error('inconsistent state')
    }

    private applyStrategy() {
        if (!this._marketState.initialized)
            return undefined;

        if (!this._outgoingSellOrder &&
            this._marketState.baseTokenUnallocated.isAvailable &&
            this._marketState.baseTokenUnallocated.value.isGreaterThanOrEqualTo(this._marketState.baseToken.orderAmounts.minimum)) {

            this._outgoingSellOrder = this.prepareOrder(Side.Sell)
        }

        if (!this._outgoingBuyOrder &&
            this._marketState.quoteTokenUnallocated.isAvailable &&
            this._marketState.quoteTokenUnallocated.value.isGreaterThanOrEqualTo(this._marketState.quoteToken.orderAmounts.minimum)) {

            this._outgoingBuyOrder = this.prepareOrder(Side.Buy)
        }
    }

    private submitOutgoingOrders() {
        if (!this._marketState.initialized)
            return undefined;

        if (this.outgoingSellOrder && !this._outgoingSellOrderSubmitted) {
            this._outgoingSellOrderSubmitted = true;
            this._restClient.submitOrder(this.outgoingSellOrder)
                .then((r: NewOrderResult) => {
                    this.emit('newOrderSubmitted', this.outgoingSellOrder,Side.Sell,r);
                })
                .catch(e => {
                    console.error('error submitting sell order: ', e)
                })
                .finally(() => {
                    this._outgoingSellOrder = undefined;
                    this._outgoingSellOrderSubmitted = false
                })
        }

        if (this._outgoingBuyOrder && !this._outgoingBuyOrderSubmitted) {
            this._outgoingBuyOrderSubmitted = true;
            this._restClient.submitOrder(this._outgoingBuyOrder)
                .then((r: NewOrderResult) => {
                    this.emit('newOrderSubmitted', this.outgoingSellOrder,Side.Buy,r);
                })
                .catch(e => {
                    console.error('error submitting buy order: ', e)
                })
                .finally(() => {
                    this._outgoingBuyOrder = undefined;
                    this._outgoingBuyOrderSubmitted = false;
                })
        }

    }

    poll() {
        this.applyStrategy()
        this.submitOutgoingOrders()
    }
}