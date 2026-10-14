import {
    VlmSpellcheckerFinalWordDictionary
} from './VlmSpellcheckerFinalWordDictionary.js';


export class VlmSpellcheckerLanguageModel {

    constructor(dictionary) {
        this.dictionary = dictionary;

        this.distanceCache = new Map();
        this.resultCache = new Map();

        this.maxCacheEntries = 50000;
    }


    static async load(
        dictionaryUrl = './dictionary.vlm'
    ) {
        console.log(
            'VlmSpellcheckerLanguageModel.load called:',
            dictionaryUrl
        );

        const dictionary =
            await VlmSpellcheckerFinalWordDictionary.load(
                dictionaryUrl + '?v=2'
            );

        console.log(
            'VlmSpellcheckerLanguageModel.load returned'
        );

        return new VlmSpellcheckerLanguageModel(
            dictionary
        );
    }


    contains(word) {
        return this.dictionary.contains(word);
    }


    getClosest(word) {
        return this.dictionary.getClosest(word);
    }


    getAllWithinDistanceGrouped(
        word,
        maxDistance
    ) {
        const key = `${word}\u0000${maxDistance}`;

        const cached = this.distanceCache.get(key);

        if (cached !== undefined) {
            console.log('Return from cashed!');
            console.log(key);
            console.log(cached);
            return cached;
        }

        const result =
            this.dictionary.getAllWithinDistanceGrouped(
                word,
                maxDistance
            );

        if (
            this.distanceCache.size >=
            this.maxCacheEntries
        ) {
            const oldestKey =
                this.distanceCache.keys().next().value;

            this.distanceCache.delete(oldestKey);
        }

        this.distanceCache.set(key, result);

        return result;
    }


    getClosestCandidates(
        word,
        maxDistance = 2,
        minCandidates = 4,
        maxCandidates = 10
    ) {
        const groups =
            this.getAllWithinDistanceGrouped(
                word,
                maxDistance
            );

        const candidates = [];
        let lastDistance = -1;

        for (
            let distance = 0;
            distance < groups.length;
            distance++
        ) {
            const group = groups[distance];

            if (group.length === 0) {
                continue;
            }

            candidates.push(...group);
            lastDistance = distance;

            if (candidates.length >= minCandidates) {
                break;
            }
        }

        const limited = candidates.slice(0, maxCandidates);

        return {
            distance: lastDistance,
            words: limited.map(
                candidate =>
                    typeof candidate === 'object' &&
                        candidate !== null
                        ? candidate.word
                        : candidate
            )
        };
    }

    checkWord(
        word,
        maxDistance = 2,
        minCandidates = 4,
        maxCandidates = 10
    ) {
        const key =
            `${word}\u0000${maxDistance}\u0000${minCandidates}\u0000${maxCandidates}`;

        const cached =
            this.resultCache.get(key);

        if (cached !== undefined) {
            return cached;
        }

        const index =
            this.dictionary.indexOf(word);

        let result;

        if (index !== -1) {
            const occurrence =
                this.dictionary.getOccurrencePercentage(index);

            const occurrenceScore =
                this.dictionary.getOccurrenceScore(index);

            if (occurrence > 2) {
                result = {
                    word,
                    recognised: true,
                    occurrence,
                    occurrenceScore,
                    distance: 0,
                    corrections: []
                };
            } else {
                const candidates =
                    this.getClosestCandidates(
                        word,
                        maxDistance,
                        minCandidates,
                        maxCandidates
                    );

                result = {
                    word,
                    recognised: true,
                    occurrence,
                    occurrenceScore,
                    distance: candidates.distance,
                    corrections: candidates.words.filter(
                        candidate => candidate !== word
                    )
                };
            }
        } else {
            const candidates =
                this.getClosestCandidates(
                    word,
                    maxDistance,
                    minCandidates,
                    maxCandidates
                );

            result = {
                word,
                recognised: false,
                occurrence: 0,
                occurrenceScore: 0,
                distance: candidates.distance,
                corrections: candidates.words
            };
        }

        // Evict the oldest entry when the cache is full.
        if (
            this.resultCache.size >=
            this.maxCacheEntries
        ) {
            const oldestKey =
                this.resultCache.keys().next().value;

            this.resultCache.delete(oldestKey);
        }

        this.resultCache.set(key, result);

        return result;
    }

    getOccurrence(word) {
        const index = this.dictionary.indexOf(word);

        if (index === -1) {
            return 0;
        }

        return this.dictionary.getOccurrencePercentage(
            index
        );
    }
}