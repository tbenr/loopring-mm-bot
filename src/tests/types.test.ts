import { assert, expect } from "chai";
import { LoadableValue } from "../types";

describe('loadable value', () => {
    it('constructor undefined', () => {
        let v1 : LoadableValue<number> = new LoadableValue<number>()
        assert.throws(()=> {v1.value})
        expect(v1.isAvailable).to.be.false;
        expect(v1.canBeInitialized).to.be.true;
    });

    it('constructor with value', () => {
        let v2 : LoadableValue<number> = new LoadableValue<number>(2)
        expect(v2.isAvailable).to.be.true;
        expect(v2.value).to.equal(2);
        expect(v2.canBeInitialized).to.be.false;
    });

    it('initialize on unset', async () => {
        let v1 : LoadableValue<number> = new LoadableValue<number>()
        await v1.initialize(() => {
            expect(v1.isLoading).to.be.true;
            expect(v1.isAvailable).to.be.false;
            expect(v1.canBeInitialized).to.be.false;
            return Promise.resolve(1);
        });
        expect(v1.value).to.equal(1);
        expect(v1.isAvailable).to.be.true;
    });

    it('initialize on set', async () => {
        let v1 : LoadableValue<number> = new LoadableValue<number>(3)
        try {
            await v1.initialize(() => { return Promise.resolve(1); });
            return assert(false, 'should throw');
        } catch (e) {
            return Promise.resolve()
        }
    });

    it('update on set', async () => {
        let v1 : LoadableValue<number> = new LoadableValue<number>(3)
        expect(v1.isAvailable).to.be.true;
        let res = await v1.update(() => {
            expect(v1.canBeInitialized).to.be.false;
            expect(v1.isLoading).to.be.true;
            expect(v1.isAvailable).to.be.true;
            return Promise.resolve(1);
        });
        expect(res).to.equal(1);
        expect(v1.value).to.equal(1);
        expect(v1.isAvailable).to.be.true;
        expect(v1.isLoading).to.be.false;
    });

    it('unset', () => {
        let v1 : LoadableValue<number> = new LoadableValue<number>(3)
        v1.unset()
        expect(v1.isAvailable).to.be.false;
        expect(v1.isLoading).to.be.false;
    });

    it('set', () => {
        let v1 : LoadableValue<number> = new LoadableValue<number>(0)
        v1.set(3)
        expect(v1.value).to.equal(3);
        expect(v1.isAvailable).to.be.true;
        expect(v1.isLoading).to.be.false;
    });
});