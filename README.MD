# Vlm Spellchecker

A self-hosted spellchecker plugin for TinyMCE.

VlmSpellchecker uses a locally hosted binary dictionary to identify misspelled and uncommon words, suggest corrections,
and replace words directly in the TinyMCE editor.

The plugin is tested with TinyMCE's open-source GPL version and does not require a cloud spellchecking service or
external spelling API.

## Demo

The demo uses a Dutch dictionary generated from Dutch Wikipedia data.

[`--> DEMO LINK <--`](https://veldin.com/vlm-spellchecker/)

The demo is configured to load its `dictionary.vlm` from the same directory as the demo page.

## Features

- **Local dictionary:** Load a VLM dictionary from your own server.
- **Unknown word detection:** Mark words that are not recognised by the dictionary with a red dotted underline.
- **Uncommon word detection:** Mark recognised but low-frequency words with an orange dotted underline.
- **Spelling suggestions:** Right-click a marked word to display suggested corrections.
- **Capitalisation preservation:** Preserve uppercase, lowercase, title case, and character-position capitalisation when
  applying corrections.

## Installation

### 1. Host the plugin

Host the plugin files on your own server. The plugin entry point is `VlmSpellcheckerPlugin.js`.

The plugin dynamically imports `VlmSpellcheckerEditor.js`, which uses the language model, dictionary implementation, and
token codec. The spelling worker and its dependencies must also be accessible to the browser.

Keep the module files together in the expected directory structure so that their relative imports resolve correctly.

### 2. Load TinyMCE

Include TinyMCE in your page using your local installation.

```html

<script src="/tinymce/js/tinymce/tinymce.min.js"></script>
```

### 3. Configure TinyMCE

```javascript
tinymce.init({
    selector: '#editor',

    license_key: 'gpl',

    height: 640,

    plugins: 'lists link autolink vlmspellchecker',

    toolbar:
        'undo redo | bold italic underline | ' +
        'bullist numlist | link | vlmspellcheckercheck',

    external_plugins: {
        vlmspellchecker:
            'https://example.com/vlm-spellchecker/VlmSpellcheckerPlugin.js'
    },

    // location of the vlm word dictionary.
    vlmspellchecker_dictionary_url: './dictionary.vlm',

    // When attribution is set, the 'about' item apears.
    vlmspellchecker_dictionary_attribution:
        'The Demo Language model used is generated from Dutch Wikipedia data.\n' +
        'Read more about it here: https://github.com/Veldin/wiki-language-models',

    // Maximum edit distance. Decides how mnay groups of corrections to get.
    vlmspellchecker_max_distance: 3,

    // When looking for 'groups' of candidates, when we reached this minimum, we don't search the next group.
    vlmspellchecker_suggestion_candidate_range_min: 4,

    // When the total of the groups of candidates exceeds this number, we limit it.s
    vlmspellchecker_suggestion_candidate_range_max: 10,

    contextmenu: 'link vlmspellchecker'
});
```

Replace the example plugin URL with the location where you host the plugin.

### 4. Use a compatible dictionary

The plugin expects a dictionary in the .VLM binary format.
The format is used by the [Wiki Language Models](https://github.com/Veldin/wiki-language-models) project.

For pre-created models, see the [releases](https://github.com/Veldin/wiki-language-models/releases).
Every release has a zip containing the dictionary.

## Configuration

| Option                                           | Default            | Description                                                                         |
|--------------------------------------------------|--------------------|-------------------------------------------------------------------------------------|
| `vlmspellchecker_dictionary_url`                 | `./dictionary.vlm` | URL of the binary dictionary.                                                       |
| `vlmspellchecker_max_distance`                   | `3`                | Maximum Levenshtein edit distance groups considered when searching for suggestions. |
| `vlmspellchecker_suggestion_candidate_range_min` | `4`                | Minimum number of candidates to aim for before stopping at a later distance group.  |
| `vlmspellchecker_suggestion_candidate_range_max` | `10`               | Maximum number of suggestions returned.                                             |
| `vlmspellchecker_dictionary_attribution`         | `''`               | Optional attribution text displayed in the plugin's About menu.                     |

## Spellchecking behaviour

### Unknown words

Words not found in the dictionary are marked with a red dotted underline.

The context menu displays available corrections generated from the dictionary.

### Uncommon words

Words found in the dictionary with a low occurrence score are marked with an orange dotted underline.

This helps identify unusual words, rare terms, and potential spelling mistakes that happen to match a dictionary entry.

An uncommon word is not necessarily incorrect.

### Applying corrections

Selecting a suggestion replaces the marked word in the editor.

The replacement attempts to preserve the original word's capitalisation. The spellchecker removes its own marking
attributes after applying the correction.

The editor's undo manager records the replacement as an undoable operation.

## Project structure

The main JavaScript modules are:

```text
VlmSpellcheckerPlugin.js
VlmSpellcheckerEditor.js
VlmSpellcheckerSpellWorker.js
VlmSpellcheckerLanguageModel.js
VlmSpellcheckerFinalWordDictionary.js
VlmSpellcheckerTokenCodec.js
```

The demo additionally uses:

```text
index.html
dictionary.vlm
```

The exact deployment layout may vary, provided the plugin URL, module imports, worker URL, and dictionary URL resolve
correctly.

## TODO::

### Improvements

- Set up a proper build and release pipeline.
- Add minification for builds.
- Automate GitHub releases and release artifacts.
- Review the current duplicate caching layer and remove one if it is unnecessary.
- Improve the overall JavaScript code style and consistency.
- Make the status bar style configurable.

### Known bugs

- Fix caret handling when the caret is inside a word or when a word is selected.
- Prevent spellchecker logic from breaking when the selection or caret position changes.

### Planned features

- Support loading multiple dictionaries.
- Allow users to switch between those multiple dictionaries.
- Add an ignore list using `localStorage`.
- Add an option to add words to a personal dictionary using `localStorage`.
- Add an option to automaticly correct using `localStorage`.
- Allow custom spellchecker styles through plugin configuration.
- Add support for the VLM n-gram language model to implement suggestions using context.
- Support (setting for) automatic dictionary loading when the editor initializes or when typing begins.
- Add a mechanism for caching loaded dictionaries between editor instances where appropriate.
- Dictionary information is now presentet in console, this should be addd to the 'About'.
- Make the 'Uncommon Word' occurence score configurable.
- Allow users to configure a hash of the dictionary to make sure the expected dictionary is loaded.

## Licence

VlmSpellchecker is intended for use with TinyMCE's open-source GPL version. The project's own licence and the licences
of the dictionary data should be documented and reviewed before redistribution.

Dictionary attribution CAN be configured through `vlmspellchecker_dictionary_attribution` and displayed in the plugin's
About menu.

