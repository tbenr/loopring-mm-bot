import { Config, Market, Order, OrderResult, Token } from "./types";
const clients = require('restify-clients')

export class RestClient {
    private client: any;
    private config: Config;

    constructor(config: Config) {
        this.config = config;
        this.client = clients.createJsonClient({
            url: config.restAPIBaseUrl,
            version: '~1.0'
        });
    }

    getWsKey(): Promise<string>{
        return new Promise((resolve, reject) => {
            this.client.get('/v3/ws/key',
                (err: any, req: any, res: any, obj: { key: string | PromiseLike<string>; }) => {
                    if (err) reject(err)
                    else resolve(obj.key);
                })
        })
    }

    getTokens(): Promise<Token[]> {
        return new Promise((resolve, reject) => {
            this.client.get('/api/v3/exchange/tokens',
                (err: any, req: any, res: any, obj: Token[]) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }

    getMarkets(): Promise<Market[]> {
        return new Promise((resolve, reject) => {
            this.client.get('/api/v3/exchange/markets',
                (err: any, req: any, res: any, obj: {markets: Market[]}) => {
                    if (err) reject(err)
                    else resolve(obj.markets);
                })
        })
    }

    getBalances(tokenIds: number[]) {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/user/balances?accountId=${this.config.account.accountId}&tokens=${tokenIds.join(',')}`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: any) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }

    getStorageId(rokenId: any): Promise<number> {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/storageId?accountId=${this.config.account.accountId}&sellTokenId=${rokenId}`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: { orderId: number | PromiseLike<number> }) => {
                    if (err) reject(err)
                    else resolve(obj.orderId);
                })
        })
    }

    getOpenOrders(market:Market) {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/orders?accountId=${this.config.account.accountId}&market=${market.market}&status=processing`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: any) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }

    getOrderStatus(orderHash: string) {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/orders?accountId=${this.config.account.accountId}&orderHash=${orderHash}`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: any) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }

    submitOrder(order: Order): Promise<OrderResult> {
        return new Promise((resolve, reject) => {
            this.client.post(
                {
                    path: '/api/v3/order',
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                order,
                (err: any, req: any, res: any, obj: OrderResult) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }
}