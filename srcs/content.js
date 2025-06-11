let librariesReady = false;

document.addEventListener('librariesReady', function() {
    librariesReady = true;
    console.log('Amino PDF Exporter: Bibliothèques prêtes');

    if (window.jspdf && !window.jsPDF) {
        window.jsPDF = window.jspdf.jsPDF;
    }
});

function init() {
    if (typeof jsPDF === 'undefined' && typeof window.jspdf === 'undefined') {
        console.error('jsPDF non disponible');
        return;
    }
    
    if (typeof JSZip === 'undefined') {
        console.error('JSZip non disponible');
        return;
    }
    
    if (window.jspdf && !window.jsPDF) {
        window.jsPDF = window.jspdf.jsPDF;
    }
    
    console.log('✅ Extension Amino Backup Tool initialisée');
    setupEventListeners();
}

function checkLibrariesAvailable() {
    const jsPDFAvailable = typeof jsPDF !== 'undefined' || (window.jspdf && typeof window.jspdf.jsPDF !== 'undefined');
    const jsZipAvailable = typeof JSZip !== 'undefined';
    
    if (!jsPDFAvailable) {
        throw new Error('jsPDF non disponible. Rechargez la page.');
    }
    
    if (!jsZipAvailable) {
        throw new Error('JSZip non disponible. Rechargez la page.');
    }
    
    console.log('📚 Toutes les librairies sont disponibles');
}

function setupEventListeners() {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        switch(request.action) {
            case 'detectAminoPosts':
                detectAminoPosts()
                    .then(result => sendResponse({
                        success: true, 
                        posts: result.posts, 
                        pageTitle: result.pageTitle
                    }))
                    .catch(error => sendResponse({success: false, error: error.message}));
                return true;
            case 'exportAminoPost':
                exportAminoPost(request.post, request.options)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({success: false, error: error.message}));
                return true;
            case 'testImageSupport':
                testImageSupport()
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({success: false, error: error.message}));
                return true;
        }
    });
}

async function detectAminoPosts() {
    try {
        const postElements = document.querySelectorAll('div.post-content-toggle');
        
        if (postElements.length === 0) {
            throw new Error('Aucun post Amino trouvé, assurez-vous de vous trouver sur un post Amino');
        }

        const posts = [];
        postElements.forEach((element, index) => {
            const textContent = element.textContent?.trim() || '';
            const preview = textContent.length > 60 
                ? textContent.substring(0, 60) + '...' 
                : textContent || `Post sans texte ${index + 1}`;

            posts.push({
                selector: `div.post-content-toggle:nth-of-type(${index + 1})`,
                preview: preview,
                index: index
            });
        });

        const pageTitle = getCleanPageTitle();

        return { posts: posts, pageTitle: pageTitle };
    } catch (error) {
        console.error('Erreur lors de la détection des posts Amino:', error);
        throw error;
    }
}

function getCleanPageTitle() {
    let title = document.title || 'amino-page';
    
    title = title
        .replace(/\s+/g, '_')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/[^\w\-_.]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
    
    if (!title || title.length === 0) {
        title = 'amino-page';
    }
    
    if (title.length > 50) {
        title = title.substring(0, 50).replace(/_$/, '');
    }
    
    return title;
}

function sanitizeFilename(filename) {
    return filename
        .replace(/\s+/g, '_')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/[^\w\-_.]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
        .substring(0, 50)
        .replace(/_$/, '') || 'amino-page';
}

async function exportAminoPost(post, options) {
    if (!options.filename) {
        options.filename = 'amino-page';
    }
    
    const element = document.querySelector(post.selector);
    if (!element) {
        throw new Error('Post Amino non trouvé sur la page');
    }
    
    const cleanFilename = sanitizeFilename(options.filename);
    
    return await generateUnifiedExport(element, cleanFilename, options);
}

async function generateUnifiedExport(element, cleanFilename, options) {
    try {
        checkLibrariesAvailable();
        
        const clonedElement = element.cloneNode(true);
        const images = await extractImagesAndUpdateHTML(clonedElement);
        const htmlContent = generateHTMLPage(clonedElement, cleanFilename);
        const pdfData = await generateOptimizedPDF(element, cleanFilename);
        
        await downloadBasedOnPreferences(htmlContent, pdfData, images, cleanFilename, options);
        
        return { 
            success: true, 
            linksCount: pdfData.linksCount,
            imagesCount: images.length,
            method: 'unified'
        };
    } catch (error) {
        console.error('Erreur lors de l\'export unifié:', error);
        throw error;
    }
}

