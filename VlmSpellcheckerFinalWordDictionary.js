import {
    stringToTokens,
    tokensToString,
    TOKEN_MASK
} from './VlmSpellcheckerTokenCodec.js';

export class VlmSpellcheckerFinalWordDictionary {

    constructor(buffer) {
        if (!(buffer instanceof ArrayBuffer)) {
            throw new Error(
                'VlmSpellcheckerFinalWordDictionary requires an ArrayBuffer'
            );
        }

        this.buffer = buffer;
        this.bytes = new Uint8Array(buffer);
        this.view = new DataView(buffer);

        let offset = 0;

        // ------------------------------------------------------------
        // Header
        // ------------------------------------------------------------

        if (this.bytes.length < 16) {
            throw new Error(
                'Dictionary file is too small'
            );
        }

        this.magic = this.view.getInt32(offset, false);
        offset += 4;

        this.type = this.view.getInt32(offset, false);
        offset += 4;

        this.wordCount = this.view.getInt32(offset, false);
        offset += 4;

        this.dataLength = this.view.getInt32(offset, false);
        offset += 4;

        if (this.magic !== 0x564C4D31) {
            throw new Error(
                'Invalid file: expected a Vlm dictionary file.'
            );
        }

        if (this.type !== 2) {
            throw new Error(
                'Unsupported dictionary version: ' +
                this.type +
                '. Expected version 2.'
            );
        }

        if (this.wordCount < 0) {
            throw new Error(
                'Invalid word count: ' +
                this.wordCount
            );
        }

        if (this.dataLength < 0) {
            throw new Error(
                'Invalid data length: ' +
                this.dataLength
            );
        }

        const lengthsByteLength =
            this.wordCount * 4;

        if (
            offset + lengthsByteLength >
            this.bytes.length
        ) {
            throw new Error(
                'Dictionary file is truncated while reading word lengths'
            );
        }

        this.lengths = new Int32Array(this.wordCount);

        for (
            let i = 0;
            i < this.wordCount;
            i++
        ) {
            const length =
                this.view.getInt32(offset, false);

            offset += 4;

            if (length <= 0) {
                throw new Error(
                    'Invalid word length at ' +
                    i +
                    ': ' +
                    length
                );
            }

            this.lengths[i] = length;
        }

        // ------------------------------------------------------------
        // Packed 6-bit occurrence scores
        //
        // 4 scores = 24 bits = 3 bytes
        // ------------------------------------------------------------

        this.occurrenceDataOffset =
            offset;

        this.occurrenceDataLength =
            VlmSpellcheckerFinalWordDictionary.packed6BitLength(
                this.wordCount
            );

        if (
            offset +
            this.occurrenceDataLength >
            this.bytes.length
        ) {
            throw new Error(
                'Dictionary file is truncated while reading occurrence scores'
            );
        }

        offset +=
            this.occurrenceDataLength;

        // ------------------------------------------------------------
        // Packed word data
        // ------------------------------------------------------------

        this.dataOffset =
            offset;

        const requiredFileLength =
            this.dataOffset +
            this.dataLength;

        if (
            requiredFileLength >
            this.bytes.length
        ) {
            throw new Error(
                'Dictionary data exceeds file size. ' +
                'Expected ' +
                requiredFileLength +
                ' bytes, got ' +
                this.bytes.length
            );
        }

        if (
            requiredFileLength !==
            this.bytes.length
        ) {
            throw new Error(
                'Dictionary file contains unexpected trailing data. ' +
                'Expected exactly ' +
                requiredFileLength +
                ' bytes, got ' +
                this.bytes.length +
                '. The dictionary may have been generated with an older format.'
            );
        }

        // ------------------------------------------------------------
        // Calculate offsets of every packed word
        // ------------------------------------------------------------

        this.offsets =
            new Int32Array(
                this.wordCount
            );

        let packedOffset = 0;

        for (
            let i = 0;
            i < this.wordCount;
            i++
        ) {
            this.offsets[i] =
                packedOffset;

            packedOffset +=
                VlmSpellcheckerFinalWordDictionary.packedLength(
                    this.lengths[i]
                );
        }

        if (
            packedOffset !==
            this.dataLength
        ) {
            throw new Error(
                'Dictionary data length mismatch. ' +
                'Expected ' +
                packedOffset +
                ', file contains ' +
                this.dataLength
            );
        }

        console.info(
            'VLMSPELLCHECKER DICTIONARY LOADED',
            {
                magic: this.magic,
                version: this.type,
                wordCount: this.wordCount,
                dataLength: this.dataLength,
                occurrenceDataLength: this.occurrenceDataLength,
                fileSize: this.bytes.length
            }
        );
    }

