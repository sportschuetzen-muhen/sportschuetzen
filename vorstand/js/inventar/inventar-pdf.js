// =========================================================
//  MODULE: INVENTAR - PDF
//  - Quittungs-Generierung (jsPDF), Signaturen-Rendering & Fallback-Recovery
// =========================================================

// =========================================================
//  PDF WIEDERHERSTELLEN
// =========================================================
async function regeneratePDF(groupJson) {
    try {
        const group = JSON.parse(decodeURIComponent(groupJson));
        if (!group?.length) return;
        const first     = group[0];
        const aktion    = (first.Aktion||"").toUpperCase();
        const isAusgabe = aktion==='AUSGABE'||aktion==='CHECKOUT';

        const items = group.map(t => ({
            itemId:           t.Inventar_ID,
            kategorie:        (t.Kategorie||"").toLowerCase(),
            zustandAbgabe:    t.Zustand_Abgabe    || '-',
            zustandRueckgabe: t.Zustand_Rueckgabe || '-',
            pfandBetrag:      parseFloat(t.Pfandbetrag)    || 0,
            pfandEinnahme:    t.Pfand_einnahme             || 'Nein',
            pfandRetour:      t.Pfand_retour_bezahlt       || 'Nein'
        }));

        const [sigMBase64, sigVBase64] = await Promise.all([
            urlToBase64(first.Unterschrift_URL || ""),
            urlToBase64(first.Sig_Vorstand     || "")
        ]);

        await generateQuittungPDF({
            action:                isAusgabe ? 'checkout' : 'checkin',
            Aktion:                first.Aktion,
            Aktueller_Besitzer_ID: first.Aktueller_Besitzer_ID,
            mitgliedId:            first.Aktueller_Besitzer_ID,
            Bemerkungen:           first.Bemerkungen || '',
            Verantwortliche_ID:    first.Verantwortliche_ID || '',
            sigMitglied:           sigMBase64,
            Sig_Vorstand:          sigVBase64,
            items
        }, String(first.Inventar_ID || '?'));
    } catch (err) {
        alert("PDF konnte nicht wiederhergestellt werden: " + err.message);
    }
}

