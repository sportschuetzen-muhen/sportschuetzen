const WORKER_UPLOAD_URL = "https://github-dropdown-refresh.dan-hunziker73.workers.dev/";
let teilnehmer = [];

/* ---------------------------------------------
   TEILNEHMER AUS LOGIN LADEN
--------------------------------------------- */
function loadTeilnehmer() {
    const userStr = localStorage.getItem('sportschuetzen_user');
    const badge = document.getElementById("upload-user-info");
    const nameInput = document.getElementById("name");
    const submitBtn = document.getElementById("submitBtn");

    if (!userStr) {
        badge.innerHTML = "⚠️ Nicht eingeloggt.<br><span style='font-size:0.8rem; font-weight:normal;'>Bitte öffnen Sie die Startseite (Haus-Icon) und loggen Sie sich ein.</span>";
        badge.style.background = "#fee2e2";
        badge.style.color = "#ef4444";
        submitBtn.disabled = true;
        return;
    }

    const user = JSON.parse(userStr);
    badge.innerHTML = `👤 Angemeldet als:<br>${user.vorname} ${user.nachname || ''} (${user.lizenz})`;
    nameInput.value = String(user.lizenz);
}

/* ---------------------------------------------
   BILD VORSCHAU + KOMPRESSION
--------------------------------------------- */
async function compressImage(file, maxWidth = 1800, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = e => {
            img.src = e.target.result;
        };

        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ratio = img.width > maxWidth ? maxWidth / img.width : 1;

            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
            resolve(compressedBase64);
        };

        img.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* ---------------------------------------------
   PREVIEW HANDLING
--------------------------------------------- */
document.getElementById("foto").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;

    const compressed = await compressImage(file);

    document.getElementById("preview").src = compressed;
    document.getElementById("preview").style.display = "block";
    document.getElementById("upload-hint").style.display = "none";

    // Temporär speichern für Upload
    e.target.dataset.compressed = compressed;
});

/* ---------------------------------------------
   FORM SUBMIT
--------------------------------------------- */
document.getElementById("uploadForm").onsubmit = async (e) => {
    e.preventDefault();

    const erzielt = parseInt(document.getElementById("erzielt").value);
    const maximal = parseInt(document.getElementById("maximal").value);

    if (erzielt > maximal) {
        alert("Erzielt kann nicht höher als Maximum sein!");
        return;
    }

    const btn = document.getElementById("submitBtn");
    btn.disabled = true;
    btn.textContent = "Wird gesendet...";

    try {
        const userStr = localStorage.getItem('sportschuetzen_user');
        if (!userStr) {
            alert("Nicht eingeloggt!");
            return;
        }
        const user = JSON.parse(userStr);

        const compressedImage = document.getElementById("foto").dataset.compressed;

        if (!compressedImage) {
            alert("Bitte Foto auswählen.");
            return;
        }

        const res = await fetch(WORKER_UPLOAD_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "upload_standblatt",
                lizenz: user.lizenz || user.id,
                vorname: user.vorname,
                nachname: user.nachname,
                erzielt,
                maximal,
                foto: compressedImage
            })
        });

        if (res.ok) {
            alert("✔ Gesendet!");
            location.reload();
        } else {
            alert("Fehler beim Senden.");
        }

    } catch (err) {
        console.error(err);
        alert("Netzwerkfehler.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Jetzt senden";
    }
};

window.onload = loadTeilnehmer;
