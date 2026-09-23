// === IMMICH BILDER-INTEGRATION & LOKALER FALLBACK ===
const IMMICH_CONFIG = {
    // Auf true gesetzt, damit Immich-Alben geladen werden
    enabled: true,

    // Cloudflare Worker Proxy URL (wird bei Bedarf verwendet)
    workerUrl: "https://sportschuetzen-website-worker.dan-hunziker73.workers.dev",

    immichHost: "",
    sharedLinkKey: ""
};

document.addEventListener("DOMContentLoaded", () => {
    initGallery();
});

let galleryData = [];
let currentFilteredData = [];
let currentItemIndex = -1;
let itemsToShow = 12; // load 12 images initially
let activeCategory = "all";
let activeAlbum = "all";
let listenersInitialized = false;

async function initGallery() {
    const grid = document.getElementById("galerie-grid");
    if (!grid) return;

    // Loading State
    grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.5rem; color: var(--primary-color);"></i>
            <p style="margin-top: 1rem; color: var(--text-muted); font-weight: 600;">Lade Fotogalerie...</p>
        </div>
    `;

    let loaded = false;

    // Prüfe auf dynamische URL-Parameter (z.B. verein.html?album=XYZ&immichHost=...)
    const urlParams = new URLSearchParams(window.location.search);
    const activeHost = urlParams.get("immichHost") || IMMICH_CONFIG.immichHost;
    const activeKey = urlParams.get("album") || IMMICH_CONFIG.sharedLinkKey;

    // 1. Immich API Abfrage via Cloudflare Worker Proxy falls explizit in URL übergeben
    if (IMMICH_CONFIG.enabled && activeHost && activeKey) {
        try {
            const proxyUrl = `${IMMICH_CONFIG.workerUrl}?module=immich&action=album&host=${encodeURIComponent(activeHost)}&key=${encodeURIComponent(activeKey)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.photos && data.photos.length > 0) {
                    galleryData = data.photos;
                    loaded = true;
                    
                    const titleEl = document.querySelector("#galerie .section-header h2");
                    if (titleEl && data.albumTitle) {
                        titleEl.innerHTML = `${data.albumTitle} <span class="text-red">Fotogalerie</span>`;
                    }
                }
            }
        } catch (immichErr) {
            console.warn("Immich-Worker nicht erreichbar, lade lokales Archiv:", immichErr);
        }
    }

    // 2. Lokales Laden der galerie.json
    if (!loaded) {
        try {
            const response = await fetch("data/galerie.json?v=" + new Date().getTime());
            if (!response.ok) throw new Error("Netzwerk-Antwort war nicht ok");
            galleryData = await response.json();
            loaded = true;
        } catch (error) {
            console.error("Fehler beim Laden der Fotogalerie:", error);
            grid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1; padding: 3rem;">Bilder konnten nicht geladen werden.</p>';
            return;
        }
    }

    // Immich Proxy-Sicherheit: Alle Medien MÜSSEN über den Cloudflare-Worker-Proxy laufen,
    // da Immich "Cross-Origin-Resource-Policy: same-origin" sendet und Browser direkte Anfragen blockieren.
    galleryData = galleryData.map(item => {
        let thumb = item.thumbnailUrl || '';
        let img = item.imageUrl || '';
        let video = item.videoUrl || '';

        // Falls noch direkte Immich-URLs vorhanden sind, in Worker-Proxy-URLs umwandeln
        const assetId = item.id;
        const key = item.albumKey || (item.thumbnailUrl && item.thumbnailUrl.match(/[?&]key=([^&]+)/)?.[1]) || (item._directThumbnailUrl && item._directThumbnailUrl.match(/[?&]key=([^&]+)/)?.[1]);
        const host = 'https://immich-muhen.danfamily.uk';

        if (assetId && key) {
            if (!thumb.includes('workers.dev')) {
                thumb = `${IMMICH_CONFIG.workerUrl}?module=immich&action=image&host=${encodeURIComponent(host)}&key=${encodeURIComponent(key)}&id=${encodeURIComponent(assetId)}&size=thumbnail`;
            }
            if (!img.includes('workers.dev')) {
                img = `${IMMICH_CONFIG.workerUrl}?module=immich&action=image&host=${encodeURIComponent(host)}&key=${encodeURIComponent(key)}&id=${encodeURIComponent(assetId)}&size=preview`;
            }
            if ((item.mediaType === 'video' || video) && !video.includes('workers.dev')) {
                video = `${IMMICH_CONFIG.workerUrl}?module=immich&action=video&host=${encodeURIComponent(host)}&key=${encodeURIComponent(key)}&id=${encodeURIComponent(assetId)}`;
            }
        }

        return {
            ...item,
            thumbnailUrl: thumb,
            imageUrl: img,
            videoUrl: video
        };
    });

    // 3. Komponenten rendern
    generateAlbumFilters();
    generateTagCloud();
    renderGallery("all");
    setupGalleryListeners();
    renderMitgliederAlbums();
}

