export class VlmSpellcheckerEditor {

    constructor(editor, url) {
        console.log('VlmSpellcheckerEditor.constructor Called');
        this.editor = editor;
        this.url = url;

        // location of the vlm dictionary.
        this.dictionaryUrl = editor.getParam(
            'vlmspellchecker_dictionary_url',
            './dictionary.vlm'
        );

        // Maximum edit distance. Decides how mnay groups of corrections to get.
        this.maxDistance = editor.getParam(
            'vlmspellchecker_max_distance',
            3
        );

        // When looking for 'groups' of candidates, when we reached this minimum, we don't search the next group.
        this.minCandidates = editor.getParam(
            'vlmspellchecker_suggestion_candidate_range_min',
            4
        );

        // When the total of the groups of candidates exceeds this number, we limit it.s
        this.maxCandidates = editor.getParam(
            'vlmspellchecker_suggestion_candidate_range_max',
            10
        );

        this.MARK_UNKNOWN_CLASS = 'vlmspellchecker-misspelled';
        this.MARK_UNCOMMON_CLASS = 'vlmspellchecker-uncommon';

        // Spellcheck revisions and generations.
        this.textRevision = 0;
        this.lastCheckedRevision = null;

        this.spellCheckGeneration = 0;
        this.autoCheckDelay = 450;
        this.autoCheckTimer = null;

        this.checking = false;
        this.checkAgain = false;

        this.stats = {
            modelLoaded: -1,
            total: 0,
            good: 0,
            bad: 0,
            isDirty: false
        };

        this.statusElement = null;

        // Worker state.
        this.worker = null;
        this.workerRequests = new Map();
        this.nextWorkerRequestId = 1;
        this.install();
    }

    install() {
        console.log('VlmSpellcheckerEditor.install Called');

        // TinyMCE may already be initialized when this module loads.
        if (this.editor.initialized) {
            this.initializeEditorUi();
        } else {
            this.editor.on('init', () => {
                this.initializeEditorUi();
            });

        }
        this.editor.on('input', () => this.markEdited());
        this.editor.on('Undo', () => this.markEdited());
        this.editor.on('Redo', () => this.markEdited());
    }

    initializeEditorUi() {

        if (this.statusElement) {
            return;
        }

        console.log(
            'VlmSpellcheckerEditor.initializeEditorUi Called'
        );

        const styleUnknown = this.editor.dom.create(
            'style', {
            type: 'text/css'
        },
            `.${this.MARK_UNKNOWN_CLASS} {
                border-bottom: 2px dotted #e74c3c;
            }`
        );
        this.editor.getDoc().head.appendChild(styleUnknown);

        const styleUncommon = this.editor.dom.create(
            'style', {
            type: 'text/css'
        },
            `.${this.MARK_UNCOMMON_CLASS} {
                border-bottom: 2px dotted orange;
            }`
        );
        this.editor.getDoc().head.appendChild(styleUncommon);

        const container = this.editor.getContainer();
        const status = container.ownerDocument.createElement('div');
        status.style.cssText = 'text-align:right; padding:4px 8px; font:12px sans-serif; color:#666;';
        container.insertAdjacentElement('afterend', status);
        this.statusElement = status;
        this.updateStatus();

        console.log('VlmSpellcheckerEditor UI initialized');
    }

    getContextMenuItems(element) {

        if (!element) {
            return [];
        }

        const span = element.closest(
            `.${this.MARK_UNKNOWN_CLASS}, .${this.MARK_UNCOMMON_CLASS}`
        );

        if (!span) {
            return [];
        }

        const corrections = span
            .getAttribute('data-vlmspellchecker-corrections')
            ?.split('|')
            .filter(Boolean) ?? [];

        if (corrections.length === 0) {
            return [{
                text: 'No corrections found',
                enabled: false
            }];
        }

        return corrections.map(suggestion => ({
            text: suggestion,
            onAction: () => this.replaceWord(span, suggestion)
        }));
    }

    scheduleAutoCheck(delay = this.autoCheckDelay) {
        clearTimeout(this.autoCheckTimer);
        this.autoCheckTimer = setTimeout(() => {
            this.runSpellCheck();
        }, delay);
    }

    markEdited() {
        this.textRevision++;
        if (this.lastCheckedRevision !== null) {
            this.stats.isDirty = true;
        }
        this.updateStatus();
        this.scheduleAutoCheck();
    }

