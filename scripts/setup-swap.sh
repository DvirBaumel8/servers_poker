#!/usr/bin/env bash
# setup-swap.sh — Initialize a 2GB swap file on a GCP e2-micro (or any 1GB RAM VM)
#
# MANDATORY: Run this before starting docker-compose.gcp.yml.
# Without swap the Node.js process will be OOM-killed during NestJS bootstrap
# or under simulation load.
#
# Usage:
#   bash scripts/setup-swap.sh
#   bash scripts/setup-swap.sh --size 4G   # optional: override swap size
#
# Idempotent — safe to run more than once (skips creation if /swapfile exists).

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SWAPFILE="/swapfile"
SWAP_SIZE="${1:-}"
if [[ "$SWAP_SIZE" == "--size" ]]; then
  SWAP_SIZE="${2:-2G}"
elif [[ -z "$SWAP_SIZE" ]]; then
  SWAP_SIZE="2G"
fi

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (sudo bash scripts/setup-swap.sh)"
  exit 1
fi

# ── Idempotency: skip if swap already active ──────────────────────────────────
if swapon --show | grep -q "$SWAPFILE"; then
  echo "✓ Swap already active on $SWAPFILE — nothing to do."
  echo ""
  free -h
  exit 0
fi

echo "==> Creating ${SWAP_SIZE} swap file at ${SWAPFILE} ..."

# Create the file (fallocate is instant; dd is a fallback for file systems
# that do not support fallocate, e.g. btrfs)
if command -v fallocate &>/dev/null; then
  fallocate -l "$SWAP_SIZE" "$SWAPFILE"
else
  SIZE_BYTES=$(numfmt --from=iec "$SWAP_SIZE")
  dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SIZE_BYTES / 1024 / 1024)) status=progress
fi

echo "==> Securing permissions ..."
chmod 600 "$SWAPFILE"

echo "==> Formatting as swap ..."
mkswap "$SWAPFILE"

echo "==> Activating swap ..."
swapon "$SWAPFILE"

# ── Persist across reboots ────────────────────────────────────────────────────
FSTAB_ENTRY="${SWAPFILE} none swap sw 0 0"
if ! grep -qF "$FSTAB_ENTRY" /etc/fstab; then
  echo "==> Adding swap entry to /etc/fstab ..."
  echo "$FSTAB_ENTRY" | tee -a /etc/fstab > /dev/null
else
  echo "==> /etc/fstab entry already present — skipping."
fi

# ── Tune swappiness for a low-RAM server ─────────────────────────────────────
# vm.swappiness=10: kernel prefers RAM; only uses swap under real pressure.
# vm.vfs_cache_pressure=50: retain dentry/inode caches longer (helps Docker layers).
echo "==> Tuning kernel swap parameters ..."
sysctl -w vm.swappiness=10
sysctl -w vm.vfs_cache_pressure=50

# Persist sysctl settings
SYSCTL_CONF="/etc/sysctl.d/99-swap.conf"
cat > "$SYSCTL_CONF" <<EOF
# Swap tuning for GCP e2-micro / 1GB RAM
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
echo "==> Kernel parameters written to ${SYSCTL_CONF}"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "✓ Swap setup complete."
echo ""
free -h
echo ""
swapon --show