// Erstellt dynamische Filter-Buttons für die vorhandenen Alben
function generateAlbumFilters() {
    const container = document.getElementById("gallery-album-filters");
    if (!container) return;

    const albumCounts = {};
    galleryData.forEach(item => {
        const a = item.album || "Vereinsarchiv";
        albumCounts[a] = (albumCounts[a] || 0) + 1;
    });

    const albumNames = Object.keys(albumCounts);
    if (albumNames.length <= 1) {
        container.style.display = "none";
        return;
    }

    container.style.display = "flex";
    container.style.gap = "0.5rem";
    container.style.flexWrap = "wrap";
    container.style.justifyContent = "center";

    let html = `
        <button class="gallery-filter-btn ${activeAlbum === 'all' ? 'active' : ''}" data-album="all" onclick="window.filterByAlbum('all')">
            📁 Alle Alben (${galleryData.length})
        </button>
    `;

    albumNames.forEach(name => {
        const count = albumCounts[name];
        const isActive = activeAlbum === name;
        html += `
            <button class="gallery-filter-btn ${isActive ? 'active' : ''}" data-album="${encodeURIComponent(name)}" onclick="window.filterByAlbum('${encodeURIComponent(name)}')">
                📁 ${name} (${count})
            </button>
        `;
    });

    container.innerHTML = html;
}

window.filterByAlbum = function(albumNameEncoded) {
    activeAlbum = albumNameEncoded === 'all' ? 'all' : decodeURIComponent(albumNameEncoded);

    // Suchfeld leeren, damit das neue Album nicht durch alte Suche blockiert wird
    const searchInput = document.getElementById("gallery-search");
    if (searchInput) searchInput.value = "";

    const container = document.getElementById("gallery-album-filters");
    if (container) {
        container.querySelectorAll(".gallery-filter-btn").forEach(btn => {
            const bAlbum = btn.getAttribute("data-album");
            if (bAlbum === albumNameEncoded) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }

    renderGallery(activeCategory);
};

function setupGalleryListeners() {
    if (listenersInitialized) return;
    listenersInitialized = true;

    // Category filter listeners
    document.querySelectorAll(".gallery-filters:not(#gallery-album-filters) .gallery-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".gallery-filters:not(#gallery-album-filters) .gallery-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeCategory = btn.getAttribute("data-category");
            const searchInput = document.getElementById("gallery-search");
            if (searchInput) searchInput.value = "";
            renderGallery(activeCategory);
        });
    });

    // Search listener
    const searchInput = document.getElementById("gallery-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            document.querySelectorAll(".gallery-filters:not(#gallery-album-filters) .gallery-filter-btn").forEach(b => b.classList.remove("active"));
            const allBtn = document.querySelector('.gallery-filters:not(#gallery-album-filters) .gallery-filter-btn[data-category="all"]');
            if (allBtn) allBtn.classList.add("active");
            activeCategory = "all";
            renderGallery("all");
        });
    }
}