async function generateOptimizedPDF(element, filename) {
    debugPDFProcess(element);
    
    const links = await extractLinks(element);
    
    const jsPDFClass = window.jsPDF || (window.jspdf && window.jspdf.jsPDF) || jsPDF;
    if (!jsPDFClass) {
        throw new Error('jsPDF non accessible. Veuillez recharger la page.');
    }
    
    const pdf = new jsPDFClass({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    const contentHeight = pageHeight - (margin * 2);
    
    const contentSections = await createContentSections(element, contentWidth, contentHeight);
    
    let pageNumber = 0;
    
    let hasFormatting = false;
    const allElements = element.querySelectorAll('b, strong, i, em, u, [style*="font-weight"], [style*="font-style"], [style*="color"]');
    if (allElements.length > 0) {
        hasFormatting = true;
    }
    
    for (const section of contentSections) {
        if (pageNumber > 0) {
            pdf.addPage();
        }
        
        let startY = margin;
        
        if (pageNumber === 0 && hasFormatting) {
            pdf.setFontSize(8);
            pdf.setTextColor(100, 100, 100);
            pdf.text('📄 Note: Le texte en gras est conservé, l\'italique apparaît en gris foncé', margin, startY);
            startY += 10;
            pdf.setTextColor(0, 0, 0);
        }
        
        await renderPageContent(pdf, section, margin, contentWidth, pageNumber, startY);
        pageNumber++;
    }
    
    await addLinksToMultiplePages(pdf, links, pageNumber);

    return {
        pdfBlob: pdf.output('blob'),
        linksCount: links.length,
        pages: pageNumber
    };
}

async function createContentSections(element, maxWidth, maxHeight) {
    const sections = [];
    const children = Array.from(element.children);
    
    const safeMaxHeight = maxHeight - 30;
    
    let currentSection = {
        elements: [],
        estimatedHeight: 0,
        images: []
    };
    
    for (const child of children) {
        const elementInfo = await analyzeElement(child, maxWidth);
        
        if (elementInfo.height > safeMaxHeight) {
            console.warn(`Élément trop grand pour une page: ${elementInfo.type}, hauteur: ${elementInfo.height}mm`);
            
            if (elementInfo.type === 'image') {
                elementInfo.height = safeMaxHeight - 20;
                elementInfo.width = elementInfo.width * (elementInfo.height / (elementInfo.height + 20));
            }
            else if ((elementInfo.type === 'paragraph' || elementInfo.type === 'text') && elementInfo.needsSplitting) {
                const splitElements = splitLongText(elementInfo, safeMaxHeight);
                
                for (const splitElement of splitElements) {
                    if (currentSection.estimatedHeight + splitElement.height > safeMaxHeight && currentSection.elements.length > 0) {
                        sections.push(currentSection);
                        currentSection = {
                            elements: [],
                            estimatedHeight: 0,
                            images: []
                        };
                    }
                    
                    currentSection.elements.push(splitElement);
                    currentSection.estimatedHeight += splitElement.height;
                }
                continue;
            }
        }
        
        if (currentSection.estimatedHeight + elementInfo.height > safeMaxHeight && currentSection.elements.length > 0) {
            sections.push(currentSection);
            currentSection = {
                elements: [],
                estimatedHeight: 0,
                images: []
            };
        }
        
        currentSection.elements.push(elementInfo);
        currentSection.estimatedHeight += elementInfo.height;
        
        if (elementInfo.type === 'image') {
            currentSection.images.push(elementInfo);
        }
    }
    
    if (currentSection.elements.length > 0) {
        sections.push(currentSection);
    }
    
    console.log(`Contenu divisé en ${sections.length} pages`);
    return sections;
}

function splitLongText(elementInfo, maxHeightPerChunk) {
    const chunks = [];
    const text = elementInfo.content;
    const maxCharsPerChunk = Math.floor((maxHeightPerChunk - 20) / 6 * 80);
    
    if (text.length <= maxCharsPerChunk) {
        return [elementInfo];
    }
    
    let currentPos = 0;
    let chunkIndex = 0;
    
    while (currentPos < text.length) {
        let endPos = Math.min(currentPos + maxCharsPerChunk, text.length);
        
        if (endPos < text.length) {
            const lastSpace = text.lastIndexOf(' ', endPos);
            const lastPeriod = text.lastIndexOf('.', endPos);
            const lastBreak = Math.max(lastSpace, lastPeriod);
            
            if (lastBreak > currentPos + maxCharsPerChunk * 0.7) {
                endPos = lastBreak + 1;
            }
        }
        
        const chunkText = text.substring(currentPos, endPos).trim();
        if (chunkText) {
            const chunkLineCount = Math.ceil(chunkText.length / 80);
            const chunkElement = {
                ...elementInfo,
                content: chunkText,
                height: chunkLineCount * 6 + 8,
                isChunk: true,
                chunkIndex: chunkIndex++,
                originalElement: elementInfo
            };
            
            chunks.push(chunkElement);
        }
        
        currentPos = endPos;
    }
    return chunks;
}

async function analyzeElement(element, maxWidth) {
    const tagName = element.tagName.toLowerCase();
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    
    let elementInfo = {
        element: element,
        type: 'unknown',
        height: 0,
        content: '',
        styles: {
            fontWeight: computedStyle.fontWeight,
            fontStyle: computedStyle.fontStyle,
            textAlign: computedStyle.textAlign,
            color: computedStyle.color,
            fontSize: computedStyle.fontSize,
            textDecoration: computedStyle.textDecoration
        }
    };
    
    switch (tagName) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
            elementInfo.type = 'heading';
            elementInfo.level = parseInt(tagName.charAt(1));
            elementInfo.content = element.textContent.trim();
            elementInfo.height = 20 + (6 - elementInfo.level) * 3;
            break;
            
        case 'p':
            elementInfo.type = 'paragraph';
            elementInfo.content = element.textContent.trim();
            
            const lineCount = Math.ceil(elementInfo.content.length / 70);
            elementInfo.height = lineCount * 7 + 8;
            
            if (elementInfo.height > 100) {
                elementInfo.needsSplitting = true;
                elementInfo.maxSafeLength = 1200;
            }
            break;
            
        case 'img':
            elementInfo.type = 'image';
            elementInfo.src = element.src;
            elementInfo.alt = element.alt || 'Image';
            
            const maxImageHeight = 120;
            const maxImageWidth = maxWidth - 10;
            
            let imgWidth = element.naturalWidth || element.width || rect.width || 200;
            let imgHeight = element.naturalHeight || element.height || rect.height || 150;
            
            let widthMM = imgWidth * 0.264583;
            let heightMM = imgHeight * 0.264583;
            
            const ratio = imgWidth / imgHeight;
            
            if (widthMM > maxImageWidth) {
                widthMM = maxImageWidth;
                heightMM = widthMM / ratio;
            }
            
            if (heightMM > maxImageHeight) {
                heightMM = maxImageHeight;
                widthMM = heightMM * ratio;
            }
            
            if (widthMM > maxImageWidth) {
                widthMM = maxImageWidth;
                heightMM = widthMM / ratio;
            }
            
            elementInfo.width = Math.min(widthMM, maxImageWidth);
            elementInfo.height = Math.min(heightMM, maxImageHeight);
            
            elementInfo.height += 10;
            break;
            
        case 'ul':
        case 'ol':
            elementInfo.type = 'list';
            elementInfo.ordered = tagName === 'ol';
            elementInfo.items = Array.from(element.querySelectorAll('li')).map(li => ({
                text: li.textContent.trim()
            }));
            elementInfo.height = elementInfo.items.length * 6 + 10;
            break;
            
        case 'div':
            const imgInDiv = element.querySelector('img');
            if (imgInDiv) {
                elementInfo.type = 'image';
                elementInfo.element = imgInDiv;
                elementInfo.src = imgInDiv.src;
                elementInfo.alt = imgInDiv.alt || 'Image';
                
                const maxImageHeight = 120;
                const maxImageWidth = maxWidth - 10;
                
                let imgWidth = imgInDiv.naturalWidth || imgInDiv.width || 200;
                let imgHeight = imgInDiv.naturalHeight || imgInDiv.height || 150;
                
                let widthMM = imgWidth * 0.264583;
                let heightMM = imgHeight * 0.264583;
                
                const ratio = imgWidth / imgHeight;
                
                if (widthMM > maxImageWidth) {
                    widthMM = maxImageWidth;
                    heightMM = widthMM / ratio;
                }
                
                if (heightMM > maxImageHeight) {
                    heightMM = maxImageHeight;
                    widthMM = heightMM * ratio;
                }
                
                elementInfo.width = Math.min(widthMM, maxImageWidth);
                elementInfo.height = Math.min(heightMM, maxImageHeight) + 10;
                
            } else {
                const textContent = element.textContent.trim();
                if (textContent) {
                    elementInfo.type = 'text';
                    elementInfo.content = textContent;
                    const divLineCount = Math.ceil(textContent.length / 70);
                    elementInfo.height = divLineCount * 6 + 5;
                } else {
                    elementInfo.height = 5;
                }
            }
            break;
            
        default:
            const defaultContent = element.textContent.trim();
            if (defaultContent) {
                elementInfo.type = 'text';
                elementInfo.content = defaultContent;
                const defaultLineCount = Math.ceil(defaultContent.length / 70);
                elementInfo.height = defaultLineCount * 6 + 3;
            } else {
                elementInfo.height = 3;
            }
    }
    
    return elementInfo;
}

function analyzeTextFormatting(element) {
    const formattedParts = [];
    
    function processNode(node, currentFormat = {}) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if (text.trim()) {
                formattedParts.push({
                    text: text,
                    ...currentFormat
                });
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            const computedStyle = window.getComputedStyle(node);
            const classList = node.classList || [];
            const className = node.className || '';
            
            const newFormat = { ...currentFormat };
            
            const classNames = className.toLowerCase().split(' ');
            
            if (classNames.includes('bold') || classNames.includes('strong') || classNames.includes('bolder') || classNames.includes('font-weight-bold')) {
                newFormat.bold = true;
            }
            
            if (classNames.includes('italic') || classNames.includes('italics') || classNames.includes('em') || classNames.includes('font-style-italic')) {
                newFormat.italic = true;
            }
            
            if (classNames.includes('underline') || classNames.includes('underlined') || classNames.includes('text-decoration-underline')) {
                newFormat.underline = true;
            }
            
            if (classNames.includes('center') || classNames.includes('text-center') || classNames.includes('centered')) {
                newFormat.align = 'center';
            } else if (classNames.includes('right') || classNames.includes('text-right')) {
                newFormat.align = 'right';
            } else if (classNames.includes('left') || classNames.includes('text-left')) {
                newFormat.align = 'left';
            }
            
            const colorClasses = classNames.filter(cls => 
                cls.startsWith('color-') || 
                cls.startsWith('text-') || 
                cls.includes('red') || cls.includes('blue') || cls.includes('green') ||
                cls.includes('purple') || cls.includes('orange') || cls.includes('yellow')
            );
            if (colorClasses.length > 0) {
                newFormat.hasColorClass = true;
            }
            
            if (tagName === 'b' || tagName === 'strong') {
                newFormat.bold = true;
            }
            
            if (tagName === 'i' || tagName === 'em') {
                newFormat.italic = true;
            }
            
            if (tagName === 'u') {
                newFormat.underline = true;
            }
            
            if (!newFormat.bold) {
                if (computedStyle.fontWeight === 'bold' || 
                    computedStyle.fontWeight === '700' ||
                    parseInt(computedStyle.fontWeight) >= 600) {
                    newFormat.bold = true;
                }
            }
            
            if (!newFormat.italic) {
                if (computedStyle.fontStyle === 'italic' ||
                    computedStyle.fontStyle === 'oblique') {
                    newFormat.italic = true;
                }
            }
            
            if (!newFormat.underline) {
                if (computedStyle.textDecoration.includes('underline')) {
                    newFormat.underline = true;
                }
            }
            
            if (!newFormat.hasColorClass) {
                const defaultColors = ['rgb(51, 51, 51)', 'rgb(0, 0, 0)', 'rgba(0, 0, 0, 1)', 'black', 'rgb(33, 37, 41)'];
                if (!defaultColors.includes(computedStyle.color)) {
                    newFormat.color = computedStyle.color;
                }
            }
            
            if (!newFormat.align) {
                if (computedStyle.textAlign && computedStyle.textAlign !== 'start' && computedStyle.textAlign !== 'left') {
                    newFormat.align = computedStyle.textAlign;
                }
            }
            
            for (const child of node.childNodes) {
                processNode(child, newFormat);
            }
        }
    }
    
    processNode(element);
    return formattedParts;
}

