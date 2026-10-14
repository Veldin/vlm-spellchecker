
/* 
 * Based on https://github.com/Veldin/wiki-language-models/blob/main/src/main/java/com/veldin/tokens/SixBitWordToken.java 
*/


export const TOKEN_BITS = 6;
export const TOKEN_MASK = 0x3F;

export const NULL_TOKEN = 0;
export const WORD_SEPARATOR = 27;
export const SENTENCE_END = 62;
export const UNKNOWN_TOKEN = 63;


export const TOKEN_TO_CHARACTER = new Array(64);
TOKEN_TO_CHARACTER[0] = '\0';

TOKEN_TO_CHARACTER[1] = 'a';
TOKEN_TO_CHARACTER[2] = 'b';
TOKEN_TO_CHARACTER[3] = 'c';
TOKEN_TO_CHARACTER[4] = 'd';
TOKEN_TO_CHARACTER[5] = 'e';
TOKEN_TO_CHARACTER[6] = 'f';
TOKEN_TO_CHARACTER[7] = 'g';
TOKEN_TO_CHARACTER[8] = 'h';
TOKEN_TO_CHARACTER[9] = 'i';
TOKEN_TO_CHARACTER[10] = 'j';
TOKEN_TO_CHARACTER[11] = 'k';
TOKEN_TO_CHARACTER[12] = 'l';
TOKEN_TO_CHARACTER[13] = 'm';
TOKEN_TO_CHARACTER[14] = 'n';
TOKEN_TO_CHARACTER[15] = 'o';
TOKEN_TO_CHARACTER[16] = 'p';
TOKEN_TO_CHARACTER[17] = 'q';
TOKEN_TO_CHARACTER[18] = 'r';
TOKEN_TO_CHARACTER[19] = 's';
TOKEN_TO_CHARACTER[20] = 't';
TOKEN_TO_CHARACTER[21] = 'u';
TOKEN_TO_CHARACTER[22] = 'v';
TOKEN_TO_CHARACTER[23] = 'w';
TOKEN_TO_CHARACTER[24] = 'x';
TOKEN_TO_CHARACTER[25] = 'y';
TOKEN_TO_CHARACTER[26] = 'z';

TOKEN_TO_CHARACTER[27] = ' ';
TOKEN_TO_CHARACTER[28] = 'é';
TOKEN_TO_CHARACTER[29] = 'è';
TOKEN_TO_CHARACTER[30] = 'ë';
TOKEN_TO_CHARACTER[31] = 'ï';
TOKEN_TO_CHARACTER[32] = 'ö';
TOKEN_TO_CHARACTER[33] = 'ü';
TOKEN_TO_CHARACTER[34] = 'á';
TOKEN_TO_CHARACTER[35] = 'à';
TOKEN_TO_CHARACTER[36] = 'ó';
TOKEN_TO_CHARACTER[37] = 'ò';
TOKEN_TO_CHARACTER[38] = 'ú';
TOKEN_TO_CHARACTER[39] = 'ç';
TOKEN_TO_CHARACTER[40] = 'ê';
TOKEN_TO_CHARACTER[41] = 'â';
TOKEN_TO_CHARACTER[42] = 'î';
TOKEN_TO_CHARACTER[43] = 'ô';
TOKEN_TO_CHARACTER[44] = 'û';
TOKEN_TO_CHARACTER[45] = 'ñ';
TOKEN_TO_CHARACTER[46] = 'ß';
TOKEN_TO_CHARACTER[47] = 'æ';
TOKEN_TO_CHARACTER[48] = 'œ';

TOKEN_TO_CHARACTER[62] = '.';
TOKEN_TO_CHARACTER[63] = '?';


export const CHARACTER_TO_TOKEN = new Map();

for (let i = 0; i < 26; i++) {
    const lower =
        String.fromCharCode('a'.charCodeAt(0) + i);

    const upper =
        String.fromCharCode('A'.charCodeAt(0) + i);

    CHARACTER_TO_TOKEN.set(lower, i + 1);
    CHARACTER_TO_TOKEN.set(upper, i + 1);
}


const ACCENTED = [
    ['é', 'É', 28],
    ['è', 'È', 29],
    ['ë', 'Ë', 30],
    ['ï', 'Ï', 31],
    ['ö', 'Ö', 32],
    ['ü', 'Ü', 33],
    ['á', 'Á', 34],
    ['à', 'À', 35],
    ['ó', 'Ó', 36],
    ['ò', 'Ò', 37],
    ['ú', 'Ú', 38],
    ['ç', 'Ç', 39],
    ['ê', 'Ê', 40],
    ['â', 'Â', 41],
    ['î', 'Î', 42],
    ['ô', 'Ô', 43],
    ['û', 'Û', 44],
    ['ñ', 'Ñ', 45],
    ['ß', 'SS', 46],
    ['æ', 'Æ', 47],
    ['œ', 'Œ', 48]
];

for (const [lower, upper, token] of ACCENTED) {
    CHARACTER_TO_TOKEN.set(lower, token);

    if (upper.length === 1) {
        CHARACTER_TO_TOKEN.set(upper, token);
    }
}

CHARACTER_TO_TOKEN.set(' ', WORD_SEPARATOR);
CHARACTER_TO_TOKEN.set('-', WORD_SEPARATOR);
CHARACTER_TO_TOKEN.set('_', WORD_SEPARATOR);
CHARACTER_TO_TOKEN.set(',', WORD_SEPARATOR);
CHARACTER_TO_TOKEN.set('.', SENTENCE_END);


export function stringToTokens(value) {
    if (value == null) {
        throw new Error('Word cannot be null');
    }

    const tokens = [];

    for (const character of value) {
        if (character === 'ß') {
            tokens.push(46);
            continue;
        }

        const token =
            CHARACTER_TO_TOKEN.get(character);

        tokens.push(
            token === undefined
                ? UNKNOWN_TOKEN
                : token
        );
    }

    return tokens;
}

export function tokensToString(tokens) {
    let result = '';

    for (const token of tokens) {
        if (token < 0 || token >= 64) {
            throw new Error(
                'Invalid 6-bit token: ' + token
            );
        }

        const character =
            TOKEN_TO_CHARACTER[token];

        if (character === undefined) {
            console.error(
                'VLMSPELLCHECKER NO CHARACTER MAPPING',
                {
                    tokens,
                    token,
                    tokenIndex:
                        tokens.indexOf(token),
                    stack:
                        new Error().stack
                }
            );

            throw new Error(
                'No character mapping for token: ' + token
            );
        }

        result += character;
    }

    return result;
}