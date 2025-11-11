#!/usr/bin/env node

const http = require('http');

function getOption(key, fallback) {
    const value = popclip.options && Object.prototype.hasOwnProperty.call(popclip.options, key)
        ? popclip.options[key]
        : undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return value;
    }
    return fallback;
}

function parseTags(raw) {
    if (!raw) {
        return [];
    }
    return raw
        .split(/[,\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function htmlToMarkdown(html) {
    if (!html) {
        return '';
    }
    let result = html;
    const blockBreaks = [
        /<\/(p|div|h[1-6]|blockquote)>/gi,
    ];
    blockBreaks.forEach((pattern) => {
        result = result.replace(pattern, '\n\n');
    });
    result = result
        .replace(/<br\s*\/?>(\s*)/gi, '\n')
        .replace(/<li>(\s*)/gi, '- ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/?(strong|b)>/gi, '**')
        .replace(/<\/?(em|i)>/gi, '*')
        .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        .replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`');
    result = result
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n');
    return result.trim();
}

function ensureCloze(text) {
    if (/\{\{c\d+::.+?\}\}/.test(text)) {
        return text;
    }
    return `{{c1::${text}}}`;
}

function buildNotePayload(actionId) {
    const deckName = getOption('deck', 'Default');
    const basicModelName = getOption('model', 'Basic');
    const clozeModelName = getOption('clozeModel', 'Cloze');
    const shouldAppendUrl = Boolean(getOption('autoCopyURL', true));
    const tags = parseTags(getOption('tags', ''));

    const selectionText = (popclip.input && popclip.input.text) ? popclip.input.text.trim() : '';
    const htmlInput = popclip.input && popclip.input.html ? popclip.input.html : '';
    const markdownFromHtml = htmlInput ? htmlToMarkdown(htmlInput) : '';
    const baseFront = selectionText || markdownFromHtml;
    const noteBody = markdownFromHtml || selectionText;

    let sourceUrl = '';
    if (shouldAppendUrl && popclip.context) {
        sourceUrl = popclip.context.browserUrl || popclip.context.url || popclip.context.linkUrl || '';
    }

    const urlSuffix = sourceUrl ? `\n\nSource: ${sourceUrl}` : '';

    console.log('PopClip action:', actionId);
    console.log('PopClip options:', JSON.stringify({ deckName, basicModelName, clozeModelName, tags, shouldAppendUrl }));
    console.log('PopClip selection length:', selectionText.length, 'HTML length:', htmlInput.length);

    if (actionId === 'com.dswcode.popclip.anki.cloze') {
        const clozeText = ensureCloze(baseFront);
        return {
            action: 'addNote',
            version: 6,
            params: {
                note: {
                    deckName,
                    modelName: clozeModelName,
                    fields: {
                        Text: clozeText,
                        Extra: noteBody ? `${noteBody}${urlSuffix}` : urlSuffix.trim(),
                    },
                    tags,
                },
            },
        };
    }

    return {
        action: 'addNote',
        version: 6,
        params: {
            note: {
                deckName,
                modelName: basicModelName,
                fields: {
                    Front: baseFront,
                    Back: `${noteBody}${urlSuffix}`.trim(),
                },
                tags,
            },
        },
    };
}

function postToAnki(payload) {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify(payload);
        console.log('Posting to AnkiConnect:', requestBody);

        const req = http.request({
            hostname: '127.0.0.1',
            port: 8765,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                try {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    console.log('AnkiConnect raw response:', raw);
                    const parsed = JSON.parse(raw);
                    if (parsed.error) {
                        reject(new Error(parsed.error));
                    } else {
                        resolve(parsed);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.log('HTTP error when contacting AnkiConnect:', error.message);
            reject(error);
        });

        req.write(requestBody);
        req.end();
    });
}

(async () => {
    try {
        const actionId = popclip.actionIdentifier || popclip.actionId || 'com.dswcode.popclip.anki.basic';
        const payload = buildNotePayload(actionId);
        const response = await postToAnki(payload);
        console.log('AnkiConnect parsed response:', JSON.stringify(response));
    } catch (error) {
        console.log('AnkiConnect error:', error && error.stack ? error.stack : String(error));
        throw error;
    }
})();