    // ------------------------------------------------------------
    // Loading
    // ------------------------------------------------------------

    static async load(url) {
        const response =
            await fetch(url);

        if (!response.ok) {
            throw new Error(
                'Failed to load dictionary: ' +
                response.status +
                ' ' +
                response.statusText
            );
        }

        const buffer =
            await response.arrayBuffer();

        return new VlmSpellcheckerFinalWordDictionary(
            buffer
        );
    }

    // ------------------------------------------------------------
    // Packed lengths
    // ------------------------------------------------------------

    /**
     * Number of bytes required to store tokenCount
     * 6-bit tokens.
     *
     * 4 tokens = 24 bits = 3 bytes.
     */
    static packedLength(tokenCount) {
        if (tokenCount <= 0) {
            return 0;
        }

        return Math.ceil(
            tokenCount * 6 / 8
        );
    }

    /**
     * Number of bytes required to store valueCount
     * 6-bit occurrence scores.
     *
     * 4 scores = 24 bits = 3 bytes.
     */
    static packed6BitLength(valueCount) {
        if (valueCount <= 0) {
            return 0;
        }

        return Math.ceil(
            valueCount * 6 / 8
        );
    }

    size() {
        return this.wordCount;
    }

    // ------------------------------------------------------------
    // Occurrence scores
    // ------------------------------------------------------------

    /**
     * Returns the 6-bit occurrence score.
     *
     * Range:
     *   0  = lowest occurrence
     *   63 = highest occurrence
     */
    getOccurrenceScore(index) {
        if (
            index < 0 ||
            index >= this.wordCount
        ) {
            throw new Error(
                'Word index out of range: ' +
                index
            );
        }

        const bitPosition =
            index * 6;

        const byteIndex =
            bitPosition >>> 3;

        const bitOffset =
            bitPosition & 7;

        const absoluteByteIndex =
            this.occurrenceDataOffset +
            byteIndex;

        let value =
            this.bytes[
            absoluteByteIndex
            ] >>> bitOffset;

        /*
         * A 6-bit value can cross a byte boundary.
         */
        if (bitOffset > 2) {
            value |=
                this.bytes[
                absoluteByteIndex + 1
                ] << (8 - bitOffset);
        }

        return value & TOKEN_MASK;
    }

    /**
     * Returns occurrence as a percentage from 0 to 100.
     */
    getOccurrencePercentage(index) {
        return Math.round(
            this.getOccurrenceScore(index) *
            100 /
            63
        );
    }

    // ------------------------------------------------------------
    // Packed word tokens
    // ------------------------------------------------------------

    /**
     * Reads one 6-bit token from the packed dictionary.
     *
     * Four tokens are stored in three bytes:
     *
     *   012345 012345 012345 012345
     *   ---------------------------
     *   01234501 23450123 45012345
     */
    getPackedToken(
        wordIndex,
        tokenIndex
    ) {
        if (
            wordIndex < 0 ||
            wordIndex >= this.wordCount
        ) {
            throw new Error(
                'Word index out of range: ' +
                wordIndex
            );
        }

        const length =
            this.lengths[wordIndex];

        if (
            tokenIndex < 0 ||
            tokenIndex >= length
        ) {
            throw new Error(
                'Token index out of range: ' +
                tokenIndex
            );
        }

        const packedOffset =
            this.offsets[wordIndex];

        const block =
            Math.floor(
                tokenIndex / 4
            );

        const position =
            tokenIndex % 4;

        const byteOffset =
            this.dataOffset +
            packedOffset +
            block * 3;

        const b0 =
            this.bytes[byteOffset];

        const b1 =
            position >= 1
                ? this.bytes[
                byteOffset + 1
                ]
                : 0;

        const b2 =
            position >= 2
                ? this.bytes[
                byteOffset + 2
                ]
                : 0;

        let token;

        switch (position) {

            case 0:
                token =
                    (b0 >>> 2) &
                    TOKEN_MASK;
                break;

            case 1:
                token =
                    (
                        ((b0 & 0x03) << 4) |
                        (b1 >>> 4)
                    ) &
                    TOKEN_MASK;
                break;

            case 2:
                token =
                    (
                        ((b1 & 0x0F) << 2) |
                        (b2 >>> 6)
                    ) &
                    TOKEN_MASK;
                break;

            case 3:
                token =
                    b2 &
                    TOKEN_MASK;
                break;
        }

        if (
            token >= 49 &&
            token <= 61
        ) {
            console.error(
                'VLMSPELLCHECKER INVALID TOKEN',
                {
                    wordIndex,
                    tokenIndex,
                    length,
                    token,
                    packedOffset,
                    block,
                    position,
                    byteOffset,
                    dataOffset:
                        this.dataOffset,
                    b0,
                    b1,
                    b2
                }
            );
        }

        return token;
    }

