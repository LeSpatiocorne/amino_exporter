document.addEventListener('DOMContentLoaded', function() {
    const exportBtn = document.getElementById('exportBtn');
    const includeImages = document.getElementById('includeImages');
    const preserveLinks = document.getElementById('preserveLinks');
    const filename = document.getElementById('filename');
    const status = document.getElementById('status');
    const detectionStatus = document.getElementById('detectionStatus');
    const detectionText = document.getElementById('detectionText');
    const postsFound = document.getElementById('postsFound');

    let aminoPosts = [];
    let selectedPost = null;

    init();

    function init() {
        chrome.storage.local.get(['includeImages', 'preserveLinks'], function(result) {
            if (result.includeImages !== undefined) {
                includeImages.checked = result.includeImages;
            }
            if (result.preserveLinks !== undefined) {
                preserveLinks.checked = result.preserveLinks;
                updateImagesCheckbox();
            }
        });

        preserveLinks.addEventListener('change', updateImagesCheckbox);

        detectAminoPosts();
    }

    function updateImagesCheckbox() {
        if (preserveLinks.checked) {
            includeImages.checked = true;
            includeImages.disabled = true;
        } else {
            includeImages.disabled = false;
        }
    }

    function detectAminoPosts() {
        detectionText.textContent = 'Recherche des posts Amino...';
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'detectAminoPosts'}, function(response) {
                if (chrome.runtime.lastError) {
                    showDetectionError('Impossible de scanner la page. Assurez-vous d\'être sur une page Amino ou raffraichissez la page.');
                    return;
                }

                if (response && response.success) {
                    aminoPosts = response.posts || [];
                    const pageTitle = response.pageTitle || 'amino-page';
                    
                    filename.value = pageTitle;
                    filename.placeholder = pageTitle;
                    
                    displayDetectionResults();
                } else {
                    showDetectionError(response?.error || 'Erreur lors de la détection');
                }
            });
        });
    }

    function displayDetectionResults() {
        if (aminoPosts.length === 0) {
            detectionStatus.className = 'detection-box warning';
            detectionText.textContent = 'Aucun post Amino détecté sur cette page';
            return;
        }

        detectionStatus.className = 'detection-box success';
        detectionText.textContent = `${aminoPosts.length} post(s) Amino détecté(s) !`;
        
        postsFound.style.display = 'block';
        postsFound.innerHTML = '';
        
        aminoPosts.forEach((post, index) => {
            const postItem = document.createElement('div');
            postItem.className = 'post-item';
            postItem.textContent = `Post ${index + 1}: ${post.preview}`;
            postItem.dataset.index = index;
            
            postItem.addEventListener('click', function() {
                selectAminoPost(index);
            });
            
            postsFound.appendChild(postItem);
        });

        if (aminoPosts.length === 1) {
            selectAminoPost(0);
        }
    }

    function selectAminoPost(index) {
        selectedPost = aminoPosts[index];
        
        document.querySelectorAll('.post-item').forEach((item, i) => {
            item.classList.toggle('selected', i === index);
        });
        
        exportBtn.disabled = false;
        showStatus(`Post ${index + 1} sélectionné`, 'success');
    }

    function showDetectionError(message) {
        detectionStatus.className = 'detection-box warning';
        detectionText.textContent = message;
    }

    exportBtn.addEventListener('click', function() {
        const options = {
            includeImages: includeImages.checked,
            preserveLinks: preserveLinks.checked,
            filename: filename.value || filename.placeholder || 'amino-page'
        };

        chrome.storage.local.set({
            includeImages: options.includeImages,
            preserveLinks: options.preserveLinks
        });

        if (selectedPost) {
            exportSingleAminoPost(selectedPost, options);
        } else {
            showStatus('Veuillez sélectionner un post à exporter', 'error');
        }
    });

    function exportSingleAminoPost(post, options) {
        let exportType = 'PDF';
        if (options.preserveLinks) {
            exportType = 'ZIP (HTML + PDF)';
        } else if (options.includeImages) {
            exportType = 'ZIP (PDF + images)';
        }
        
        showStatus(`Export ${exportType} du post Amino en cours...`, 'info');
        exportBtn.disabled = true;

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'exportAminoPost',
                post: post,
                options: options
            }, handleExportResponse);
        });
    }

    function handleExportResponse(response) {
        exportBtn.disabled = false;
        
        if (chrome.runtime.lastError) {
            showStatus('Erreur: ' + chrome.runtime.lastError.message, 'error');
            return;
        }

        if (response && response.success) {
            let message = 'Export terminé avec succès !';
            
            if (response.result) {
                if (response.result.method === 'unified') {
                    message += ' (PDF optimisé sans coupures)';
                }
                
                if (response.result.htmlGenerated) {
                    message += ' (ZIP avec HTML + PDF téléchargé)';
                } else if (response.result.linksCount !== undefined && response.result.linksCount > 0) {
                    message += ` (${response.result.linksCount} lien${response.result.linksCount > 1 ? 's' : ''} dans le PDF)`;
                }
                
                if (response.result.pages) {
                    message += ` - ${response.result.pages} page${response.result.pages > 1 ? 's' : ''}`;
                }
                
                if (response.result.imagesCount) {
                    message += ` - ${response.result.imagesCount} image${response.result.imagesCount > 1 ? 's' : ''}`;
                }
            }
            
            showStatus(message, 'success');
            setTimeout(() => window.close(), 2000);
        } else {
            showStatus('Erreur lors de l\'export: ' + (response?.error || 'Erreur inconnue'), 'error');
        }
    }

    function showStatus(message, type = 'info') {
        status.textContent = message;
        status.className = 'status ' + type;
        status.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                status.style.display = 'none';
            }, 3000);
        }
    }
}); 