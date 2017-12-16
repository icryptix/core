describe('KeyPair', () => {
    const catcher = {catcher: () => 0};

    it('can serialize and unserialize', (done) => {
        (async () => {
            const pair1 = await KeyPair.generate();
            const pair2 = KeyPair.unserialize(pair1.serialize());
            expect(pair1.privateKey).toEqual(pair2.privateKey);
            expect(pair1.publicKey).toEqual(pair2.publicKey);
            expect(pair1.isLocked).toEqual(pair2.isLocked);
        })().then(done, done.fail);
    });

    it('can encrypt and decrypt after locked serialization', (done) => {
        (async () => {
            const key = new Uint8Array([1, 2, 3, 4]);
            const pair1 = await KeyPair.generate();
            const privateKeyBak = PrivateKey.unserialize(pair1.privateKey.serialize());
            await pair1.lock(key);
            expect(pair1.isLocked).toBeTruthy();
            const pair2 = KeyPair.unserialize(pair1.serialize());
            expect(pair2.isLocked).toBeTruthy();
            await pair2.unlock(key);
            expect(pair2.isLocked).toBeFalsy();
            expect(privateKeyBak).toEqual(pair2.privateKey);
        })().then(done, done.fail);
    });

    it('can lock, unlock and relock', (done) => {
        (async () => {
            const key = new Uint8Array([1, 2, 3, 4]);
            const pair = await KeyPair.generate();
            const privateKeyBak = PrivateKey.unserialize(pair.privateKey.serialize());
            await pair.lock(key);
            expect(pair.isLocked).toBeTruthy();
            expect(() => pair.privateKey).toThrow();
            await pair.unlock(key);
            expect(pair.isLocked).toBeFalsy();
            const privateKeyTmp = pair.privateKey;
            expect(privateKeyTmp).toEqual(privateKeyBak);
            pair.relock();
            expect(pair.isLocked).toBeTruthy();
            expect(() => pair.privateKey).toThrow();
            expect(privateKeyTmp).not.toEqual(privateKeyBak);
        })().then(done, done.fail);
    });

    it('errors when trying to unlock with wrong key', (done) => {
        spyOn(catcher, 'catcher');
        (async () => {
            const key = new Uint8Array([1, 2, 3, 4]);
            const key2 = new Uint8Array([1, 2, 3, 3]);
            const pair1 = await KeyPair.generate();
            await pair1.lock(key);
            await pair1.unlock(key2).catch(catcher.catcher);
            expect(catcher.catcher).toHaveBeenCalled();
            expect(pair1.isLocked).toBeTruthy();
            await pair1.unlock(key);
            expect(pair1.isLocked).toBeFalsy();
        })().then(done, done.fail);
    });
});