    updateStatus() {

        if (!this.statusElement) {
            return;
        }

        const { modelLoaded, total, bad, isDirty } = this.stats;
        const hasBeenChecked = this.lastCheckedRevision !== null;

        let statusLight = '⚪';

        if (modelLoaded === 1 && hasBeenChecked && !isDirty) {
            statusLight = bad === 0 ? '🟢' : '🔴';
        }

        let modelStatus = '';

        if (modelLoaded === 0) {
            modelStatus = 'Loading - ';
        } else if (modelLoaded !== 1) {
            modelStatus = 'No model loaded - ';
        }

        this.statusElement.textContent =
            `${modelStatus}Marked: ${bad} / Total: ${total} ${statusLight}`;
    }

    saveCaretPosition() {

        const selection = this.editor.selection;
        const rng = selection.getRng();

        if (!rng || !rng.collapsed) {
            return null;
        }

        const doc = this.editor.getDoc();
        const marker = doc.createElement('span');

        marker.setAttribute(
            'data-vlmspellchecker-caret-marker',
            '1'
        );
        marker.setAttribute('data-mce-bogus', '1');

        marker.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden;';

        try {
            rng.insertNode(marker);
            return marker;
        } catch (e) {
            console.warn(
                'Could not save caret position:',
                e
            );
            return null;
        }
    }

    restoreCaretPosition(marker) {

        if (!marker || !marker.parentNode) {
            return;
        }

        const doc = this.editor.getDoc();
        const rng = doc.createRange();
        rng.setStartBefore(marker);
        rng.collapse(true);
        this.editor.selection.setRng(rng);
        marker.parentNode.removeChild(marker);
        this.editor.nodeChanged();
    }

    /*
     * Creates a TreeWalker that skips non-editable content
     * and our temporary caret marker.
     */
    createTextWalker() {
        const body = this.editor.getBody();
        const doc = this.editor.getDoc();
        return doc.createTreeWalker(
            body,
            NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (
                    node.parentElement &&
                    node.parentElement.getAttribute(
                        'contenteditable'
                    ) === 'false'
                ) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (
                    node.parentElement &&
                    node.parentElement.hasAttribute(
                        'data-vlmspellchecker-caret-marker'
                    )
                ) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
        );
    }

    /*
     * Collect the unique words currently present in the editor.
     *
     * Existing spellchecker marks are deliberately left untouched
     * while the worker processes these words.
     */
    collectWords() {
        const walker = this.createTextWalker();
        const words = new Set();
        const wordRegex = /[A-Za-zÀ-ÖØ-öø-ÿßÆæŒœ]+/g;
        let node;
        while ((node = walker.nextNode())) {
            if (
                !node.nodeValue ||
                !node.nodeValue.trim()
            ) {
                continue;
            }
            let match;
            wordRegex.lastIndex = 0;
            while (
                (match = wordRegex.exec(node.nodeValue)) !== null
            ) {
                words.add(match[0].toLowerCase());
            }
        }
        return Array.from(words);
    }

