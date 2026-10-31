const list = document.querySelector('#tabs');
const downloadButton = document.querySelector('#download');
const countLabel = document.querySelector('#count');
const status = document.querySelector('#status');
const selectAllButton = document.querySelector('#selectAll');
const reauthButton = document.querySelector('#reauth');
const groupFilter = document.querySelector('#groupFilter');
const scanMediaButton = document.querySelector('#scanMedia');
const downloadMediaButton = document.querySelector('#downloadMedia');
let allTabs = [];
let tabGroups = [];
let eligibleTabs = [];
let discoveredMedia = [];

function scanPageMedia() {
  const found = new Map();
  const add = (rawUrl, kind, label = '') => {
    try {
      const url = new URL(rawUrl, location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.mpd')) return;
      if (!found.has(url.href)) found.set(url.href, { url: url.href, kind, label });
    } catch {}
  };

  for (const image of document.images) {
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    if (width < 160 || height < 120) continue;
    add(image.currentSrc || image.src, 'image', image.alt || image.title || 'image');
  }
  for (const video of document.querySelectorAll('video')) {
    add(video.currentSrc || video.src, 'video', video.title || 'video');
    for (const source of video.querySelectorAll('source[src]')) add(source.src, 'video', video.title || 'video');
  }
  for (const audio of document.querySelectorAll('audio')) {
    add(audio.currentSrc || audio.src, 'audio', audio.title || 'audio');
    for (const source of audio.querySelectorAll('source[src]')) add(source.src, 'audio', audio.title || 'audio');
  }
  for (const link of document.querySelectorAll('a[href]')) {
    if (/\.(?:png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|mp3|m4a|wav|ogg)(?:$|[?#])/i.test(link.href)) {
      add(link.href, 'image ou média', link.textContent.trim().slice(0, 100));
    }
  }
  return [...found.values()];
}

function currentGroupTabs() {
  const selectedGroup = groupFilter.value;
  return allTabs.filter(tab => selectedGroup === 'all' || String(tab.groupId) === selectedGroup);
}

function setMediaStatus(message, error = false) {
  status.textContent = message;
  status.style.color = error ? '#b42318' : '#344054';
}

scanMediaButton.addEventListener('click', async () => {
  const tabsToScan = currentGroupTabs().filter(tab => /^https?:\/\//i.test(tab.url || ''));
  if (!tabsToScan.length) {
    setMediaStatus('Aucune page web à scanner dans cette sélection.', true);
    return;
  }

  const origins = [...new Set(tabsToScan.map(tab => {
    try { return `${new URL(tab.url).origin}/*`; } catch { return null; }
  }).filter(Boolean))];
  scanMediaButton.disabled = true;
  downloadMediaButton.hidden = true;
  discoveredMedia = [];
  setMediaStatus(`Autorisation des sites puis scan de ${tabsToScan.length} onglet(s)…`);
  try {
    const granted = await chrome.permissions.request({ origins });
    if (!granted) throw new Error('Autorisation des sites refusée. Le scan n’a pas été lancé.');

    const results = await Promise.allSettled(tabsToScan.map(async tab => {
      const execution = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanPageMedia });
      return (execution[0]?.result || []).map(media => ({ ...media, tabTitle: tab.title || new URL(tab.url).hostname }));
    }));
    discoveredMedia = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (!discoveredMedia.length) {
      setMediaStatus('Aucune image ou source audio/vidéo directe trouvée. Les lecteurs intégrés ou protégés peuvent ne pas exposer leur média.');
      return;
    }
    downloadMediaButton.textContent = `Télécharger ${discoveredMedia.length} média${discoveredMedia.length > 1 ? 's' : ''}`;
    downloadMediaButton.hidden = false;
    const failedTabs = results.filter(result => result.status === 'rejected').length;
    setMediaStatus(`${discoveredMedia.length} média(s) trouvé(s)${failedTabs ? ` ; ${failedTabs} onglet(s) inaccessible(s)` : ''}. Vérifie la sélection puis télécharge.`);
  } catch (error) {
    setMediaStatus(error?.message || 'Le scan des médias a échoué.', true);
  } finally {
    scanMediaButton.disabled = false;
  }
});

downloadMediaButton.addEventListener('click', async () => {
  if (!discoveredMedia.length) return;
  downloadMediaButton.disabled = true;
  const results = await Promise.allSettled(discoveredMedia.map((media, index) => {
    let filename = '';
    try { filename = decodeURIComponent(new URL(media.url).pathname.split('/').pop() || ''); } catch {}
    filename = (filename || `${media.kind}-${index + 1}`)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180);
    return chrome.downloads.download({ url: media.url, filename, conflictAction: 'uniquify', saveAs: false });
  }));
  const started = results.filter(result => result.status === 'fulfilled').length;
  const failed = results.length - started;
  setMediaStatus(`${started} téléchargement(s) lancé(s)${failed ? `, ${failed} échec(s)` : ''}.`);
  downloadMediaButton.disabled = false;
});

function driveFileId(tab) {
  try {
    const url = new URL(tab.url);
    if (url.hostname !== 'drive.google.com') return null;
    return url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
  } catch {
    return null;
  }
}

function driveResourceKey(tab) {
  try {
    const url = new URL(tab.url);
    return url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey') || '';
  } catch {
    return '';
  }
}

function fileDownloadUrl(tab) {
  try {
    const url = new URL(tab.url);
    const supported = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|zip|rar|7z|tar|gz|png|jpe?g|webp|gif|mp3|mp4|mov|avi|wav|epub)$/i;
    if (['http:', 'https:'].includes(url.protocol) && supported.test(decodeURIComponent(url.pathname))) return tab.url;
    return null;
  } catch {
    return null;
  }
}

