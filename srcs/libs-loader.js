// Chargeur de librairies pour Amino Backup Tool
(function() {
    'use strict';
    
    // Compatibilité jsPDF
    if (window.jspdf && !window.jsPDF) {
        window.jsPDF = window.jspdf.jsPDF;
    }
    
    // Vérification de la disponibilité des librairies
    const libsStatus = {
        jsPDF: typeof jsPDF !== 'undefined' || (window.jspdf && typeof window.jspdf.jsPDF !== 'undefined'),
        JSZip: typeof JSZip !== 'undefined'
    };
    
    console.log('📚 Statut des librairies:', libsStatus);
    
    // S'assurer que toutes les librairies sont disponibles
    if (!libsStatus.jsPDF) {
        console.error('❌ jsPDF non disponible');
    }
    if (!libsStatus.JSZip) {
        console.error('❌ JSZip non disponible');
    }
    
    if (libsStatus.jsPDF && libsStatus.JSZip) {
        console.log('✅ Toutes les librairies sont chargées correctement');
    }
})(); 