async function renderPageContent(pdf, section, margin, contentWidth, pageNumber, startY) {
    let currentY = startY;
    const lineHeight = 6;
    
    for (const elementInfo of section.elements) {
        currentY = await renderElement(pdf, elementInfo, margin, currentY, contentWidth, lineHeight);
        
        currentY += 3;
    }
}

async function renderElement(pdf, elementInfo, margin, currentY, contentWidth, lineHeight) {
    switch (elementInfo.type) {
        case 'heading':
            const fontSize = Math.max(16 - (elementInfo.level * 1), 12);
            pdf.setFontSize(fontSize);
            pdf.setFont(undefined, 'bold');
            pdf.setTextColor(0, 0, 0);
            
            const headingText = elementInfo.content || '';
            
            if (headingText.trim()) {
                const headingLines = pdf.splitTextToSize(headingText, contentWidth);
                pdf.text(headingLines, margin, currentY);
                
                const headingHeight = headingLines.length * (lineHeight + 2);
                
                pdf.setFont(undefined, 'normal');
                return currentY + headingHeight + 8;
            } else {
                pdf.setFont(undefined, 'normal');
                return currentY + 5;
            }
            
        case 'paragraph':
        case 'text':
            const text = elementInfo.content || '';
            
            if (!text.trim()) {
                return currentY + 3;
            }
            
            const element = elementInfo.element;
            const className = element.className || '';
            const classNames = className.toLowerCase().split(' ');
            
            const hasBold = classNames.includes('bold') || classNames.includes('strong') || classNames.includes('bolder');
            const hasItalic = classNames.includes('italic') || classNames.includes('italics') || classNames.includes('em');
            const hasUnderline = classNames.includes('underline') || classNames.includes('underlined');
            const hasCenter = classNames.includes('center') || classNames.includes('text-center') || classNames.includes('centered');
            const hasRight = classNames.includes('right') || classNames.includes('text-right');
            
            pdf.setFontSize(11);
            pdf.setFont(undefined, hasBold ? 'bold' : 'normal');
            
            if (hasItalic) {
                pdf.setTextColor(64, 64, 64);
            } else {
                pdf.setTextColor(0, 0, 0);
            }
            
            if (hasCenter) {
                const textLines = pdf.splitTextToSize(text, contentWidth);
                let lineY = currentY;
                
                textLines.forEach(line => {
                    const lineWidth = pdf.getTextWidth(line);
                    const xPos = margin + (contentWidth - lineWidth) / 2;
                    pdf.text(line, xPos, lineY);
                    lineY += lineHeight;
                });
                
                return lineY + 3;
            } else if (hasRight) {
                const textLines = pdf.splitTextToSize(text, contentWidth);
                let lineY = currentY;
                
                textLines.forEach(line => {
                    const lineWidth = pdf.getTextWidth(line);
                    const xPos = margin + contentWidth - lineWidth;
                    pdf.text(line, xPos, lineY);
                    lineY += lineHeight;
                });
                
                return lineY + 3;
            } else {
                const textLines = pdf.splitTextToSize(text, contentWidth);
                pdf.text(textLines, margin, currentY);
                
                const textHeight = textLines.length * lineHeight;
                
                if (hasUnderline) {
                }
                
                return currentY + textHeight + 3;
            }
            
        case 'list':
            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');
            pdf.setTextColor(0, 0, 0);
            
            let listY = currentY;
            
            for (let i = 0; i < elementInfo.items.length; i++) {
                const item = elementInfo.items[i];
                const prefix = elementInfo.ordered ? `${i + 1}. ` : '• ';
                const itemText = item.text || '';
                
                if (itemText.trim()) {
                    pdf.text(prefix, margin + 5, listY);
                    
                    const itemLines = pdf.splitTextToSize(itemText, contentWidth - 20);
                    pdf.text(itemLines, margin + 15, listY);
                    
                    listY += itemLines.length * lineHeight + 3;
                }
            }
            
            return listY + 5;
            
        case 'image':
            try {
                const imageData = await loadImageAsDataURL(elementInfo.element);
                
                if (imageData && imageData.length > 100) {
                    const xPos = margin + (contentWidth - elementInfo.width) / 2;
                    
                    pdf.addImage(imageData, 'JPEG', xPos, currentY, elementInfo.width, elementInfo.height - 10);
                    
                    return currentY + elementInfo.height;
                    
                } else {
                    throw new Error(`Image data invalide: ${imageData ? 'trop courte' : 'null'}`);
                }
                
            } catch (error) {
                console.error(`❌ ÉCHEC IMAGE: ${error.message}`);
                console.error(`❌ Stack:`, error.stack);
                
                pdf.setFontSize(9);
                pdf.setTextColor(255, 0, 0);
                pdf.text(`[ÉCHEC IMAGE]`, margin, currentY + 10);
                pdf.text(`Erreur: ${error.message}`, margin, currentY + 16);
                pdf.text(`Source: ${elementInfo.element.src.substring(0, 80)}`, margin, currentY + 22);
                pdf.setTextColor(0, 0, 0);
                
                return currentY + 30;
            }
            
        default:
            return currentY + 5;
    }
}