    /*
     * Collect fresh text-node references.
     *
     * This must happen AFTER old marks have been unwrapped.
     */
    collectTextNodes() {
        const walker = this.createTextWalker();
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (
                node.nodeValue &&
                node.nodeValue.trim()
            ) {
                textNodes.push(node);
            }
        }
        return textNodes;
    }

    async runSpellCheck() {
        console.log(
            'VlmSpellcheckerEditor.runSpellCheck Called'
        );
        clearTimeout(this.autoCheckTimer);
        if (this.checking) {
            this.checkAgain = true;
            return;
        }
        this.checking = true;
        // Every run gets a unique generation ID.
        const generation = ++this.spellCheckGeneration;
        // Capture the document revision before asynchronous work.
        const revisionAtStart = this.textRevision;
        this.stats = {
            ...this.stats,
            modelLoaded: 0
        };
        this.updateStatus();
        try {
            /*
             * Keep the old marks in place while the worker runs.
             * This prevents the editor from flashing unmarked text.
             */
            const words = this.collectWords();
            const checked = await this.checkWordsInWorker(words);

            /*
             * If the document changed while the worker was running,
             * discard these results. Leave the old marks untouched.
             */
            if (this.textRevision !== revisionAtStart) {
                this.stats.modelLoaded = 1;
                this.stats.isDirty = true;
                this.updateStatus();
                return;
            }

            const stats = {
                modelLoaded: 1,
                total: 0,
                good: 0,
                bad: 0,
                isDirty: false
            };

            const caretRange = this.editor.selection.getRng();
            const caretMarker = this.saveCaretPosition();

            try {
                this.editor.undoManager.transact(() => {

                    this.clearMarks();
                    /*
                     * Unwrapping spans can change the DOM structure.
                     * Never reuse the text nodes collected before
                     * the worker finished.
                     */
                    const textNodes = this.collectTextNodes();
                    const wordRegex =
                        /[A-Za-zÀ-ÖØ-öø-ÿßÆæŒœ]+/g;

                    // Apply the new generation of marks.
                    for (const textNode of textNodes) {
                        if (!textNode.parentNode) {
                            continue;
                        }
                        const text = textNode.nodeValue;
                        const replacements = [];
                        let match;
                        wordRegex.lastIndex = 0;
                        while (
                            (match = wordRegex.exec(text)) !== null
                        ) {
                            const word = match[0];
                            const wordStart = match.index;
                            const wordEnd = wordStart + word.length;
                            
                            //Do not mark the word containing the current caret position.
                            if (
                                caretRange.collapsed &&
                                caretRange.startContainer === textNode &&
                                caretRange.startOffset >= wordStart &&
                                caretRange.startOffset <= wordEnd
                            ) {
                                continue;
                            }

                            const result = checked.get(
                                word.toLowerCase()
                            );

                            if (!result) {
                                continue;
                            }

                            stats.total++;

                            if (
                                result.recognised &&
                                result.occurrence > 2
                            ) {
                                stats.good++;
                            } else {
                                stats.bad++;
                                replacements.push({
                                    start: match.index,
                                    end: match.index + word.length,
                                    word,
                                    result
                                });
                            }
                        }
                        /*
                         * Process backwards so wrapping later words
                         * does not invalidate earlier text offsets.
                         */
                        for (
                            let i = replacements.length - 1; i >= 0; i--
                        ) {
                            const replacement = replacements[i];
                            const range = this.editor.dom.createRng();
                            range.setStart(
                                textNode,
                                replacement.start
                            );
                            range.setEnd(
                                textNode,
                                replacement.end
                            );
                            this.markWord(
                                range,
                                replacement.word,
                                replacement.result.corrections || [],
                                replacement.result.recognised,
                                generation
                            );
                        }
                    }

                    this.removeOldMarks(generation);
                });
            } finally {
                this.restoreCaretPosition(caretMarker);
            }
            this.stats = stats;
            this.lastCheckedRevision = revisionAtStart;
            this.updateStatus();
            this.editor.nodeChanged();
        } catch (error) {
            console.error(
                'VlmSpellchecker spell check failed:',
                error
            );
            this.stats.modelLoaded = -1;
            this.updateStatus();
            this.editor.notificationManager.open({
                text: 'VlmSpellchecker spell check failed: ' +
                    error.message,
                type: 'error',
                timeout: 6000
            });
        } finally {
            this.checking = false;

            if (this.checkAgain) {
                this.checkAgain = false;
                this.scheduleAutoCheck(0);
            }
        }
    }

    /*
     * Unwrap all previous spellchecker marks.
     *
     * TinyMCE's remove(node, true) removes the wrapper while
     * preserving its child content.
     */
    clearMarks() {
        const selector =
            `.${this.MARK_UNKNOWN_CLASS}, ` +
            `.${this.MARK_UNCOMMON_CLASS}`;
        const marks = this.editor.dom.select(selector);
        for (const mark of marks) {
            this.editor.dom.remove(mark, true);
        }
    }

    /*
     * Remove marks belonging to older generations.
     *
     * The current generation remains untouched.
     */
    removeOldMarks(generation) {
        const selector =
            `.${this.MARK_UNKNOWN_CLASS}[data-vlmspellchecker-generation], ` +
            `.${this.MARK_UNCOMMON_CLASS}[data-vlmspellchecker-generation]`;
        const marks = this.editor.dom.select(selector);
        for (const mark of marks) {
            if (
                mark.getAttribute(
                    'data-vlmspellchecker-generation'
                ) !== String(generation)
            ) {
                this.editor.dom.remove(mark, true);
            }
        }
    }

    markWord(
        range,
        word,
        corrections,
        recognised,
        generation
    ) {
        const classValue = recognised ?
            this.MARK_UNCOMMON_CLASS :
            this.MARK_UNKNOWN_CLASS;
        const span = this.editor.dom.create('span', {
            class: classValue,
            'data-vlmspellchecker-word': word,
            'data-vlmspellchecker-corrections': corrections.join('|'),
            'data-vlmspellchecker-generation': String(generation),
            'data-mce-bogus': '1'
        });
        try {
            range.surroundContents(span);
        } catch (e) {
            const content = range.extractContents();
            span.appendChild(content);
            range.insertNode(span);
        }
    }

    /*
     * Replace a marked word while preserving its capitalization
     * and keeping the existing span and its DOM position.
     */
    replaceWord(span, suggestion) {
        if (!span || !suggestion) {
            return;
        }
        const body = this.editor.getBody();
        if (
            !span.parentNode ||
            !body.contains(span)
        ) {
            return;
        }
        const originalWord =
            span.getAttribute('data-vlmspellchecker-word') ||
            span.textContent;
        if (!originalWord) {
            return;
        }
        const preserveCapitalisation = (
            original,
            replacement
        ) => {
            // All uppercase: HUIS -> WONING
            if (original === original.toUpperCase()) {
                return replacement.toUpperCase();
            }
            // All lowercase: huis -> woning
            if (original === original.toLowerCase()) {
                return replacement.toLowerCase();
            }
            // Title case: Huis -> Woning
            if (
                original[0] === original[0].toUpperCase() &&
                original.slice(1) ===
                original.slice(1).toLowerCase()
            ) {
                return (
                    replacement.charAt(0).toUpperCase() +
                    replacement.slice(1).toLowerCase()
                );
            }
            // Mixed case: preserve capitalization by character position.
            const originalCharacters = Array.from(original);
            return Array.from(replacement)
                .map((character, index) => {
                    const originalCharacter =
                        originalCharacters[index];
                    if (!originalCharacter) {
                        return character;
                    }
                    if (
                        originalCharacter ===
                        originalCharacter.toUpperCase() &&
                        originalCharacter !==
                        originalCharacter.toLowerCase()
                    ) {
                        return character.toUpperCase();
                    }
                    if (
                        originalCharacter ===
                        originalCharacter.toLowerCase() &&
                        originalCharacter !==
                        originalCharacter.toUpperCase()
                    ) {
                        return character.toLowerCase();
                    }
                    return character;
                })
                .join('');
        };
        const correctedWord = preserveCapitalisation(
            originalWord,
            suggestion
        );
        let replaced = false;
        this.editor.undoManager.transact(() => {
            if (
                !span.parentNode ||
                !body.contains(span)
            ) {
                return;
            }
            // Update the text inside the existing span.
            span.textContent = correctedWord;
            // Remove spellchecker-specific decorations and attributes.
            span.classList.remove(
                this.MARK_UNKNOWN_CLASS,
                this.MARK_UNCOMMON_CLASS
            );
            span.removeAttribute(
                'data-vlmspellchecker-word'
            );
            span.removeAttribute(
                'data-vlmspellchecker-corrections'
            );
            span.removeAttribute(
                'data-vlmspellchecker-generation'
            );
            span.removeAttribute('data-mce-bogus');
            replaced = true;
        });
        if (!replaced) {
            return;
        }
        this.markEdited();
        this.editor.nodeChanged();
        this.editor.focus();
    }

    initSpellWorker() {
        if (this.worker) {
            return;
        }
        console.log(
            'Creating VlmSpellchecker spell worker'
        );
        this.worker = new Worker(
            new URL(
                './VlmSpellcheckerSpellWorker.js',
                import.meta.url
            ), {
            type: 'module'
        }
        );
        this.worker.addEventListener(
            'message',
            ({
                data
            }) => {
                const request = this.workerRequests.get(data.id);
                if (!request) {
                    return;
                }
                this.workerRequests.delete(data.id);
                if (data.error) {
                    request.reject(new Error(data.error));
                } else {
                    request.resolve(new Map(data.results));
                }
            }
        );
        this.worker.addEventListener(
            'error',
            (event) => {
                console.error(
                    'VlmSpellchecker spell worker error:',
                    event
                );
                for (
                    const request of this.workerRequests.values()
                ) {
                    request.reject(
                        event.error ||
                        new Error(event.message)
                    );
                }
                this.workerRequests.clear();
            }
        );
    }

    checkWordsInWorker(words) {
        this.initSpellWorker();
        const id = this.nextWorkerRequestId++;
        const dictionaryUrl = new URL(
            this.dictionaryUrl,
            document.baseURI
        ).href;
        console.log(
            'VlmSpellchecker dictionary URL:',
            dictionaryUrl
        );
        return new Promise((resolve, reject) => {
            this.workerRequests.set(id, {
                resolve,
                reject
            });
            this.worker.postMessage({
                id,
                words,
                maxDistance: this.maxDistance,
                minCandidates: this.minCandidates,
                maxCandidates: this.maxCandidates,
                dictionaryUrl
            });
        });
    }
}