// Generate the tag cloud from top detected persons & tags
function generateTagCloud() {
    const container = document.getElementById("gallery-tag-cloud");
    if (!container) return;

    const tagCounts = {};
    const personCounts = {};

    galleryData.forEach(item => {
        if (item.tags) {
            item.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
        if (item.detectedPersons) {
            item.detectedPersons.forEach(person => {
                personCounts[person] = (personCounts[person] || 0) + 1;
            });
        }
    });

    const topTags = Object.keys(tagCounts)
        .sort((a, b) => tagCounts[b] - tagCounts[a])
        .slice(0, 8);

    const topPersons = Object.keys(personCounts)
        .sort((a, b) => personCounts[b] - personCounts[a])
        .slice(0, 8);

    let html = "";
    
    if (topTags.length > 0 || topPersons.length > 0) {
        html += `<span style="color:var(--text-muted); font-size:0.85rem; font-weight:600; width:100%; text-align:center; margin-bottom:0.25rem; user-select:none;">Häufig gesucht:</span>`;
    }

    topPersons.forEach(person => {
        html += `<span class="gallery-tag-pill person-pill" onclick="window.filterByTag('person:${person}')">👤 ${person}</span>`;
    });

    topTags.forEach(tag => {
        html += `<span class="gallery-tag-pill tag-pill" onclick="window.filterByTag('tag:${tag}')">#${tag}</span>`;
    });

    container.innerHTML = html;
}

window.filterByTag = function(value) {
    const searchInput = document.getElementById("gallery-search");
    if (!searchInput) return;

    if (value.startsWith("tag:")) {
        searchInput.value = value.substring(4);
    } else if (value.startsWith("person:")) {
        searchInput.value = value.substring(7);
    }

    // Bei Tagsuche auf "Alle Alben" & "Alle Kategorien" zurücksetzen
    activeAlbum = "all";
    const albumContainer = document.getElementById("gallery-album-filters");
    if (albumContainer) {
        albumContainer.querySelectorAll(".gallery-filter-btn").forEach(btn => {
            if (btn.getAttribute("data-album") === "all") btn.classList.add("active");
            else btn.classList.remove("active");
        });
    }

    document.querySelectorAll(".gallery-filters:not(#gallery-album-filters) .gallery-filter-btn").forEach(b => b.classList.remove("active"));
    const allBtn = document.querySelector('.gallery-filters:not(#gallery-album-filters) .gallery-filter-btn[data-category="all"]');
    if (allBtn) allBtn.classList.add("active");
    activeCategory = "all";

    renderGallery("all");
    window.closeLightbox();
};

function formatPhotoUrl(url) {
    if (!url) return "";
    return url;
}

function renderGallery(filter, append = false) {
    const grid = document.getElementById("galerie-grid");
    if (!grid) return;

    if (!append) {
        itemsToShow = 12; // Reset pagination counter
    }

    let filtered = galleryData;

    // Album Filter
    if (activeAlbum !== "all") {
        filtered = filtered.filter(item => (item.album || "Vereinsarchiv") === activeAlbum);
    }

    // Category Filter
    if (filter !== "all") {
        filtered = filtered.filter(item => item.category === filter);
    }

    // Search input filter
    const searchInput = document.getElementById("gallery-search");
    if (searchInput && searchInput.value) {
        const searchVal = searchInput.value.toLowerCase();
        filtered = filtered.filter(item => {
            const title = (item.title || "").toLowerCase();
            const desc = (item.description || "").toLowerCase();
            const album = (item.album || "").toLowerCase();
            const tags = (item.tags || []).join(" ").toLowerCase();
            const persons = (item.detectedPersons || []).join(" ").toLowerCase();
            return title.includes(searchVal) || desc.includes(searchVal) || album.includes(searchVal) || tags.includes(searchVal) || persons.includes(searchVal);
        });
    }

    currentFilteredData = filtered; // Save globally for lightbox controls
    const totalItems = filtered.length;
    const itemsToDisplay = filtered.slice(0, itemsToShow);

    if (itemsToDisplay.length === 0) {
        grid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1; padding: 3rem;">Keine Fotos gefunden, die zu deinen Filtern passen.</p>';
        updateLoadMoreButton(0, 0);
        return;
    }

    if (!append) {
        grid.innerHTML = "";
    }

    const startIndex = append ? grid.children.length : 0;
    const sliceToAppend = itemsToDisplay.slice(startIndex);

    sliceToAppend.forEach((item, index) => {
        const globalIndex = startIndex + index;
        const card = document.createElement("div");
        card.className = "masonry-item fade-in-up";
        card.style.cursor = "pointer";
        card.style.animationDelay = `${index * 0.04}s`;
        card.addEventListener("click", () => openLightbox(globalIndex));

        const fallbacks = [
            "linear-gradient(135deg, #0f3c5c 0%, #1e40af 100%)",
            "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
            "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
            "linear-gradient(135deg, #7c2d12 0%, #f97316 100%)",
            "linear-gradient(135deg, #581c87 0%, #a855f7 100%)",
            "linear-gradient(135deg, #4c1d95 0%, #6366f1 100%)"
        ];
        const gradient = fallbacks[globalIndex % fallbacks.length];
        const imgPlaceholderId = `img-gallery-${item.id}`;
        const displayThumbUrl = formatPhotoUrl(item.thumbnailUrl || item.imageUrl);
        const isVideo = item.mediaType === 'video' || !!item.videoUrl;

        const videoBadge = isVideo 
            ? `<span style="position: absolute; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.75); color: #fff; padding: 4px 9px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; backdrop-filter: blur(4px); z-index: 2;">▶ Video</span>`
            : '';

        const albumBadge = item.album 
            ? `<span style="font-size: 0.72rem; background: rgba(15, 60, 92, 0.08); color: var(--primary-color); border-radius: 4px; padding: 2px 7px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;" title="${item.album}">📁 ${item.album}</span>`
            : '';

        card.innerHTML = `
            <div class="gallery-img-container" style="position: relative;">
                ${videoBadge}
                <img id="${imgPlaceholderId}" src="${displayThumbUrl}" alt="${item.title}" class="masonry-img" loading="lazy" onerror="window.handleImageError(this, '${gradient}', '${item.id}')">
                <div class="gallery-img-overlay">
                    <span class="gallery-zoom-icon">${isVideo ? '▶' : '🔍'}</span>
                </div>
            </div>
            <div class="masonry-caption">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.35rem; flex-wrap: wrap; gap: 4px;">
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <span class="badge-sm badge-${item.category}">${getCategoryLabel(item.category)}</span>
                        ${albumBadge}
                    </div>
                    <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">${item.date}</span>
                </div>
                <h4 style="margin: 5px 0 0 0; font-size:1.05rem; font-weight:700; color:var(--primary-color); text-align: left;">${item.title}</h4>
            </div>
        `;
        grid.appendChild(card);
    });

    updateLoadMoreButton(itemsToShow, totalItems);
}

function updateLoadMoreButton(visibleCount, totalCount) {
    const container = document.getElementById("gallery-load-more-container");
    const btn = document.getElementById("gallery-load-more-btn");
    if (!container || !btn) return;

    if (visibleCount < totalCount) {
        container.style.display = "block";
        btn.onclick = () => {
            itemsToShow += 12;
            renderGallery(activeCategory, true);
        };
    } else {
        container.style.display = "none";
    }
}

// Gracefully replace missing image files with an elegant text gradient card
window.handleImageError = (imgEl, gradient, itemId) => {
    // Falls noch nicht versucht: Einmaliger Retry mit Cache-Buster
    if (!imgEl.dataset.retried) {
        imgEl.dataset.retried = "true";
        const sep = imgEl.src.includes('?') ? '&' : '?';
        imgEl.src = imgEl.src + sep + '_retry=' + Date.now();
        return;
    }

    const parent = imgEl.parentElement;
    if (!parent) return;

    const placeholder = document.createElement("div");
    placeholder.className = "gallery-img-fallback-container";
    placeholder.style.background = gradient;
    placeholder.innerHTML = `
        <div class="fallback-icon">📷</div>
        <div class="fallback-text">Vorschau</div>
    `;
    
    imgEl.style.display = "none";
    parent.appendChild(placeholder);
};

function getCategoryLabel(cat) {
    switch (cat) {
        case "geschichte": return "Geschichte";
        case "events": return "Events";
        case "nachwuchs": return "Nachwuchs";
        default: return cat;
    }
}

// === LIGHTBOX FUNCTIONALITY ===
function openLightbox(index) {
    const lightbox = document.getElementById("galerie-lightbox");
    const img = document.getElementById("lightbox-img");
    const video = document.getElementById("lightbox-video");
    const fallback = document.getElementById("lightbox-fallback");
    const title = document.getElementById("lightbox-title");
    const desc = document.getElementById("lightbox-desc");
    const category = document.getElementById("lightbox-category");
    const albumEl = document.getElementById("lightbox-album");
    const date = document.getElementById("lightbox-date");

    if (!lightbox) return;

    currentItemIndex = index;
    const item = currentFilteredData[index];
    if (!item) return;

    const isVideo = item.mediaType === 'video' || !!item.videoUrl;

    if (isVideo) {
        if (img) img.style.display = "none";
        if (fallback) fallback.style.display = "none";
        if (video) {
            video.style.display = "block";
            video.src = item.videoUrl;
            video.poster = formatPhotoUrl(item.imageUrl || item.thumbnailUrl);
            video.load();
        }
    } else {
        if (video) {
            video.style.display = "none";
            video.pause();
            video.src = "";
        }
        if (img) {
            img.style.display = "block";
            if (fallback) fallback.style.display = "none";
            img.src = formatPhotoUrl(item.imageUrl || item.thumbnailUrl);
            img.alt = item.title;

            img.onerror = () => {
                if (!img.dataset.retried) {
                    img.dataset.retried = "true";
                    const sep = img.src.includes('?') ? '&' : '?';
                    img.src = img.src + sep + '_retry=' + Date.now();
                    return;
                }
                img.style.display = "none";
                if (fallback) {
                    fallback.style.display = "flex";
                    fallback.style.background = "linear-gradient(135deg, #0f3c5c 0%, #ef4444 100%)";
                    fallback.innerHTML = `
                        <span style="font-size:3rem; margin-bottom:1rem;">📷</span>
                        <span style="font-weight:600; text-transform:uppercase; letter-spacing:1px; font-size:0.85rem; opacity:0.8;">Bild konnte nicht geladen werden</span>
                    `;
                }
            };
        }
    }

    if (title) title.textContent = item.title;
    if (desc) desc.innerHTML = item.description || "";
    
    if (category) {
        category.textContent = getCategoryLabel(item.category);
        category.className = `category-badge badge-${item.category}`;
    }

    if (albumEl) {
        if (item.album) {
            albumEl.textContent = `📁 ${item.album}`;
            albumEl.style.display = "inline-block";
        } else {
            albumEl.style.display = "none";
        }
    }

    if (date) date.textContent = item.date;

    // Render detected persons
    const personsContainer = document.getElementById("lightbox-persons");
    if (personsContainer) {
        if (item.detectedPersons && item.detectedPersons.length > 0) {
            personsContainer.innerHTML = `
                <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.08); font-size: 0.85rem;">
                    <strong style="color: var(--primary-color); display: block; margin-bottom: 0.35rem;">Personen (Internes Archiv):</strong>
                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                        ${item.detectedPersons.map(person => `<span class="person-tag" style="background: rgba(15, 60, 92, 0.08); color: var(--primary-color); border: 1px solid rgba(15, 60, 92, 0.15); padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; cursor: pointer;" onclick="window.filterByTag('person:${person}')">👤 ${person}</span>`).join('')}
                    </div>
                </div>
            `;
            personsContainer.style.display = "block";
        } else {
            personsContainer.innerHTML = "";
            personsContainer.style.display = "none";
        }
    }

    // Render tags
    const tagsContainer = document.getElementById("lightbox-tags");
    if (tagsContainer) {
        if (item.tags && item.tags.length > 0) {
            tagsContainer.innerHTML = item.tags.map(tag => `<span style="background: rgba(239, 68, 68, 0.06); color: var(--accent-color); border: 1px solid rgba(239, 68, 68, 0.12); font-size: 0.7rem; padding: 2px 7px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;" onclick="window.filterByTag('tag:${tag}')">#${tag}</span>`).join(' ');
            tagsContainer.style.display = "flex";
        } else {
            tagsContainer.innerHTML = "";
            tagsContainer.style.display = "none";
        }
    }

    lightbox.style.display = "flex";
    document.body.classList.add("no-scroll");
}

window.closeLightbox = () => {
    const lightbox = document.getElementById("galerie-lightbox");
    if (!lightbox) return;

    const video = document.getElementById("lightbox-video");
    if (video) {
        video.pause();
        video.src = "";
    }

    lightbox.style.display = "none";
    document.body.classList.remove("no-scroll");
};

window.nextLightbox = function(e) {
    if (e) e.stopPropagation();
    if (currentFilteredData.length <= 1) return;
    
    let nextIndex = currentItemIndex + 1;
    if (nextIndex >= currentFilteredData.length) {
        nextIndex = 0;
    }
    openLightbox(nextIndex);
};

window.prevLightbox = function(e) {
    if (e) e.stopPropagation();
    if (currentFilteredData.length <= 1) return;
    
    let prevIndex = currentItemIndex - 1;
    if (prevIndex < 0) {
        prevIndex = currentFilteredData.length - 1;
    }
    openLightbox(prevIndex);
};

// Keyboard events
document.addEventListener("keydown", (e) => {
    const lightbox = document.getElementById("galerie-lightbox");
    if (!lightbox || lightbox.style.display === "none") return;

    if (e.key === "ArrowRight") {
        window.nextLightbox();
    } else if (e.key === "ArrowLeft") {
        window.prevLightbox();
    } else if (e.key === "Escape") {
        window.closeLightbox();
    }
});

// Close lightbox on clicking outside content
document.addEventListener("DOMContentLoaded", () => {
    const lightbox = document.getElementById("galerie-lightbox");
    if (lightbox) {
        lightbox.addEventListener("click", (e) => {
            if (e.target === lightbox) {
                window.closeLightbox();
            }
        });
    }
});

// Rendert die tatsächlichen Alben im geschützten Mitgliederbereich
function renderMitgliederAlbums() {
    const grid = document.getElementById("immich-albums-grid");
    if (!grid) return;

    // Gruppiere Alben
    const albumsMap = {};
    galleryData.forEach(item => {
        const a = item.album || "Vereinsarchiv";
        if (!albumsMap[a]) {
            albumsMap[a] = {
                title: a,
                coverUrl: item.thumbnailUrl || item.imageUrl,
                count: 0,
                year: item.date || ''
            };
        }
        albumsMap[a].count++;
    });

    const albumNames = Object.keys(albumsMap);
    if (albumNames.length === 0) return;

    let html = "";
    albumNames.forEach(name => {
        const alb = albumsMap[name];
        html += `
            <div class="glass-card" style="padding: 1.5rem; text-align: center; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="position: relative; width: 100%; height: 160px; border-radius: 10px; overflow: hidden; margin-bottom: 1rem; background: rgba(15,60,92,0.05);">
                        <img src="${alb.coverUrl}" alt="${alb.title}" style="width: 100%; height: 100%; object-fit: cover;">
                        <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #fff; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 4px;">
                            ${alb.count} Medien
                        </span>
                    </div>
                    <h4 style="margin-bottom: 0.5rem; color: var(--primary-color);">${alb.title}</h4>
                    <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem;">Fotos und Videos direkt aus unserem Immich-Vereinsarchiv.</p>
                </div>
                <button onclick="window.filterByAlbum('${encodeURIComponent(name)}'); document.getElementById('galerie').scrollIntoView({behavior: 'smooth'});" class="btn btn-outline" style="font-size: 0.85rem; width: 100%;">
                    In Galerie öffnen
                </button>
            </div>
        `;
    });

    grid.innerHTML = html;
}
