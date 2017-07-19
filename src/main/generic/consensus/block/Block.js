class Block {
    /**
     * @param {BlockHeader} header
     * @param {BlockInterlink} interlink
     * @param {BlockBody} body
     */
    constructor(header, interlink, body) {
        if (!(header instanceof BlockHeader)) throw 'Malformed header';
        if (!(interlink instanceof BlockInterlink)) throw 'Malformed interlink';
        if (!(body instanceof BlockBody)) throw 'Malformed body';
        /** @type {BlockHeader} */
        this._header = header;
        /** @type {BlockInterlink} */
        this._interlink = interlink;
        /** @type {BlockBody} */
        this._body = body;
    }

    /**
     * @param {SerialBuffer} buf
     * @returns {Block}
     */
    static unserialize(buf) {
        const header = BlockHeader.unserialize(buf);
        const interlink = BlockInterlink.unserialize(buf);
        const body = BlockBody.unserialize(buf);
        return new Block(header, interlink, body);
    }

    /**
     * @param {SerialBuffer} [buf]
     * @returns {SerialBuffer}
     */
    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        this._header.serialize(buf);
        this._interlink.serialize(buf);
        this._body.serialize(buf);
        return buf;
    }

    /** @type {number} */
    get serializedSize() {
        return this._header.serializedSize
            + this._interlink.serializedSize
            + this._body.serializedSize;
    }

    /**
     * @returns {Promise.<boolean>}
     */
    async verify() {
        // Check that the maximum block size is not exceeded.
        if (this.serializedSize > Policy.BLOCK_SIZE_MAX) {
            Log.w(Block, 'Invalid block - max block size exceeded');
            return false;
        }

        const senderPubKeys = {};
        for (const tx of this._body.transactions) {
            // Check that there is only one transaction per sender.
            if (senderPubKeys[tx.senderPubKey]) {
                Log.w(Block, 'Invalid block - more than one transaction per sender');
                return false;
            }
            senderPubKeys[tx.senderPubKey] = true;

            // Check that there are no transactions to oneself.
            const txSenderAddr = await tx.getSenderAddr(); // eslint-disable-line no-await-in-loop
            if (tx.recipientAddr.equals(txSenderAddr)) {
                Log.w(Block, 'Invalid block - sender and recipient coincide');
                return false;
            }
        }

        // Check that the headerHash matches the difficulty.
        if (!(await this._header.verifyProofOfWork())) {
            Log.w(Block, 'Invalid block - PoW verification failed');
            return false;
        }

        // Check that bodyHash given in the header matches the actual bodyHash.
        const bodyHash = await this._body.hash();
        if (!this._header.bodyHash.equals(bodyHash)) {
            Log.w(Block, 'Invalid block - body hash mismatch');
            return false;
        }

        // Check that the interlinkHash given in the header matches the actual interlinkHash.
        const interlinkHash = await this._interlink.hash();
        if (!this._header.interlinkHash.equals(interlinkHash)) {
            Log.w(Block, 'Invalid block - interlink hash mismatch');
            return false;
        }

        // Check that all transaction signatures are valid.
        for (const tx of this._body.transactions) {
            if (!(await tx.verifySignature())) { // eslint-disable-line no-await-in-loop
                Log.w(Blockchain, 'Invalid block - invalid transaction signature');
                return false;
            }
        }

        // Everything checks out.
        return true;
    }

    /**
     * @param {Block} prevBlock
     * @returns {Promise.<boolean>}
     */
    async isSuccessorOf(prevBlock) {
        // Check that the height is one higher than previous
        if (this._header.height !== prevBlock.header.height + 1) {
            return false;
        }

        // Check that the timestamp is greater or equal to the previous block's timestamp.
        if (this._header.timestamp < prevBlock.header.timestamp) {
            return false;
        }

        // Check that the hash of the previous block equals prevHash.
        const prevHash = await prevBlock.hash();
        if (!this._header.prevHash.equals(prevHash)) {
            return false;
        }

        // Check that the interlink hash is correct.
        const interlinkHash = await prevBlock.nextInterlink(this.target).hash();
        if (!this._header.interlinkHash.equals(interlinkHash)) {
            return false;
        }

        // Everything checks out.
        return true;
    }

    /**
     * The 'InterlinkUpdate' algorithm from the PoPoW paper adapted for dynamic difficulty.
     * @param {number} nextTarget
     * @returns {Promise.<BlockInterlink>}
     */
    async nextInterlink(nextTarget) {
        // Compute how much harder the block hash is than the next target.
        const hash = await this.hash();
        const nextTargetHeight = BlockUtils.getTargetHeight(nextTarget);
        let i = 1, depth = 0;
        while (BlockUtils.isProofOfWork(hash, Math.pow(2, nextTargetHeight - i))) {
            depth = i;
            i++;
        }

        // If the block hash is not hard enough and the target height didn't change, the interlink doesn't change.
        const targetHeight = BlockUtils.getTargetHeight(this.target);
        if (depth === 0 && targetHeight === nextTargetHeight) {
            return this.interlink;
        }

        // The interlink changes, start constructing a new one.
        /** @type {Array.<Hash>} */
        const hashes = [Block.GENESIS.HASH];

        // Push the current block hash up to depth times onto the new interlink. If depth == 0, it won't be pushed.
        for (let i = 0; i < depth; i++) {
            hashes.push(hash);
        }

        // Push the remaining hashes from the current interlink. If the target height decreases (i.e. the difficulty
        // increases), we omit the block(s) at the beginning of the current interlink as they are not eligible for
        // inclusion anymore.
        const offset = targetHeight - nextTargetHeight;
        for (let j = depth + offset + 1; j < this.interlink.length; j++) {
            hashes.push(this.interlink.hashes[j]);
        }

        return new BlockInterlink(hashes);
    }

    /**
     * @param {Block|*} o
     * @returns {boolean}
     */
    equals(o) {
        return o instanceof Block
            && this._header.equals(o._header)
            && this._interlink.equals(o._interlink)
            && this._body.equals(o._body);
    }

    /**
     * @type {BlockHeader}
     */
    get header() {
        return this._header;
    }

    /**
     * @type {BlockInterlink}
     */
    get interlink() {
        return this._interlink;
    }

    /**
     * @type {BlockBody}
     */
    get body() {
        return this._body;
    }

    /**
     * @type {Hash}
     */
    get prevHash() {
        return this._header.prevHash;
    }

    /**
     * @type {Hash}
     */
    get bodyHash() {
        return this._header.bodyHash;
    }

    /**
     * @type {Hash}
     */
    get accountsHash() {
        return this._header.accountsHash;
    }

    /**
     * @type {number}
     */
    get nBits() {
        return this._header.nBits;
    }

    /**
     * @type {number}
     */
    get target() {
        return this._header.target;
    }

    /**
     * @type {number}
     */
    get difficulty() {
        return this._header.difficulty;
    }

    /**
     * @type {number}
     */
    get height() {
        return this._header.height;
    }
    
    /**
     * @type {number}
     */
    get timestamp() {
        return this._header.timestamp;
    }

    /**
     * @type {number}
     */
    get nonce() {
        return this._header.nonce;
    }

    /**
     * @type {Address}
     */
    get minerAddr() {
        return this._body.minerAddr;
    }

    /**
     * @type {Array.<Transaction>}
     */
    get transactions() {
        return this._body.transactions;
    }

    /**
     * @type {number}
     */
    get transactionCount() {
        return this._body.transactionCount;
    }

    /**
     * @returns {Promise.<Hash>}
     */
    hash() {
        return this._header.hash();
    }
}
Class.register(Block);

/* Genesis Block */
Block.GENESIS = new Block(
    new BlockHeader(
        new Hash(null),
        new Hash(BufferUtils.fromBase64('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=')),
        new Hash(BufferUtils.fromBase64('Xmju8G32zjPl4m6U/ULB3Nyozs2BkVgX2k9fy5/HeEg=')),
        new Hash(BufferUtils.fromBase64('3OXA29ZLjMiwzb52dseSuRH4Reha9lAh4qfPLm6SF28=')),
        BlockUtils.difficultyToCompact(1),
        1,
        0,
        38760),
    new BlockInterlink([]),
    new BlockBody(new Address(BufferUtils.fromBase64('kekkD0FSI5gu3DRVMmMHEOlKf1I')), [])
);
// Store hash for synchronous access
Block.GENESIS.HASH = Hash.fromBase64('5eKwilmaRc8xCO79IXIFLPuuNOvfQ04BLMNenkhYfs0=');
