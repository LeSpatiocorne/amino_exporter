chrome.runtime.onInstalled.addListener(function() {
    console.log('Amino PDF Exporter installé');
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'elementSelected') {
        chrome.runtime.sendMessage(request);
    }
});

chrome.downloads.onChanged.addListener(function(downloadDelta) {
    if (downloadDelta.state && downloadDelta.state.current === 'complete') {
        console.log('Téléchargement terminé:', downloadDelta.id);
    }
}); 