function render() {
  const selectedGroup = groupFilter.value;
  const tabs = selectedGroup === 'all' ? allTabs : allTabs.filter(tab => String(tab.groupId) === selectedGroup);
  eligibleTabs = tabs.filter(tab => driveFileId(tab) || fileDownloadUrl(tab));
  list.replaceChildren();
  countLabel.textContent = `${eligibleTabs.length} onglet${eligibleTabs.length > 1 ? 's' : ''}`;
  if (!eligibleTabs.length) {
    list.innerHTML = '<li class="empty">Aucun onglet téléchargeable trouvé.</li>';
    return;
  }
  eligibleTabs.forEach((tab, index) => {
    const row = document.createElement('li');
    row.dataset.tabIndex = String(index);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedGroup === 'all' ? tab.active : true;
    checkbox.setAttribute('aria-label', `Sélectionner ${tab.title || tab.url}`);
    const icon = document.createElement('img');
    icon.className = 'favicon';
    icon.src = tab.favIconUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="9" fill="%23cbd5e1"/%3E%3C/svg%3E';
    icon.alt = '';
    const copy = document.createElement('div');
    copy.className = 'tab-copy';
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || 'Onglet sans titre';
    const host = document.createElement('div');
    host.className = 'tab-url';
    try { host.textContent = new URL(tab.url).hostname; } catch { host.textContent = tab.url; }
    copy.append(title, host);
    row.append(checkbox, icon, copy);
    row.addEventListener('click', event => {
      if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
      updateButton();
    });
    checkbox.addEventListener('change', updateButton);
    list.append(row);
  });
  updateButton();
}

function updateButton() {
  const selected = list.querySelectorAll('input:checked').length;
  downloadButton.disabled = selected === 0;
  downloadButton.textContent = selected ? `Télécharger ${selected} fichier${selected > 1 ? 's' : ''}` : 'Télécharger la sélection';
}

selectAllButton.addEventListener('click', () => {
  const boxes = [...list.querySelectorAll('input[type="checkbox"]')];
  const select = boxes.some(box => !box.checked);
  boxes.forEach(box => { box.checked = select; });
  selectAllButton.textContent = select ? 'Tout désélectionner' : 'Tout sélectionner';
  updateButton();
});

downloadButton.addEventListener('click', async () => {
  const selectedRows = [...list.querySelectorAll('li')].filter(row => row.querySelector('input')?.checked);
  const selectedTabs = selectedRows.map(row => eligibleTabs[Number(row.dataset.tabIndex)]).filter(Boolean);
  const items = selectedTabs.map(tab => ({
    tabId: tab.id,
    title: tab.title || 'Fichier sans titre',
    drive: Boolean(driveFileId(tab)),
    fileId: driveFileId(tab),
    resourceKey: driveResourceKey(tab),
    url: fileDownloadUrl(tab)
  }));
  downloadButton.disabled = true;
  reauthButton.hidden = true;
  status.textContent = `Démarrage de ${items.length} téléchargement(s)…`;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'START_BATCH', items });
    if (response?.error) status.textContent = response.error;
    else {
      const results = response?.results || [];
      const started = results.filter(result => result.ok).length;
      const failed = results.filter(result => !result.ok);
      status.textContent = failed.length
        ? `${started} démarré(s), ${failed.length} échec(s). ${response.accountEmail ? `Compte OAuth : ${response.accountEmail}. ` : ''}${failed[0].title} : ${failed[0].reason}`
        : `${started} téléchargement(s) démarré(s). ${response.accountEmail ? `Compte OAuth : ${response.accountEmail}.` : ''}`;
      if (failed.some(item => /Drive API 404/i.test(item.reason))) reauthButton.hidden = false;
    }
  } catch (error) {
    status.textContent = `Erreur : ${error?.message || 'le lot n’a pas pu démarrer.'}`;
  }
  updateButton();
});

reauthButton.addEventListener('click', async () => {
  reauthButton.disabled = true;
  status.textContent = 'Ouverture de la connexion Google…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RECONNECT_GOOGLE' });
    status.textContent = response?.ok
      ? `Compte Google du profil Chrome : ${response.accountEmail || 'email non disponible'}. Pour utiliser une autre adresse, ouvre Jaim dans un profil Chrome connecté à ce compte.`
      : `Reconnexion Google impossible : ${response?.error || 'aucune réponse.'}`;
  } catch (error) {
    status.textContent = `Reconnexion Google impossible : ${error?.message || 'erreur inconnue.'}`;
  }
  reauthButton.disabled = false;
});

chrome.tabs.query({}).then(async tabs => {
  allTabs = tabs;
  tabGroups = await chrome.tabGroups.query({});
  for (const group of tabGroups) {
    const hasWebTab = allTabs.some(tab => tab.groupId === group.id && /^https?:\/\//i.test(tab.url || ''));
    if (!hasWebTab) continue;
    const option = document.createElement('option');
    option.value = String(group.id);
    option.textContent = group.title || `Groupe ${group.id}`;
    groupFilter.append(option);
  }
  render();
}).catch(() => {
  countLabel.textContent = 'Erreur';
  list.innerHTML = '<li class="empty">Impossible de lire les onglets.</li>';
});

groupFilter.addEventListener('change', () => {
  discoveredMedia = [];
  downloadMediaButton.hidden = true;
  render();
});