    // ------------------------------------------------------------
    // Words
    // ------------------------------------------------------------

    getWordTokens(index) {
        if (
            index < 0 ||
            index >= this.wordCount
        ) {
            throw new Error(
                'Word index out of range: ' +
                index
            );
        }

        const length =
            this.lengths[index];

        const tokens =
            new Array(length);

        for (
            let i = 0;
            i < length;
            i++
        ) {
            tokens[i] =
                this.getPackedToken(
                    index,
                    i
                );
        }

        return tokens;
    }

    getWord(index) {
        return tokensToString(
            this.getWordTokens(index)
        );
    }

    // ------------------------------------------------------------
    // Binary search
    // ------------------------------------------------------------

    compareWordToStored(
        tokens,
        index
    ) {
        const storedLength =
            this.lengths[index];

        const length =
            Math.min(
                tokens.length,
                storedLength
            );

        for (
            let i = 0;
            i < length;
            i++
        ) {
            const a =
                tokens[i];

            const b =
                this.getPackedToken(
                    index,
                    i
                );

            if (a !== b) {
                return a - b;
            }
        }

        return (
            tokens.length -
            storedLength
        );
    }

    indexOfTokens(tokens) {
        let low = 0;

        let high =
            this.wordCount - 1;

        while (low <= high) {
            const middle =
                (low + high) >>> 1;

            const comparison =
                this.compareWordToStored(
                    tokens,
                    middle
                );

            if (comparison === 0) {
                return middle;
            }

            if (comparison < 0) {
                high =
                    middle - 1;
            } else {
                low =
                    middle + 1;
            }
        }

        return -1;
    }

    indexOf(word) {
        return this.indexOfTokens(
            stringToTokens(word)
        );
    }

    contains(word) {
        return (
            this.indexOf(word) !== -1
        );
    }

    // ------------------------------------------------------------
    // Prefix search
    // ------------------------------------------------------------

    /**
     * Compares a stored word to a prefix.
     *
     * Returns:
     *
     *  -1 if the stored word sorts before prefix
     *   0 if the stored word starts with prefix
     *   1 if the stored word sorts after prefix
     */
    compareStoredWordToPrefix(
        prefix,
        index
    ) {
        const storedLength =
            this.lengths[index];

        for (
            let i = 0;
            i < prefix.length;
            i++
        ) {
            if (i >= storedLength) {
                return -1;
            }

            const storedToken =
                this.getPackedToken(
                    index,
                    i
                );

            if (
                storedToken !==
                prefix[i]
            ) {
                return (
                    storedToken -
                    prefix[i]
                );
            }
        }

        return 0;
    }

    /**
     * Finds the contiguous range of sorted
     * words that start with prefix.
     *
     * Returns:
     *
     *   [start, end]
     *
     * where end is exclusive.
     */
    getPrefixRange(prefix) {
        let low = 0;

        let high =
            this.wordCount;

        // First word that is not before prefix.
        while (low < high) {
            const middle =
                (low + high) >>> 1;

            if (
                this.compareStoredWordToPrefix(
                    prefix,
                    middle
                ) < 0
            ) {
                low =
                    middle + 1;
            } else {
                high =
                    middle;
            }
        }

        const start = low;

        // First word after the prefix range.
        low = start;

        high =
            this.wordCount;

        while (low < high) {
            const middle =
                (low + high) >>> 1;

            if (
                this.compareStoredWordToPrefix(
                    prefix,
                    middle
                ) <= 0
            ) {
                low =
                    middle + 1;
            } else {
                high =
                    middle;
            }
        }

        return [
            start,
            low
        ];
    }

    // ------------------------------------------------------------
    // Levenshtein
    // ------------------------------------------------------------

    static levenshtein(a, b) {
        if (a.length === 0) {
            return b.length;
        }

        if (b.length === 0) {
            return a.length;
        }

        if (a.length < b.length) {
            const temp = a;
            a = b;
            b = temp;
        }

        let previous =
            new Int32Array(
                b.length + 1
            );

        let current =
            new Int32Array(
                b.length + 1
            );

        for (
            let j = 0;
            j <= b.length;
            j++
        ) {
            previous[j] = j;
        }

        for (
            let i = 1;
            i <= a.length;
            i++
        ) {
            current[0] = i;

            for (
                let j = 1;
                j <= b.length;
                j++
            ) {
                const insertion =
                    current[j - 1] + 1;

                const deletion =
                    previous[j] + 1;

                const substitution =
                    previous[j - 1] +
                    (
                        a[i - 1] === b[j - 1]
                            ? 0
                            : 1
                    );

                current[j] =
                    Math.min(
                        insertion,
                        deletion,
                        substitution
                    );
            }

            const temp =
                previous;

            previous =
                current;

            current =
                temp;
        }

        return previous[
            b.length
        ];
    }