async function renderFormattedText(pdf, formattedParts, startX, startY, maxWidth, lineHeight) {
    let currentX = startX;
    let currentY = startY;
    const spaceWidth = pdf.getTextWidth(' ');
    
    for (const part of formattedParts) {
        const text = part.text;
        
        if (part.bold) {
            pdf.setFont(undefined, 'bold');
        } else {
            pdf.setFont(undefined, 'normal');
        }
        
        if (part.color) {
            const rgb = parseColor(part.color);
            if (rgb) {
                pdf.setTextColor(rgb.r, rgb.g, rgb.b);
            }
        } else if (part.italic) {
            pdf.setTextColor(64, 64, 64);
        } else {
            pdf.setTextColor(0, 0, 0);
        }
        
        pdf.setFontSize(11);
        
        const words = text.split(' ');
        
        let lineStartX = startX;
        if (part.align === 'center') {
            const lineText = words.join(' ');
            const textWidth = pdf.getTextWidth(lineText);
            lineStartX = startX + (maxWidth - textWidth) / 2;
        } else if (part.align === 'right') {
            const lineText = words.join(' ');
            const textWidth = pdf.getTextWidth(lineText);
            lineStartX = startX + maxWidth - textWidth;
        }
        
        currentX = lineStartX;
        
        for (let i = 0; i < words.length; i++) {
            let word = words[i];
            
            if (part.italic) {
            }
            
            if (part.underline) {
            }
            
            const wordWidth = pdf.getTextWidth(word);
            
            if (currentX + wordWidth > startX + maxWidth) {
                currentY += lineHeight;
                currentX = lineStartX;
                
                if (currentY > 250) {
                    console.warn('⚠️ Dépassement de page détecté');
                    break;
                }
            }
            
            pdf.text(word, currentX, currentY);
            currentX += wordWidth;
            
            if (i < words.length - 1) {
                currentX += spaceWidth;
            }
        }
        
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0, 0, 0);
    }
    
    return currentY + lineHeight;
}

