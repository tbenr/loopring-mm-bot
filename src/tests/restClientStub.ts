import { IRestClient } from "../restClient";
import { Token, Market, Balance, Orders, OrderDetail, NewOrder, NewOrderResult, Config } from "../types";

export class RestClientStub implements IRestClient {

    private config: Config;
    private _respondBalancesEmpty:boolean;

    private storageIds: {[tokenId: number]: number}
    private balances: {[tokenId: number]: Balance}
    private currentOrders: {[market: string]: OrderDetail[]};

    private _submittedOrders: NewOrder[]

    constructor(config: Config, respondBalancesEmpty:boolean = true) {
        this.config = config;
        this.storageIds={};
        this.balances={};
        this.currentOrders={};

        this._submittedOrders=[];

        this._respondBalancesEmpty = respondBalancesEmpty;
    }

    get submittedOrders() {
        return this._submittedOrders
    }

    clearSubmittedOrders() {
        this._submittedOrders=[];
    }

    setStorageId(tokenId: number, storageId: number) {
        this.storageIds = { ...this.storageIds, [tokenId]: storageId };
    }

    private static EMPTY_BALANCE:Balance = {
        tokenId: 0,
        total: "0",
        locked: "0",
        pending: {
            deposit: "0",
            withdraw: "0"
        }
    }

    setBalance(token: Token,
        total: string,
        locked: string,
        pendingDeposit: string = '0',
        pendingWothdraw: string = '0') {

        this.balances = {
            ...this.balances,
            [token.tokenId]: {
                tokenId: token.tokenId,
                total: total,
                locked: locked,
                pending: {
                    deposit: pendingDeposit,
                    withdraw: pendingWothdraw
                }
            }
        };
    }

    getWsKey(): Promise<string> {
        throw new Error("Method not implemented.");
    }

    getTokens(): Promise<Token[]> {
        throw new Error("Method not implemented.");
    }

    getMarkets(): Promise<Market[]> {
        throw new Error("Method not implemented.");
    }

    getBalances(tokenIds: number[]): Promise<Balance[]> {
        let filteredBalances:Balance[] = [];
        tokenIds.forEach(tokenId => {
            if(this.balances[tokenId]) filteredBalances.push(this.balances[tokenId])
            else if(this._respondBalancesEmpty) filteredBalances.push({...RestClientStub.EMPTY_BALANCE,tokenId: tokenId})
        });
        return Promise.resolve(filteredBalances)
    }

    getStorageId(tokenId: number): Promise<number> {
        let storageId = this.storageIds[tokenId]
        return Promise.resolve(storageId)
    }
    
    getOpenOrders(market: Market): Promise<Orders> {
        let orders = this.currentOrders[market.market]
        let ordersDetails:Orders =
        {
            totalNum: orders ? orders.length : 0,
            orders: orders ? orders : []
        }
        return Promise.resolve(ordersDetails)
    }

    getOrderStatus(orderHash: string): Promise<OrderDetail> {
        throw new Error("Method not implemented.");
    }

    submitOrder(order: NewOrder): Promise<NewOrderResult> {
        this._submittedOrders.push(order);

        let storageIdToken = Number(order.buyToken.tokenId)
        let storageId = this.storageIds[storageIdToken]

        this.setStorageId(storageIdToken,storageId + 2)

        console.log('resclientstub order submitted')

        return Promise.resolve({hash: 'hash', clientOrderId: String(order.storageId) ,status: 'processing', isIdempotent: false})
    }
}