    // ------------------------------------------------------------
    // Closest word
    // ------------------------------------------------------------

    getClosest(
        word,
        prefixLength = 1
    ) {
        const tokens =
            stringToTokens(word);

        const safePrefixLength =
            Math.max(
                0,
                Math.floor(
                    prefixLength
                )
            );

        const prefix =
            tokens.slice(
                0,
                safePrefixLength
            );

        const [
            start,
            end
        ] =
            this.getPrefixRange(
                prefix
            );

        let bestIndex = -1;

        let bestDistance =
            Infinity;

        for (
            let i = start;
            i < end;
            i++
        ) {
            const lengthDifference =
                Math.abs(
                    tokens.length -
                    this.lengths[i]
                );

            if (
                lengthDifference >
                bestDistance
            ) {
                continue;
            }

            const candidate =
                this.getWordTokens(i);

            const distance =
                VlmSpellcheckerFinalWordDictionary.levenshtein(
                    tokens,
                    candidate
                );

            if (
                distance <
                bestDistance
            ) {
                bestDistance =
                    distance;

                bestIndex =
                    i;

                if (
                    bestDistance === 0
                ) {
                    break;
                }
            }
        }

        if (bestIndex === -1) {
            return null;
        }

        return {
            word:
                this.getWord(bestIndex),

            index:
                bestIndex,

            distance:
                bestDistance
        };
    }

    // ------------------------------------------------------------
    // All words within distance
    // ------------------------------------------------------------

    getAllWithinDistanceGrouped(
        word,
        maxDistance,
        prefixLength
    ) {
        const tokens =
            stringToTokens(word);

        const safePrefixLength =
            Math.max(
                0,
                Math.floor(prefixLength)
            );

        const prefix =
            tokens.slice(
                0,
                safePrefixLength
            );

        const [
            start,
            end
        ] =
            this.getPrefixRange(
                prefix
            );

        const groups =
            Array.from(
                {
                    length:
                        maxDistance + 1
                },
                () => []
            );

        for (
            let i = start;
            i < end;
            i++
        ) {
            const dictionaryLength =
                this.lengths[i];

            if (
                Math.abs(
                    tokens.length -
                    dictionaryLength
                ) >
                maxDistance
            ) {
                continue;
            }

            const candidate =
                this.getWordTokens(i);

            const distance =
                VlmSpellcheckerFinalWordDictionary.levenshtein(
                    tokens,
                    candidate
                );

            if (
                distance <=
                maxDistance
            ) {
                groups[distance].push({
                    word:
                        tokensToString(
                            candidate
                        ),

                    occurrence:
                        this.getOccurrenceScore(
                            i
                        )
                });
            }
        }

        // --------------------------------------------------------
        // Sort each distance group by occurrence.
        //
        // Distance remains the primary ordering.
        // Occurrence is only used within the same
        // distance group.
        // --------------------------------------------------------

        for (
            const group of groups
        ) {
            group.sort(
                (a, b) =>
                    b.occurrence -
                    a.occurrence
            );
        }

        return groups;
    }

    // ------------------------------------------------------------
    // Closest candidates
    // ------------------------------------------------------------

    getClosestCandidates(
        word,
        maxDistance,
        prefixLength = 1,
        minCandidates = 4,
        maxCandidates = 10
    ) {
        const groups =
            this.getAllWithinDistanceGrouped(
                word,
                maxDistance,
                prefixLength,
            );

        const candidates = [];

        let lastDistance = -1;

        /*
         * Process distance groups in order.
         *
         * Distance always has priority.
         *
         * Each group is already sorted by
         * occurrence, highest first.
         */
        for (
            let distance = 0;
            distance < groups.length;
            distance++
        ) {
            const group =
                groups[distance];

            if (
                group.length === 0
            ) {
                continue;
            }

            /*
             * Add the complete group.
             *
             * This is important because we want
             * the minimum to be satisfied by adding
             * the next distance group, rather than
             * arbitrarily cutting a distance group.
             */
            candidates.push(
                ...group
            );

            lastDistance =
                distance;

            /*
             * Stop once the minimum has been
             * reached.
             *
             * The final maximum is applied below.
             */
            if (
                candidates.length >=
                minCandidates
            ) {
                break;
            }
        }

        /*
         * Apply the maximum only after the
         * minimum has been satisfied.
         */
        const limited =
            candidates.slice(
                0,
                maxCandidates
            );

        return {
            distance:
                lastDistance,

            words:
                limited.map(
                    candidate =>
                        candidate.word
                )
        };
    }
}