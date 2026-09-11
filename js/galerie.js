// === IMMICH BILDER-INTEGRATION (VARIANTE A) & LOKALER FALLBACK ===
const IMMICH_CONFIG = {
    // Auf true gesetzt, damit Immich-Alben direkt geladen werden
    enabled: true,

    // Cloudflare Worker Proxy URL für Edge-Caching, CORS-Handling und Heim-IP-Schutz
    workerUrl: "https://v1-vorstand-api.dan-hunziker73.workers.dev",

    // Basis-URL deiner Immich-Instanz (z.B. "https://fotos.sportschuetzen-muhen.ch" oder Cloudflare Tunnel)
    // Kann auch dynamisch per URL-Parameter übergeben werden: ?immichHost=https://...
    immichHost: "",

    // Der Freigabe-Schlüssel (Shared Link Key) deines Albums in Immich (z.B. aus https://.../share/XYZ -> "XYZ")
    // Kann auch dynamisch per URL-Parameter übergeben werden: ?album=XYZ
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

    // 1. Immich API Abfrage via Cloudflare Worker Proxy
    if (IMMICH_CONFIG.enabled && activeHost && activeKey) {
        try {
            const proxyUrl = `${IMMICH_CONFIG.workerUrl}?module=immich&action=album&host=${encodeURIComponent(activeHost)}&key=${encodeURIComponent(activeKey)}`;
            console.log("Frage Immich-Album via Worker ab:", proxyUrl);
            
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.photos && data.photos.length > 0) {
                    galleryData = data.photos;
                    loaded = true;
                    console.log(`✅ ${data.photos.length} Fotos erfolgreich aus Immich geladen ("${data.albumTitle}")`);
                    
                    // Album-Titel in Überschrift dynamisch anzeigen
                    const titleEl = document.querySelector("#galerie .section-header h2");
                    if (titleEl && data.albumTitle) {
                        titleEl.innerHTML = `${data.albumTitle} <span class="text-red">Fotogalerie</span>`;
                    }
                }
            } else {
                console.warn("Worker meldete Status:", response.status);
            }
        } catch (immichErr) {
            console.warn("Immich-Verbindung nicht erfolgreich, lade lokales Archiv:", immichErr);
        }
    }

    // 2. Lokales Fallback auf galerie.json
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

    // 3. Komponenten rendern
    generateTagCloud();
    renderGallery("all");
    setupGalleryListeners();
}

