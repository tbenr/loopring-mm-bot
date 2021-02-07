
export type LoadableValueLoader<T> = () => Promise<T>;

export class LoadableValue<T> {
    private _loading:boolean;
    private _value: T | undefined = undefined

    constructor(value?: T) {
        this._loading = false;
        this._value = value;
    }

    get isLoading(): boolean {
        return this._loading
    }
    get isAvailable(): boolean {
        return this._value !== undefined
    }

    get canBeInitialized(): boolean {
        return !this._loading && this._value === undefined
    }

    set(value: T) {
        if (this._loading) {
            throw new Error('initializing or updating')
        }
        this._value = value;
    }
    unset() {
        if (this._loading) {
            throw new Error('initializing or updating')
        }
        this._value = undefined
    }

    async initialize(loader: LoadableValueLoader<T>) {
        if (this._value !== undefined) {
            return Promise.reject('is already initialized');
        }
        return this.load(loader)
    }

    async update(loader: LoadableValueLoader<T>) {
        return this.load(loader)
    }

    private async load(loader: LoadableValueLoader<T>): Promise<T> {
        if (this._loading) {
            throw new Error('already initializing or updating')
        }
        this._loading = true;
        try {
            const value = await loader();
            this._value = value;
            return Promise.resolve(value);
        } catch (e) {
            this._value = undefined
            return Promise.reject(e);
        } finally {
            this._loading = false;
        }
    }

    get value(): T {
        if (this._value === undefined) {
            throw new Error('unavailable')
        }
        return this._value
    }
}

export interface Config {
    restAPIBaseUrl: string,
    wsBaseUrl: string,
    account: {
        exchangeName: string,
        exchangeAddress: string,
        accountAddress: string,
        accountId: number,
        apiKey: string,
        publicKeyX: string,
        publicKeyY: string,
        privateKey: string
    },
    pair: string,
    maxBuyPrice: string,
    minSellPrice: string,
    "reconnectWsAfterMissedPingSeconds": number
}

export interface Order {
        exchange: string,
        accountId: number,
        storageId: number,
        sellToken: {
            tokenId: string,
            volume: string
        },
        buyToken : {
            tokenId : string,
            volume : string
        },
        allOrNone: boolean,
        fillAmountBOrS: boolean, // true => buy
        validUntil: number,
        maxFeeBips: number,
        orderType: 'LIMIT_ORDER'| 'TAKER_ONLY'| 'MAKER_ONLY'|'AMM',
        eddsaSignature?: string,
        label?: number
}

export interface Market {
    market: string,
    baseTokenId: number,
    quoteTokenId: number,
    precisionForPrice: number,
    orderbookAggLevels: number,
    enabled: boolean

}


export interface Token {
    type: string,
    tokenId: number,
    symbol: string,
    name: string,
    address: string,
    decimals: number,
    precision: number,
    orderAmounts: {
        minimum: string,
        maximum: string,
        dust: string
    },
    fastWithdrawLimit: string,
    enabled: boolean
}

/*
    "295.97",  //price
    "456781000000000",  //size
    "3015000000000",  //volume
    "4" // count
*/
export type PriceSlot = [string,string,string,string]


export interface OrderBook {
    bids: PriceSlot[],
    asks: PriceSlot[]
}

export enum Side {
    Buy = 'buy',
    Sell = 'sell'
}

export interface Notification {
    topic: {
        topic: string
        market: string
    }
    ts: number,
    startVersion: number,
    endVersion: number,
    data: any
}