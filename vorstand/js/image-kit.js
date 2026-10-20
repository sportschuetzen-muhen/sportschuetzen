/**
 * ImageKit - Zentraler Bildverarbeitungs- und Normalisierungs-Standard
 * Sportschützen Muhen (Vorstand & Portal)
 * 
 * Bietet standardisierte Client-seitige Bildverarbeitung:
 * - Automatische Apple HEIC/HEIF Konvertierung via heic2any
 * - Robuste Multi-Fallback Bilddekodierung (createImageBitmap -> HTMLImageElement -> FileReader)
 * - Quadratischer Zuschnitt (Center-Crop) auf beliebige Dimensionen (z. B. 600x600 px Porträt)
 * - Proportionales Skalieren mit maximaler Kantenlänge (z. B. für News, OCR, Belege)
 * - Einheitliche Konvertierung in WebP Blob / JPEG Blob / DataURL
 */
(function() {
  'use strict';

  const ImageKit = {
    /**
     * Prüft, ob eine Datei ein Apple HEIC/HEIF Format ist.
     */
    isHeic(file) {
      if (!file) return false;
      const name = (file.name || '').toLowerCase();
      const type = (file.type || '').toLowerCase();
      return (
        name.endsWith('.heic') ||
        name.endsWith('.heif') ||
        type === 'image/heic' ||
        type === 'image/heif' ||
        type.includes('heic') ||
        type.includes('heif')
      );
    },

    /**
     * Normalisiert eine Bilddatei. Falls es sich um HEIC/HEIF handelt,
     * wird sie via heic2any clientseitig zu JPEG konvertiert.
     */
    async normalizeFile(file, options = {}) {
      if (!this.isHeic(file)) {
        return file;
      }

      if (typeof window.heic2any === 'undefined') {
        console.warn('ImageKit: heic2any Bibliothek nicht geladen. Versuche Standard-Verarbeitung.');
        return file;
      }

      const quality = options.quality || 0.90;
      try {
        const converted = await window.heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: quality
        });
        const blobObj = Array.isArray(converted) ? converted[0] : converted;
        const newName = (file.name || 'image').replace(/\.(heic|heif)$/i, '.jpg');
        return new File([blobObj], newName, { type: 'image/jpeg' });
      } catch (err) {
        console.warn('ImageKit: heic2any Konvertierungsfehler:', err);
        throw new Error('Das iPhone HEIC-Foto konnte nicht konvertiert werden: ' + (err.message || err));
      }
    },

    /**
     * Lädt ein Bild robust mit mehrstufigem Fallback:
     * 1. Automatische HEIC-Normalisierung
     * 2. Versuch über createImageBitmap
     * 3. Fallback über new Image() mit URL.createObjectURL & decode()
     * 4. Fallback über FileReader DataURL
     */
    async loadImage(fileOrBlob) {
      if (!fileOrBlob) throw new Error('Keine Bilddatei angegeben.');

      const normalized = await this.normalizeFile(fileOrBlob);

      // Versuch 1: createImageBitmap (sehr schnell)
      if (typeof window.createImageBitmap === 'function') {
        try {
          const bitmap = await window.createImageBitmap(normalized);
          return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            close: () => bitmap.close && bitmap.close()
          };
        } catch (bitmapErr) {
          console.warn('ImageKit: createImageBitmap fehlgeschlagen, nutze Fallback ImageElement:', bitmapErr.message);
        }
      }

      // Versuch 2: HTMLImageElement via Object URL
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          const objectUrl = URL.createObjectURL(normalized);
          image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
          };
          image.onerror = (e) => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('HTMLImageElement Dekodierung fehlgeschlagen.'));
          };
          image.src = objectUrl;
        });

        return {
          source: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          close: () => {}
        };
      } catch (objErr) {
        console.warn('ImageKit: ObjectURL fehlgeschlagen, nutze FileReader Fallback:', objErr.message);
      }

      // Versuch 3: FileReader DataURL
      const imgFromDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Das Bild konnte nicht dekodiert werden (Format wird vom Browser nicht unterstützt).'));
          image.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Dateizugriff fehlgeschlagen.'));
        reader.readAsDataURL(normalized);
      });

      return {
        source: imgFromDataUrl,
        width: imgFromDataUrl.naturalWidth || imgFromDataUrl.width,
        height: imgFromDataUrl.naturalHeight || imgFromDataUrl.height,
        close: () => {}
      };
    },

    /**
     * Schneidet ein Bild zentriert quadratisch zu (Center-Crop) und skaliert es auf targetSize.
     * Ideal für Profil- und Porträtfotos (z. B. 600x600 px).
     * 
     * @param {File|Blob} fileOrBlob 
     * @param {Object} options { size: 600, quality: 0.85, format: 'image/webp' }
     * @returns {Promise<{ blob: Blob, dataUrl: string, width: number, height: number, format: string }>}
     */
    async cropSquare(fileOrBlob, options = {}) {
      const targetSize = options.size || 600;
      const quality = options.quality !== undefined ? options.quality : 0.85;
      const format = options.format || 'image/webp';

      const loaded = await this.loadImage(fileOrBlob);

      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        // Bessere Rendering-Qualität
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const minSide = Math.min(loaded.width, loaded.height);
        const startX = (loaded.width - minSide) / 2;
        const startY = (loaded.height - minSide) / 2;

        ctx.drawImage(
          loaded.source,
          startX, startY, minSide, minSide,
          0, 0, targetSize, targetSize
        );

        // Blob generieren (mit automatischem JPEG-Fallback)
        let blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), format, quality);
        });

        let finalFormat = format;
        if (!blob && format === 'image/webp') {
          // Fallback auf JPEG
          finalFormat = 'image/jpeg';
          blob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
          });
        }

        if (!blob) throw new Error('Generierung des Bild-Blobs fehlgeschlagen.');

        const dataUrl = canvas.toDataURL(finalFormat, quality);

        return {
          blob,
          dataUrl,
          width: targetSize,
          height: targetSize,
          format: finalFormat
        };
      } finally {
        if (typeof loaded.close === 'function') loaded.close();
      }
    },

    /**
     * Skaliert ein Bild proportional auf eine maximale Kantenlänge (z. B. 1200 px).
     * 
     * @param {File|Blob} fileOrBlob 
     * @param {Object} options { maxDim: 1200, quality: 0.85, format: 'image/jpeg' }
     * @returns {Promise<{ blob: Blob, dataUrl: string, width: number, height: number, format: string }>}
     */
    async resize(fileOrBlob, options = {}) {
      const maxDim = options.maxDim || 1200;
      const quality = options.quality !== undefined ? options.quality : 0.85;
      const format = options.format || 'image/jpeg';

      const loaded = await this.loadImage(fileOrBlob);

      try {
        let width = loaded.width;
        let height = loaded.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(loaded.source, 0, 0, width, height);

        let blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), format, quality);
        });

        let finalFormat = format;
        if (!blob && format === 'image/webp') {
          finalFormat = 'image/jpeg';
          blob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
          });
        }

        if (!blob) throw new Error('Generierung des skalierten Bild-Blobs fehlgeschlagen.');

        const dataUrl = canvas.toDataURL(finalFormat, quality);

        return {
          blob,
          dataUrl,
          width,
          height,
          format: finalFormat
        };
      } finally {
        if (typeof loaded.close === 'function') loaded.close();
      }
    },

    /**
     * Konvertiert eine Datei (inkl. Apple HEIC) direkt in eine DataURL (Base64).
     */
    async fileToDataUrl(fileOrBlob, options = {}) {
      const normalized = await this.normalizeFile(fileOrBlob, options);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(normalized);
      });
    }
  };

  window.ImageKit = ImageKit;
})();