function setupGalleryListeners() {
    if (listenersInitialized) return;
    listenersInitialized = true;

    // Category filter listeners
    document.querySelectorAll(".gallery-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".gallery-filter-btn").forEach(b => b.classList.remove("active"));
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
            document.querySelectorAll(".gallery-filter-btn").forEach(b => b.classList.remove("active"));
            const allBtn = document.querySelector('.gallery-filter-btn[data-category="all"]');
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

    // Reset categories for a global search
    document.querySelectorAll(".gallery-filter-btn").forEach(b => b.classList.remove("active"));
    const allBtn = document.querySelector('.gallery-filter-btn[data-category="all"]');
    if (allBtn) allBtn.classList.add("active");
    activeCategory = "all";

    renderGallery("all");
    
    // Close lightbox if it was open
    window.closeLightbox();
};

function formatPhotoUrl(url) {
    if (!url) return "";
    // If running on local dev server, use the local proxy to bypass CORP same-origin restriction
    if (window.location.hostname === "localhost" && url.includes("immich-muhen.danfamily.uk")) {
        return "/api/immich-proxy?url=" + encodeURIComponent(url);
    }
    return url;
}

function renderGallery(filter, append = false) {
    const grid = document.getElementById("galerie-grid");
    if (!grid) return;

    if (!append) {
        itemsToShow = 12; // Reset pagination counter
    }

    let filtered = filter === "all" 
        ? galleryData 
        : galleryData.filter(item => item.category === filter);

    const searchInput = document.getElementById("gallery-search");
    if (searchInput && searchInput.value) {
        const searchVal = searchInput.value.toLowerCase();
        filtered = filtered.filter(item => {
            const title = (item.title || "").toLowerCase();
            const desc = (item.description || "").toLowerCase();
            const tags = (item.tags || []).join(" ").toLowerCase();
            const persons = (item.detectedPersons || []).join(" ").toLowerCase();
            return title.includes(searchVal) || desc.includes(searchVal) || tags.includes(searchVal) || persons.includes(searchVal);
        });
    }

    currentFilteredData = filtered; // Save globally for lightbox controls
    const totalItems = filtered.length;
    const itemsToDisplay = filtered.slice(0, itemsToShow);

    if (itemsToDisplay.length === 0) {
        grid.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1; padding: 3rem;">Keine Fotos gefunden, die zu deiner Suche passen.</p>';
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
        card.style.animationDelay = `${index * 0.05}s`;
        card.addEventListener("click", () => openLightbox(globalIndex));

        // Gradients for broken physical images
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

        card.innerHTML = `
            <div class="gallery-img-container">
                <img id="${imgPlaceholderId}" src="${displayThumbUrl}" alt="${item.title}" class="masonry-img" loading="lazy" onerror="window.handleImageError(this, '${gradient}')">
                <div class="gallery-img-overlay">
                    <span class="gallery-zoom-icon">🔍</span>
                </div>
            </div>
            <div class="masonry-caption">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.25rem;">
                    <span class="badge-sm badge-${item.category}">${getCategoryLabel(item.category)}</span>
                    <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">${item.date}</span>
                </div>
                <h4 style="margin: 5px 0 0 0; font-size:1.05rem; font-weight:700; color:var(--primary-color);">${item.title}</h4>
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
window.handleImageError = (imgEl, gradient) => {
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
    const fallback = document.getElementById("lightbox-fallback");
    const title = document.getElementById("lightbox-title");
    const desc = document.getElementById("lightbox-desc");
    const category = document.getElementById("lightbox-category");
    const date = document.getElementById("lightbox-date");

    if (!lightbox || !img) return;

    currentItemIndex = index;
    const item = currentFilteredData[index];
    if (!item) return;

    // Reset visibility
    img.style.display = "block";
    if (fallback) fallback.style.display = "none";

    img.src = formatPhotoUrl(item.imageUrl || item.thumbnailUrl);
    img.alt = item.title;

    // Handle lightbox image error (e.g. file missing)
    img.onerror = () => {
        img.style.display = "none";
        if (fallback) {
            fallback.style.display = "flex";
            fallback.style.background = "linear-gradient(135deg, #0f3c5c 0%, #ef4444 100%)";
            fallback.innerHTML = `
                <span style="font-size:3rem; margin-bottom:1rem;">📷</span>
                <span style="font-weight:600; text-transform:uppercase; letter-spacing:1px; font-size:0.85rem; opacity:0.8;">Keine Bilddatei vorhanden</span>
            `;
        }
    };

    title.textContent = item.title;
    desc.innerHTML = item.description || "";
    
    category.textContent = getCategoryLabel(item.category);
    category.className = `category-badge badge-${item.category}`;
    date.textContent = item.date;

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
    document.body.classList.add("no-scroll"); // disable background scrolling
}

window.closeLightbox = () => {
    const lightbox = document.getElementById("galerie-lightbox");
    if (!lightbox) return;
    lightbox.style.display = "none";
    document.body.classList.remove("no-scroll"); // restore scrolling
};

window.nextLightbox = function(e) {
    if (e) e.stopPropagation();
    if (currentFilteredData.length <= 1) return;
    
    let nextIndex = currentItemIndex + 1;
    if (nextIndex >= currentFilteredData.length) {
        nextIndex = 0; // wrap around
    }
    openLightbox(nextIndex);
};

window.prevLightbox = function(e) {
    if (e) e.stopPropagation();
    if (currentFilteredData.length <= 1) return;
    
    let prevIndex = currentItemIndex - 1;
    if (prevIndex < 0) {
        prevIndex = currentFilteredData.length - 1; // wrap around
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
