function safeFilename(name, extension = '') {
  let filename = String(name || 'fichier')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!filename) filename = 'fichier';
  if (extension && !filename.toLowerCase().endsWith(extension)) filename += extension;
  return filename;
}

async function downloadDriveFile(item, token) {
  if (typeof item.fileId !== 'string' || !/^[\w-]+$/.test(item.fileId)) {
    throw new Error('ID de fichier Drive invalide.');
  }
  const driveHeaders = { Authorization: `Bearer ${token}` };
  const downloadHeaders = [{ name: 'Authorization', value: `Bearer ${token}` }];
  if (item.resourceKey) {
    driveHeaders['X-Goog-Drive-Resource-Keys'] = `${item.fileId}/${item.resourceKey}`;
    downloadHeaders.push({ name: 'X-Goog-Drive-Resource-Keys', value: `${item.fileId}/${item.resourceKey}` });
  }
  const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.fileId)}?supportsAllDrives=true&fields=name,mimeType,capabilities(canDownload)`, {
    headers: driveHeaders
  });
  if (!metadataResponse.ok) {
    let detail = '';
    try { detail = (await metadataResponse.json()).error?.message || ''; } catch {}
    if (metadataResponse.status === 404) {
      throw new Error(`Drive API 404 : fichier introuvable pour le compte OAuth. Vérifie que c'est le bon compte Google et que ce compte peut ouvrir le fichier. ${detail}`.trim());
    }
    throw new Error(`Drive API (${metadataResponse.status}) : ${detail || 'accès au fichier refusé.'}`);
  }
  const metadata = await metadataResponse.json();
  if (metadata.capabilities?.canDownload === false) throw new Error('Le propriétaire a désactivé le téléchargement de ce fichier.');

  const workspaceTypes = new Set([
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/vnd.google-apps.drawing'
  ]);
  const isWorkspaceFile = workspaceTypes.has(metadata.mimeType);
  const targetUrl = isWorkspaceFile
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.fileId)}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.fileId)}?alt=media&supportsAllDrives=true`;
  const filename = safeFilename(metadata.name || item.title, isWorkspaceFile ? '.pdf' : '');
  await chrome.downloads.download({
    url: targetUrl,
    filename,
    headers: downloadHeaders,
    conflictAction: 'uniquify',
    saveAs: false
  });
}

async function startOne(item, token) {
  try {
    if (item.drive) {
      await downloadDriveFile(item, token);
      return { title: item.title, ok: true };
    }
    if (!item.url) return { title: item.title, ok: false, reason: 'Adresse de fichier invalide.' };
    await chrome.downloads.download({ url: item.url, conflictAction: 'uniquify', saveAs: false });
    return { title: item.title, ok: true };
  } catch (error) {
    return { title: item.title, ok: false, reason: error?.message || 'Chrome a refusé le téléchargement.' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'RECONNECT_GOOGLE') {
    chrome.identity.clearAllCachedAuthTokens().then(() => chrome.identity.getAuthToken({ interactive: true }))
      .then(async auth => {
        const token = auth?.token || auth;
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Google API (${response.status})`);
        const accountEmail = (await response.json()).user?.emailAddress || '';
        sendResponse({ ok: true, accountEmail });
      })
      .catch(error => sendResponse({ ok: false, error: error?.message || 'La reconnexion Google a échoué.' }));
    return true;
  }
  if (message?.type !== 'START_BATCH') return;
  const items = message.items || [];
  const driveItems = items.filter(item => item.drive);
  const getToken = driveItems.length
    ? chrome.identity.getAuthToken({ interactive: true }).then(auth => auth?.token || auth)
    : Promise.resolve(null);
  getToken.then(async token => {
    let accountEmail = '';
    if (driveItems.length && token) {
      try {
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) accountEmail = (await response.json()).user?.emailAddress || '';
      } catch {}
    }
    const results = await Promise.all(items.map(item => startOne(item, token)));
    return { results, accountEmail };
  }).then(result => {
    sendResponse(result);
  }).catch(error => {
    sendResponse({ error: error?.message || 'Échec du lot de téléchargements.' });
  });
  return true;
});