function parseColor(colorString) {
    if (colorString.startsWith('rgb(')) {
        const matches = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (matches) {
            return {
                r: parseInt(matches[1]),
                g: parseInt(matches[2]),
                b: parseInt(matches[3])
            };
        }
    }
    
    const namedColors = {
        'red': { r: 255, g: 0, b: 0 },
        'blue': { r: 0, g: 0, b: 255 },
        'green': { r: 0, g: 128, b: 0 },
        'black': { r: 0, g: 0, b: 0 },
        'white': { r: 255, g: 255, b: 255 }
    };
    
    return namedColors[colorString.toLowerCase()] || null;
}

async function loadImageAsDataURL(imgElement) {
    return new Promise((resolve) => {
        try {
            if (imgElement.src.startsWith('data:')) {
                resolve(imgElement.src);
                return;
            }
            
            if (imgElement.complete && imgElement.naturalWidth > 0) {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    const width = imgElement.naturalWidth;
                    const height = imgElement.naturalHeight;
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    ctx.drawImage(imgElement, 0, 0);
                    
                    let dataURL = canvas.toDataURL('image/png');
                    
                    if (dataURL.length > 2000000) {
                        dataURL = canvas.toDataURL('image/jpeg', 0.8);
                    }
                    if (dataURL && dataURL.length > 100 && !dataURL.includes('data:,')) {
                        resolve(dataURL);
                        return;
                    }
                } catch (error) {
                    console.error('❌ Erreur conversion canvas:', error);
                }
            }
            
            console.log('🔄 Rechargement image...');
            const newImg = new Image();
            newImg.crossOrigin = 'anonymous';
            
            newImg.onload = function() {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    canvas.width = this.naturalWidth;
                    canvas.height = this.naturalHeight;
                    
                    ctx.drawImage(this, 0, 0);
                    const dataURL = canvas.toDataURL('image/jpeg', 0.7);
                    
                    if (dataURL && dataURL.length > 100) {
                        resolve(dataURL);
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    console.error('❌ Erreur rechargement:', error);
                    resolve(null);
                }
            };
            
            newImg.onerror = () => {
                resolve(null);
            };
            
            newImg.src = imgElement.src;
            
            setTimeout(() => {
                resolve(null);
            }, 8000);
            
        } catch (error) {
            console.error('❌ Erreur générale loadImage:', error);
            resolve(null);
        }
    });
}

async function testImageSupport() {
    const jsPDFClass = window.jsPDF || (window.jspdf && window.jspdf.jsPDF) || jsPDF;
    if (!jsPDFClass) {
        return { success: false, error: 'jsPDF non disponible' };
    }
    
    const testPdf = new jsPDFClass();
    
    if (typeof testPdf.addImage !== 'function') {
        return { success: false, error: 'addImage non supporté par jsPDF' };
    }
    
    try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 100;
        testCanvas.height = 100;
        const ctx = testCanvas.getContext('2d');
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(0, 0, 100, 100);
        
        const testDataURL = testCanvas.toDataURL('image/jpeg');
        testPdf.addImage(testDataURL, 'JPEG', 10, 10, 50, 50);
        
        return { 
            success: true, 
            message: 'Support des images confirmé',
            jsPDFVersion: testPdf.version || 'inconnue'
        };
    } catch (error) {
        console.error('❌ Test de support des images échoué:', error);
        return { 
            success: false, 
            error: `Test échoué: ${error.message}`,
            jsPDFVersion: testPdf.version || 'inconnue'
        };
    }
}

async function addLinksToMultiplePages(pdf, links, totalPages) {
}