async function urlToBase64(url) {
    if (!url) return "";
    try {
        const res  = await fetch(url);
        const blob = await res.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch { return ""; }
}

// =========================================================
//  PDF-QUITTUNG
// =========================================================
async function generateQuittungPDF(data, transId, sigMitgliedUrl, sigVorstandUrl) {
    const { jsPDF }    = window.jspdf;
    const doc          = new jsPDF();
    const mitgliedId   = data.Aktueller_Besitzer_ID || data.mitgliedId;
    const mitglied     = (inventarState.mitglieder||[])
        .find(m => m.ID.toString() === mitgliedId.toString());
    const mitgliedName = mitglied ? `${mitglied.Nachname} ${mitglied.Vorname}` : mitgliedId;
    const isAusgabe    = data.action==='checkout' || data.Aktion==='AUSGABE';
    const typ          = isAusgabe ? 'AUSGABE-QUITTUNG' : 'RÜCKNAHME-QUITTUNG';

    // Header
    doc.setFontSize(20); doc.setFont(undefined,'bold');
    doc.text("Sportschützen Muhen", 105, 18, { align:'center' });
    doc.setFontSize(15);
    doc.text(typ, 105, 28, { align:'center' });
    doc.setLineWidth(0.5); doc.line(20, 33, 190, 33);

    // Stammdaten
    doc.setFontSize(10); doc.setFont(undefined,'normal');
    let y = 42;
    const rowMeta = (label, value) => {
        doc.setFont(undefined,'bold');   doc.text(label, 20, y);
        doc.setFont(undefined,'normal'); doc.text(String(value||'-'), 65, y);
        y += 7;
    };
    rowMeta("Datum:",          formatCH(new Date()));
    rowMeta("Quittungs-Nr.:",  `T-${transId}`);
    rowMeta("Mitglied:",        mitgliedName);
    rowMeta("Verantwortlich:",  data.Verantwortliche_ID || '-');
    if (data.Bemerkungen) rowMeta("Bemerkungen:", data.Bemerkungen);
    y += 4;

    // Tabellen-Header
    doc.setFont(undefined,'bold');
    doc.setFillColor(30,30,30); doc.setTextColor(255,255,255);
    doc.rect(20, y, 170, 8, 'F');
    doc.text("Pos.",       22, y+5.5);
    doc.text("Kategorie",  35, y+5.5);
    doc.text("Gegenstand", 68, y+5.5);
    doc.text("Zustand",    130, y+5.5);
    doc.text("Pfand",      165, y+5.5);
    doc.setTextColor(0,0,0);
    y += 10;

    const keyMap = { "gewehr":"gewehre","schluessel":"schluessel",
                     "kleidung":"kleidung","schiessbekleidung":"schiessbekleidung" };
    const items  = data.items || [{
        itemId:           data.Inventar_ID || data.itemId,
        kategorie:        (data.Kategorie||data.kategorie||"").toLowerCase(),
        zustandAbgabe:    data.Zustand_Abgabe,
        zustandRueckgabe: data.Zustand_Rueckgabe,
        pfandBetrag:      data.Pfandbetrag || 0,
        pfandEinnahme:    data.Pfand_einnahme,
        pfandRetour:      data.Pfand_retour_bezahlt
    }];

    let totalPfand = 0;
    items.forEach((w, i) => {
        const item    = (inventarState[keyMap[w.kategorie]]||[])
            .find(it => it.ID.toString()===w.itemId.toString() ||
                        parseInt(it.ID)===parseInt(w.itemId));
        const label   = item ? getItemLabel(w.kategorie, item) : String(w.itemId);
        const zustand = isAusgabe ? w.zustandAbgabe : w.zustandRueckgabe;
        const pfand   = parseFloat(w.pfandBetrag) || 0;
        totalPfand   += pfand;

        if (i%2===0) {
            doc.setFillColor(245,245,245);
            doc.rect(20, y-1, 170, 8, 'F');
        }
        doc.setFont(undefined,'normal');
        doc.text(String(i+1), 22, y+5);
        doc.text((w.kategorie||'-').toUpperCase().slice(0,10), 35, y+5);
        doc.text(label.length>38 ? label.slice(0,36)+'…' : label, 68, y+5);
        doc.text(zustand||'-', 130, y+5);
        doc.text(pfand>0 ? `CHF ${pfand.toFixed(2)}` : '-', 165, y+5);
        y += 8;
        if (y > 245) { doc.addPage(); y = 20; }
    });

    // Pfand-Summe
    if (totalPfand > 0) {
        doc.setLineWidth(0.3); doc.line(130, y, 190, y); y += 5;
        doc.setFont(undefined,'bold');
        doc.text(`Total Pfand: CHF ${totalPfand.toFixed(2)}`, 130, y);
        const pfandStatus = isAusgabe
            ? (items[0]?.pfandEinnahme==='Ja' ? '✓ Kassiert' : '✗ Nicht kassiert')
            : (items[0]?.pfandRetour  ==='Ja' ? '✓ Retour bezahlt' : '✗ Noch offen');
        doc.setFont(undefined,'normal');
        doc.text(pfandStatus, 130, y+6);
        y += 14;
    }
    y += 8;

    // Unterschriften
    doc.setLineWidth(0.4); doc.line(20, y, 190, y); y += 8;
    doc.setFont(undefined,'bold'); doc.text("Unterschriften", 20, y);
    doc.setFont(undefined,'normal'); y += 8;

    const sigM = data.sigMitglied  || "";
    const sigV = data.Sig_Vorstand || "";

    if (sigM.length > 50) {
        doc.addImage(sigM, 'PNG', 20, y, 70, 22);
        doc.text("Mitglied", 20, y+26);
    } else if (sigMitgliedUrl) {
        doc.setFontSize(7); doc.setTextColor(100);
        doc.text(`Sig. Mitglied: ${sigMitgliedUrl}`, 20, y+10);
        doc.setFontSize(10); doc.setTextColor(0);
    }
    if (sigV.length > 50) {
        doc.addImage(sigV, 'PNG', 110, y, 70, 22);
        doc.text("Vorstand", 110, y+26);
    } else if (sigVorstandUrl) {
        doc.setFontSize(7); doc.setTextColor(100);
        doc.text(`Sig. Vorstand: ${sigVorstandUrl}`, 110, y+10);
        doc.setFontSize(10); doc.setTextColor(0);
    }

    // Footer
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Sportschützen Muhen | www.sportschuetzen-muhen.ch | ${formatCH(new Date())}`,
             105, 287, { align:'center' });

    const dateStr  = new Date().toISOString().split('T')[0].replace(/-/g,'');
    const typKurz  = isAusgabe ? 'Ausgabe' : 'Rueckgabe';
    doc.save(`${dateStr}_${typKurz}_${mitglied?.Nachname||'Unbekannt'}_T${transId}.pdf`);
}
