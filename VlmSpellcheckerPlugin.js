(function () {
    'use strict';

    console.log('VlmSpellchecker plugin.js loading');

    tinymce.PluginManager.add(
        'vlmspellchecker',
        function (editor, url) {
            console.log('VlmSpellchecker plugin registered');

            function escapeHtml(value) {
                return String(value ?? '').replace(
                    /[&<>"']/g,
                    function (character) {
                        return {
                            '&': '&amp;',
                            '<': '&lt;',
                            '>': '&gt;',
                            '"': '&quot;',
                            "'": '&#39;'
                        }[character];
                    }
                );
            }

            function getDictionaryAttribution() {
                return editor.getParam(
                    'vlmspellchecker_dictionary_attribution',
                    ''
                );
            }

            function openAboutDialog() {

                var attribution = getDictionaryAttribution();

                var attributionHtml = attribution.trim()
                    ? (
                        '<h4>Attribution:</h4>' +
                        '<p>' +
                        escapeHtml(attribution).replace(/\n/g, '<br>') +
                        '</p>'
                    )
                    : '';

                editor.windowManager.open({
                    title: 'VlmSpellchecker',
                    size: 'normal',

                    body: {
                        type: 'panel',
                        items: [
                            {
                                type: 'htmlpanel',
                                html:
                                    '<p>A spellchecker plugin ' +
                                    'using the VLM statistical language model format.</p>' +
                                    attributionHtml
                            }
                        ]
                    },

                    buttons: [
                        {
                            type: 'cancel',
                            text: 'Close',
                            primary: true
                        }
                    ]
                });
            }

            function runSpellCheck() {
                console.log('VlmSpellchecker button clicked');

                if (!editor._vlmspellcheckerEditor) {
                    console.warn(
                        'VlmSpellchecker editor is not loaded yet.'
                    );
                    return;
                }

                editor._vlmspellcheckerEditor.runSpellCheck();
            }

            /*
             * Register a split button when attribution is available.
             * Otherwise, register a regular button.
             */
            var attribution = getDictionaryAttribution();

            if (attribution.trim()) {
                editor.ui.registry.addSplitButton(
                    'vlmspellcheckercheck',
                    {
                        text: 'VlmSpellchecker',
                        tooltip: 'Check spelling with VlmSpellchecker',
                        icon: 'spell-check',

                        onAction: runSpellCheck,

                        onItemAction: function (api, value) {
                            if (value === 'about') {
                                openAboutDialog();
                            }
                        },

                        fetch: function (callback) {
                            callback([
                                {
                                    type: 'choiceitem',
                                    text: 'About',
                                    value: 'about'
                                }
                            ]);
                        }
                    }
                );
            } else {
                editor.ui.registry.addButton(
                    'vlmspellcheckercheck',
                    {
                        text: 'VlmSpellchecker',
                        tooltip: 'Check spelling with VlmSpellchecker',
                        icon: 'spell-check',
                        onAction: runSpellCheck
                    }
                );
            }

            /*
             * Load the actual editor implementation.
             */
            import(url + '/VlmSpellcheckerEditor.js')
                .then(function (module) {
                    console.log('VlmSpellcheckerEditor imported');

                    editor._vlmspellcheckerEditor =
                        new module.VlmSpellcheckerEditor(
                            editor,
                            url
                        );

                    console.log(
                        'VlmSpellcheckerEditor instance created'
                    );
                })
                .catch(function (error) {
                    console.error(
                        'Failed to load VlmSpellchecker plugin:',
                        error
                    );

                    editor.notificationManager.open({
                        text:
                            'Failed to load VlmSpellchecker spellchecker: ' +
                            error.message,
                        type: 'error',
                        timeout: 6000
                    });
                });

            /*
             * Context menu for spelling suggestions.
             */
            editor.ui.registry.addContextMenu(
                'vlmspellchecker',
                {
                    update: function (element) {
                        if (!editor._vlmspellcheckerEditor) {
                            return [];
                        }

                        return editor._vlmspellcheckerEditor
                            .getContextMenuItems(element);
                    }
                }
            );

            return {
                getMetadata: function () {
                    return {
                        name: 'VlmSpellchecker Dictionary Spellchecker',
                        url: 'https://github.com/Veldin/wiki-language-models'
                    };
                }
            };
        }
    );

    console.log('VlmSpellchecker plugin.js registered');
})();