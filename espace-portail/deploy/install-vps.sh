#!/usr/bin/env bash
# Installation sur VPS Debian/Ubuntu.
# Usage : sudo bash install-vps.sh espace.example.com
#
# Prerequis : DNS A/AAAA du domaine pointe vers ce serveur, ports 80/443 ouverts.
# Le bundle (pack-for-vps.ps1) doit etre dans le repertoire courant ou passé en $2.

set -euo pipefail

DOMAIN="${1:?Usage: sudo bash install-vps.sh <domaine> [chemin-bundle]}"
BUNDLE_DIR="${2:-$(pwd)}"
INSTALL_ROOT="/opt/espace-portail"
DATA_DIR="${INSTALL_ROOT}/data"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Lancez avec sudo." >&2
  exit 1
fi

echo "==> Paquets systeme"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates build-essential pkg-config libssl-dev unzip

echo "==> Mises a jour de securite automatiques"
# Une machine exposee non patchee est le mode d'echec le plus banal.
apt-get install -y -qq unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Pare-feu"
apt-get install -y -qq ufw
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
# 8787 reste ferme : le binaire n'est joignable que par Caddy, en local.
ufw --force enable >/dev/null
echo "Ports ouverts : 22, 80, 443. Le portail (8787) reste local."

echo "==> Swap"
# La compilation Rust (axum + tokio + SQLite bundle) depasse 2 Go de RAM.
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ "${MEM_MB}" -lt 3000 && ! -f /swapfile ]]; then
  echo "RAM detectee : ${MEM_MB} Mo — creation d'un swap de 2 Go pour la compilation."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "==> Rust (rustup)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
export PATH="${HOME}/.cargo/bin:${PATH}"

echo "==> Utilisateur espace"
if ! id espace &>/dev/null; then
  useradd --system --home "${INSTALL_ROOT}" --shell /usr/sbin/nologin espace
fi

mkdir -p "${INSTALL_ROOT}/bin" "${DATA_DIR}" /var/log/caddy
chown -R espace:espace "${INSTALL_ROOT}" "${DATA_DIR}"
# Caddy tourne sous son propre utilisateur : sans ce chown il ne peut pas
# ouvrir son fichier de log et refuse de demarrer.
if id caddy &>/dev/null; then
  chown -R caddy:caddy /var/log/caddy
fi

echo "==> Compilation espace-portail"
BUILD_SRC="${BUNDLE_DIR}"
if [[ ! -f "${BUILD_SRC}/Cargo.toml" ]]; then
  echo "Cargo.toml introuvable dans ${BUILD_SRC}" >&2
  exit 1
fi
(
  cd "${BUILD_SRC}"
  cargo build --release
)
install -m 755 "${BUILD_SRC}/target/release/espace-portail" "${INSTALL_ROOT}/bin/espace-portail"

if [[ -d "${BUILD_SRC}/web/dist" ]]; then
  rm -rf "${INSTALL_ROOT}/web"
  mkdir -p "${INSTALL_ROOT}/web"
  cp -a "${BUILD_SRC}/web/dist" "${INSTALL_ROOT}/web/dist"
fi

chown -R espace:espace "${INSTALL_ROOT}"

echo "==> Fichier .env"
if [[ ! -f "${INSTALL_ROOT}/.env" ]]; then
  cp "${BUILD_SRC}/deploy/env.production.example" "${INSTALL_ROOT}/.env"
  chown espace:espace "${INSTALL_ROOT}/.env"
  chmod 600 "${INSTALL_ROOT}/.env"
  echo "Editez ${INSTALL_ROOT}/.env (secret sync, Brevo, Gmail) avant de demarrer."
fi

echo "==> Caddy"
sed "s/espace.votre-cabinet.fr/${DOMAIN}/g" "${BUILD_SRC}/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

echo "==> systemd"
cp "${BUILD_SRC}/deploy/espace-portail.service" /etc/systemd/system/espace-portail.service
systemctl daemon-reload
systemctl enable espace-portail

echo ""
echo "Installation terminee."
echo "1. Editez ${INSTALL_ROOT}/.env"
echo "2. sudo systemctl start espace-portail"
echo "3. CRM : URL https://${DOMAIN} + meme ESPACE_SYNC_SECRET"
echo "4. curl -I https://${DOMAIN}/health"
