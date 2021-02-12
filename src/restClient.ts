import { signRestURL } from "./sign/exchange";
import { Balance, Config, Market, NewOrder, OrderResult, OrderDetail, Orders, Token } from "./types";
const clients = require('restify-clients')

export interface IRestClient {
    getWsKey(): Promise<string>;
    getTokens(): Promise<Token[]>;
    getMarkets(): Promise<Market[]>;
    getBalances(tokenIds: number[]):Promise<Balance[]>;
    getStorageId(tokenId: number): Promise<number>;
    getOpenOrders(market:Market): Promise<Orders>;
    getOrderStatus(orderHash: string):Promise<OrderDetail>;
    submitOrder(order: NewOrder): Promise<OrderResult>;
    cancelOrder(orderHash:string):Promise<OrderResult>;
}

export class RestClient implements IRestClient {
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

    getBalances(tokenIds: number[]):Promise<Balance[]> {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/user/balances?accountId=${this.config.account.accountId}&tokens=${tokenIds.join(',')}`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: Balance[]) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }

    getStorageId(tokenId: number): Promise<number> {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/storageId?accountId=${this.config.account.accountId}&sellTokenId=${tokenId}`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: { orderId: number | PromiseLike<number> }) => {
                    if (err) reject(err)
                    else resolve(obj.orderId);
                })
        })
    }

    getOpenOrders(market:Market): Promise<Orders> {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/orders?accountId=${this.config.account.accountId}&market=${market.market}&status=processing`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: Orders) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }

    getOrderStatus(orderHash: string):Promise<OrderDetail> {
        return new Promise((resolve, reject) => {
            this.client.get(
                {
                    path: `/api/v3/order?accountId=${this.config.account.accountId}&orderHash=${orderHash}`,
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                (err: any, req: any, res: any, obj: OrderDetail) => {
                    if (err) reject(err)
                    else resolve(obj);
                })
        })
    }

    submitOrder(order: NewOrder): Promise<OrderResult> {
        return new Promise((resolve, reject) => {
            this.client.post(
                {
                    path: '/api/v3/order',
                    headers: { 'X-API-KEY': this.config.account.apiKey }
                },
                order,
                (err: any, req: any, res: any, obj: OrderResult) => {
                    if (err) {
                        let message;
                        if(typeof err.message === 'string') {
                            try {
                                message = JSON.parse(err.message);
                            }
                            catch(e) {
                                message = undefined;
                            }
                        }
                        reject(message?.resultInfo ? message.resultInfo : err)
                    }
                    else resolve(obj);
                })
        })
    }

    cancelOrder(orderHash:string):Promise<OrderResult> {
        return new Promise((resolve, reject) => {

            const uri = encodeURIComponent(`${this.config.restAPIBaseUrl}/api/v3/order`);

            const params = `accountId=${this.config.account.accountId}&orderHash=${orderHash}`;

            const signature = signRestURL('DELETE',uri,encodeURIComponent(params),{
                secretKey: this.config.account.privateKey,
                publicKeyX: this.config.account.publicKeyX,
                publicKeyY: this.config.account.publicKeyY
            });
            this.client.del(
                {
                    path: `/api/v3/order?${params}`,
                    headers: {
                        'X-API-KEY': this.config.account.apiKey,
                        'X-API-SIG': signature
                    }
                },
                (err: any, req: any, res: any, obj: OrderResult) => {
                    if (err) {
                        let message;
                        if(typeof err.message === 'string') {
                            try {
                                message = JSON.parse(err.message);
                            }
                            catch(e) {
                                message = undefined;
                            }
                        }
                        reject(message?.resultInfo ? message.resultInfo : err)
                    }
                    else resolve(obj);
                })
        })
    }
}