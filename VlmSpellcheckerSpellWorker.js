import {
    VlmSpellcheckerLanguageModel
} from './VlmSpellcheckerLanguageModel.js';

let loadedUrl = null;
let modelPromise = null;

function getModel(dictionaryUrl) {
    if (!modelPromise || loadedUrl !== dictionaryUrl) {
        loadedUrl = dictionaryUrl;
        modelPromise = VlmSpellcheckerLanguageModel.load(dictionaryUrl);
    }
    return modelPromise;
}

self.addEventListener(
    'message',
    async ({
        data
    }) => {
        const {
            id,
            words,
            maxDistance,
            minCandidates,
            maxCandidates,
            dictionaryUrl
        } = data;
        try {
            const model =
                await getModel(
                    dictionaryUrl
                );
            const results = [];
            for (const word of words) {
                try {
                    const result = model.checkWord(
                        word,
                        maxDistance,
                        minCandidates,
                        maxCandidates
                    );
                    results.push([
                        word,
                        result
                    ]);
                } catch (error) {
                    console.error(
                        'VLMSPELLCHECKER WORD FAILED', {
                        word,
                        error: error?.message,
                        stack: error?.stack
                    }
                    );
                    throw error;
                }
            }
            self.postMessage({
                id,
                results
            });
        } catch (error) {
            console.error(
                'VLMSPELLCHECKER WORKER FAILED',
                error
            );
            console.error(
                'VLMSPELLCHECKER worker error stack:',
                error?.stack
            );
            self.postMessage({
                id,
                error: error?.stack ||
                    error?.message ||
                    String(error)
            });
        }
    }
);
