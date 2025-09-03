const https = require('https');

function inferLangFromFilename(file) {
  const base = file.replace(/\.json$/i, '');
  return base.toUpperCase();
}

function getDeeplEndpoint(useFreeApi) {
  return useFreeApi ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
}

function encodeForm(data) {
  return Object.entries(data)
    .map(([k, v]) =>
      Array.isArray(v)
        ? v.map((vv) => `${encodeURIComponent(k)}=${encodeURIComponent(vv)}`).join('&')
        : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    )
    .join('&');
}

function postForm(url, formBody, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      method: 'POST',
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formBody),
      },
      timeout: timeoutMs,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse DeepL response'));
          }
        } else {
          reject(new Error(`DeepL API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('DeepL request timed out'));
    });
    req.write(formBody);
    req.end();
  });
}

async function translateTexts({
  apiKey,
  useFreeApi = true,
  sourceLang,
  targetLang,
  texts,
  formality = 'default',
  preserveFormatting = true,
  splitSentences = '1',
  timeoutMs = 15000,
}) {
  if (!texts || !texts.length) return [];
  const url = getDeeplEndpoint(useFreeApi);

  // Chunk to respect DeepL limits (max ~50 texts)
  const chunkSize = 40;
  const outputs = [];
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const form = encodeForm({
      auth_key: apiKey,
      text: chunk,
      target_lang: targetLang,
      ...(sourceLang ? { source_lang: sourceLang } : {}),
      formality,
      preserve_formatting: preserveFormatting ? '1' : '0',
      split_sentences: splitSentences,
    });
    const res = await postForm(url, form, timeoutMs);
    if (!res || !res.translations) throw new Error('Invalid DeepL response');
    outputs.push(...res.translations.map((t) => t.text));
  }
  return outputs;
}

module.exports = {
  translateTexts,
  inferLangFromFilename,
};

