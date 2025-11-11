(async () => {
  const selectedText = (popclip.input && popclip.input.text ? popclip.input.text : '').trim();

  if (!selectedText) {
    popclip.showText('未检测到选中文本，无法添加到 Anki。');
    return;
  }

  const context = popclip.context || {};
  const sourceDetails = [];

  const sourceTitle = context.browserTitle || context.appName || '';
  const sourceUrl = context.browserUrl || context.selectionUrl || '';
  const sourceApp = context.appBundleIdentifier || context.appName || '';

  if (sourceTitle) {
    sourceDetails.push(sourceTitle);
  }
  if (sourceUrl && !sourceDetails.includes(sourceUrl)) {
    sourceDetails.push(sourceUrl);
  }
  if (sourceApp && !sourceDetails.includes(sourceApp)) {
    sourceDetails.push(sourceApp);
  }

  const note = {
    deckName: 'Default',
    modelName: 'Basic',
    fields: {
      Front: selectedText,
      Back: sourceDetails.join('\n') || selectedText
    },
    tags: ['PopClip', 'Anki']
  };

  const payload = {
    action: 'addNote',
    version: 6,
    params: {
      note
    }
  };

  try {
    const response = await fetch('http://127.0.0.1:8765', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      popclip.showText(`添加到 Anki 失败：${result.error}`);
      return;
    }

    popclip.showText('已添加到 Anki');
  } catch (error) {
    popclip.showText(`无法连接到 Anki。请启动 Anki 并确保已启用 AnkiConnect。\n${error.message}`);
  }
})();