async function downloadBasedOnPreferences(htmlContent, pdfData, images, filename, options) {
    const wantsLinks = options.preserveLinks;
    const wantsImages = options.includeImages && images.length > 0;
    
    if (wantsLinks && wantsImages) {
        await downloadCompleteZip(htmlContent, pdfData.pdfBlob, images, filename);
    } else if (wantsLinks && !wantsImages) {
        await downloadHtmlPdfZip(htmlContent, pdfData.pdfBlob, filename);
    } else if (!wantsLinks && wantsImages) {
        await downloadPdfImagesZip(pdfData.pdfBlob, images, filename);
    } else {
        downloadPDFOnly(pdfData.pdfBlob, filename);
    }
}

async function downloadCompleteZip(htmlContent, pdfBlob, images, filename) {
    const zip = new JSZip();
    
    zip.file(filename + '.pdf', pdfBlob);
    zip.file(filename + '.html', htmlContent);
    
    const imagesFolder = zip.folder('images');
    images.forEach(image => {
        imagesFolder.file(image.name, image.blob);
    });
    
    const zipBlob = await zip.generateAsync({type: 'blob'});
    downloadBlob(zipBlob, filename + '_complet.zip');
}

async function downloadHtmlPdfZip(htmlContent, pdfBlob, filename) {
    const zip = new JSZip();
    
    zip.file(filename + '.pdf', pdfBlob);
    zip.file(filename + '.html', htmlContent);
    
    const zipBlob = await zip.generateAsync({type: 'blob'});
    downloadBlob(zipBlob, filename + '_avec_liens.zip');
}

async function downloadPdfImagesZip(pdfBlob, images, filename) {
    const zip = new JSZip();
    
    zip.file(filename + '.pdf', pdfBlob);
    
    const imagesFolder = zip.folder('images');
    images.forEach(image => {
        imagesFolder.file(image.name, image.blob);
    });
    
    const zipBlob = await zip.generateAsync({type: 'blob'});
    downloadBlob(zipBlob, filename + '_avec_images.zip');
}

