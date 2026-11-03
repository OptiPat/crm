/*
 * Garde-fou macOS : l'interface exige Safari 16.4+ (WebKit du système).
 * Script classique en ES5 : il doit s'exécuter même quand le bundle principal
 * ne peut pas être lu, pour remplacer l'écran blanc par une consigne claire.
 */
(function () {
  var tooOld = false;
  try {
    new RegExp("(?<!a)b");
  } catch (e) {
    tooOld = true;
  }
  if (!tooOld) {
    try {
      tooOld = !(window.CSS && CSS.supports && CSS.supports("color", "color-mix(in srgb, red, blue)"));
    } catch (e) {
      tooOld = true;
    }
  }
  if (!tooOld) return;

  function showMessage() {
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText =
      "font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:24px;" +
      "border:1px solid #d4d4d8;border-radius:12px;color:#18181b;background:#fff;line-height:1.5";
    box.innerHTML =
      "<h1 style=\"font-size:20px;margin:0 0 12px\">Mise à jour nécessaire</h1>" +
      "<p style=\"margin:0 0 8px\">Le CRM a besoin de Safari 16.4 ou plus récent pour s'afficher.</p>" +
      "<p style=\"margin:0\">Ouvrez <b>Réglages Système → Général → Mise à jour de logiciels</b>, " +
      "installez les mises à jour de macOS et de Safari, puis relancez le CRM.</p>";
    document.body.appendChild(box);
  }

  if (document.body) showMessage();
  else document.addEventListener("DOMContentLoaded", showMessage);
})();