function downloadPDFOnly(pdfBlob, filename) {
    downloadBlob(pdfBlob, filename + '.pdf');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function exportWithHTML(element, cleanFilename, options) {
    return await generateUnifiedExport(element, cleanFilename, options);
}

async function exportPDFOnly(element, cleanFilename, options) {
    return await generateUnifiedExport(element, cleanFilename, options);
}

function generateHTMLPage(element, title) {
    const clonedElement = element.cloneNode(true);
    
    const extractedStyles = extractUsedStyles(element);
    
    const htmlTemplate = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .header {
            border-bottom: 2px solid #eee;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        .post-content {
            font-size: 16px;
        }
        
        .post-content img {
            width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 10px 0;
            display: block;
        }
        
        .post-content a {
            color: #007bff;
            text-decoration: none;
        }
        
        .post-content a:hover {
            text-decoration: underline;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        
        ${extractedStyles}
        
        .post-content b, .post-content strong, .post-content .bold, .post-content .bolder {
            font-weight: bold !important;
        }
        
        .post-content i, .post-content em, .post-content .italic, .post-content .italics {
            font-style: italic !important;
        }
        
        .post-content u, .post-content .underline, .post-content .underlined {
            text-decoration: underline !important;
        }
        
        .post-content .center, .post-content .text-center, .post-content .centered {
            text-align: center !important;
        }
        
        .post-content .left, .post-content .text-left {
            text-align: left !important;
        }
        
        .post-content .right, .post-content .text-right {
            text-align: right !important;
        }
        
        .post-content .bold.italic, .post-content .bold.italics, .post-content .bolder.italic, .post-content .bolder.italics {
            font-weight: bold !important;
            font-style: italic !important;
        }
        
        .post-content .bold.underline, .post-content .bolder.underline {
            font-weight: bold !important;
            text-decoration: underline !important;
        }
        
        .post-content .italic.underline, .post-content .italics.underline {
            font-style: italic !important;
            text-decoration: underline !important;
        }
        
        .post-content .bold.italic.underline, .post-content .bold.italics.underline, .post-content .bolder.italic.underline, .post-content .bolder.italics.underline {
            font-weight: bold !important;
            font-style: italic !important;
            text-decoration: underline !important;
        }
        
        .post-content .red, .post-content .color-red {
            color: #dc3545 !important;
        }
        
        .post-content .blue, .post-content .color-blue {
            color: #007bff !important;
        }
        
        .post-content .green, .post-content .color-green {
            color: #28a745 !important;
        }
        
        .post-content .purple, .post-content .color-purple {
            color: #6f42c1 !important;
        }
        
        .post-content .orange, .post-content .color-orange {
            color: #fd7e14 !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${escapeHtml(title)}</h1>
            <p>Exporté depuis Amino - ${new Date().toLocaleString('fr-FR')}</p>
        </div>
        
        <div class="post-content">
            ${preserveFormattingInHTML(clonedElement)}
        </div>
        
        <div class="footer">
            <p>Généré par Amino Backup Tool</p>
        </div>
    </div>
</body>
</html>`;
    
    return htmlTemplate;
}

function extractUsedStyles(element) {
    const stylesSet = new Set();
    const allElements = element.querySelectorAll('*');
    
    const elementsToProcess = [element, ...allElements];
    
    elementsToProcess.forEach(el => {
        const computedStyle = window.getComputedStyle(el);
        const className = el.className;
        const tagName = el.tagName.toLowerCase();
        
        if (el.style.cssText) {
            const selector = className ? `.${className.split(' ').join('.')}` : tagName;
            stylesSet.add(`${selector} { ${el.style.cssText} }`);
        }
        
        const importantStyles = [];
        
        if (computedStyle.color !== 'rgb(51, 51, 51)') {
            importantStyles.push(`color: ${computedStyle.color}`);
        }
        
        if (computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            importantStyles.push(`background-color: ${computedStyle.backgroundColor}`);
        }
        
        if (computedStyle.textAlign !== 'start') {
            importantStyles.push(`text-align: ${computedStyle.textAlign}`);
        }
        
        if (computedStyle.fontWeight !== '400' && computedStyle.fontWeight !== 'normal') {
            importantStyles.push(`font-weight: ${computedStyle.fontWeight}`);
        }
        
        if (computedStyle.fontStyle !== 'normal') {
            importantStyles.push(`font-style: ${computedStyle.fontStyle}`);
        }
        
        if (computedStyle.fontSize !== '16px') {
            importantStyles.push(`font-size: ${computedStyle.fontSize}`);
        }
        
        if (computedStyle.textDecoration !== 'none') {
            importantStyles.push(`text-decoration: ${computedStyle.textDecoration}`);
        }
        
        if (importantStyles.length > 0) {
            const selector = className ? `.${className.split(' ').join('.')}` : tagName;
            stylesSet.add(`${selector} { ${importantStyles.join('; ')} }`);
        }
    });
    
    return Array.from(stylesSet).join('\n');
}

function preserveFormattingInHTML(element) {
    const clone = element.cloneNode(true);
    
    const allElements = [clone, ...clone.querySelectorAll('*')];
    
    allElements.forEach(el => {
        const computedStyle = window.getComputedStyle(el);
        const classList = el.classList || [];
        const className = el.className || '';
        const inlineStyles = [];
        
        const classNames = className.toLowerCase().split(' ');
        
        if (classNames.includes('bold') || classNames.includes('strong') || classNames.includes('bolder')) {
            inlineStyles.push('font-weight: bold !important');
        }
        
        if (classNames.includes('italic') || classNames.includes('italics') || classNames.includes('em')) {
            inlineStyles.push('font-style: italic !important');
        }
        
        if (classNames.includes('underline') || classNames.includes('underlined')) {
            inlineStyles.push('text-decoration: underline !important');
        }
        
        if (classNames.includes('center') || classNames.includes('text-center') || classNames.includes('centered')) {
            inlineStyles.push('text-align: center !important');
        } else if (classNames.includes('right') || classNames.includes('text-right')) {
            inlineStyles.push('text-align: right !important');
        } else if (classNames.includes('left') || classNames.includes('text-left')) {
            inlineStyles.push('text-align: left !important');
        }
        
        if (!classNames.some(cls => ['bold', 'strong', 'bolder'].includes(cls))) {
            if (computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 600) {
                inlineStyles.push('font-weight: bold');
            }
        }
        
        if (!classNames.some(cls => ['italic', 'italics', 'em'].includes(cls))) {
            if (computedStyle.fontStyle === 'italic' || computedStyle.fontStyle === 'oblique') {
                inlineStyles.push('font-style: italic');
            }
        }
        
        if (!classNames.some(cls => ['underline', 'underlined'].includes(cls))) {
            if (computedStyle.textDecoration.includes('underline')) {
                inlineStyles.push('text-decoration: underline');
            }
        }
        const defaultColors = ['rgb(51, 51, 51)', 'rgb(0, 0, 0)', 'rgba(0, 0, 0, 1)', 'black', 'rgb(33, 37, 41)'];
        if (!defaultColors.includes(computedStyle.color)) {
            inlineStyles.push(`color: ${computedStyle.color}`);
        }
        
        if (!classNames.some(cls => ['center', 'text-center', 'centered', 'right', 'text-right', 'left', 'text-left'].includes(cls))) {
            if (computedStyle.textAlign && computedStyle.textAlign !== 'start' && computedStyle.textAlign !== 'left') {
                inlineStyles.push(`text-align: ${computedStyle.textAlign}`);
            }
        }
        
        if (computedStyle.fontSize !== '16px' && computedStyle.fontSize !== '14px') {
            inlineStyles.push(`font-size: ${computedStyle.fontSize}`);
        }
        
        if (inlineStyles.length > 0) {
            const existingStyle = el.getAttribute('style') || '';
            const newStyle = existingStyle + (existingStyle ? '; ' : '') + inlineStyles.join('; ');
            el.setAttribute('style', newStyle);
        }
        
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'b' || tagName === 'strong') {
            el.style.fontWeight = 'bold';
        }
        if (tagName === 'i' || tagName === 'em') {
            el.style.fontStyle = 'italic';
        }
        if (tagName === 'u') {
            el.style.textDecoration = 'underline';
        }
    });
    
    return clone.innerHTML;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function downloadTextFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, filename);
}

async function generatePDF(element, filename, options) {
    const pdfData = await generateOptimizedPDF(element, filename);
    
    if (options.includeImages) {
        const images = await extractImages(element);
        if (images.length > 0) {
            await downloadPdfImagesZip(pdfData.pdfBlob, images, filename);
            return { linksCount: pdfData.linksCount, method: 'unified-compat' };
        }
    }
    
    downloadPDFOnly(pdfData.pdfBlob, filename);
    return { linksCount: pdfData.linksCount, method: 'unified-compat' };
}

function findBestPageBreak(element, startY, endY, scaleY) {
    try {
        const domStartY = startY / scaleY;
        const domEndY = endY / scaleY;
        const searchRangeHeight = 20;
        
        const textElements = element.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th');
        let bestBreakPoint = endY;
        let minDistance = Infinity;
        
        for (const textEl of textElements) {
            const rect = textEl.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const relativeTop = rect.top - elementRect.top + element.scrollTop;
            const relativeBottom = relativeTop + rect.height;
            
            if (relativeTop >= domEndY - searchRangeHeight && relativeTop <= domEndY + searchRangeHeight) {
                const breakBefore = relativeTop * scaleY;
                const distance = Math.abs(breakBefore - endY);
                
                if (distance < minDistance && breakBefore > startY) {
                    minDistance = distance;
                    bestBreakPoint = breakBefore;
                }
            }
            
            if (relativeBottom >= domEndY - searchRangeHeight && relativeBottom <= domEndY + searchRangeHeight) {
                const breakAfter = relativeBottom * scaleY;
                const distance = Math.abs(breakAfter - endY);
                
                if (distance < minDistance && breakAfter > startY) {
                    minDistance = distance;
                    bestBreakPoint = breakAfter;
                }
            }
        }
        
        const maxDeviation = (endY - startY) * 0.1;
        if (Math.abs(bestBreakPoint - endY) > maxDeviation) {
            return endY;
        }
        
        return bestBreakPoint;
    } catch (error) {
        console.warn('Erreur lors de la recherche du meilleur point de coupure:', error);
        return endY;
    }
}

async function extractLinks(element) {
    const links = [];
    const linkElements = element.querySelectorAll('a[href]');
    
    linkElements.forEach((link, index) => {
        const rect = link.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        const relativeX = rect.left - elementRect.left + element.scrollLeft;
        const relativeY = rect.top - elementRect.top + element.scrollTop;
        
        const linkData = {
            url: link.href,
            text: link.textContent?.trim() || link.href,
            x: relativeX,
            y: relativeY,
            width: rect.width,
            height: rect.height,
            index: index
        };
        
        if (linkData.url && linkData.url !== '#' && linkData.width > 0 && linkData.height > 0) {
            links.push(linkData);
        }
    });
    
    return links;
}

function addLinksToPage(pdf, links, scaleX, scaleY, pageYOffset, pageHeight, pageNumber) {
    links.forEach(link => {
        const pdfX = link.x * scaleX;
        const pdfY = (link.y - pageYOffset) * scaleY;
        const pdfWidth = link.width * scaleX;
        const pdfHeight = link.height * scaleY;
        
        const linkBottom = link.y + link.height - pageYOffset;
        if (link.y >= pageYOffset && linkBottom <= pageYOffset + pageHeight) {
            try {
                pdf.link(pdfX, pdfY, pdfWidth, pdfHeight, { url: link.url });
            } catch (error) {
                console.warn(`Impossible d'ajouter le lien: ${link.url}`, error);
            }
        }
    });
}

async function extractImages(element) {
    const images = [];
    const imgElements = element.querySelectorAll('img');
    
    for (let i = 0; i < imgElements.length; i++) {
        const img = imgElements[i];
        try {
            const blob = await urlToBlob(img.src);
            const extension = getImageExtension(img.src);
            images.push({
                name: `image_${i + 1}.${extension}`,
                blob: blob
            });
        } catch (error) {
            console.warn('Impossible de télécharger l\'image:', img.src, error);
        }
    }
    
    return images;
}

async function urlToBlob(url) {
    const response = await fetch(url);
    return await response.blob();
}

function getImageExtension(url) {
    const match = url.match(/\.(jpg|jpeg|png|gif|svg|webp)(\?|$)/i);
    return match ? match[1].toLowerCase() : 'png';
}

async function downloadAsZip(pdf, images, filename) {
    const zip = new JSZip();
    
    const pdfBlob = pdf.output('blob');
    zip.file(filename + '.pdf', pdfBlob);
    
    const imagesFolder = zip.folder('images');
    images.forEach(image => {
        imagesFolder.file(image.name, image.blob);
    });
    
    const zipBlob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function downloadAsZipWithHTML(htmlContent, pdfData, images, filename) {
    const zip = new JSZip();
    
    zip.file(filename + '.html', htmlContent);
    zip.file(filename + '.pdf', pdfData.pdfBlob);
    
    if (images && images.length > 0) {
        const imagesFolder = zip.folder('images');
        images.forEach(image => {
            imagesFolder.file(image.name, image.blob);
        });
    }
    
    const zipBlob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function extractImagesAndUpdateHTML(element) {
    const images = [];
    const imgElements = element.querySelectorAll('img');
    
    for (let i = 0; i < imgElements.length; i++) {
        const img = imgElements[i];
        if (img.src && img.src.startsWith('http')) {
            try {
                const blob = await urlToBlob(img.src);
                const extension = getImageExtension(img.src);
                const imageName = `image_${i + 1}.${extension}`;
                
                images.push({
                    name: imageName,
                    blob: blob
                });
                
                img.src = `images/${imageName}`;
                
            } catch (error) {
                console.warn('Impossible de télécharger l\'image:', img.src, error);
            }
        }
    }
    
    return images;
}

async function generatePDFBlob(element, filename, options) {
    const pdfData = await generateOptimizedPDF(element, filename);
    
    const images = options.includeImages ? await extractImages(element) : [];
    
    return {
        pdfBlob: pdfData.pdfBlob,
        images: images,
        linksCount: pdfData.linksCount,
        method: 'unified-compat'
    };
}

function debugPDFProcess(element) {
    const jsPDFClass = window.jsPDF || (window.jspdf && window.jspdf.jsPDF) || jsPDF;
    if (jsPDFClass) {
        try {
            const testPdf = new jsPDFClass();
            testPdf.setFontSize(12);
            const testText = "Test de rendu de texte simple";
            const testLines = testPdf.splitTextToSize(testText, 100);
        } catch (e) {
            console.error('❌ Erreur création PDF test:', e);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}